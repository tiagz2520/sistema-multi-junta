import { BadRequestException } from '@nestjs/common';

const activeStates = ['ACTIVA', 'INACTIVA'] as const;
const activityTypes = ['ASAMBLEA', 'MINGA'] as const;

function fields(input: unknown, allowed: readonly string[], partial = false) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new BadRequestException('Se esperaba un objeto JSON.');
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    (partial && keys.length === 0) ||
    keys.some((key) => !allowed.includes(key))
  ) {
    throw new BadRequestException('Los campos de la solicitud no son válidos.');
  }
  return record;
}

function text(value: unknown, name: string): string;
function text(
  value: unknown,
  name: string,
  optional: boolean,
): string | undefined;
function text(value: unknown, name: string, optional = false) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${name} es obligatorio.`);
  }
  return value.trim();
}

function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T {
  if (
    typeof value !== 'string' ||
    !allowed.some((option) => option === value)
  ) {
    throw new BadRequestException(`${name} no es válido.`);
  }
  return value as T;
}

function optionalState(value: unknown) {
  return value === undefined
    ? undefined
    : choice(value, activeStates, 'El estado');
}

function optionalId(value: unknown, name: string) {
  if (value === undefined || value === null) return value;
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  ) {
    throw new BadRequestException(`${name} no es válido.`);
  }
  return value.toLowerCase();
}

export function sectorInput(input: unknown, partial = false) {
  const body = fields(
    input,
    ['nombre', 'clasificacion', 'descripcion', 'estado'],
    partial,
  );
  return {
    nombre: text(body.nombre, 'El nombre', partial),
    clasificacion: text(body.clasificacion, 'La clasificación', partial),
    descripcion:
      body.descripcion === null
        ? null
        : text(body.descripcion, 'La descripción', true),
    estado: optionalState(body.estado),
  };
}

export function socioInput(input: unknown, partial = false) {
  const body = fields(
    input,
    ['cedula', 'nombres', 'apellidos', 'sectorId', 'estado'],
    partial,
  );
  const cedula = text(body.cedula, 'La cédula', partial);
  if (cedula !== undefined && !/^[0-9]{10}$/.test(cedula)) {
    throw new BadRequestException('La cédula debe tener diez dígitos.');
  }
  return {
    cedula,
    nombres: text(body.nombres, 'Los nombres', partial),
    apellidos: text(body.apellidos, 'Los apellidos', partial),
    sectorId: optionalId(body.sectorId, 'El sector'),
    estado: optionalState(body.estado),
  };
}

export function socioFilters(input: {
  q: unknown;
  estado: unknown;
  sectorId: unknown;
  offset: unknown;
}) {
  if (input.q !== undefined && typeof input.q !== 'string') {
    throw new BadRequestException('La búsqueda no es válida.');
  }
  const offset = input.offset === undefined ? 0 : input.offset;
  const offsetNumber =
    typeof offset === 'string' && /^\d+$/.test(offset)
      ? Number(offset)
      : offset;
  if (
    typeof offsetNumber !== 'number' ||
    !Number.isSafeInteger(offsetNumber) ||
    offsetNumber < 0
  ) {
    throw new BadRequestException('El desplazamiento no es válido.');
  }
  return {
    q: input.q?.trim() || undefined,
    estado: optionalState(input.estado),
    sectorId: optionalId(input.sectorId, 'El sector') ?? undefined,
    offset: offsetNumber,
  };
}

function instant(value: unknown, name: string, optional: boolean) {
  const raw = text(value, name, optional);
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  const day = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      raw,
    ) ||
    !Number.isFinite(date.valueOf()) ||
    !Number.isFinite(day.valueOf()) ||
    day.toISOString().slice(0, 10) !== raw.slice(0, 10)
  ) {
    throw new BadRequestException(
      `${name} debe ser una fecha ISO con zona horaria.`,
    );
  }
  return date;
}

export function activityInput(input: unknown, partial = false) {
  const body = fields(
    input,
    ['tipo', 'titulo', 'inicio', 'fin', 'lugar'],
    partial,
  );
  return {
    tipo:
      partial && body.tipo === undefined
        ? undefined
        : choice(body.tipo, activityTypes, 'El tipo'),
    titulo: text(body.titulo, 'El título', partial),
    inicio: instant(body.inicio, 'El inicio', partial),
    fin: instant(body.fin, 'El fin', partial),
    lugar: text(body.lugar, 'El lugar', partial),
  };
}

export function attendanceInput(input: unknown) {
  const body = fields(input, ['estado', 'motivo']);
  return {
    estado: choice(body.estado, ['PRESENTE', 'AUSENTE'], 'La marca'),
    motivo: text(body.motivo, 'El motivo', true),
  };
}

export function justificationInput(input: unknown) {
  const body = fields(input, ['motivo']);
  return { motivo: text(body.motivo, 'El motivo') };
}

export function decisionInput(input: unknown) {
  const body = fields(input, ['decision', 'motivo']);
  return {
    decision: choice(body.decision, ['ACEPTADA', 'RECHAZADA'], 'La decisión'),
    motivo: text(body.motivo, 'El motivo'),
  };
}
