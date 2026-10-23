import { type Punt, routeUrl } from '../domein/navigatie';
import { puntSchema } from '../domein/validatie';
import { Ongeldig } from '../fouten';
import { berekenRoute, type RouteDeelDuur, RouteNietBeschikbaar } from '../google/routes';
import { haalInstellingen } from './instellingen';
import { haalTaak } from './taken';

export const MELDING_GEEN_LOCATIE = 'Je huidige locatie is niet beschikbaar. De volgorde is berekend vanaf de garage.';
export const MELDING_GEEN_GARAGE = 'Er is nog geen garage-adres ingesteld (Beheer → Instellingen). De volgorde is niet berekend.';

export type RouteDeel = RouteDeelDuur & { naar: string };
export type RoutePlan = {
  /** Indexen in taak.stops, in rijvolgorde. */
  volgorde: number[];
  /** De stops in rijvolgorde (de berekende volgorde, of de ingevoerde bij een terugval). */
  stops: { naam: string; adres: string; lat: number; lng: number }[];
  geoptimaliseerd: boolean;
  meldingen: string[];
  /** Eén deel per stop plus het laatste deel naar de garage; null als er niet berekend is. */
  delen: RouteDeel[] | null;
  totaalSec: number | null;
  totaalMeters: number | null;
  url: string;
};

/** De volgorde geldt alleen voor dit moment en wordt niet opgeslagen. Een Google-storing geeft de ingevoerde volgorde met een melding. */
export async function planRoute(taakId: string, start: Punt | null, haal: typeof fetch = fetch): Promise<RoutePlan> {
  const begin = start === null ? null : puntSchema.parse(start);
  const [taak, instellingen] = await Promise.all([haalTaak(taakId), haalInstellingen()]);
  const stops = taak.stops;
  if (stops.length < 2) throw new Ongeldig('Een route plannen kan vanaf 2 locaties.');
  const ingevoerd = stops.map((_, i) => i);
  const inRijvolgorde = (volgorde: number[]) => volgorde.map((i) => {
    const { naam, adres, lat, lng } = stops[i];
    return { naam, adres, lat, lng };
  });
  // Maps start bewust zonder origin: de route begint dan bij de eigen locatie van het apparaat.
  const zonderBerekening = (meldingen: string[], garage: Punt | null): RoutePlan => ({
    volgorde: ingevoerd, stops: inRijvolgorde(ingevoerd), geoptimaliseerd: false, meldingen, delen: null, totaalSec: null, totaalMeters: null,
    url: routeUrl({ start: null, bestemming: garage, stops }),
  });

  if (instellingen.garageLat === null || instellingen.garageLng === null) {
    return zonderBerekening([MELDING_GEEN_GARAGE], null);
  }
  const garage = { lat: instellingen.garageLat, lng: instellingen.garageLng };
  const vertrek = begin ?? garage;
  const meldingen = begin ? [] : [MELDING_GEEN_LOCATIE];
  try {
    const r = await berekenRoute({ start: vertrek, bestemming: garage, stops }, haal);
    const namen = [...r.volgorde.map((i) => stops[i].naam), instellingen.naam];
    return {
      volgorde: r.volgorde,
      stops: inRijvolgorde(r.volgorde),
      geoptimaliseerd: true,
      meldingen,
      delen: r.delen.map((d, i) => ({ naar: namen[i], ...d })),
      totaalSec: r.totaalSec,
      totaalMeters: r.totaalMeters,
      url: routeUrl({ start: null, bestemming: garage, stops: r.volgorde.map((i) => stops[i]) }),
    };
  } catch (e) {
    if (!(e instanceof RouteNietBeschikbaar)) throw e;
    return zonderBerekening([...meldingen, e.message], garage);
  }
}
