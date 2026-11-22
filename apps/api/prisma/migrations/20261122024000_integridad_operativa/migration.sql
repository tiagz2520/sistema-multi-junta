BEGIN;

ALTER TABLE multi_junta.tarifa_multa ADD CONSTRAINT tarifa_multa_monto_finito CHECK (monto <> 'NaN'::numeric);
ALTER TABLE multi_junta.obligacion ADD CONSTRAINT obligacion_monto_finito CHECK (monto <> 'NaN'::numeric);
ALTER TABLE multi_junta.pago ADD CONSTRAINT pago_monto_finito CHECK (monto <> 'NaN'::numeric);
ALTER TABLE multi_junta.gasto ADD CONSTRAINT gasto_monto_finito CHECK (monto <> 'NaN'::numeric);
ALTER TABLE multi_junta.activo_fijo ADD CONSTRAINT activo_fijo_motivo_baja_obligatorio
  CHECK (estado <> 'INACTIVA' OR motivo_baja IS NOT NULL);

COMMIT;
