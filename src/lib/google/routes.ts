import type { Punt } from '../domein/navigatie';
import { Fout } from '../fouten';
import { googleSleutel, vraagGoogle } from './http';

export class RouteNietBeschikbaar extends Fout {
  constructor() {
    super('Volgorde kon niet berekend worden');
  }
}

export type RouteDeelDuur = { duurSec: number; meters: number };
export type BerekendeRoute = { volgorde: number[]; delen: RouteDeelDuur[]; totaalSec: number; totaalMeters: number };

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const VELDEN =
  'routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters,routes.optimizedIntermediateWaypointIndex';
const TIMEOUT_MS = 10_000;
const nietBeschikbaar = () => new RouteNietBeschikbaar();

const waypoint = (p: Punt) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

/** Google geeft een duur als "123s" (soms met decimalen). */
function seconden(d: unknown): number {
  const m = typeof d === 'string' ? /^(\d+(?:\.\d+)?)s$/.exec(d) : null;
  if (!m) throw nietBeschikbaar();
  return Math.round(Number(m[1]));
}

function meters(m: unknown): number {
  if (m === undefined) return 0; // Google laat een afstand van 0 weg
  if (typeof m !== 'number' || !Number.isFinite(m)) throw nietBeschikbaar();
  return m;
}

function isPermutatie(v: unknown, n: number): v is number[] {
  return Array.isArray(v) && v.length === n && [...v].sort((a, b) => a - b).every((x, i) => x === i);
}

type Antwoord = {
  routes?: {
    duration?: unknown;
    distanceMeters?: unknown;
    legs?: { duration?: unknown; distanceMeters?: unknown }[];
    optimizedIntermediateWaypointIndex?: unknown;
  }[];
};

/** Snelste volgorde van de stops met actueel verkeer, van start naar bestemming. */
export async function berekenRoute(
  invoer: { start: Punt; bestemming: Punt; stops: Punt[] },
  haal: typeof fetch = fetch,
): Promise<BerekendeRoute> {
  const data = (await vraagGoogle(
    haal,
    ROUTES_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleSleutel(nietBeschikbaar), 'X-Goog-FieldMask': VELDEN },
      body: JSON.stringify({
        origin: waypoint(invoer.start),
        destination: waypoint(invoer.bestemming),
        intermediates: invoer.stops.map(waypoint),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        optimizeWaypointOrder: true,
        languageCode: 'nl-NL',
        units: 'METRIC',
      }),
    },
    { timeoutMs: TIMEOUT_MS, fout: nietBeschikbaar },
  )) as Antwoord;
  const route = data.routes?.[0];
  const volgorde = route?.optimizedIntermediateWaypointIndex;
  const legs = route?.legs;
  const n = invoer.stops.length;
  if (!route || !isPermutatie(volgorde, n) || !Array.isArray(legs) || legs.length !== n + 1) throw nietBeschikbaar();
  return {
    volgorde,
    delen: legs.map((l) => ({ duurSec: seconden(l.duration), meters: meters(l.distanceMeters) })),
    totaalSec: seconden(route.duration),
    totaalMeters: meters(route.distanceMeters),
  };
}
