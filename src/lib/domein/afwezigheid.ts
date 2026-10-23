import { DAGNAMEN_KORT, type Datum, kortDatumLabel, plusDagen, weekdag } from './datums';
import { datumsVoorHerhaling, type HerhalingType } from './herhaling';

export type Afwezigheid = {
  id: string;
  begindatum: Datum;
  einddatum: Datum | null;
  heleDag: boolean;
  /** 'HH:MM', alleen bij een tijdvak. */
  van: string | null;
  tot: string | null;
  reden: string | null;
  herhalingType: HerhalingType | null;
  weekdagen: number[];
  intervalWeken: number;
};

export const HERHALING_LABELS_AFWEZIG: Record<HerhalingType, string> = {
  dagelijks: 'Elke dag',
  wekelijks: 'Wekelijks',
  maandelijks: 'Maandelijks',
  weekdagen: 'Op gekozen weekdagen',
  elke_x_weken: 'Elke X weken',
};

// Afwezigheid schuift nooit naar een werkdag: elke dag telt.
const ALLE_DAGEN = [1, 2, 3, 4, 5, 6, 7];

/** De dagen van `van` t/m `tot` waarop het blok geldt. */
export function afwezigheidsDagen(a: Afwezigheid, van: Datum, tot: Datum): Datum[] {
  if (!a.herhalingType) {
    const begin = a.begindatum > van ? a.begindatum : van;
    const laatste = a.einddatum ?? a.begindatum;
    const einde = laatste < tot ? laatste : tot;
    const dagen: Datum[] = [];
    for (let d = begin; d <= einde; d = plusDagen(d, 1)) dagen.push(d);
    return dagen;
  }
  const einde = a.einddatum && a.einddatum < tot ? a.einddatum : tot;
  const regel = { type: a.herhalingType, weekdagen: a.weekdagen, intervalWeken: a.intervalWeken, startdatum: a.begindatum };
  return datumsVoorHerhaling(regel, van, einde, ALLE_DAGEN);
}

/** Eerst hele dagen, dan tijdvakken op begintijd. */
export function vergelijkAfwezigheden(a: Afwezigheid, b: Afwezigheid): number {
  if (a.heleDag !== b.heleDag) return a.heleDag ? -1 : 1;
  return (a.van ?? '').localeCompare(b.van ?? '');
}

export function tijdvakLabel(a: Afwezigheid): string {
  return a.heleDag ? 'hele dag' : `${a.van}–${a.tot}`;
}

export function balkTekst(naam: string, a: Afwezigheid): string {
  const kern = a.heleDag ? `${naam} niet beschikbaar (hele dag)` : `${naam} niet beschikbaar · ${tijdvakLabel(a)}`;
  return a.reden ? `${kern} · ${a.reden}` : kern;
}

const dag = (d: Datum) => `${DAGNAMEN_KORT[weekdag(d)]} ${kortDatumLabel(d)}`;

export function periodeTekst(a: Afwezigheid): string {
  if (a.herhalingType) return `vanaf ${dag(a.begindatum)}${a.einddatum ? ` t/m ${dag(a.einddatum)}` : ''}`;
  return a.einddatum && a.einddatum !== a.begindatum ? `${dag(a.begindatum)} t/m ${dag(a.einddatum)}` : dag(a.begindatum);
}

export function herhalingTekst(a: Afwezigheid): string {
  switch (a.herhalingType) {
    case null:
      return 'Eenmalig';
    case 'weekdagen':
      return `Op ${a.weekdagen.map((d) => DAGNAMEN_KORT[d]).join(', ')}`;
    case 'elke_x_weken':
      return `Elke ${a.intervalWeken} weken`;
    default:
      return HERHALING_LABELS_AFWEZIG[a.herhalingType];
  }
}

/** Waarschuwing voor het taakvenster; `blokken` zijn de blokken op de gekozen dag. */
export function afwezigheidWaarschuwing(naam: string, blokken: Afwezigheid[], tijd: string | null): string | null {
  const raak = blokken.find((a) => a.heleDag || (tijd !== null && (a.van ?? '') <= tijd && tijd < (a.tot ?? '')));
  if (raak) return `${naam} is dan niet beschikbaar${raak.reden ? ` (${raak.reden})` : ''}.`;
  if (tijd !== null) return null;
  const vakken = blokken.filter((a) => !a.heleDag).sort(vergelijkAfwezigheden);
  if (vakken.length === 0) return null;
  return `Let op: ${naam} is die dag ${vakken.map((a) => `van ${a.van} tot ${a.tot}`).join(' en ')} niet beschikbaar.`;
}
