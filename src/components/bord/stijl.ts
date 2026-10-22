import { DAGNAMEN_KORT } from '@/lib/domein/datums';
import type { HerhalingType } from '@/lib/domein/herhaling';
import type { Prioriteit, Status, TaakLabel } from '@/lib/domein/taak';

export const PRIO_STIP: Record<Prioriteit, string> = {
  laag: 'bg-prio-laag', middel: 'bg-prio-middel', hoog: 'bg-prio-hoog', zsm: 'bg-prio-zsm', nu: 'bg-prio-nu',
};

export const PRIO_KNOP_AAN: Record<Prioriteit, string> = {
  laag: 'border-prio-laag bg-prio-laag/20',
  middel: 'border-prio-middel bg-prio-middel/20',
  hoog: 'border-prio-hoog bg-prio-hoog/20',
  zsm: 'border-prio-zsm bg-prio-zsm/20',
  nu: 'border-prio-nu bg-prio-nu/25',
};

export const STATUS_PIL: Record<Status, string> = {
  open: 'bg-kaart-hover text-tekst-zacht',
  bezig: 'bg-bezig-bg text-bezig-tekst',
  klaar: 'bg-klaar-bg text-klaar-tekst',
};

export const LABEL_STIJL: Record<TaakLabel['soort'], string> = {
  gemist: 'bg-prio-nu/15 text-fout',
  uitgesteld: 'bg-kaart-hover text-tekst-zacht',
  achterstallig: 'bg-prio-zsm/15 text-fout',
};

export function herhalingKort(t: {
  herhalingType: HerhalingType | null;
  herhalingWeekdagen: number[] | null;
  herhalingInterval: number | null;
}): string | null {
  switch (t.herhalingType) {
    case null: return null;
    case 'dagelijks': return 'dagelijks';
    case 'wekelijks': return 'wekelijks';
    case 'maandelijks': return 'maandelijks';
    case 'weekdagen': return (t.herhalingWeekdagen ?? []).map((d) => DAGNAMEN_KORT[d]).join('/');
    case 'elke_x_weken': return `elke ${t.herhalingInterval ?? 2} wk`;
  }
}
