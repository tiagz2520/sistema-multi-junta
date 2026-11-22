BEGIN;
SET LOCAL search_path = pg_catalog;

-- Permite referencias compuestas que verifican junta y membresía en la propia FK.
ALTER TABLE multi_junta.membresia
  ADD CONSTRAINT membresia_junta_id_id_key UNIQUE (junta_id,id);

CREATE TABLE multi_junta.socio_vinculo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  junta_id uuid NOT NULL,
  socio_id uuid NOT NULL,
  membresia_id uuid NOT NULL,
  operador_id uuid NOT NULL REFERENCES multi_junta.cuenta(id) ON DELETE RESTRICT,
  codigo_hash text,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ACTIVO','REVOCADO','VENCIDO')),
  vence_en timestamptz(3) NOT NULL DEFAULT (statement_timestamp() + interval '24 hours'),
  creado_en timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  confirmado_en timestamptz(3),
  revocado_en timestamptz(3),
  revocado_por uuid REFERENCES multi_junta.cuenta(id) ON DELETE RESTRICT,
  motivo_revocacion text,
  FOREIGN KEY (junta_id,socio_id) REFERENCES multi_junta.socio(junta_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (junta_id,membresia_id) REFERENCES multi_junta.membresia(junta_id,id) ON DELETE RESTRICT,
  CHECK ((estado = 'PENDIENTE') = (codigo_hash IS NOT NULL)),
  CHECK (codigo_hash IS NULL OR codigo_hash COLLATE "C" ~ '^[a-f0-9]{64}$'),
  CHECK (estado <> 'ACTIVO' OR confirmado_en IS NOT NULL),
  CHECK (estado <> 'REVOCADO' OR (revocado_en IS NOT NULL AND revocado_por IS NOT NULL AND motivo_revocacion IS NOT NULL))
);

CREATE UNIQUE INDEX socio_vinculo_disponibilidad_socio ON multi_junta.socio_vinculo(junta_id,socio_id)
  WHERE estado IN ('PENDIENTE','ACTIVO');
CREATE UNIQUE INDEX socio_vinculo_disponibilidad_membresia ON multi_junta.socio_vinculo(junta_id,membresia_id)
  WHERE estado IN ('PENDIENTE','ACTIVO');
CREATE UNIQUE INDEX socio_vinculo_codigo_key ON multi_junta.socio_vinculo(codigo_hash);

ALTER TABLE multi_junta.socio_vinculo ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_junta.socio_vinculo FORCE ROW LEVEL SECURITY;
CREATE POLICY portal_vinculo_identidad ON multi_junta.socio_vinculo FOR ALL TO multi_junta_identity
  USING (junta_id::text = current_setting('app.junta_id', true))
  WITH CHECK (junta_id::text = current_setting('app.junta_id', true));
CREATE POLICY portal_vinculo_admin ON multi_junta.socio_vinculo FOR SELECT TO multi_junta_app
  USING (multi_junta.op_visible(junta_id,ARRAY['ADMIN_JUNTA']::text[]));
CREATE POLICY portal_socio_identidad ON multi_junta.socio FOR SELECT TO multi_junta_identity
  USING (junta_id::text = current_setting('app.junta_id', true));
CREATE POLICY portal_cuenta_socio ON multi_junta.membresia FOR INSERT TO multi_junta_identity
  WITH CHECK (rol_codigo='SOCIO' AND multi_junta.op_visible(junta_id,ARRAY['ADMIN_JUNTA']::text[]));
GRANT SELECT (junta_id,id,estado) ON multi_junta.socio TO multi_junta_identity;
GRANT SELECT, INSERT ON multi_junta.socio_vinculo TO multi_junta_identity;
GRANT UPDATE (codigo_hash,estado,confirmado_en,revocado_en,revocado_por,motivo_revocacion)
  ON multi_junta.socio_vinculo TO multi_junta_identity;
GRANT SELECT (id,junta_id,socio_id,membresia_id,estado,vence_en,creado_en,confirmado_en,revocado_en,motivo_revocacion)
  ON multi_junta.socio_vinculo TO multi_junta_app;
GRANT UPDATE (version_acceso) ON multi_junta.membresia TO multi_junta_identity;
-- La revocación incrementa la versión de la membresía para invalidar sus sesiones.
-- Sin una política UPDATE para el propietario de las rutinas, FORCE RLS impediría el cambio.
CREATE POLICY portal_membresia_revocacion ON multi_junta.membresia FOR UPDATE TO multi_junta_identity
  USING (junta_id::text = current_setting('app.junta_id', true) AND rol_codigo = 'SOCIO')
  WITH CHECK (junta_id::text = current_setting('app.junta_id', true) AND rol_codigo = 'SOCIO');

CREATE FUNCTION multi_junta.m3_membresia_actual(p_junta uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $sql$ SELECT op.membresia_id FROM multi_junta.op_contexto(p_junta) AS op $sql$;

CREATE FUNCTION multi_junta.portal_socio_actual(p_junta uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $sql$
  SELECT v.socio_id FROM multi_junta.op_contexto(p_junta) AS op
  JOIN multi_junta.socio_vinculo v ON v.junta_id=p_junta AND v.membresia_id=op.membresia_id
  JOIN multi_junta.socio s ON s.junta_id=v.junta_id AND s.id=v.socio_id
  WHERE op.rol='SOCIO' AND v.estado='ACTIVO' AND s.estado='ACTIVA'
$sql$;

CREATE FUNCTION multi_junta.portal_invitar(
  p_junta uuid, p_socio uuid, p_membresia uuid, p_usuario text, p_clave text, p_codigo text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $sql$
DECLARE actor uuid; target uuid := p_membresia; alta jsonb; resultado jsonb;
BEGIN
  IF NOT multi_junta.op_bloquear(p_junta,'ADMIN_JUNTA') THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  SELECT op.cuenta_id INTO actor FROM multi_junta.op_contexto(p_junta) AS op;
  IF (p_membresia IS NULL) = (p_usuario IS NULL)
     OR (p_codigo COLLATE "C" ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN
    RETURN jsonb_build_object('error','invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM multi_junta.socio s WHERE s.junta_id=p_junta AND s.id=p_socio AND s.estado='ACTIVA') THEN
    RETURN jsonb_build_object('error','not_found');
  END IF;
  UPDATE multi_junta.socio_vinculo v SET estado='VENCIDO',codigo_hash=NULL
    WHERE v.junta_id=p_junta AND v.estado='PENDIENTE' AND v.vence_en<=clock_timestamp()
      AND (v.socio_id=p_socio OR v.membresia_id=target);
  IF EXISTS (SELECT 1 FROM multi_junta.socio_vinculo v WHERE v.junta_id=p_junta
       AND v.estado IN ('PENDIENTE','ACTIVO') AND (v.socio_id=p_socio OR v.membresia_id=target)) THEN
    RETURN jsonb_build_object('error','conflict');
  END IF;
  IF target IS NULL THEN
    alta := multi_junta.gp_alta_membresia(actor,p_junta,p_usuario,p_clave,'SOCIO','SOCIO_CUENTA_CREADA');
    IF alta ? 'error' THEN RETURN jsonb_build_object('error','conflict'); END IF;
    target := (alta->'data'->>'id')::uuid;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM multi_junta.membresia m JOIN multi_junta.cuenta c ON c.id=m.cuenta_id
    WHERE m.junta_id=p_junta AND m.id=target AND m.estado='ACTIVA' AND m.rol_codigo='SOCIO' AND c.estado='ACTIVA'
    FOR SHARE OF m,c
  ) THEN RETURN jsonb_build_object('error','not_found'); END IF;
  INSERT INTO multi_junta.socio_vinculo AS v (junta_id,socio_id,membresia_id,operador_id,codigo_hash)
    VALUES (p_junta,p_socio,target,actor,p_codigo)
    RETURNING jsonb_build_object('id',v.id,'membresiaId',v.membresia_id,'venceEn',v.vence_en) INTO resultado;
  RETURN jsonb_build_object('data',resultado);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('error','conflict');
END
$sql$;

CREATE FUNCTION multi_junta.portal_confirmar(p_junta uuid,p_codigo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $sql$
DECLARE target uuid; resultado jsonb;
BEGIN
  IF NOT multi_junta.op_bloquear(p_junta,'SOCIO') THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  target := multi_junta.m3_membresia_actual(p_junta);
  UPDATE multi_junta.socio_vinculo v SET estado='ACTIVO',codigo_hash=NULL,confirmado_en=clock_timestamp()
    WHERE v.junta_id=p_junta AND v.membresia_id=target AND v.codigo_hash=p_codigo AND v.estado='PENDIENTE'
      AND v.vence_en>clock_timestamp()
      AND EXISTS (SELECT 1 FROM multi_junta.socio s WHERE s.junta_id=v.junta_id AND s.id=v.socio_id AND s.estado='ACTIVA')
    RETURNING jsonb_build_object('id',v.id,'socioId',v.socio_id,'membresiaId',v.membresia_id,'estado',v.estado) INTO resultado;
  IF resultado IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  RETURN jsonb_build_object('data',resultado);
END
$sql$;

CREATE FUNCTION multi_junta.portal_revocar(p_junta uuid,p_id uuid,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $sql$
DECLARE prior record; actor uuid;
BEGIN
  IF NOT multi_junta.op_bloquear(p_junta,'ADMIN_JUNTA') THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  IF length(btrim(p_motivo)) BETWEEN 1 AND 500 IS NOT TRUE THEN RETURN jsonb_build_object('error','invalid'); END IF;
  SELECT op.cuenta_id INTO actor FROM multi_junta.op_contexto(p_junta) AS op;
  SELECT v.id,v.estado,v.membresia_id INTO prior FROM multi_junta.socio_vinculo v
    WHERE v.id=p_id AND v.junta_id=p_junta AND v.estado IN ('ACTIVO','PENDIENTE') FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  UPDATE multi_junta.socio_vinculo v SET estado='REVOCADO',codigo_hash=NULL,
    revocado_en=clock_timestamp(),revocado_por=actor,motivo_revocacion=p_motivo
    WHERE v.id=prior.id AND v.junta_id=p_junta;
  IF prior.estado='ACTIVO' THEN
    UPDATE multi_junta.membresia m SET version_acceso=m.version_acceso+1
      WHERE m.id=prior.membresia_id AND m.junta_id=p_junta AND m.rol_codigo='SOCIO';
  END IF;
  RETURN jsonb_build_object('data',jsonb_build_object('id',prior.id,'estado','REVOCADO'));
END
$sql$;

GRANT CREATE ON SCHEMA multi_junta TO multi_junta_identity;
ALTER FUNCTION multi_junta.m3_membresia_actual(uuid) OWNER TO multi_junta_identity;
ALTER FUNCTION multi_junta.portal_socio_actual(uuid) OWNER TO multi_junta_identity;
ALTER FUNCTION multi_junta.portal_invitar(uuid,uuid,uuid,text,text,text) OWNER TO multi_junta_identity;
ALTER FUNCTION multi_junta.portal_confirmar(uuid,text) OWNER TO multi_junta_identity;
ALTER FUNCTION multi_junta.portal_revocar(uuid,uuid,text) OWNER TO multi_junta_identity;
REVOKE CREATE ON SCHEMA multi_junta FROM multi_junta_identity;
SET LOCAL ROLE multi_junta_identity;
REVOKE ALL ON FUNCTION multi_junta.m3_membresia_actual(uuid),multi_junta.portal_socio_actual(uuid),
  multi_junta.portal_invitar(uuid,uuid,uuid,text,text,text),multi_junta.portal_confirmar(uuid,text),
  multi_junta.portal_revocar(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION multi_junta.m3_membresia_actual(uuid),multi_junta.portal_socio_actual(uuid),
  multi_junta.portal_invitar(uuid,uuid,uuid,text,text,text),multi_junta.portal_confirmar(uuid,text),
  multi_junta.portal_revocar(uuid,uuid,text) TO multi_junta_app;
RESET ROLE;

CREATE TRIGGER auditar_socio_vinculo AFTER INSERT OR UPDATE ON multi_junta.socio_vinculo
  FOR EACH ROW EXECUTE FUNCTION multi_junta.op_auditar_tabla();
CREATE POLICY portal_socio_propio ON multi_junta.socio FOR SELECT TO multi_junta_app
  USING (id=multi_junta.portal_socio_actual(junta_id));
CREATE POLICY portal_asistencia_propia ON multi_junta.asistencia FOR SELECT TO multi_junta_app
  USING (socio_id=multi_junta.portal_socio_actual(junta_id));
CREATE POLICY portal_actividad_propia ON multi_junta.actividad FOR SELECT TO multi_junta_app
  USING (EXISTS (SELECT 1 FROM multi_junta.asistencia a
    WHERE a.junta_id=actividad.junta_id AND a.actividad_id=actividad.id
    AND a.socio_id=multi_junta.portal_socio_actual(actividad.junta_id)));
CREATE POLICY portal_obligacion_propia ON multi_junta.obligacion FOR SELECT TO multi_junta_app
  USING (socio_id=multi_junta.portal_socio_actual(junta_id));
CREATE POLICY portal_pago_propio ON multi_junta.pago FOR SELECT TO multi_junta_app
  USING (socio_id=multi_junta.portal_socio_actual(junta_id));

COMMIT;
