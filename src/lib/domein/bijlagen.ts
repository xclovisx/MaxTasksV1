export const BIJLAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type BijlageType = (typeof BIJLAGE_TYPES)[number];
export type Bijlage = { id: string; naam: string; type: BijlageType; grootte: number };

export const MAX_BIJLAGE_BYTES = 10 * 1024 * 1024;
export const MAX_BIJLAGEN_PER_TAAK = 10;
export const BEWAAR_DAGEN_NA_KLAAR = 30;
/** Langste zijde van een foto na verkleinen; een QR-code blijft dan goed scanbaar. */
export const MAX_ZIJDE = 2000;

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const begintMet = (b: Uint8Array, kop: number[], vanaf = 0) =>
  b.length >= vanaf + kop.length && kop.every((x, i) => b[vanaf + i] === x);

/** Bepaalt het type uit de eerste bytes; naam en meegestuurd type tellen niet. */
export function bepaalType(b: Uint8Array): BijlageType | null {
  if (begintMet(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (begintMet(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (begintMet(b, ascii('RIFF')) && begintMet(b, ascii('WEBP'), 8)) return 'image/webp';
  if (begintMet(b, ascii('%PDF-'))) return 'application/pdf';
  return null;
}

/** Alleen het laatste deel van een pad, zonder stuurtekens, max 200 tekens. */
export function schoonNaam(naam: string): string {
  const laatste = naam.split(/[\\/]/).pop() ?? '';
  const zonderStuur = [...laatste].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('');
  return [...zonderStuur.trim()].slice(0, 200).join('').trim() || 'bijlage';
}

export function alsJpgNaam(naam: string): string {
  const punt = naam.lastIndexOf('.');
  return `${punt > 0 ? naam.slice(0, punt) : naam}.jpg`;
}

/** Naam voor een geplakte afbeelding zonder eigen naam. Geen ':' erin: Windows weigert die in bestandsnamen. */
export function plakNaam(nu: Date = new Date()): string {
  const delen = new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(nu);
  const deel = (t: Intl.DateTimeFormatPartTypes) => delen.find((p) => p.type === t)?.value ?? '';
  return `Schermafbeelding ${deel('day')}-${deel('month')} ${deel('hour')}.${deel('minute')}.jpg`;
}

export function soortVerwerking(type: string): 'verklein' | 'ongewijzigd' | 'weiger' {
  if (type.startsWith('image/')) return 'verklein';
  if (type === 'application/pdf') return 'ongewijzigd';
  return 'weiger';
}

export const magOngewijzigd = (type: string): boolean => ['image/jpeg', 'image/png', 'image/webp'].includes(type);

export function formatGrootte(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
