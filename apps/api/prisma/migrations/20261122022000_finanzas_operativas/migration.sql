BEGIN;

SET LOCAL search_path = pg_catalog;

CREATE TABLE multi_junta.tarifa_multa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta (id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK (tipo IN ('ASAMBLEA', 'MINGA')),
    vigente_desde DATE NOT NULL,
    monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    UNIQUE (junta_id, id),
    UNIQUE (junta_id, tipo, vigente_desde)
);

CREATE TABLE multi_junta.obligacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta (id) ON DELETE RESTRICT,
    actividad_id UUID NOT NULL,
    asistencia_id UUID NOT NULL,
    socio_id UUID NOT NULL,
    tarifa_id UUID NOT NULL,
    concepto TEXT NOT NULL CHECK (char_length(concepto) BETWEEN 1 AND 180),
    monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    estado TEXT NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE', 'PAGADA', 'ANULADA', 'REVISION_PENDIENTE')),
    motivo_anulacion TEXT,
    motivo_revision TEXT,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    UNIQUE (junta_id, id),
    UNIQUE (junta_id, asistencia_id),
    FOREIGN KEY (junta_id, actividad_id) REFERENCES multi_junta.actividad (junta_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (junta_id, asistencia_id) REFERENCES multi_junta.asistencia (junta_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (junta_id, socio_id) REFERENCES multi_junta.socio (junta_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (junta_id, tarifa_id) REFERENCES multi_junta.tarifa_multa (junta_id, id) ON DELETE RESTRICT,
    CHECK ((estado = 'ANULADA') = (motivo_anulacion IS NOT NULL)),
    CHECK (estado <> 'REVISION_PENDIENTE' OR motivo_revision IS NOT NULL)
);

CREATE TABLE multi_junta.contador_comprobante (
    junta_id UUID PRIMARY KEY REFERENCES multi_junta.junta (id) ON DELETE RESTRICT,
    ultimo BIGINT NOT NULL CHECK (ultimo > 0)
);

CREATE TABLE multi_junta.pago (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta (id) ON DELETE RESTRICT,
    obligacion_id UUID,
    socio_id UUID NOT NULL,
    socio_nombre TEXT NOT NULL,
    junta_nombre TEXT NOT NULL,
    concepto TEXT NOT NULL CHECK (char_length(concepto) BETWEEN 1 AND 180),
    monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    fecha DATE NOT NULL,
    metodo TEXT NOT NULL CHECK (char_length(metodo) BETWEEN 1 AND 80),
    solicitud_id UUID NOT NULL,
    numero_comprobante BIGINT NOT NULL CHECK (numero_comprobante > 0),
    estado TEXT NOT NULL DEFAULT 'REGISTRADO' CHECK (estado IN ('REGISTRADO', 'ANULADO')),
    motivo_anulacion TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    UNIQUE (junta_id, id),
    UNIQUE (junta_id, numero_comprobante),
    UNIQUE (junta_id, solicitud_id),
    FOREIGN KEY (junta_id, socio_id) REFERENCES multi_junta.socio (junta_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (junta_id, obligacion_id) REFERENCES multi_junta.obligacion (junta_id, id) ON DELETE RESTRICT,
    CHECK ((estado = 'ANULADO') = (motivo_anulacion IS NOT NULL))
);

CREATE UNIQUE INDEX pago_obligacion_vigente_key ON multi_junta.pago (junta_id, obligacion_id)
    WHERE obligacion_id IS NOT NULL AND estado = 'REGISTRADO';
CREATE INDEX pago_junta_fecha_idx ON multi_junta.pago (junta_id, fecha DESC, numero_comprobante DESC);

CREATE TABLE multi_junta.gasto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta (id) ON DELETE RESTRICT,
    concepto TEXT NOT NULL CHECK (char_length(concepto) BETWEEN 1 AND 180),
    descripcion TEXT NOT NULL CHECK (char_length(descripcion) BETWEEN 1 AND 600),
    monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    fecha DATE NOT NULL,
    beneficiario TEXT NOT NULL CHECK (char_length(beneficiario) BETWEEN 1 AND 180),
    nombre_archivo TEXT NOT NULL,
    tipo_archivo TEXT NOT NULL CHECK (tipo_archivo IN ('application/pdf', 'image/jpeg', 'image/png')),
    archivo BYTEA NOT NULL CHECK (octet_length(archivo) BETWEEN 1 AND 2097152),
    estado TEXT NOT NULL DEFAULT 'REGISTRADO' CHECK (estado IN ('REGISTRADO', 'ANULADO')),
    motivo_anulacion TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    UNIQUE (junta_id, id),
    CHECK ((estado = 'ANULADO') = (motivo_anulacion IS NOT NULL))
);

CREATE INDEX gasto_junta_fecha_idx ON multi_junta.gasto (junta_id, fecha DESC, creado_en DESC);

ALTER TABLE multi_junta.tarifa_multa ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.tarifa_multa FORCE ROW LEVEL SECURITY;
CREATE POLICY tarifa_multa_lectura ON multi_junta.tarifa_multa FOR SELECT TO multi_junta_app
    USING (multi_junta.op_visible(junta_id, ARRAY['ADMIN_JUNTA','SECRETARIA','TESORERIA']::TEXT[]));
CREATE POLICY tarifa_multa_alta ON multi_junta.tarifa_multa FOR INSERT TO multi_junta_app
    WITH CHECK (multi_junta.op_visible(junta_id, ARRAY['ADMIN_JUNTA']::TEXT[]));

ALTER TABLE multi_junta.obligacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.obligacion FORCE ROW LEVEL SECURITY;
CREATE POLICY obligacion_lectura ON multi_junta.obligacion FOR SELECT TO multi_junta_app
    USING (multi_junta.op_visible(junta_id, ARRAY['SECRETARIA','TESORERIA']::TEXT[]));
CREATE POLICY obligacion_alta ON multi_junta.obligacion FOR INSERT TO multi_junta_app
    WITH CHECK (estado = 'PENDIENTE' AND multi_junta.op_visible(junta_id, ARRAY['SECRETARIA','TESORERIA']::TEXT[]));
CREATE POLICY obligacion_tesoreria ON multi_junta.obligacion FOR UPDATE TO multi_junta_app
    USING (multi_junta.op_visible(junta_id, ARRAY['TESORERIA']::TEXT[]))
    WITH CHECK (multi_junta.op_visible(junta_id, ARRAY['TESORERIA']::TEXT[]));
CREATE POLICY obligacion_correccion ON multi_junta.obligacion FOR UPDATE TO multi_junta_app
    USING (
        estado IN ('PENDIENTE', 'PAGADA') AND multi_junta.op_visible(junta_id, ARRAY['SECRETARIA']::TEXT[])
        AND EXISTS (
            SELECT 1 FROM multi_junta.asistencia a
            WHERE a.junta_id = obligacion.junta_id AND a.id = obligacion.asistencia_id
              AND a.estado IN ('PRESENTE', 'JUSTIFICADO')
        )
    )
    WITH CHECK (
        estado IN ('ANULADA', 'REVISION_PENDIENTE') AND multi_junta.op_visible(junta_id, ARRAY['SECRETARIA']::TEXT[])
        AND EXISTS (
            SELECT 1 FROM multi_junta.asistencia a
            WHERE a.junta_id = obligacion.junta_id AND a.id = obligacion.asistencia_id
              AND a.estado IN ('PRESENTE', 'JUSTIFICADO')
        )
    );

ALTER TABLE multi_junta.contador_comprobante ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.contador_comprobante FORCE ROW LEVEL SECURITY;
CREATE POLICY contador_comprobante_tesoreria ON multi_junta.contador_comprobante FOR ALL TO multi_junta_app
    USING (multi_junta.op_visible(junta_id, ARRAY['TESORERIA']::TEXT[]))
    WITH CHECK (multi_junta.op_visible(junta_id, ARRAY['TESORERIA']::TEXT[]));

ALTER TABLE multi_junta.pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.pago FORCE ROW LEVEL SECURITY;
CREATE POLICY pago_tesoreria ON multi_junta.pago FOR ALL TO multi_junta_app
    USING (multi_junta.op_visible(junta_id, ARRAY['TESORERIA']::TEXT[]))
    WITH CHECK (multi_junta.op_visible(junta_id, ARRAY['TESORERIA']::TEXT[]));

ALTER TABLE multi_junta.gasto ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.gasto FORCE ROW LEVEL SECURITY;
CREATE POLICY gasto_tesoreria ON multi_junta.gasto FOR ALL TO multi_junta_app
    USING (multi_junta.op_visible(junta_id, ARRAY['TESORERIA']::TEXT[]))
    WITH CHECK (multi_junta.op_visible(junta_id, ARRAY['TESORERIA']::TEXT[]));

GRANT SELECT, INSERT ON multi_junta.tarifa_multa TO multi_junta_app;
GRANT SELECT, INSERT, UPDATE (estado, motivo_anulacion, motivo_revision) ON multi_junta.obligacion TO multi_junta_app;
GRANT SELECT, INSERT, UPDATE (ultimo) ON multi_junta.contador_comprobante TO multi_junta_app;
GRANT SELECT, INSERT, UPDATE (estado, motivo_anulacion) ON multi_junta.pago, multi_junta.gasto TO multi_junta_app;

CREATE TRIGGER auditoria AFTER INSERT ON multi_junta.tarifa_multa
    FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla();
CREATE TRIGGER auditoria AFTER INSERT OR UPDATE ON multi_junta.obligacion
    FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla();
CREATE TRIGGER auditoria AFTER INSERT OR UPDATE ON multi_junta.pago
    FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla();
CREATE TRIGGER auditoria AFTER INSERT OR UPDATE ON multi_junta.gasto
    FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla();

CREATE FUNCTION multi_junta.finanzas_corregir_ausencia()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
    UPDATE multi_junta.obligacion
    SET estado = CASE WHEN estado = 'PAGADA' THEN 'REVISION_PENDIENTE' ELSE 'ANULADA' END,
        motivo_anulacion = CASE WHEN estado = 'PENDIENTE' THEN 'Ausencia corregida por Secretaría.' END,
        motivo_revision = CASE WHEN estado = 'PAGADA' THEN 'Ausencia corregida con pago vigente.' END
    WHERE junta_id = NEW.junta_id AND asistencia_id = NEW.id AND estado IN ('PENDIENTE', 'PAGADA');
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION multi_junta.finanzas_corregir_ausencia() FROM PUBLIC;
CREATE TRIGGER finanzas_corregir_ausencia AFTER UPDATE OF estado ON multi_junta.asistencia
    FOR EACH ROW WHEN (OLD.estado = 'AUSENTE' AND NEW.estado IN ('PRESENTE', 'JUSTIFICADO'))
    EXECUTE FUNCTION multi_junta.finanzas_corregir_ausencia();

COMMIT;
