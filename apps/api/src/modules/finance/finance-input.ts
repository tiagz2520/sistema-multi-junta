import { BadRequestException } from '@nestjs/common';

export interface FinanceUpload {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

export const maxExpenseFileSize = 2 * 1024 * 1024;

export function financeBody(value: unknown, fields: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Se requiere un objeto con los datos.');
  }
  if (Object.keys(value).some((key) => !fields.includes(key))) {
    throw new BadRequestException('La solicitud contiene campos desconocidos.');
  }
  return value as Record<string, unknown>;
}

export function financeText(value: unknown, label: string, limit: number) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.includes('\0') || Array.from(text).length > limit) {
    throw new BadRequestException(
      `${label} debe contener entre 1 y ${limit} caracteres.`,
    );
  }
  return text;
}

export function financeId(value: unknown, label: string) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new BadRequestException(`${label} debe ser un UUID.`);
  }
  return value.toLowerCase();
}

export function financeDay(value: unknown, label: string) {
  if (typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    ) {
      return value;
    }
  }
  throw new BadRequestException(
    `${label} debe ser una fecha YYYY-MM-DD válida.`,
  );
}

export function financeAmount(value: unknown) {
  if (typeof value === 'string' && /^\d{1,12}(?:\.\d{1,2})?$/.test(value)) {
    const [integer, decimal = ''] = value.split('.');
    const amount = `${BigInt(integer)}.${decimal.padEnd(2, '0')}`;
    if (amount !== '0.00') return amount;
  }
  throw new BadRequestException(
    'El monto debe ser una cadena decimal positiva de hasta dos decimales.',
  );
}

export function expenseFile(file: FinanceUpload | undefined) {
  if (
    !file ||
    file.buffer.length === 0 ||
    file.buffer.length > maxExpenseFileSize
  ) {
    throw new BadRequestException('Adjunta un respaldo de hasta 2 MiB.');
  }
  const signatures = {
    'application/pdf': Buffer.from('%PDF-', 'ascii'),
    'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
    'image/png': Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  };
  const mime = file.mimetype as keyof typeof signatures;
  if (
    !Object.hasOwn(signatures, mime) ||
    !file.buffer.subarray(0, signatures[mime].length).equals(signatures[mime])
  ) {
    throw new BadRequestException(
      'El respaldo debe ser un PDF, JPEG o PNG válido.',
    );
  }
  const originalName = file.originalname.split(/[\\/]/).at(-1);
  return {
    bytes: file.buffer,
    mime,
    name: financeText(originalName, 'El nombre del archivo', 180),
  };
}
