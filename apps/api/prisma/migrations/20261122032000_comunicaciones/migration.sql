BEGIN;
SET LOCAL search_path = pg_catalog;

CREATE TABLE multi_junta.convocatoria (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 junta_id uuid NOT NULL REFERENCES multi_junta.junta(id) ON DELETE RESTRICT,
 actividad_id uuid NOT NULL,
 asunto text NOT NULL CHECK (length(btrim(asunto)) BETWEEN 1 AND 180),
 contenido text NOT NULL CHECK (length(btrim(contenido)) BETWEEN 1 AND 5000),
 titulo_actividad text NOT NULL,
 fecha_actividad timestamptz(3) NOT NULL,
 lugar_actividad text NOT NULL,
 emitida_en timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
 estado text NOT NULL DEFAULT 'PUBLICADA' CHECK (estado IN ('PUBLICADA','ARCHIVADA')),
 UNIQUE (junta_id,id),
 FOREIGN KEY (junta_id,actividad_id) REFERENCES multi_junta.actividad(junta_id,id) ON DELETE RESTRICT
);
CREATE INDEX convocatoria_fecha_idx ON multi_junta.convocatoria(junta_id,emitida_en DESC);

CREATE TABLE multi_junta.convocatoria_destinatario (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 junta_id uuid NOT NULL,
 convocatoria_id uuid NOT NULL,
 membresia_id uuid NOT NULL,
 UNIQUE (junta_id,convocatoria_id,membresia_id),
 FOREIGN KEY (junta_id,convocatoria_id) REFERENCES multi_junta.convocatoria(junta_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (junta_id,membresia_id) REFERENCES multi_junta.membresia(junta_id,id) ON DELETE RESTRICT
);
CREATE INDEX convocatoria_destinatario_membresia_idx
 ON multi_junta.convocatoria_destinatario(junta_id,membresia_id,convocatoria_id);

CREATE TABLE multi_junta.comunicacion_documento (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 junta_id uuid NOT NULL REFERENCES multi_junta.junta(id) ON DELETE RESTRICT,
 tipo text NOT NULL CHECK (tipo IN ('ACTA','RESOLUCION','ACUERDO','OFICIO')),
 titulo text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 1 AND 180),
 fecha date NOT NULL,
 descripcion text NOT NULL CHECK (length(btrim(descripcion)) BETWEEN 1 AND 3000),
 institucion text,
 archivo bytea NOT NULL CHECK (octet_length(archivo) BETWEEN 5 AND 2097152),
 estado text NOT NULL DEFAULT 'PUBLICADO' CHECK (estado IN ('PUBLICADO','ARCHIVADO')),
 creado_en timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
 UNIQUE (junta_id,id),
 CHECK ((tipo='OFICIO' AND institucion IS NOT NULL AND length(btrim(institucion)) BETWEEN 1 AND 180)
    OR (tipo<>'OFICIO' AND institucion IS NULL))
);
CREATE INDEX comunicacion_documento_fecha_idx
 ON multi_junta.comunicacion_documento(junta_id,fecha DESC,id);

CREATE TABLE multi_junta.comunicacion_mensaje (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 junta_id uuid NOT NULL REFERENCES multi_junta.junta(id) ON DELETE RESTRICT,
 remitente_id uuid NOT NULL,
 destinatario_id uuid NOT NULL,
 texto text NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 3000),
 archivo bytea CHECK (archivo IS NULL OR octet_length(archivo) BETWEEN 5 AND 2097152),
 creado_en timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
 UNIQUE (junta_id,id),
 CHECK (remitente_id<>destinatario_id),
 FOREIGN KEY (junta_id,remitente_id) REFERENCES multi_junta.membresia(junta_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (junta_id,destinatario_id) REFERENCES multi_junta.membresia(junta_id,id) ON DELETE RESTRICT
);
CREATE INDEX comunicacion_mensaje_destinatario_idx
 ON multi_junta.comunicacion_mensaje(junta_id,destinatario_id,creado_en DESC);
CREATE INDEX comunicacion_mensaje_remitente_idx
 ON multi_junta.comunicacion_mensaje(junta_id,remitente_id,creado_en DESC);

CREATE FUNCTION multi_junta.comm_destinatarios(p_junta uuid)
RETURNS TABLE(id uuid, usuario text, rol text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $sql$
 SELECT m.id,c.nombre_usuario_normalizado,m.rol_codigo::text
 FROM multi_junta.op_contexto(p_junta) op
 JOIN multi_junta.membresia m ON m.junta_id=p_junta AND m.estado='ACTIVA'
 JOIN multi_junta.cuenta c ON c.id=m.cuenta_id AND c.estado='ACTIVA'
 WHERE (op.rol='SECRETARIA'
     OR (op.rol='ADMIN_JUNTA' AND m.rol_codigo='SOCIO')
     OR (op.rol='SOCIO' AND m.rol_codigo='ADMIN_JUNTA'))
  AND m.id<>op.membresia_id
 ORDER BY c.nombre_usuario_normalizado,m.id
$sql$;

CREATE FUNCTION multi_junta.comm_mensaje_permitido(
 p_junta uuid,p_remitente uuid,p_destinatario uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $sql$
 SELECT EXISTS (
  SELECT 1 FROM multi_junta.op_contexto(p_junta) op
  JOIN multi_junta.membresia m ON m.junta_id=p_junta AND m.id=p_destinatario AND m.estado='ACTIVA'
  JOIN multi_junta.cuenta c ON c.id=m.cuenta_id AND c.estado='ACTIVA'
  WHERE op.membresia_id=p_remitente AND p_remitente<>p_destinatario
   AND ((op.rol='SOCIO' AND m.rol_codigo='ADMIN_JUNTA')
     OR (op.rol='ADMIN_JUNTA' AND m.rol_codigo='SOCIO'))
 )
$sql$;

CREATE FUNCTION multi_junta.comm_destinatario_propio(p_junta uuid,p_membresia uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $sql$
 SELECT p_membresia=multi_junta.m3_membresia_actual(p_junta)
$sql$;

GRANT CREATE ON SCHEMA multi_junta TO multi_junta_identity;
ALTER FUNCTION multi_junta.comm_destinatarios(uuid) OWNER TO multi_junta_identity;
ALTER FUNCTION multi_junta.comm_mensaje_permitido(uuid,uuid,uuid) OWNER TO multi_junta_identity;
ALTER FUNCTION multi_junta.comm_destinatario_propio(uuid,uuid) OWNER TO multi_junta_identity;
REVOKE CREATE ON SCHEMA multi_junta FROM multi_junta_identity;
SET LOCAL ROLE multi_junta_identity;
REVOKE ALL ON FUNCTION multi_junta.comm_destinatarios(uuid),
 multi_junta.comm_mensaje_permitido(uuid,uuid,uuid),
 multi_junta.comm_destinatario_propio(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION multi_junta.comm_destinatarios(uuid),
 multi_junta.comm_mensaje_permitido(uuid,uuid,uuid),
 multi_junta.comm_destinatario_propio(uuid,uuid) TO multi_junta_app;
RESET ROLE;

ALTER TABLE multi_junta.convocatoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.convocatoria FORCE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.convocatoria_destinatario ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.convocatoria_destinatario FORCE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.comunicacion_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.comunicacion_documento FORCE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.comunicacion_mensaje ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.comunicacion_mensaje FORCE ROW LEVEL SECURITY;

CREATE POLICY convocatoria_dest_leer ON multi_junta.convocatoria_destinatario FOR SELECT TO multi_junta_app
 USING (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[])
   OR (multi_junta.op_visible(junta_id,ARRAY['ADMIN_JUNTA','TESORERIA','SOCIO']::text[])
     AND multi_junta.comm_destinatario_propio(junta_id,membresia_id)));
CREATE POLICY convocatoria_dest_insertar ON multi_junta.convocatoria_destinatario FOR INSERT TO multi_junta_app
 WITH CHECK (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[]));

CREATE POLICY convocatoria_leer ON multi_junta.convocatoria FOR SELECT TO multi_junta_app
 USING (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[])
   OR (estado='PUBLICADA'
     AND multi_junta.op_visible(junta_id,ARRAY['ADMIN_JUNTA','TESORERIA','SOCIO']::text[])
     AND EXISTS (
      SELECT 1 FROM multi_junta.convocatoria_destinatario d
      WHERE d.junta_id=convocatoria.junta_id AND d.convocatoria_id=convocatoria.id
       AND d.membresia_id=multi_junta.m3_membresia_actual(convocatoria.junta_id))));
CREATE POLICY convocatoria_insertar ON multi_junta.convocatoria FOR INSERT TO multi_junta_app
 WITH CHECK (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[]) AND estado='PUBLICADA');
CREATE POLICY convocatoria_archivar ON multi_junta.convocatoria FOR UPDATE TO multi_junta_app
 USING (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[]))
 WITH CHECK (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[]));

CREATE POLICY documento_leer ON multi_junta.comunicacion_documento FOR SELECT TO multi_junta_app
 USING (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[])
   OR (tipo<>'OFICIO' AND estado='PUBLICADO'
     AND multi_junta.op_visible(junta_id,ARRAY['ADMIN_JUNTA','TESORERIA','SOCIO']::text[])));
CREATE POLICY documento_insertar ON multi_junta.comunicacion_documento FOR INSERT TO multi_junta_app
 WITH CHECK (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[]) AND estado='PUBLICADO');
CREATE POLICY documento_archivar ON multi_junta.comunicacion_documento FOR UPDATE TO multi_junta_app
 USING (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[]))
 WITH CHECK (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[]));

CREATE POLICY mensaje_leer ON multi_junta.comunicacion_mensaje FOR SELECT TO multi_junta_app
 USING (multi_junta.op_visible(junta_id,ARRAY['ADMIN_JUNTA','SOCIO']::text[])
   AND (multi_junta.comm_destinatario_propio(junta_id,remitente_id)
     OR multi_junta.comm_destinatario_propio(junta_id,destinatario_id)));
CREATE POLICY mensaje_insertar ON multi_junta.comunicacion_mensaje FOR INSERT TO multi_junta_app
 WITH CHECK (multi_junta.comm_mensaje_permitido(junta_id,remitente_id,destinatario_id));

GRANT SELECT, INSERT, UPDATE (estado) ON multi_junta.convocatoria TO multi_junta_app;
GRANT SELECT, INSERT ON multi_junta.convocatoria_destinatario TO multi_junta_app;
GRANT SELECT, INSERT, UPDATE (estado) ON multi_junta.comunicacion_documento TO multi_junta_app;
GRANT SELECT, INSERT ON multi_junta.comunicacion_mensaje TO multi_junta_app;

CREATE TRIGGER auditar_convocatoria AFTER INSERT OR UPDATE ON multi_junta.convocatoria
 FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla();
CREATE TRIGGER auditar_convocatoria_dest AFTER INSERT ON multi_junta.convocatoria_destinatario
 FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla();
CREATE TRIGGER auditar_documento AFTER INSERT OR UPDATE ON multi_junta.comunicacion_documento
 FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla();
CREATE TRIGGER auditar_mensaje AFTER INSERT ON multi_junta.comunicacion_mensaje
 FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla();

COMMIT;
