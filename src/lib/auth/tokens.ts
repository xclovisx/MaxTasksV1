import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function sha256(tekst: string): string {
  return createHash('sha256').update(tekst).digest('hex');
}

export function nieuwToken(): string {
  return randomBytes(32).toString('base64url');
}

export function nieuweCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function gelijk(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
