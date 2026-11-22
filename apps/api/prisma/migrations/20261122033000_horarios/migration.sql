BEGIN;
SET LOCAL search_path=pg_catalog;

CREATE TABLE multi_junta.horario_servicio (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 junta_id uuid NOT NULL REFERENCES multi_junta.junta(id) ON DELETE RESTRICT,
 nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
 estado multi_junta.estado NOT NULL DEFAULT 'ACTIVA',
 UNIQUE (junta_id,id),
 UNIQUE (junta_id,nombre)
);

CREATE TABLE multi_junta.horario_semanal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 junta_id uuid NOT NULL REFERENCES multi_junta.junta(id) ON DELETE RESTRICT,
 servicio_id uuid NOT NULL,
 sector_id uuid NOT NULL,
 dia integer NOT NULL CHECK (dia BETWEEN 1 AND 7),
 inicio time(0) NOT NULL,
 fin time(0) NOT NULL,
 desde date NOT NULL,
 hasta date NOT NULL,
 estado text NOT NULL DEFAULT 'PUBLICADO' CHECK (estado IN ('PUBLICADO','ARCHIVADO')),
 creado_en timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
 UNIQUE (junta_id,id),
 CHECK (inicio<fin AND desde<=hasta),
 FOREIGN KEY (junta_id,servicio_id) REFERENCES multi_junta.horario_servicio(junta_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (junta_id,sector_id) REFERENCES multi_junta.sector(junta_id,id) ON DELETE RESTRICT
);
CREATE INDEX horario_sector_vigencia_idx
 ON multi_junta.horario_semanal(junta_id,sector_id,dia,desde,hasta);

ALTER TABLE multi_junta.horario_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.horario_servicio FORCE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.horario_semanal ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.horario_semanal FORCE ROW LEVEL SECURITY;

CREATE POLICY horario_servicio_leer ON multi_junta.horario_servicio FOR SELECT TO multi_junta_app
 USING (multi_junta.op_visible(junta_id,ARRAY['ADMIN_JUNTA','SECRETARIA','SOCIO']::text[]));
CREATE POLICY horario_servicio_insertar ON multi_junta.horario_servicio FOR INSERT TO multi_junta_app
 WITH CHECK (multi_junta.op_visible(junta_id,ARRAY['ADMIN_JUNTA']::text[]));
CREATE POLICY horario_semanal_leer ON multi_junta.horario_semanal FOR SELECT TO multi_junta_app
 USING (
   multi_junta.op_visible(junta_id,ARRAY['SECRETARIA','ADMIN_JUNTA']::text[])
   OR (estado='PUBLICADO' AND multi_junta.op_visible(junta_id,ARRAY['SOCIO']::text[])
     AND EXISTS (
       SELECT 1 FROM multi_junta.socio s
       WHERE s.junta_id=horario_semanal.junta_id AND s.sector_id=horario_semanal.sector_id
         AND s.id=multi_junta.portal_socio_actual(horario_semanal.junta_id)
     ))
 );
CREATE POLICY horario_semanal_insertar ON multi_junta.horario_semanal FOR INSERT TO multi_junta_app
 WITH CHECK (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[]) AND estado='PUBLICADO');
CREATE POLICY horario_semanal_cambiar ON multi_junta.horario_semanal FOR UPDATE TO multi_junta_app
 USING (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[]))
 WITH CHECK (multi_junta.op_visible(junta_id,ARRAY['SECRETARIA']::text[]));

-- Un Socio únicamente puede resolver el nombre del sector al que está vinculado.
CREATE POLICY sector_portal_socio ON multi_junta.sector FOR SELECT TO multi_junta_app
 USING (multi_junta.op_visible(junta_id,ARRAY['SOCIO']::text[])
   AND id=(SELECT s.sector_id FROM multi_junta.socio s
    WHERE s.junta_id=sector.junta_id AND s.id=multi_junta.portal_socio_actual(sector.junta_id)));

GRANT SELECT,INSERT ON multi_junta.horario_servicio TO multi_junta_app;
GRANT SELECT,INSERT,UPDATE (servicio_id,sector_id,dia,inicio,fin,desde,hasta,estado)
 ON multi_junta.horario_semanal TO multi_junta_app;

CREATE TRIGGER horario_servicio_auditar AFTER INSERT OR UPDATE ON multi_junta.horario_servicio
 FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla();
CREATE TRIGGER horario_auditar AFTER INSERT OR UPDATE ON multi_junta.horario_semanal
 FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla();

COMMIT;
