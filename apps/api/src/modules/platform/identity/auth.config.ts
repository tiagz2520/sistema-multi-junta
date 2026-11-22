import { ServiceUnavailableException } from '@nestjs/common';

function invalidConfiguration(): never {
  throw new ServiceUnavailableException(
    'La configuración de autenticación no está disponible.',
  );
}

function readDuration(value: string | undefined, fallback: number): number {
  const duration = value === undefined ? fallback : Number(value);

  if (!Number.isInteger(duration) || duration < 1 || duration > 86_400) {
    return invalidConfiguration();
  }

  return duration;
}

export function authConfig() {
  const origin = process.env.AUTH_ORIGIN ?? 'http://127.0.0.1:5173';
  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    return invalidConfiguration();
  }

  const secureCookie = url.protocol === 'https:';
  if (
    url.origin !== origin ||
    (!secureCookie && url.protocol !== 'http:') ||
    (!secureCookie && process.env.NODE_ENV === 'production')
  ) {
    return invalidConfiguration();
  }

  return {
    origin,
    secureCookie,
    idleSeconds: readDuration(process.env.AUTH_IDLE_SECONDS, 1800),
    absoluteSeconds: readDuration(process.env.AUTH_ABSOLUTE_SECONDS, 43200),
  };
}
