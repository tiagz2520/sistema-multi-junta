BEGIN;
SET LOCAL search_path = pg_catalog;

CREATE TABLE multi_junta.inventario_articulo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta(id) ON DELETE RESTRICT,
    nombre TEXT NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
    categoria TEXT NOT NULL CHECK (length(btrim(categoria)) BETWEEN 1 AND 80),
    unidad TEXT NOT NULL CHECK (length(btrim(unidad)) BETWEEN 1 AND 40),
    stock NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (stock >= 0 AND stock <> 'NaN'::NUMERIC),
    costo_unitario NUMERIC(14,2) CHECK (costo_unitario >= 0 AND costo_unitario <> 'NaN'::NUMERIC),
    estado multi_junta.estado NOT NULL DEFAULT 'ACTIVA',
    CONSTRAINT inventario_articulo_junta_id_key UNIQUE (junta_id, id),
    CONSTRAINT inventario_articulo_nombre_key UNIQUE (junta_id, nombre),
    CONSTRAINT inventario_articulo_baja_check CHECK (estado = 'ACTIVA' OR stock = 0)
);

CREATE TABLE multi_junta.inventario_movimiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL,
    articulo_id UUID NOT NULL,
    responsable_id UUID NOT NULL REFERENCES multi_junta.cuenta(id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA')),
    cantidad NUMERIC(14,3) NOT NULL CHECK (cantidad > 0 AND cantidad <> 'NaN'::NUMERIC),
    motivo TEXT NOT NULL CHECK (length(btrim(motivo)) BETWEEN 1 AND 500),
    stock_resultante NUMERIC(14,3) NOT NULL CHECK (stock_resultante >= 0 AND stock_resultante <> 'NaN'::NUMERIC),
    ocurrido_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventario_movimiento_articulo_fkey FOREIGN KEY (junta_id, articulo_id)
      REFERENCES multi_junta.inventario_articulo(junta_id, id) ON DELETE RESTRICT
);

CREATE INDEX inventario_movimiento_articulo_idx
    ON multi_junta.inventario_movimiento (junta_id, articulo_id, ocurrido_en);

CREATE TABLE multi_junta.activo_fijo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta(id) ON DELETE RESTRICT,
    codigo TEXT NOT NULL CHECK (length(btrim(codigo)) BETWEEN 1 AND 40),
    nombre TEXT NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
    descripcion TEXT NOT NULL CHECK (length(btrim(descripcion)) BETWEEN 1 AND 1000),
    ubicacion TEXT NOT NULL CHECK (length(btrim(ubicacion)) BETWEEN 1 AND 200),
    fecha_adquisicion DATE NOT NULL,
    valor NUMERIC(14,2) NOT NULL CHECK (valor > 0 AND valor <> 'NaN'::NUMERIC),
    vida_util INTEGER CHECK (vida_util > 0),
    documento TEXT NOT NULL CHECK (length(btrim(documento)) BETWEEN 1 AND 200),
    estado multi_junta.estado NOT NULL DEFAULT 'ACTIVA',
    motivo_baja TEXT,
    baja_en TIMESTAMPTZ(3),
    CONSTRAINT activo_fijo_codigo_key UNIQUE (junta_id, codigo),
    CONSTRAINT activo_fijo_baja_check CHECK (
        (estado = 'ACTIVA' AND motivo_baja IS NULL AND baja_en IS NULL)
          OR (estado = 'INACTIVA' AND length(btrim(motivo_baja)) BETWEEN 1 AND 500 AND baja_en IS NOT NULL)
    )
);

CREATE TABLE multi_junta.propiedad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL REFERENCES multi_junta.junta(id) ON DELETE RESTRICT,
    socio_id UUID NOT NULL,
    sector_id UUID NOT NULL,
    nombre TEXT NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
    dimensiones TEXT NOT NULL CHECK (length(btrim(dimensiones)) BETWEEN 1 AND 200),
    latitud NUMERIC(9,6),
    longitud NUMERIC(9,6),
    estado multi_junta.estado NOT NULL DEFAULT 'ACTIVA',
    CONSTRAINT propiedad_junta_id_key UNIQUE (junta_id, id),
    CONSTRAINT propiedad_socio_fkey FOREIGN KEY (junta_id, socio_id)
      REFERENCES multi_junta.socio(junta_id, id) ON DELETE RESTRICT,
    CONSTRAINT propiedad_sector_fkey FOREIGN KEY (junta_id, sector_id)
      REFERENCES multi_junta.sector(junta_id, id) ON DELETE RESTRICT,
    CONSTRAINT propiedad_coordenadas_check CHECK (
      (latitud IS NULL AND longitud IS NULL) OR (
        latitud IS NOT NULL AND longitud IS NOT NULL AND latitud BETWEEN -90 AND 90
        AND longitud BETWEEN -180 AND 180
      )
    )
);

CREATE INDEX propiedad_socio_idx ON multi_junta.propiedad (junta_id, socio_id);
CREATE INDEX propiedad_sector_idx ON multi_junta.propiedad (junta_id, sector_id);

CREATE TABLE multi_junta.propiedad_foto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    junta_id UUID NOT NULL,
    propiedad_id UUID NOT NULL,
    imagen BYTEA NOT NULL CHECK (octet_length(imagen) BETWEEN 4 AND 2097152),
    CONSTRAINT propiedad_foto_propiedad_key UNIQUE (junta_id, propiedad_id),
    CONSTRAINT propiedad_foto_propiedad_fkey FOREIGN KEY (junta_id, propiedad_id)
      REFERENCES multi_junta.propiedad(junta_id, id) ON DELETE RESTRICT
);

DO $seguridad$
DECLARE nombre TEXT; rol TEXT;
BEGIN
    FOR nombre, rol IN SELECT * FROM (VALUES
        ('inventario_articulo','TESORERIA'), ('inventario_movimiento','TESORERIA'),
        ('activo_fijo','TESORERIA'), ('propiedad','SECRETARIA'), ('propiedad_foto','SECRETARIA')
    ) AS objetos(n, r) LOOP
        EXECUTE format('ALTER TABLE multi_junta.%I ENABLE ROW LEVEL SECURITY', nombre);
        EXECUTE format('ALTER TABLE multi_junta.%I FORCE ROW LEVEL SECURITY', nombre);
        EXECUTE format('CREATE POLICY recursos_leer ON multi_junta.%I FOR SELECT TO multi_junta_app USING (multi_junta.op_visible(junta_id, ARRAY[%L]::TEXT[]))', nombre, rol);
        EXECUTE format('CREATE POLICY recursos_crear ON multi_junta.%I FOR INSERT TO multi_junta_app WITH CHECK (multi_junta.op_visible(junta_id, ARRAY[%L]::TEXT[]))', nombre, rol);
        IF nombre <> 'inventario_movimiento' THEN
            EXECUTE format('CREATE POLICY recursos_editar ON multi_junta.%I FOR UPDATE TO multi_junta_app USING (multi_junta.op_visible(junta_id, ARRAY[%L]::TEXT[])) WITH CHECK (multi_junta.op_visible(junta_id, ARRAY[%L]::TEXT[]))', nombre, rol, rol);
        END IF;
        EXECUTE format('CREATE TRIGGER recursos_auditar AFTER INSERT OR UPDATE ON multi_junta.%I FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla()', nombre);
    END LOOP;
END
$seguridad$;

GRANT SELECT, INSERT ON multi_junta.inventario_articulo, multi_junta.inventario_movimiento,
    multi_junta.activo_fijo, multi_junta.propiedad, multi_junta.propiedad_foto TO multi_junta_app;
GRANT UPDATE (nombre, categoria, unidad, costo_unitario, stock, estado)
    ON multi_junta.inventario_articulo TO multi_junta_app;
GRANT UPDATE (nombre, descripcion, ubicacion, fecha_adquisicion, valor, vida_util, documento, estado, motivo_baja, baja_en)
    ON multi_junta.activo_fijo TO multi_junta_app;
GRANT UPDATE (socio_id, sector_id, nombre, dimensiones, latitud, longitud, estado)
    ON multi_junta.propiedad TO multi_junta_app;
GRANT UPDATE (imagen) ON multi_junta.propiedad_foto TO multi_junta_app;

COMMIT;
