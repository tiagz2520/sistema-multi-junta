BEGIN;

SET LOCAL search_path = pg_catalog;

CREATE TABLE multi_junta.operacion_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta(id) ON DELETE RESTRICT,
    cuenta_id UUID NOT NULL REFERENCES multi_junta.cuenta(id) ON DELETE RESTRICT,
    tabla TEXT NOT NULL,
    objeto_id UUID NOT NULL,
    evento TEXT NOT NULL CHECK (evento IN ('INSERT', 'UPDATE')),
    ocurrido_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX operacion_auditoria_junta_objeto_idx
    ON multi_junta.operacion_auditoria(junta_id, tabla, objeto_id, ocurrido_en);

ALTER TABLE multi_junta.operacion_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.operacion_auditoria FORCE ROW LEVEL SECURITY;
CREATE POLICY operacion_auditoria_escritura ON multi_junta.operacion_auditoria
    FOR INSERT TO multi_junta_identity
    WITH CHECK (junta_id::TEXT = current_setting('app.junta_id', true));

GRANT INSERT(junta_id, cuenta_id, tabla, objeto_id, evento)
    ON multi_junta.operacion_auditoria TO multi_junta_identity;

CREATE FUNCTION multi_junta.op_contexto(p_junta UUID)
RETURNS TABLE (sesion_id UUID, cuenta_id UUID, membresia_id UUID, rol TEXT)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT s.sesion_id, s.cuenta_id, s.membresia_id, s.rol
    FROM multi_junta.auth_live_session(current_setting('app.operacion_huella', true)) AS s
    WHERE p_junta::TEXT = current_setting('app.junta_id', true)
      AND s.ambito = 'JUNTA' AND s.junta_id = p_junta AND s.membresia_id IS NOT NULL;
$function$;

CREATE FUNCTION multi_junta.op_visible(p_junta UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT EXISTS (SELECT 1 FROM multi_junta.op_contexto(p_junta) AS op WHERE op.rol = ANY(p_roles));
$function$;

CREATE FUNCTION multi_junta.op_bloquear(p_junta UUID, p_rol TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    actor RECORD;
BEGIN
    SELECT * INTO actor FROM multi_junta.op_contexto(p_junta) AS op WHERE op.rol = p_rol;
    IF NOT FOUND THEN RETURN false; END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('operacion:' || p_junta::TEXT, 0));
    PERFORM 1 FROM multi_junta.cuenta WHERE id = actor.cuenta_id FOR SHARE;
    PERFORM 1 FROM multi_junta.junta WHERE id = p_junta FOR SHARE;
    PERFORM 1 FROM multi_junta.membresia WHERE id = actor.membresia_id AND junta_id = p_junta FOR SHARE;
    PERFORM 1 FROM multi_junta.sesion WHERE id = actor.sesion_id FOR SHARE;

    RETURN EXISTS (
        SELECT 1 FROM multi_junta.op_contexto(p_junta) AS op
        WHERE op.sesion_id = actor.sesion_id AND op.rol = p_rol
    );
END;
$function$;

CREATE FUNCTION multi_junta.op_junta_datos(p_junta UUID)
RETURNS TABLE (nombre TEXT, ruc TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
    SELECT j.nombre, j.ruc FROM multi_junta.junta AS j
    WHERE j.id = p_junta AND multi_junta.op_visible(p_junta, ARRAY['TESORERIA','SECRETARIA','ADMIN_JUNTA']);
$function$;

CREATE FUNCTION multi_junta.op_auditar_tabla()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    actor UUID;
BEGIN
    SELECT op.cuenta_id INTO actor FROM multi_junta.op_contexto(NEW.junta_id) AS op;
    IF actor IS NOT NULL AND (TG_OP = 'INSERT' OR OLD IS DISTINCT FROM NEW) THEN
        INSERT INTO multi_junta.operacion_auditoria(junta_id, cuenta_id, tabla, objeto_id, evento)
        VALUES (NEW.junta_id, actor, TG_TABLE_NAME, NEW.id, TG_OP);
    END IF;
    RETURN NEW;
END;
$function$;

GRANT CREATE ON SCHEMA multi_junta TO multi_junta_identity;
ALTER FUNCTION multi_junta.op_contexto(UUID) OWNER TO multi_junta_identity;
ALTER FUNCTION multi_junta.op_visible(UUID, TEXT[]) OWNER TO multi_junta_identity;
ALTER FUNCTION multi_junta.op_bloquear(UUID, TEXT) OWNER TO multi_junta_identity;
ALTER FUNCTION multi_junta.op_junta_datos(UUID) OWNER TO multi_junta_identity;
ALTER FUNCTION multi_junta.op_auditar_tabla() OWNER TO multi_junta_identity;
REVOKE CREATE ON SCHEMA multi_junta FROM multi_junta_identity;

SET LOCAL ROLE multi_junta_identity;
REVOKE ALL ON FUNCTION multi_junta.op_contexto(UUID), multi_junta.op_visible(UUID, TEXT[]),
    multi_junta.op_bloquear(UUID, TEXT), multi_junta.op_junta_datos(UUID),
    multi_junta.op_auditar_tabla() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION multi_junta.op_visible(UUID, TEXT[]), multi_junta.op_bloquear(UUID, TEXT),
    multi_junta.op_junta_datos(UUID)
    TO multi_junta_app;
GRANT EXECUTE ON FUNCTION multi_junta.op_auditar_tabla() TO multi_junta_migrator;
RESET ROLE;

COMMIT;
