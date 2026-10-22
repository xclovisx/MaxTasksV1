import { DAGNAMEN_KORT, type Datum, kortDatumLabel, weekdag } from './datums';

export type Prioriteit = 'laag' | 'middel' | 'hoog' | 'zsm' | 'nu';
export type Status = 'open' | 'bezig' | 'klaar';

/** Van meest naar minst urgent. */
export const PRIORITEITEN: Prioriteit[] = ['nu', 'zsm', 'hoog', 'middel', 'laag'];
export const PRIORITEIT_LABEL: Record<Prioriteit, string> = {
  laag: 'Laag', middel: 'Middel', hoog: 'Hoog', zsm: 'Zo snel mogelijk', nu: 'Nu',
};
export const STATUSSEN: Status[] = ['open', 'bezig', 'klaar'];
export const STATUS_LABEL: Record<Status, string> = { open: 'Open', bezig: 'Bezig', klaar: 'Klaar' };

export type Sorteerbaar = { status: Status; prioriteit: Prioriteit; tijd: string | null; aangemaaktOp: Date };

export function vergelijkTaken(a: Sorteerbaar, b: Sorteerbaar): number {
  const klaar = Number(a.status === 'klaar') - Number(b.status === 'klaar');
  if (klaar) return klaar;
  const prio = PRIORITEITEN.indexOf(a.prioriteit) - PRIORITEITEN.indexOf(b.prioriteit);
  if (prio) return prio;
  if (a.tijd && !b.tijd) return -1;
  if (!a.tijd && b.tijd) return 1;
  if (a.tijd && b.tijd && a.tijd !== b.tijd) return a.tijd < b.tijd ? -1 : 1;
  return new Date(a.aangemaaktOp).getTime() - new Date(b.aangemaaktOp).getTime();
}

export type TaakLabel = { soort: 'gemist' | 'uitgesteld' | 'achterstallig'; tekst: string };

export function taakLabels(t: { status: Status; prioriteit: Prioriteit; gemist: boolean; uitgesteldVan: Datum | null }): TaakLabel[] {
  if (t.status === 'klaar') return [];
  if (t.gemist) return [{ soort: 'gemist', tekst: 'gemist' }];
  if (!t.uitgesteldVan) return [];
  const labels: TaakLabel[] = [{
    soort: 'uitgesteld',
    tekst: `uitgesteld van ${DAGNAMEN_KORT[weekdag(t.uitgesteldVan)]} ${kortDatumLabel(t.uitgesteldVan)}`,
  }];
  if (t.prioriteit === 'zsm' || t.prioriteit === 'nu') labels.push({ soort: 'achterstallig', tekst: 'achterstallig' });
  return labels;
}
