import { BadRequestException } from '@nestjs/common';

export function fields(value: unknown, allowed: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException();
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new BadRequestException();
  return value as Record<string, unknown>;
}

export function text(value: unknown, max: number) {
  if (typeof value !== 'string') throw new BadRequestException();
  const normalized = value.trim();
  if (!normalized || normalized.includes('\0') || normalized.length > max)
    throw new BadRequestException();
  return normalized;
}

export function decimal(value: unknown, scale: 2 | 3, strictlyPositive = true) {
  const format =
    scale === 2 ? /^\d{1,12}(\.\d{1,2})?$/ : /^\d{1,11}(\.\d{1,3})?$/;
  if (
    typeof value !== 'string' ||
    !format.test(value) ||
    (strictlyPositive && !/[1-9]/.test(value))
  ) {
    throw new BadRequestException();
  }
  return value;
}

export function date(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith('0000-')
  )
    throw new BadRequestException();
  const day = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value)
    throw new BadRequestException();
  return value;
}

export function uuid(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length !== 36 ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
  )
    throw new BadRequestException();
  return value.toLowerCase();
}

export function state(value: unknown) {
  if (value !== 'ACTIVA' && value !== 'INACTIVA')
    throw new BadRequestException();
  return value;
}

export function lifetime(value: unknown) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 2147483647
  )
    throw new BadRequestException();
  return value;
}

export function coordinates(lat: unknown, lon: unknown) {
  if (
    (lat === undefined || lat === null || lat === '') &&
    (lon === undefined || lon === null || lon === '')
  ) {
    return { lat: null, lon: null };
  }
  const angle = (value: unknown, limit: number) => {
    if (
      typeof value !== 'string' ||
      !/^-?\d{1,3}(\.\d{1,6})?$/.test(value) ||
      Math.abs(Number(value)) > limit
    )
      throw new BadRequestException();
    return value;
  };
  return { lat: angle(lat, 90), lon: angle(lon, 180) };
}
