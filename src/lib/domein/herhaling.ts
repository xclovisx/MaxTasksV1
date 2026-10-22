import {
  type Datum, eersteWerkdagVanaf, laatsteDagVanMaand, plusDagen, verschilInDagen, weekdag,
} from './datums';

export type HerhalingType = 'dagelijks' | 'wekelijks' | 'maandelijks' | 'weekdagen' | 'elke_x_weken';

export type HerhalingRegel = {
  type: HerhalingType;
  weekdagen: number[];
  intervalWeken: number;
  startdatum: Datum;
};

export const HERHALING_LABELS: Record<HerhalingType, string> = {
  dagelijks: 'Dagelijks (elke werkdag)',
  wekelijks: 'Wekelijks',
  maandelijks: 'Maandelijks',
  weekdagen: 'Op gekozen weekdagen',
  elke_x_weken: 'Elke X weken',
};

const laterVan = (a: Datum, b: Datum): Datum => (a > b ? a : b);

function basisDatum(regel: HerhalingRegel, d: Datum, werkdagen: number[]): Datum | null {
  const startWeekdag = weekdag(regel.startdatum);
  switch (regel.type) {
    case 'dagelijks':
      return werkdagen.includes(weekdag(d)) ? d : null;
    case 'weekdagen':
      return regel.weekdagen.includes(weekdag(d)) ? d : null;
    case 'wekelijks':
      return weekdag(d) === startWeekdag ? eersteWerkdagVanaf(d, werkdagen) : null;
    case 'elke_x_weken': {
      if (weekdag(d) !== startWeekdag) return null;
      const weken = verschilInDagen(regel.startdatum, d) / 7;
      return weken % regel.intervalWeken === 0 ? eersteWerkdagVanaf(d, werkdagen) : null;
    }
    case 'maandelijks': {
      const jaar = Number(d.slice(0, 4));
      const maand = Number(d.slice(5, 7));
      const doel = Math.min(Number(regel.startdatum.slice(8, 10)), laatsteDagVanMaand(jaar, maand));
      return Number(d.slice(8, 10)) === doel ? eersteWerkdagVanaf(d, werkdagen) : null;
    }
  }
}

export function datumsVoorHerhaling(regel: HerhalingRegel, van: Datum, tot: Datum, werkdagen: number[]): Datum[] {
  const begin = laterVan(van, regel.startdatum);
  if (verschilInDagen(begin, tot) < 0) return [];
  // Verschuiven naar een werkdag kan tot 6 dagen vooruit gaan: scan dus 7 dagen eerder.
  const scanVan = laterVan(regel.startdatum, plusDagen(begin, -7));
  const gevonden = new Set<Datum>();
  for (let d = scanVan; verschilInDagen(d, tot) >= 0; d = plusDagen(d, 1)) {
    const kandidaat = basisDatum(regel, d, werkdagen);
    if (kandidaat && kandidaat >= begin && kandidaat <= tot) gevonden.add(kandidaat);
  }
  return [...gevonden].sort();
}
