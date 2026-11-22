BEGIN;

SET LOCAL search_path = pg_catalog;

ALTER TABLE multi_junta.auditoria_identidad
    ADD COLUMN junta_id UUID,
    ADD COLUMN objetivo_cuenta_id UUID,
    ADD COLUMN objetivo_membresia_id UUID,
    ADD COLUMN rol_anterior multi_junta.codigo_rol,
    ADD COLUMN rol_resultante multi_junta.codigo_rol,
    ADD COLUMN estado_anterior multi_junta.estado,
    ADD COLUMN estado_resultante multi_junta.estado,
    ADD CONSTRAINT auditoria_identidad_junta_id_fkey FOREIGN KEY (junta_id)
        REFERENCES multi_junta.junta (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT auditoria_identidad_objetivo_cuenta_id_fkey FOREIGN KEY (objetivo_cuenta_id)
        REFERENCES multi_junta.cuenta (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT auditoria_identidad_membresia_objetivo_fkey
        FOREIGN KEY (junta_id, objetivo_membresia_id, objetivo_cuenta_id)
        REFERENCES multi_junta.membresia (junta_id, id, cuenta_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT auditoria_identidad_objetivo_membresia_check CHECK (
        objetivo_membresia_id IS NULL OR (junta_id IS NOT NULL AND objetivo_cuenta_id IS NOT NULL)
    ),
    ADD CONSTRAINT auditoria_identidad_secretaria_inicial_check CHECK (
        evento <> 'SECRETARIA_INICIAL_CREADA' OR objetivo_membresia_id IS NOT NULL
    );

CREATE INDEX auditoria_identidad_junta_id_evento_idx ON multi_junta.auditoria_identidad (junta_id, evento);
CREATE UNIQUE INDEX auditoria_identidad_secretaria_inicial_key
    ON multi_junta.auditoria_identidad (junta_id) WHERE evento = 'SECRETARIA_INICIAL_CREADA';

GRANT SELECT (tipo, ruc), INSERT (id, nombre, tipo, ruc), UPDATE (estado)
    ON multi_junta.junta TO multi_junta_identity;
GRANT INSERT (id, nombre_usuario_normalizado, hash_contrasena, requiere_cambio_contrasena)
    ON multi_junta.cuenta TO multi_junta_identity;
GRANT INSERT (id, junta_id, cuenta_id, rol_codigo), UPDATE (rol_codigo, estado)
    ON multi_junta.membresia TO multi_junta_identity;
GRANT SELECT (junta_id, evento, rol_anterior, rol_resultante),
      INSERT (junta_id, objetivo_cuenta_id, objetivo_membresia_id, rol_anterior, rol_resultante,
              estado_anterior, estado_resultante)
    ON multi_junta.auditoria_identidad TO multi_junta_identity;

CREATE POLICY membresia_alta_gestion ON multi_junta.membresia
    FOR INSERT TO multi_junta_identity WITH CHECK (
        (rol_codigo = 'ADMIN_JUNTA' AND NULLIF(current_setting('app.junta_id', true), '') IS NULL)
        OR (rol_codigo = 'SECRETARIA' AND junta_id::TEXT = current_setting('app.junta_id', true))
    );

CREATE POLICY membresia_cambio_gestion ON multi_junta.membresia
    FOR UPDATE TO multi_junta_identity
    USING (junta_id::TEXT = current_setting('app.junta_id', true))
    WITH CHECK (
        junta_id::TEXT = current_setting('app.junta_id', true)
        AND rol_codigo IN ('SECRETARIA', 'TESORERIA', 'SOCIO')
    );

-- Rutinas internas. Los roles y ámbitos admitidos quedan fijados en la base.
CREATE FUNCTION multi_junta.gp_authorize(p_hash TEXT, p_junta UUID, p_mutation BOOLEAN)
RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    actor RECORD;
    confirmed UUID;
BEGIN
    IF p_junta::TEXT IS DISTINCT FROM NULLIF(current_setting('app.junta_id', true), '') THEN
        RETURN NULL;
    END IF;

    SELECT v.sesion_id, v.cuenta_id, v.membresia_id INTO actor
    FROM multi_junta.auth_live_session(p_hash) AS v
    WHERE (p_junta IS NULL AND v.ambito = 'PLATAFORMA' AND v.rol = 'SUPER_ADMIN')
       OR (v.junta_id = p_junta AND v.ambito = 'JUNTA' AND v.rol = 'ADMIN_JUNTA');

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    IF NOT p_mutation THEN
        RETURN actor.cuenta_id;
    END IF;

    PERFORM 1 FROM multi_junta.cuenta AS c WHERE c.id = actor.cuenta_id FOR SHARE;
    IF p_junta IS NOT NULL THEN
        PERFORM 1 FROM multi_junta.junta AS j WHERE j.id = p_junta FOR UPDATE;
        PERFORM 1 FROM multi_junta.membresia AS m
        WHERE m.junta_id = p_junta AND m.id = actor.membresia_id FOR SHARE;
    END IF;
    PERFORM 1 FROM multi_junta.sesion AS s WHERE s.id = actor.sesion_id FOR SHARE;

    SELECT v.cuenta_id INTO confirmed FROM multi_junta.auth_live_session(p_hash) AS v
    WHERE v.sesion_id = actor.sesion_id AND (
        (p_junta IS NULL AND v.ambito = 'PLATAFORMA' AND v.rol = 'SUPER_ADMIN')
        OR (v.junta_id = p_junta AND v.ambito = 'JUNTA' AND v.rol = 'ADMIN_JUNTA')
    );
    RETURN confirmed;
END;
$function$;

CREATE FUNCTION multi_junta.gp_junta_json(
    p_id UUID, p_nombre TEXT, p_tipo TEXT, p_ruc TEXT, p_estado multi_junta.estado
)
RETURNS JSONB
LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT jsonb_build_object('id', p_id, 'nombre', p_nombre, 'tipo', p_tipo, 'ruc', p_ruc, 'estado', p_estado);
$function$;

CREATE FUNCTION multi_junta.gp_membresia_json(
    p_id UUID, p_cuenta UUID, p_usuario TEXT, p_rol multi_junta.codigo_rol, p_estado multi_junta.estado
)
RETURNS JSONB
LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT jsonb_build_object('id', p_id, 'cuentaId', p_cuenta, 'usuario', p_usuario, 'rol', p_rol, 'estado', p_estado);
$function$;

CREATE FUNCTION multi_junta.gp_secretaria_disponible(p_junta UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT NOT EXISTS (
        SELECT FROM multi_junta.membresia AS m WHERE m.junta_id = p_junta AND m.rol_codigo = 'SECRETARIA'
    ) AND NOT EXISTS (
        SELECT FROM multi_junta.auditoria_identidad AS a WHERE a.junta_id = p_junta AND (
            a.evento = 'SECRETARIA_INICIAL_CREADA'
            OR (a.evento = 'MEMBRESIA_ACTUALIZADA' AND (a.rol_anterior = 'SECRETARIA' OR a.rol_resultante = 'SECRETARIA'))
        )
    );
$function$;

CREATE FUNCTION multi_junta.gp_alta_membresia(
    p_actor UUID, p_junta UUID, p_usuario TEXT, p_hash_argon TEXT, p_rol multi_junta.codigo_rol, p_evento TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    nueva_cuenta UUID := gen_random_uuid();
    nueva_membresia UUID := gen_random_uuid();
BEGIN
    IF (p_usuario COLLATE "C" ~ '^[a-z0-9._-]{3,32}$' AND p_hash_argon LIKE '$argon2id$%') IS NOT TRUE THEN
        RETURN jsonb_build_object('error', 'conflict');
    END IF;

    INSERT INTO multi_junta.cuenta (id, nombre_usuario_normalizado, hash_contrasena, requiere_cambio_contrasena)
    VALUES (nueva_cuenta, p_usuario, p_hash_argon, true);

    INSERT INTO multi_junta.membresia (id, junta_id, cuenta_id, rol_codigo)
    VALUES (nueva_membresia, p_junta, nueva_cuenta, p_rol);

    INSERT INTO multi_junta.auditoria_identidad (cuenta_id, junta_id, objetivo_cuenta_id,
                                               objetivo_membresia_id, rol_resultante, estado_resultante, evento)
    VALUES (p_actor, p_junta, nueva_cuenta, nueva_membresia, p_rol, 'ACTIVA', p_evento);

    RETURN jsonb_build_object('data',
        multi_junta.gp_membresia_json(nueva_membresia, nueva_cuenta, p_usuario, p_rol, 'ACTIVA'));
EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object('error', 'conflict');
END;
$function$;

CREATE FUNCTION multi_junta.gp_list_juntas(p_hash TEXT, p_offset INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    listing JSONB;
BEGIN
    IF multi_junta.gp_authorize(p_hash, NULL, false) IS NULL THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;
    IF p_offset IS NULL OR p_offset < 0 THEN
        RETURN jsonb_build_object('error', 'conflict');
    END IF;

    SELECT coalesce(jsonb_agg(multi_junta.gp_junta_json(j.id, j.nombre, j.tipo, j.ruc, j.estado)
                             ORDER BY j.nombre, j.id), '[]'::JSONB)
    INTO listing FROM (
        SELECT id, nombre, tipo, ruc, estado FROM multi_junta.junta
        ORDER BY nombre, id LIMIT 25 OFFSET p_offset
    ) AS j;
    RETURN jsonb_build_object('data', listing);
END;
$function$;

CREATE FUNCTION multi_junta.gp_create_junta(p_hash TEXT, p_nombre TEXT, p_tipo TEXT, p_ruc TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    actor UUID := multi_junta.gp_authorize(p_hash, NULL, true);
    created RECORD;
BEGIN
    IF actor IS NULL THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;
    IF NULLIF(btrim(p_nombre), '') IS NULL OR NULLIF(btrim(p_tipo), '') IS NULL
        OR (p_ruc IS NOT NULL AND p_ruc COLLATE "C" !~ '^[0-9]{13}$') THEN
        RETURN jsonb_build_object('error', 'conflict');
    END IF;

    INSERT INTO multi_junta.junta (id, nombre, tipo, ruc)
    VALUES (gen_random_uuid(), btrim(p_nombre), btrim(p_tipo), p_ruc)
    RETURNING id, nombre, tipo, ruc, estado INTO created;

    INSERT INTO multi_junta.auditoria_identidad (cuenta_id, junta_id, evento, estado_resultante)
    VALUES (actor, created.id, 'JUNTA_CREADA', created.estado);

    RETURN jsonb_build_object('data',
        multi_junta.gp_junta_json(created.id, created.nombre, created.tipo, created.ruc, created.estado));
EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'conflict');
END;
$function$;

CREATE FUNCTION multi_junta.gp_get_junta(p_hash TEXT, p_junta UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    info JSONB;
BEGIN
    IF multi_junta.gp_authorize(p_hash, NULL, false) IS NULL THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    SELECT multi_junta.gp_junta_json(j.id, j.nombre, j.tipo, j.ruc, j.estado) || jsonb_build_object(
        'administradores', (
            SELECT coalesce(jsonb_agg(multi_junta.gp_membresia_json(
                m.id, m.cuenta_id, c.nombre_usuario_normalizado, m.rol_codigo, m.estado
            ) ORDER BY c.nombre_usuario_normalizado, m.id), '[]'::JSONB)
            FROM multi_junta.membresia AS m
            JOIN multi_junta.cuenta AS c ON c.id = m.cuenta_id
            WHERE m.junta_id = j.id AND m.rol_codigo = 'ADMIN_JUNTA'
        )
    ) INTO info FROM multi_junta.junta AS j WHERE j.id = p_junta;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'not_found');
    END IF;
    RETURN jsonb_build_object('data', info);
END;
$function$;

CREATE FUNCTION multi_junta.gp_set_junta_estado(p_hash TEXT, p_junta UUID, p_estado TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    actor UUID := multi_junta.gp_authorize(p_hash, NULL, true);
    prior RECORD;
    next_state multi_junta.estado;
BEGIN
    IF actor IS NULL THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;
    IF (p_estado IN ('ACTIVA', 'INACTIVA')) IS NOT TRUE THEN
        RETURN jsonb_build_object('error', 'conflict');
    END IF;

    SELECT j.id, j.nombre, j.tipo, j.ruc, j.estado INTO prior
    FROM multi_junta.junta AS j WHERE j.id = p_junta FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'not_found');
    END IF;

    next_state := p_estado::multi_junta.estado;
    IF prior.estado <> next_state THEN
        UPDATE multi_junta.junta SET estado = next_state WHERE id = p_junta;
        INSERT INTO multi_junta.auditoria_identidad
            (cuenta_id, junta_id, evento, estado_anterior, estado_resultante)
        VALUES (actor, p_junta, 'JUNTA_ESTADO_CAMBIADO', prior.estado, next_state);
    END IF;

    RETURN jsonb_build_object('data',
        multi_junta.gp_junta_json(prior.id, prior.nombre, prior.tipo, prior.ruc, next_state));
END;
$function$;

CREATE FUNCTION multi_junta.gp_create_admin(p_hash TEXT, p_junta UUID, p_usuario TEXT, p_hash_argon TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    actor UUID := multi_junta.gp_authorize(p_hash, NULL, true);
    target_state multi_junta.estado;
BEGIN
    IF actor IS NULL THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    SELECT j.estado INTO target_state FROM multi_junta.junta AS j WHERE j.id = p_junta FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'not_found');
    END IF;
    IF target_state <> 'ACTIVA' THEN
        RETURN jsonb_build_object('error', 'conflict');
    END IF;

    RETURN multi_junta.gp_alta_membresia(p_actor => actor, p_junta => p_junta, p_usuario => p_usuario,
        p_hash_argon => p_hash_argon, p_rol => 'ADMIN_JUNTA', p_evento => 'ADMIN_JUNTA_CREADO');
END;
$function$;

CREATE FUNCTION multi_junta.gp_local_junta(p_hash TEXT, p_junta UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    info JSONB;
BEGIN
    IF p_junta IS NULL OR multi_junta.gp_authorize(p_hash, p_junta, false) IS NULL THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    SELECT multi_junta.gp_junta_json(j.id, j.nombre, j.tipo, j.ruc, j.estado) || jsonb_build_object(
        'secretariaInicialDisponible', multi_junta.gp_secretaria_disponible(j.id)
    ) INTO info FROM multi_junta.junta AS j WHERE j.id = p_junta;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'not_found');
    END IF;
    RETURN jsonb_build_object('data', info);
END;
$function$;

CREATE FUNCTION multi_junta.gp_list_membresias(p_hash TEXT, p_junta UUID, p_offset INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    listing JSONB;
BEGIN
    IF p_junta IS NULL OR multi_junta.gp_authorize(p_hash, p_junta, false) IS NULL THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;
    IF p_offset IS NULL OR p_offset < 0 THEN
        RETURN jsonb_build_object('error', 'conflict');
    END IF;

    SELECT coalesce(jsonb_agg(multi_junta.gp_membresia_json(m.id, m.cuenta_id, m.usuario, m.rol_codigo, m.estado)
                             ORDER BY m.usuario, m.id), '[]'::JSONB)
    INTO listing FROM (
        SELECT m.id, m.cuenta_id, c.nombre_usuario_normalizado AS usuario, m.rol_codigo, m.estado
        FROM multi_junta.membresia AS m JOIN multi_junta.cuenta AS c ON c.id = m.cuenta_id
        WHERE m.junta_id = p_junta AND m.rol_codigo IN ('SECRETARIA', 'TESORERIA', 'SOCIO')
        ORDER BY c.nombre_usuario_normalizado, m.id LIMIT 25 OFFSET p_offset
    ) AS m;
    RETURN jsonb_build_object('data', listing);
END;
$function$;

CREATE FUNCTION multi_junta.gp_update_membresia(
    p_hash TEXT, p_junta UUID, p_membresia UUID, p_rol TEXT, p_estado TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    actor UUID;
    prior RECORD;
    next_role multi_junta.codigo_rol;
    next_state multi_junta.estado;
BEGIN
    IF p_junta IS NULL THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;
    actor := multi_junta.gp_authorize(p_hash, p_junta, true);
    IF actor IS NULL THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;
    IF (p_rol IS NULL AND p_estado IS NULL)
        OR (p_rol IS NOT NULL AND p_rol NOT IN ('SECRETARIA', 'TESORERIA', 'SOCIO'))
        OR (p_estado IS NOT NULL AND p_estado NOT IN ('ACTIVA', 'INACTIVA')) THEN
        RETURN jsonb_build_object('error', 'conflict');
    END IF;

    SELECT m.id, m.cuenta_id, c.nombre_usuario_normalizado AS usuario, m.rol_codigo, m.estado INTO prior
    FROM multi_junta.membresia AS m JOIN multi_junta.cuenta AS c ON c.id = m.cuenta_id
    WHERE m.junta_id = p_junta AND m.id = p_membresia FOR UPDATE OF m;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'not_found');
    END IF;
    IF prior.rol_codigo NOT IN ('SECRETARIA', 'TESORERIA', 'SOCIO') THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    next_role := coalesce(p_rol::multi_junta.codigo_rol, prior.rol_codigo);
    next_state := coalesce(p_estado::multi_junta.estado, prior.estado);
    IF prior.rol_codigo <> next_role OR prior.estado <> next_state THEN
        UPDATE multi_junta.membresia SET rol_codigo = next_role, estado = next_state
        WHERE junta_id = p_junta AND id = p_membresia;

        INSERT INTO multi_junta.auditoria_identidad (cuenta_id, junta_id, objetivo_cuenta_id,
            objetivo_membresia_id, evento, rol_anterior, rol_resultante, estado_anterior, estado_resultante)
        VALUES (actor, p_junta, prior.cuenta_id, prior.id, 'MEMBRESIA_ACTUALIZADA',
            prior.rol_codigo, next_role, prior.estado, next_state);
    END IF;

    RETURN jsonb_build_object('data',
        multi_junta.gp_membresia_json(prior.id, prior.cuenta_id, prior.usuario, next_role, next_state));
END;
$function$;

CREATE FUNCTION multi_junta.gp_create_secretaria(p_hash TEXT, p_junta UUID, p_usuario TEXT, p_hash_argon TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    actor UUID;
BEGIN
    IF p_junta IS NULL THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;
    actor := multi_junta.gp_authorize(p_hash, p_junta, true);
    IF actor IS NULL THEN
        RETURN jsonb_build_object('error', 'forbidden');
    END IF;
    IF NOT multi_junta.gp_secretaria_disponible(p_junta) THEN
        RETURN jsonb_build_object('error', 'conflict');
    END IF;

    RETURN multi_junta.gp_alta_membresia(p_actor => actor, p_junta => p_junta, p_usuario => p_usuario,
        p_hash_argon => p_hash_argon, p_rol => 'SECRETARIA', p_evento => 'SECRETARIA_INICIAL_CREADA');
END;
$function$;

-- La transferencia a NOLOGIN requiere CREATE, solo dentro de esta transacción.
GRANT CREATE ON SCHEMA multi_junta TO multi_junta_identity;

DO $grants$
DECLARE
    entry RECORD;
    routine REGPROCEDURE;
BEGIN
    FOR entry IN SELECT * FROM (VALUES
        ('multi_junta.gp_authorize(text,uuid,boolean)', false),
        ('multi_junta.gp_junta_json(uuid,text,text,text,multi_junta.estado)', false),
        ('multi_junta.gp_membresia_json(uuid,uuid,text,multi_junta.codigo_rol,multi_junta.estado)', false),
        ('multi_junta.gp_secretaria_disponible(uuid)', false),
        ('multi_junta.gp_alta_membresia(uuid,uuid,text,text,multi_junta.codigo_rol,text)', false),
        ('multi_junta.gp_list_juntas(text,integer)', true),
        ('multi_junta.gp_create_junta(text,text,text,text)', true),
        ('multi_junta.gp_get_junta(text,uuid)', true),
        ('multi_junta.gp_set_junta_estado(text,uuid,text)', true),
        ('multi_junta.gp_create_admin(text,uuid,text,text)', true),
        ('multi_junta.gp_local_junta(text,uuid)', true),
        ('multi_junta.gp_list_membresias(text,uuid,integer)', true),
        ('multi_junta.gp_update_membresia(text,uuid,uuid,text,text)', true),
        ('multi_junta.gp_create_secretaria(text,uuid,text,text)', true)
    ) AS routines(signature, app_access) LOOP
        routine := entry.signature::REGPROCEDURE;
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', routine);
        IF entry.app_access THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO multi_junta_app', routine);
        END IF;
        EXECUTE format('ALTER FUNCTION %s OWNER TO multi_junta_identity', routine);
    END LOOP;
END;
$grants$;

REVOKE CREATE ON SCHEMA multi_junta FROM multi_junta_identity;

COMMIT;
