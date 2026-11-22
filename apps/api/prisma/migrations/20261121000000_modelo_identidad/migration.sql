BEGIN;

SET LOCAL search_path = pg_catalog;

CREATE TYPE multi_junta.estado AS ENUM ('ACTIVA', 'INACTIVA');
CREATE TYPE multi_junta.codigo_rol AS ENUM (
    'SUPER_ADMIN', 'ADMIN_JUNTA', 'SECRETARIA', 'TESORERIA', 'SOCIO'
);
CREATE TYPE multi_junta.ambito_rol AS ENUM ('PLATAFORMA', 'JUNTA');
CREATE TYPE multi_junta.ambito_sesion AS ENUM ('PREVIA', 'PLATAFORMA', 'JUNTA');

CREATE TABLE multi_junta.junta (
    id UUID NOT NULL,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL,
    ruc TEXT,
    estado multi_junta.estado NOT NULL DEFAULT 'ACTIVA',
    version_acceso INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT junta_pkey PRIMARY KEY (id),
    CONSTRAINT junta_version_acceso_check CHECK (version_acceso > 0)
);

CREATE TABLE multi_junta.rol (
    codigo multi_junta.codigo_rol NOT NULL,
    ambito multi_junta.ambito_rol NOT NULL,
    nombre TEXT NOT NULL,
    CONSTRAINT rol_pkey PRIMARY KEY (codigo),
    CONSTRAINT rol_codigo_ambito_check CHECK (
        (codigo = 'SUPER_ADMIN' AND ambito = 'PLATAFORMA')
        OR (codigo <> 'SUPER_ADMIN' AND ambito = 'JUNTA')
    )
);

CREATE UNIQUE INDEX junta_ruc_key ON multi_junta.junta (ruc);
CREATE UNIQUE INDEX rol_codigo_ambito_key ON multi_junta.rol (codigo, ambito);

CREATE TABLE multi_junta.cuenta (
    id UUID NOT NULL,
    nombre_usuario_normalizado VARCHAR(32) NOT NULL,
    hash_contrasena TEXT NOT NULL,
    estado multi_junta.estado NOT NULL DEFAULT 'ACTIVA',
    requiere_cambio_contrasena BOOLEAN NOT NULL DEFAULT false,
    version_acceso INTEGER NOT NULL DEFAULT 1,
    rol_plataforma_codigo multi_junta.codigo_rol,
    rol_plataforma_ambito multi_junta.ambito_rol NOT NULL DEFAULT 'PLATAFORMA',
    CONSTRAINT cuenta_pkey PRIMARY KEY (id),
    CONSTRAINT cuenta_nombre_usuario_normalizado_check CHECK (
        nombre_usuario_normalizado COLLATE "C" ~ '^[a-z0-9._-]{3,32}$'
    ),
    CONSTRAINT cuenta_version_acceso_check CHECK (version_acceso > 0),
    CONSTRAINT cuenta_rol_plataforma_ambito_check CHECK (rol_plataforma_ambito = 'PLATAFORMA'),
    CONSTRAINT cuenta_rol_plataforma_codigo_rol_plataforma_ambito_fkey
        FOREIGN KEY (rol_plataforma_codigo, rol_plataforma_ambito)
        REFERENCES multi_junta.rol (codigo, ambito) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX cuenta_nombre_usuario_normalizado_key
    ON multi_junta.cuenta (nombre_usuario_normalizado);

CREATE TABLE multi_junta.membresia (
    id UUID NOT NULL,
    junta_id UUID NOT NULL,
    cuenta_id UUID NOT NULL,
    rol_codigo multi_junta.codigo_rol NOT NULL,
    rol_ambito multi_junta.ambito_rol NOT NULL DEFAULT 'JUNTA',
    estado multi_junta.estado NOT NULL DEFAULT 'ACTIVA',
    version_acceso INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT membresia_pkey PRIMARY KEY (id),
    CONSTRAINT membresia_rol_ambito_check CHECK (rol_ambito = 'JUNTA'),
    CONSTRAINT membresia_version_acceso_check CHECK (version_acceso > 0),
    CONSTRAINT membresia_junta_id_fkey FOREIGN KEY (junta_id)
        REFERENCES multi_junta.junta (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT membresia_cuenta_id_fkey FOREIGN KEY (cuenta_id)
        REFERENCES multi_junta.cuenta (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT membresia_rol_codigo_rol_ambito_fkey FOREIGN KEY (rol_codigo, rol_ambito)
        REFERENCES multi_junta.rol (codigo, ambito) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX membresia_junta_id_cuenta_id_key
    ON multi_junta.membresia (junta_id, cuenta_id);
CREATE UNIQUE INDEX membresia_junta_id_id_cuenta_id_key
    ON multi_junta.membresia (junta_id, id, cuenta_id);
CREATE INDEX membresia_cuenta_id_idx ON multi_junta.membresia (cuenta_id);

CREATE UNIQUE INDEX membresia_admin_junta_activa_key ON multi_junta.membresia (cuenta_id)
    WHERE rol_codigo = 'ADMIN_JUNTA' AND estado = 'ACTIVA';

CREATE TABLE multi_junta.sesion (
    id UUID NOT NULL,
    huella_token TEXT NOT NULL,
    cuenta_id UUID NOT NULL,
    ambito multi_junta.ambito_sesion NOT NULL,
    junta_id UUID,
    membresia_id UUID,
    version_acceso_cuenta INTEGER NOT NULL DEFAULT 1,
    version_acceso_junta INTEGER,
    version_acceso_membresia INTEGER,
    emitida_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_absoluta_en TIMESTAMPTZ(3) NOT NULL,
    expira_inactividad_en TIMESTAMPTZ(3) NOT NULL,
    revocada_en TIMESTAMPTZ(3),
    CONSTRAINT sesion_pkey PRIMARY KEY (id),
    CONSTRAINT sesion_ambito_junta_check CHECK (
        (ambito = 'JUNTA' AND junta_id IS NOT NULL AND membresia_id IS NOT NULL)
        OR (ambito <> 'JUNTA' AND junta_id IS NULL AND membresia_id IS NULL)
    ),
    CONSTRAINT sesion_version_acceso_check CHECK (
        version_acceso_cuenta > 0
        AND (version_acceso_junta IS NULL OR version_acceso_junta > 0)
        AND (version_acceso_membresia IS NULL OR version_acceso_membresia > 0)
    ),
    CONSTRAINT sesion_cuenta_id_fkey FOREIGN KEY (cuenta_id)
        REFERENCES multi_junta.cuenta (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT sesion_junta_id_membresia_id_cuenta_id_fkey
        FOREIGN KEY (junta_id, membresia_id, cuenta_id)
        REFERENCES multi_junta.membresia (junta_id, id, cuenta_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX sesion_huella_token_key ON multi_junta.sesion (huella_token);
CREATE INDEX sesion_cuenta_id_idx ON multi_junta.sesion (cuenta_id);
CREATE INDEX sesion_junta_id_membresia_id_cuenta_id_idx
    ON multi_junta.sesion (junta_id, membresia_id, cuenta_id);

INSERT INTO multi_junta.rol (codigo, ambito, nombre) VALUES
    ('SUPER_ADMIN', 'PLATAFORMA', 'Super Administrador de la Plataforma'),
    ('ADMIN_JUNTA', 'JUNTA', 'Administrador de la Junta'),
    ('SECRETARIA', 'JUNTA', 'Secretaría'),
    ('TESORERIA', 'JUNTA', 'Tesorería'),
    ('SOCIO', 'JUNTA', 'Socio');

-- La validación del parámetro evita errores de conversión y conserva la comparación por UUID.
ALTER TABLE multi_junta.membresia ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.membresia FORCE ROW LEVEL SECURITY;
CREATE POLICY membresia_aislamiento_junta ON multi_junta.membresia
    FOR ALL TO multi_junta_app
    USING (junta_id = CASE
        WHEN pg_input_is_valid(current_setting('app.junta_id', true), 'pg_catalog.uuid')
        THEN current_setting('app.junta_id', true)::UUID
    END)
    WITH CHECK (junta_id = CASE
        WHEN pg_input_is_valid(current_setting('app.junta_id', true), 'pg_catalog.uuid')
        THEN current_setting('app.junta_id', true)::UUID
    END);

ALTER TABLE multi_junta.sesion ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.sesion FORCE ROW LEVEL SECURITY;
CREATE POLICY sesion_aislamiento_junta ON multi_junta.sesion
    FOR ALL TO multi_junta_app
    USING (ambito = 'JUNTA' AND junta_id = CASE
        WHEN pg_input_is_valid(current_setting('app.junta_id', true), 'pg_catalog.uuid')
        THEN current_setting('app.junta_id', true)::UUID
    END)
    WITH CHECK (ambito = 'JUNTA' AND junta_id = CASE
        WHEN pg_input_is_valid(current_setting('app.junta_id', true), 'pg_catalog.uuid')
        THEN current_setting('app.junta_id', true)::UUID
    END);

COMMIT;
