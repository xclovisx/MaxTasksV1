export const BIJLAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type BijlageType = (typeof BIJLAGE_TYPES)[number];
export const CODE_FORMATEN = ['QRCode', 'Code128', 'Code39', 'Code93', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'ITF', 'Codabar'] as const;
export type CodeFormaat = (typeof CODE_FORMATEN)[number];
export type Code = { formaat: CodeFormaat; tekst: string };
export const MAX_CODE_TEKST = 2000;

export type Bijlage = { id: string; naam: string; type: BijlageType; grootte: number; code: Code | null };

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

export const isQr = (f: CodeFormaat): boolean => f === 'QRCode';

/** Alleen een geldig gelezen code met gewone tekst; binaire inhoud tonen we niet als tekst. */
export function geldigeCode(r: { format: string; text: string; isValid: boolean; contentType: string }): Code | null {
  if (!r.isValid || !(CODE_FORMATEN as readonly string[]).includes(r.format)) return null;
  if (r.contentType !== 'Text' && r.contentType !== 'GS1') return null;
  if (r.text.length === 0 || r.text.length > MAX_CODE_TEKST) return null;
  return { formaat: r.format as CodeFormaat, tekst: r.text };
}

type Punt = { x: number; y: number };
export type Positie = { topLeft: Punt; topRight: Punt; bottomRight: Punt; bottomLeft: Punt };

function oppervlak(p: Positie): number {
  const h = [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft];
  let som = 0;
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    som += a.x * b.y - b.x * a.y;
  }
  return Math.abs(som) / 2;
}

export function grootsteCode<T extends { position: Positie }>(resultaten: T[]): T | null {
  return resultaten.reduce<T | null>((beste, r) => (!beste || oppervlak(r.position) > oppervlak(beste.position) ? r : beste), null);
}
