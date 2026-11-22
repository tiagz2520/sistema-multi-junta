const usernamePattern = /^[A-Za-z0-9._-]{3,32}$/;

export function normalizeUsername(value: string): string {
  const trimmed = value.trim();

  if (!usernamePattern.test(trimmed)) {
    throw new Error(
      'El nombre de usuario debe tener de 3 a 32 caracteres y solo admite letras ASCII, dígitos, punto, guion y guion bajo.',
    );
  }

  return trimmed.toLowerCase();
}
