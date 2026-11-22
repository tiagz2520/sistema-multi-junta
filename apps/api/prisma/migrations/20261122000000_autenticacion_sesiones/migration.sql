BEGIN;

SET LOCAL search_path = pg_catalog;

CREATE TABLE multi_junta.auditoria_identidad (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    cuenta_id UUID NOT NULL,
    evento TEXT NOT NULL,
    ocurrido_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT auditoria_identidad_pkey PRIMARY KEY (id),
    CONSTRAINT auditoria_identidad_cuenta_id_fkey FOREIGN KEY (cuenta_id)
        REFERENCES multi_junta.cuenta (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX auditoria_identidad_cuenta_id_ocurrido_en_idx
    ON multi_junta.auditoria_identidad (cuenta_id, ocurrido_en);
CREATE UNIQUE INDEX auditoria_identidad_super_admin_inicializado_key
    ON multi_junta.auditoria_identidad (evento) WHERE evento = 'SUPER_ADMIN_INICIALIZADO';

CREATE TABLE multi_junta.intento_autenticacion (
    dimension TEXT NOT NULL,
    huella VARCHAR(64) NOT NULL,
    ventana_inicio TIMESTAMPTZ(3) NOT NULL,
    intentos INTEGER NOT NULL,
    CONSTRAINT intento_autenticacion_pkey PRIMARY KEY (dimension, huella),
    CONSTRAINT intento_autenticacion_dimension_check CHECK (dimension IN ('NOMBRE', 'IP')),
    CONSTRAINT intento_autenticacion_huella_check CHECK (huella COLLATE "C" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT intento_autenticacion_intentos_check CHECK (intentos BETWEEN 1 AND 61)
);

CREATE INDEX intento_autenticacion_ventana_inicio_idx
    ON multi_junta.intento_autenticacion (ventana_inicio);

CREATE FUNCTION multi_junta.incrementar_version_acceso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
    NEW.version_acceso := OLD.version_acceso + 1;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION multi_junta.incrementar_version_acceso() FROM PUBLIC;

CREATE TRIGGER cuenta_version_acceso
    BEFORE UPDATE ON multi_junta.cuenta
    FOR EACH ROW WHEN (
        OLD.estado IS DISTINCT FROM NEW.estado
        OR OLD.rol_plataforma_codigo IS DISTINCT FROM NEW.rol_plataforma_codigo
        OR OLD.hash_contrasena IS DISTINCT FROM NEW.hash_contrasena
        OR OLD.requiere_cambio_contrasena IS DISTINCT FROM NEW.requiere_cambio_contrasena
    )
    EXECUTE FUNCTION multi_junta.incrementar_version_acceso();

CREATE TRIGGER junta_version_acceso
    BEFORE UPDATE ON multi_junta.junta
    FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
    EXECUTE FUNCTION multi_junta.incrementar_version_acceso();

CREATE TRIGGER membresia_version_acceso
    BEFORE UPDATE ON multi_junta.membresia
    FOR EACH ROW WHEN (
        OLD.estado IS DISTINCT FROM NEW.estado
        OR OLD.rol_codigo IS DISTINCT FROM NEW.rol_codigo
    )
    EXECUTE FUNCTION multi_junta.incrementar_version_acceso();

-- La identidad no posee tablas y usa políticas propias bajo FORCE RLS.
CREATE POLICY membresia_lectura_identidad ON multi_junta.membresia
    FOR SELECT TO multi_junta_identity USING (true);
CREATE POLICY sesion_lectura_identidad ON multi_junta.sesion
    FOR SELECT TO multi_junta_identity USING (true);
CREATE POLICY sesion_alta_identidad ON multi_junta.sesion
    FOR INSERT TO multi_junta_identity WITH CHECK (true);
CREATE POLICY sesion_cambio_identidad ON multi_junta.sesion
    FOR UPDATE TO multi_junta_identity USING (true) WITH CHECK (true);

GRANT SELECT (id, nombre_usuario_normalizado, hash_contrasena, estado, requiere_cambio_contrasena,
              version_acceso, rol_plataforma_codigo),
      UPDATE (hash_contrasena, requiere_cambio_contrasena)
    ON multi_junta.cuenta TO multi_junta_identity;
GRANT SELECT (id, nombre, estado, version_acceso) ON multi_junta.junta TO multi_junta_identity;
GRANT SELECT (id, junta_id, cuenta_id, rol_codigo, estado, version_acceso)
    ON multi_junta.membresia TO multi_junta_identity;
GRANT SELECT (id, huella_token, cuenta_id, ambito, junta_id, membresia_id, version_acceso_cuenta,
              version_acceso_junta, version_acceso_membresia, expira_absoluta_en,
              expira_inactividad_en, revocada_en),
      INSERT (id, huella_token, cuenta_id, ambito, version_acceso_cuenta, expira_absoluta_en,
              expira_inactividad_en),
      UPDATE (huella_token, ambito, junta_id, membresia_id, version_acceso_junta,
              version_acceso_membresia, expira_inactividad_en, revocada_en)
    ON multi_junta.sesion TO multi_junta_identity;
GRANT INSERT (cuenta_id, evento) ON multi_junta.auditoria_identidad TO multi_junta_identity;
GRANT SELECT (dimension, huella, ventana_inicio, intentos),
      INSERT (dimension, huella, ventana_inicio, intentos), UPDATE (ventana_inicio, intentos), DELETE
    ON multi_junta.intento_autenticacion TO multi_junta_identity;

CREATE FUNCTION multi_junta.auth_attempt(p_nombre TEXT, p_ip TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    window_start TIMESTAMPTZ := date_bin('15 minutes', statement_timestamp(), '2000-01-01 UTC'::TIMESTAMPTZ);
    ip_attempts INTEGER;
    name_attempts INTEGER;
BEGIN
    IF (p_nombre COLLATE "C" ~ '^[a-f0-9]{64}$' AND p_ip COLLATE "C" ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN
        RETURN false;
    END IF;

    INSERT INTO multi_junta.intento_autenticacion AS prior (dimension, huella, ventana_inicio, intentos)
    VALUES ('IP', p_ip, window_start, 1)
    ON CONFLICT (dimension, huella) DO UPDATE
    SET ventana_inicio = GREATEST(prior.ventana_inicio, EXCLUDED.ventana_inicio),
        intentos = CASE WHEN prior.ventana_inicio >= EXCLUDED.ventana_inicio
            THEN LEAST(prior.intentos + 1, 61) ELSE 1 END
    RETURNING prior.intentos INTO ip_attempts;

    IF ip_attempts > 60 THEN
        RETURN false;
    END IF;

    INSERT INTO multi_junta.intento_autenticacion AS prior (dimension, huella, ventana_inicio, intentos)
    VALUES ('NOMBRE', p_nombre, window_start, 1)
    ON CONFLICT (dimension, huella) DO UPDATE
    SET ventana_inicio = GREATEST(prior.ventana_inicio, EXCLUDED.ventana_inicio),
        intentos = CASE WHEN prior.ventana_inicio >= EXCLUDED.ventana_inicio
            THEN LEAST(prior.intentos + 1, 6) ELSE 1 END
    RETURNING prior.intentos INTO name_attempts;

    -- Conserva la ventana actual y la inmediatamente anterior, con limpieza acotada por petición.
    DELETE FROM multi_junta.intento_autenticacion AS expired
    USING (
        SELECT i.dimension, i.huella FROM multi_junta.intento_autenticacion AS i
        WHERE i.ventana_inicio < window_start - INTERVAL '15 minutes'
        ORDER BY i.ventana_inicio LIMIT 32 FOR UPDATE SKIP LOCKED
    ) AS old
    WHERE expired.dimension = old.dimension AND expired.huella = old.huella;

    RETURN name_attempts <= 5;
END;
$function$;

CREATE FUNCTION multi_junta.auth_credential(p_username TEXT)
RETURNS TABLE(cuenta_id UUID, hash_contrasena TEXT, version_acceso INTEGER, estado TEXT)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT c.id, c.hash_contrasena, c.version_acceso, c.estado::TEXT
    FROM multi_junta.cuenta AS c
    WHERE c.nombre_usuario_normalizado = p_username
      AND p_username COLLATE "C" ~ '^[a-z0-9._-]{3,32}$';
$function$;

-- Rutina privada: la invocan las operaciones de abajo con un token ya hasheado.
CREATE FUNCTION multi_junta.auth_live_session(p_hash TEXT)
RETURNS TABLE(
    sesion_id UUID, cuenta_id UUID, junta_id UUID, membresia_id UUID, ambito TEXT,
    rol TEXT, requiere_cambio BOOLEAN, version_acceso INTEGER
)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT s.id, c.id, s.junta_id, s.membresia_id, s.ambito::TEXT,
           CASE WHEN s.ambito = 'PLATAFORMA' THEN c.rol_plataforma_codigo::TEXT
                WHEN s.ambito = 'JUNTA' THEN m.rol_codigo::TEXT END,
           c.requiere_cambio_contrasena, c.version_acceso
    FROM multi_junta.sesion AS s
    JOIN multi_junta.cuenta AS c ON c.id = s.cuenta_id
    LEFT JOIN multi_junta.membresia AS m
        ON m.junta_id = s.junta_id AND m.id = s.membresia_id AND m.cuenta_id = s.cuenta_id
    LEFT JOIN multi_junta.junta AS j ON j.id = s.junta_id
    WHERE p_hash COLLATE "C" ~ '^[a-f0-9]{64}$' AND s.huella_token = p_hash
      AND s.revocada_en IS NULL AND c.estado = 'ACTIVA'
      AND s.expira_absoluta_en > statement_timestamp() AND s.expira_inactividad_en > statement_timestamp()
      AND s.version_acceso_cuenta = c.version_acceso
      AND (
          s.ambito = 'PREVIA'
          OR (NOT c.requiere_cambio_contrasena AND (
              (s.ambito = 'PLATAFORMA' AND c.rol_plataforma_codigo = 'SUPER_ADMIN')
              OR (s.ambito = 'JUNTA' AND m.estado = 'ACTIVA' AND j.estado = 'ACTIVA'
                  AND m.version_acceso = s.version_acceso_membresia
                  AND j.version_acceso = s.version_acceso_junta)
          ))
      );
$function$;

CREATE FUNCTION multi_junta.auth_start(
    p_cuenta UUID, p_version INTEGER, p_hash TEXT, p_idle_seconds INTEGER, p_absolute_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
    IF (p_hash COLLATE "C" ~ '^[a-f0-9]{64}$'
        AND p_idle_seconds BETWEEN 1 AND 86400 AND p_absolute_seconds BETWEEN 1 AND 86400) IS NOT TRUE THEN
        RETURN false;
    END IF;

    WITH eligible AS (
        SELECT c.id, c.version_acceso, c.rol_plataforma_codigo, c.requiere_cambio_contrasena
        FROM multi_junta.cuenta AS c
        WHERE c.id = p_cuenta AND c.version_acceso = p_version AND c.estado = 'ACTIVA'
        FOR SHARE
    ), created AS (
        INSERT INTO multi_junta.sesion (
            id, huella_token, cuenta_id, ambito, version_acceso_cuenta, expira_absoluta_en, expira_inactividad_en
        )
        SELECT gen_random_uuid(), p_hash, c.id,
               CASE WHEN c.rol_plataforma_codigo = 'SUPER_ADMIN' AND NOT c.requiere_cambio_contrasena
                    THEN 'PLATAFORMA'::multi_junta.ambito_sesion ELSE 'PREVIA'::multi_junta.ambito_sesion END,
               c.version_acceso, statement_timestamp() + make_interval(secs => p_absolute_seconds),
               statement_timestamp() + make_interval(secs => LEAST(p_idle_seconds, p_absolute_seconds))
        FROM eligible AS c
        ON CONFLICT (huella_token) DO NOTHING
        RETURNING cuenta_id
    )
    INSERT INTO multi_junta.auditoria_identidad (cuenta_id, evento)
    SELECT created.cuenta_id, 'SESION_INICIADA' FROM created;

    RETURN FOUND;
END;
$function$;

CREATE FUNCTION multi_junta.auth_validate(p_hash TEXT, p_idle_seconds INTEGER)
RETURNS TABLE(cuenta_id UUID, junta_id UUID, membresia_id UUID, ambito TEXT, rol TEXT, requiere_cambio BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
    WITH valid AS MATERIALIZED (
        SELECT * FROM multi_junta.auth_live_session(p_hash) WHERE p_idle_seconds BETWEEN 1 AND 86400
    ), touched AS (
        UPDATE multi_junta.sesion AS s
        SET expira_inactividad_en = GREATEST(s.expira_inactividad_en,
            LEAST(s.expira_absoluta_en, statement_timestamp() + make_interval(secs => p_idle_seconds)))
        FROM valid AS v
        WHERE s.id = v.sesion_id AND s.huella_token = p_hash AND s.revocada_en IS NULL
          AND s.expira_absoluta_en > statement_timestamp() AND s.expira_inactividad_en > statement_timestamp()
        RETURNING s.id
    )
    SELECT v.cuenta_id, v.junta_id, v.membresia_id, v.ambito, v.rol, v.requiere_cambio
    FROM valid AS v JOIN touched AS t ON t.id = v.sesion_id;
$function$;

CREATE FUNCTION multi_junta.auth_contexts(p_hash TEXT)
RETURNS TABLE(junta_id UUID, nombre TEXT, rol TEXT)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT j.id, j.nombre, m.rol_codigo::TEXT
    FROM multi_junta.auth_live_session(p_hash) AS v
    JOIN multi_junta.membresia AS m ON m.cuenta_id = v.cuenta_id
    JOIN multi_junta.junta AS j ON j.id = m.junta_id
    WHERE NOT v.requiere_cambio AND m.estado = 'ACTIVA' AND j.estado = 'ACTIVA'
    ORDER BY j.nombre, j.id;
$function$;

CREATE FUNCTION multi_junta.auth_switch(
    p_current_hash TEXT, p_new_hash TEXT, p_junta UUID, p_idle_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
    IF (p_new_hash COLLATE "C" ~ '^[a-f0-9]{64}$'
        AND p_new_hash <> p_current_hash AND p_idle_seconds BETWEEN 1 AND 86400) IS NOT TRUE THEN
        RETURN false;
    END IF;

    WITH target AS MATERIALIZED (
        SELECT v.sesion_id, c.id AS cuenta_id, j.id AS junta_id, m.id AS membresia_id,
               j.version_acceso AS version_junta, m.version_acceso AS version_membresia
        FROM multi_junta.auth_live_session(p_current_hash) AS v
        JOIN multi_junta.cuenta AS c ON c.id = v.cuenta_id
        LEFT JOIN multi_junta.membresia AS m
            ON m.cuenta_id = v.cuenta_id AND m.junta_id = p_junta AND m.estado = 'ACTIVA'
        LEFT JOIN multi_junta.junta AS j ON j.id = m.junta_id AND j.estado = 'ACTIVA'
        WHERE NOT v.requiere_cambio AND NOT c.requiere_cambio_contrasena
          AND c.version_acceso = v.version_acceso AND c.estado = 'ACTIVA' AND (
            (p_junta IS NULL AND c.rol_plataforma_codigo = 'SUPER_ADMIN') OR j.id IS NOT NULL
        )
        FOR SHARE OF c
    ), rotated AS (
        UPDATE multi_junta.sesion AS s
        SET huella_token = p_new_hash,
            ambito = CASE WHEN t.junta_id IS NULL THEN 'PLATAFORMA'::multi_junta.ambito_sesion
                          ELSE 'JUNTA'::multi_junta.ambito_sesion END,
            junta_id = t.junta_id, membresia_id = t.membresia_id,
            version_acceso_junta = t.version_junta, version_acceso_membresia = t.version_membresia,
            expira_inactividad_en = LEAST(s.expira_absoluta_en,
                statement_timestamp() + make_interval(secs => p_idle_seconds))
        FROM target AS t
        WHERE s.id = t.sesion_id AND s.huella_token = p_current_hash AND s.revocada_en IS NULL
          AND s.expira_absoluta_en > statement_timestamp() AND s.expira_inactividad_en > statement_timestamp()
          AND NOT EXISTS (SELECT FROM multi_junta.sesion AS other WHERE other.huella_token = p_new_hash)
        RETURNING s.cuenta_id
    )
    INSERT INTO multi_junta.auditoria_identidad (cuenta_id, evento)
    SELECT r.cuenta_id, 'CONTEXTO_CAMBIADO' FROM rotated AS r;

    RETURN FOUND;
END;
$function$;

CREATE FUNCTION multi_junta.auth_logout(p_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
    WITH valid AS MATERIALIZED (
        SELECT v.sesion_id FROM multi_junta.auth_live_session(p_hash) AS v
    ), revoked AS (
        UPDATE multi_junta.sesion AS s SET revocada_en = statement_timestamp()
        FROM valid AS v
        WHERE s.id = v.sesion_id AND s.huella_token = p_hash AND s.revocada_en IS NULL
        RETURNING s.cuenta_id
    )
    INSERT INTO multi_junta.auditoria_identidad (cuenta_id, evento)
    SELECT r.cuenta_id, 'SESION_CERRADA' FROM revoked AS r;

    RETURN FOUND;
END;
$function$;

CREATE FUNCTION multi_junta.auth_own_credential(p_hash TEXT)
RETURNS TABLE(cuenta_id UUID, hash_contrasena TEXT, version_acceso INTEGER, estado TEXT)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT c.id, c.hash_contrasena, c.version_acceso, c.estado::TEXT
    FROM multi_junta.auth_live_session(p_hash) AS v
    JOIN multi_junta.cuenta AS c ON c.id = v.cuenta_id
    WHERE v.ambito = 'PREVIA' AND v.requiere_cambio;
$function$;

CREATE FUNCTION multi_junta.auth_password(p_hash TEXT, p_version INTEGER, p_new_argon_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    changed_account UUID;
BEGIN
    IF (p_new_argon_hash LIKE '$argon2id$%') IS NOT TRUE THEN
        RETURN false;
    END IF;

    WITH valid AS MATERIALIZED (
        SELECT v.cuenta_id FROM multi_junta.auth_live_session(p_hash) AS v
        WHERE v.ambito = 'PREVIA' AND v.requiere_cambio AND v.version_acceso = p_version
    )
    UPDATE multi_junta.cuenta AS c
    SET hash_contrasena = p_new_argon_hash, requiere_cambio_contrasena = false
    FROM valid AS v
    WHERE c.id = v.cuenta_id AND c.version_acceso = p_version AND c.requiere_cambio_contrasena
    RETURNING c.id INTO changed_account;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    UPDATE multi_junta.sesion AS s SET revocada_en = statement_timestamp()
    WHERE s.cuenta_id = changed_account AND s.revocada_en IS NULL;

    INSERT INTO multi_junta.auditoria_identidad (cuenta_id, evento)
    VALUES (changed_account, 'CONTRASENA_CAMBIADA');

    RETURN true;
END;
$function$;

CREATE FUNCTION multi_junta.auth_membership(p_hash TEXT)
RETURNS TABLE(cuenta_id UUID, junta_id UUID, membresia_id UUID, rol TEXT)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT v.cuenta_id, v.junta_id, v.membresia_id, v.rol
    FROM multi_junta.auth_live_session(p_hash) AS v
    WHERE v.ambito = 'JUNTA' AND v.junta_id::TEXT = current_setting('app.junta_id', true);
$function$;

-- PostgreSQL exige CREATE para transferir un objeto al nuevo propietario.
-- Esta concesión solo existe en la transacción de la migración.
GRANT CREATE ON SCHEMA multi_junta TO multi_junta_identity;

DO $grants$
DECLARE
    routine REGPROCEDURE;
BEGIN
    FOREACH routine IN ARRAY ARRAY[
        'multi_junta.auth_attempt(text,text)'::REGPROCEDURE,
        'multi_junta.auth_credential(text)'::REGPROCEDURE,
        'multi_junta.auth_live_session(text)'::REGPROCEDURE,
        'multi_junta.auth_start(uuid,integer,text,integer,integer)'::REGPROCEDURE,
        'multi_junta.auth_validate(text,integer)'::REGPROCEDURE,
        'multi_junta.auth_contexts(text)'::REGPROCEDURE,
        'multi_junta.auth_switch(text,text,uuid,integer)'::REGPROCEDURE,
        'multi_junta.auth_logout(text)'::REGPROCEDURE,
        'multi_junta.auth_own_credential(text)'::REGPROCEDURE,
        'multi_junta.auth_password(text,integer,text)'::REGPROCEDURE,
        'multi_junta.auth_membership(text)'::REGPROCEDURE
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', routine);
        IF routine <> 'multi_junta.auth_live_session(text)'::REGPROCEDURE THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO multi_junta_app', routine);
        END IF;
        EXECUTE format('ALTER FUNCTION %s OWNER TO multi_junta_identity', routine);
    END LOOP;
END;
$grants$;

REVOKE CREATE ON SCHEMA multi_junta FROM multi_junta_identity;

COMMIT;
