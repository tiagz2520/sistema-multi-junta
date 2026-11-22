import { Algorithm, hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

const argon2Options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

let dummyHash: Promise<string> | undefined;

export function isPasswordInput(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\0') &&
    Buffer.byteLength(value, 'utf8') <= 256
  );
}

export function isNewPasswordValid(value: unknown): value is string {
  return isPasswordInput(value) && Array.from(value).length >= 12;
}

export function hashPassword(password: string) {
  return hash(password, argon2Options);
}

async function verifyAgainstDummy(password: string) {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  await verify(await dummyHash, password);
  return false;
}

export async function verifyPassword(
  encoded: string | null,
  password: string,
): Promise<boolean> {
  if (!encoded?.startsWith('$argon2id$')) {
    return verifyAgainstDummy(password);
  }

  try {
    return await verify(encoded, password);
  } catch {
    return verifyAgainstDummy(password);
  }
}
