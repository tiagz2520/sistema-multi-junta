BEGIN;

SET LOCAL search_path = pg_catalog;

CREATE TABLE multi_junta.sector (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta (id) ON DELETE RESTRICT,
    nombre TEXT NOT NULL CHECK (btrim(nombre) <> ''),
    clasificacion TEXT NOT NULL CHECK (btrim(clasificacion) <> ''),
    descripcion TEXT,
    estado multi_junta.estado NOT NULL DEFAULT 'ACTIVA',
    UNIQUE (junta_id, id)
);

CREATE TABLE multi_junta.socio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta (id) ON DELETE RESTRICT,
    cedula TEXT NOT NULL CHECK (cedula COLLATE "C" ~ '^[0-9]{10}$'),
    nombres TEXT NOT NULL CHECK (btrim(nombres) <> ''),
    apellidos TEXT NOT NULL CHECK (btrim(apellidos) <> ''),
    estado multi_junta.estado NOT NULL DEFAULT 'ACTIVA',
    sector_id UUID,
    UNIQUE (junta_id, id),
    UNIQUE (junta_id, cedula),
    FOREIGN KEY (junta_id, sector_id) REFERENCES multi_junta.sector (junta_id, id) ON DELETE RESTRICT
);

CREATE INDEX socio_sector_idx ON multi_junta.socio (junta_id, sector_id, apellidos, nombres, id);

CREATE TABLE multi_junta.actividad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta (id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK (tipo IN ('ASAMBLEA', 'MINGA')),
    titulo TEXT NOT NULL CHECK (btrim(titulo) <> ''),
    inicio TIMESTAMPTZ(3) NOT NULL,
    fin TIMESTAMPTZ(3) NOT NULL CHECK (fin > inicio),
    lugar TEXT NOT NULL CHECK (btrim(lugar) <> ''),
    estado TEXT NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'CERRADA')),
    UNIQUE (junta_id, id)
);

CREATE INDEX actividad_inicio_idx ON multi_junta.actividad (junta_id, inicio, id);

CREATE TABLE multi_junta.asistencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta (id) ON DELETE RESTRICT,
    actividad_id UUID NOT NULL,
    socio_id UUID NOT NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    estado TEXT CHECK (estado IN ('PRESENTE', 'AUSENTE', 'JUSTIFICADO')),
    UNIQUE (junta_id, id),
    UNIQUE (junta_id, actividad_id, socio_id),
    FOREIGN KEY (junta_id, actividad_id) REFERENCES multi_junta.actividad (junta_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (junta_id, socio_id) REFERENCES multi_junta.socio (junta_id, id) ON DELETE RESTRICT
);

CREATE TABLE multi_junta.historial_asistencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta (id) ON DELETE RESTRICT,
    asistencia_id UUID NOT NULL,
    estado_anterior TEXT CHECK (estado_anterior IN ('PRESENTE', 'AUSENTE', 'JUSTIFICADO')),
    estado_resultante TEXT NOT NULL CHECK (estado_resultante IN ('PRESENTE', 'AUSENTE', 'JUSTIFICADO')),
    motivo TEXT,
    ocurrido_en TIMESTAMPTZ(3) NOT NULL DEFAULT statement_timestamp(),
    UNIQUE (junta_id, id),
    FOREIGN KEY (junta_id, asistencia_id) REFERENCES multi_junta.asistencia (junta_id, id) ON DELETE RESTRICT,
    CHECK (estado_anterior IS DISTINCT FROM estado_resultante),
    CHECK (estado_anterior IS NULL OR (motivo IS NOT NULL AND btrim(motivo) <> ''))
);

CREATE INDEX historial_asistencia_fecha_idx ON multi_junta.historial_asistencia (junta_id, asistencia_id, ocurrido_en, id);

CREATE TABLE multi_junta.justificacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta (id) ON DELETE RESTRICT,
    asistencia_id UUID NOT NULL,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'ACEPTADA', 'RECHAZADA')),
    motivo TEXT NOT NULL CHECK (btrim(motivo) <> ''),
    motivo_decision TEXT,
    creada_en TIMESTAMPTZ(3) NOT NULL DEFAULT statement_timestamp(),
    decidida_en TIMESTAMPTZ(3),
    UNIQUE (junta_id, id),
    FOREIGN KEY (junta_id, asistencia_id) REFERENCES multi_junta.asistencia (junta_id, id) ON DELETE RESTRICT,
    CHECK (
        (estado = 'PENDIENTE' AND motivo_decision IS NULL AND decidida_en IS NULL)
        OR (estado <> 'PENDIENTE' AND motivo_decision IS NOT NULL AND btrim(motivo_decision) <> '' AND decidida_en IS NOT NULL)
    )
);

CREATE UNIQUE INDEX justificacion_pendiente_por_asistencia_idx
    ON multi_junta.justificacion (junta_id, asistencia_id) WHERE estado = 'PENDIENTE';
CREATE INDEX justificacion_asistencia_estado_idx ON multi_junta.justificacion (junta_id, asistencia_id, estado);

DO $policies$
DECLARE
    item RECORD;
BEGIN
    FOR item IN SELECT * FROM (VALUES
        ('sector', 'ARRAY[''ADMIN_JUNTA'',''SECRETARIA'']::text[]', 'ARRAY[''ADMIN_JUNTA'']::text[]', true),
        ('socio', 'ARRAY[''ADMIN_JUNTA'',''SECRETARIA'',''TESORERIA'']::text[]', 'ARRAY[''SECRETARIA'']::text[]', true),
        ('actividad', 'ARRAY[''SECRETARIA'',''TESORERIA'']::text[]', 'ARRAY[''SECRETARIA'']::text[]', true),
        ('asistencia', 'ARRAY[''SECRETARIA'',''TESORERIA'']::text[]', 'ARRAY[''SECRETARIA'']::text[]', true),
        ('historial_asistencia', 'ARRAY[''SECRETARIA'']::text[]', 'ARRAY[''SECRETARIA'']::text[]', false),
        ('justificacion', 'ARRAY[''SECRETARIA'',''TESORERIA'']::text[]', 'ARRAY[''SECRETARIA'']::text[]', true)
    ) AS rules(table_name, readers, writers, can_update) LOOP
        EXECUTE format('ALTER TABLE multi_junta.%I ENABLE ROW LEVEL SECURITY', item.table_name);
        EXECUTE format('ALTER TABLE multi_junta.%I FORCE ROW LEVEL SECURITY', item.table_name);
        EXECUTE format('CREATE POLICY lectura ON multi_junta.%I FOR SELECT TO multi_junta_app USING (multi_junta.op_visible(junta_id, %s))', item.table_name, item.readers);
        EXECUTE format('CREATE POLICY alta ON multi_junta.%I FOR INSERT TO multi_junta_app WITH CHECK (multi_junta.op_visible(junta_id, %s))', item.table_name, item.writers);
        IF item.can_update THEN
            EXECUTE format('CREATE POLICY cambio ON multi_junta.%I FOR UPDATE TO multi_junta_app USING (multi_junta.op_visible(junta_id, %s)) WITH CHECK (multi_junta.op_visible(junta_id, %s))', item.table_name, item.writers, item.writers);
        END IF;
        EXECUTE format('CREATE TRIGGER auditoria AFTER INSERT OR UPDATE ON multi_junta.%I FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla()', item.table_name);
    END LOOP;
END;
$policies$;

GRANT SELECT, INSERT ON multi_junta.sector, multi_junta.socio, multi_junta.actividad,
    multi_junta.asistencia, multi_junta.historial_asistencia, multi_junta.justificacion TO multi_junta_app;
GRANT UPDATE (nombre, clasificacion, descripcion, estado) ON multi_junta.sector TO multi_junta_app;
GRANT UPDATE (cedula, nombres, apellidos, sector_id, estado) ON multi_junta.socio TO multi_junta_app;
GRANT UPDATE (tipo, titulo, inicio, fin, lugar, estado) ON multi_junta.actividad TO multi_junta_app;
GRANT UPDATE (estado) ON multi_junta.asistencia TO multi_junta_app;
GRANT UPDATE (estado, motivo_decision, decidida_en) ON multi_junta.justificacion TO multi_junta_app;

COMMIT;
