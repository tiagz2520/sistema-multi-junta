BEGIN;
SET LOCAL search_path = pg_catalog;

-- Un socio activo y vinculado puede consultar solo sus propios predios activos.
-- No se amplían los permisos de escritura ni el acceso a predios de otros miembros.
CREATE POLICY portal_propiedad_propia
  ON multi_junta.propiedad FOR SELECT TO multi_junta_app
  USING (
    estado = 'ACTIVA'
    AND socio_id = multi_junta.portal_socio_actual(junta_id)
  );

-- Los bytes privados de la fotografía se autorizan por su predio, no solo por
-- conocer un UUID. Se preserva la política existente de Secretaría.
CREATE POLICY portal_propiedad_foto_propia
  ON multi_junta.propiedad_foto FOR SELECT TO multi_junta_app
  USING (
    EXISTS (
      SELECT 1
      FROM multi_junta.propiedad p
      WHERE p.junta_id = propiedad_foto.junta_id
        AND p.id = propiedad_foto.propiedad_id
        AND p.estado = 'ACTIVA'
        AND p.socio_id = multi_junta.portal_socio_actual(propiedad_foto.junta_id)
    )
  );

-- Permite mostrar el nombre del sector asignado al predio, aunque no coincida
-- con el sector del padrón. No revela sectores ajenos.
CREATE POLICY portal_sector_de_propiedad
  ON multi_junta.sector FOR SELECT TO multi_junta_app
  USING (
    EXISTS (
      SELECT 1
      FROM multi_junta.propiedad p
      WHERE p.junta_id = sector.junta_id
        AND p.sector_id = sector.id
        AND p.estado = 'ACTIVA'
        AND p.socio_id = multi_junta.portal_socio_actual(sector.junta_id)
    )
  );

COMMIT;
