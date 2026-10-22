export type Datum = string; // 'YYYY-MM-DD'

const DAG_MS = 86_400_000;
const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const DAGNAMEN = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
export const DAGNAMEN_KORT = ['', 'ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

function naarUtc(d: Datum): number {
  const [j, m, dag] = d.split('-').map(Number);
  return Date.UTC(j, m - 1, dag);
}

function vanUtc(ms: number): Datum {
  return new Date(ms).toISOString().slice(0, 10);
}

export function plusDagen(d: Datum, n: number): Datum {
  return vanUtc(naarUtc(d) + n * DAG_MS);
}

/** 'YYYY-MM-DD' én een datum die echt bestaat (geen 30 februari). */
export function isGeldigeDatum(d: string): d is Datum {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && plusDagen(d, 0) === d;
}

export function weekdag(d: Datum): number {
  const w = new Date(naarUtc(d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export function verschilInDagen(van: Datum, tot: Datum): number {
  return Math.round((naarUtc(tot) - naarUtc(van)) / DAG_MS);
}

export function maandagVan(d: Datum): Datum {
  return plusDagen(d, 1 - weekdag(d));
}

/**
 * Kolommen van het weekbord: de werkdagen van de week plus elke andere dag (ma-zo) waarop
 * een taak staat, op datumvolgorde. Zo verdwijnt er nooit een taak van het bord.
 */
export function dagenVoorWeek(maandag: Datum, werkdagen: number[], takenDatums: Datum[]): Datum[] {
  const dagen = new Set<Datum>(werkdagen.map((w) => plusDagen(maandag, w - 1)));
  const zondag = plusDagen(maandag, 6);
  for (const d of takenDatums) if (d >= maandag && d <= zondag) dagen.add(d);
  return [...dagen].sort();
}

export function eersteWerkdagVanaf(d: Datum, werkdagen: number[]): Datum {
  if (werkdagen.length === 0) throw new Error('Geen werkdagen ingesteld');
  let x = d;
  while (!werkdagen.includes(weekdag(x))) x = plusDagen(x, 1);
  return x;
}

export function vandaagInAmsterdam(nu: Date = new Date()): Datum {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(nu);
}

export function isoWeek(d: Datum): { jaar: number; week: number } {
  const donderdag = plusDagen(d, 4 - weekdag(d));
  const jaar = Number(donderdag.slice(0, 4));
  const week = Math.floor(verschilInDagen(`${jaar}-01-01`, donderdag) / 7) + 1;
  return { jaar, week };
}

export function weekCode(d: Datum): string {
  const { jaar, week } = isoWeek(d);
  return `${jaar}-W${String(week).padStart(2, '0')}`;
}

export function parseWeekCode(code: string): Datum | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(code);
  if (!m) return null;
  const jaar = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > isoWeek(`${jaar}-12-28`).week) return null;
  return plusDagen(maandagVan(`${jaar}-01-04`), (week - 1) * 7);
}

export function laatsteDagVanMaand(jaar: number, maand: number): number {
  return new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
}

export function kortDatumLabel(d: Datum): string {
  return `${Number(d.slice(8, 10))} ${MAANDEN_KORT[Number(d.slice(5, 7)) - 1]}`;
}

export function formatMoment(m: Date): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(m);
}
