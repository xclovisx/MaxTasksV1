# Garage Takenbord: fase 3 (route en meldingen) implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bij een taak met 2 of meer stops berekent "Plan route" de snelste volgorde met actueel verkeer, van je huidige locatie terug naar de garage, en opent Google Maps met alle stops. Daarnaast krijgt de beheerder een ntfy-pushmelding als een medewerker een taak met "Zo snel mogelijk" of "Nu" maakt, of de prioriteit daarnaar verhoogt.

**Architecture:**
- **Google Routes:** een kleine Routes API-client (`computeRoutes`), die dezelfde aanroephulp gebruikt als de Places-client (`src/lib/google/http.ts`).
- **Route berekenen:** de dienst `planRoute` haalt de stops en de garage op, laat Google de volgorde berekenen en bouwt de Maps-link. Faalt Google, dan geeft hij de ingevoerde volgorde terug met een melding; hij gooit dan geen fout.
- **Knop in de UI:** de knop roept een server action aan met de GPS-positie uit de browser.
- **ntfy-meldingen:** ntfy wordt na de commit van de taak aangeroepen, met JSON-publicatie. Een fout wordt alleen gelogd. Het onderwerp staat in `instellingen`; de server-URL en het token komen uit `.env`.

**Tech Stack:** zoals fase 1 en 2: Next.js 16, React 19, TypeScript 5, Tailwind 4, postgres.js 3, Zod 4, Vitest 4 + Testcontainers, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md` §7.6 (meldingen), §8.2–8.3 (route), §10 (foutafhandeling), met het addendum `docs/superpowers/plans/2026-10-22-addendum-een-bedrijf.md` (één bedrijf).

**Bewuste keuzes (worden in Task 5 in de spec vastgelegd):**
1. **Server action voor de route:** route plannen gaat via een server action (`planRouteActie`) in plaats van `POST /api/taken/:id/route`. Zo werkt het hetzelfde als de rest van de app, met de inlogcontrole erin.
2. **Geen garage-adres:** dan wordt de volgorde niet berekend en verschijnt er een melding. De Maps-link eindigt bij de laatste stop.
3. **Eigen acties van de beheerder:** maakt of wijzigt de beheerder zelf een taak, dan volgt geen melding (hij is zelf de ontvanger).
4. **Link in de melding:** de melding linkt naar `Vandaag` op de dag van de taak (`/vandaag?datum=…`), omdat een taak geen eigen URL heeft.
5. **Hele reeks:** het verhogen van de prioriteit van een hele reeks geeft geen melding. Alleen nieuwe taken (ook een nieuwe reeks) en losse wijzigingen doen dat.

## Global Constraints

- Er is één bedrijf. Geen `bedrijf_id`, geen RLS. Rechten worden in de diensten afgedwongen.
- **Plan route** verschijnt alleen bij **2 of meer stops**. De berekening gebeurt pas na de tik. Elke stop houdt zijn eigen knop "Navigeer".
- De browser vraagt de huidige locatie op met een **timeout van 8 seconden**. Bij weigering of geen locatie is het startpunt de garage, met de melding `Je huidige locatie is niet beschikbaar. De route start bij de garage.`
- De server roept de **Google Routes API** `computeRoutes` aan met `travelMode=DRIVE`, `routingPreference=TRAFFIC_AWARE`, `optimizeWaypointOrder=true`, origin = startpunt, destination = garage en intermediates = de stops. De timeout is **10 seconden**.
- Faalt Google (fout, tegoed op, timeout, onbruikbaar antwoord of geen sleutel), dan volgt de melding `Volgorde kon niet berekend worden` en opent Maps met de stops in de **ingevoerde volgorde**.
- Zonder garage-coördinaten volgt de melding `Er is nog geen garage-adres ingesteld (Beheer → Instellingen). De volgorde is niet berekend.` Google wordt dan niet aangeroepen.
- De berekende volgorde wordt **niet opgeslagen**.
- Maps-link: `https://www.google.com/maps/dir/?api=1&origin=<lat>%2C<lng>&destination=<lat>%2C<lng>&waypoints=<lat>%2C<lng>%7C<lat>%2C<lng>&travelmode=driving`. Zonder start valt `origin` weg (Maps gebruikt dan de huidige locatie). Zonder bestemming wordt de laatste stop de `destination`.
- Google wordt **alleen op de server** aangeroepen, met `GOOGLE_MAPS_API_KEY`. Tests praten **nooit** met de echte Google of de echte ntfy: unit- en integratietests gebruiken een nep-`fetch`, e2e draait met een lege `GOOGLE_MAPS_API_KEY` en een lege `NTFY_URL`.
- **Wanneer een melding:** een taak die een **medewerker** aanmaakt met prioriteit `zsm` of `nu`, of waarvan hij de prioriteit daarnaar verhoogt (ook `zsm` → `nu`), geeft één ntfy-melding. Een verlaging, of een actie van de beheerder, geeft er geen.
- **Als het misgaat:** mislukt ntfy, dan wordt dat gelogd met `console.error('[ntfy] melding versturen mislukt', fout)` en wordt de taak gewoon opgeslagen.
- **ntfy-configuratie:** de server staat in `NTFY_URL`, het optionele token in `NTFY_TOKEN` (`Authorization: Bearer …`). Het onderwerp staat in `instellingen.ntfy_onderwerp`: 1–64 tekens, `[A-Za-z0-9_-]`. Ontbreekt de server of het onderwerp, dan gaat er geen melding uit. De beheerder ziet in Instellingen een knop **"Stuur testmelding"**.
- Alle UI-teksten zijn Nederlands. Donker thema met de bestaande kleurtokens en UI-componenten (`src/components/ui.tsx`).
- Elke commit-boodschap eindigt met `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Werkomgeving: Windows en Git Bash.
  - Docker en Testcontainers: zet eerst `export PATH="/c/Users/Max/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"`.
  - Pakketten (als dat al nodig is): installeer ze met `npx npm@11 install`.
  - `npm run test:e2e`: er mag geen andere `next dev` in dezelfde map draaien. De dev-Postgres (`maxtasksv1-db-1`, poort 5432) moet draaien.
- Lees eerst AGENTS.md: deze Next.js-versie wijkt af van je trainingsdata. Lees de relevante gids in `node_modules/next/dist/docs/` voordat je server actions of pagina's schrijft.

---

## Bestandsstructuur

```
src/lib/google/http.ts                   gedeelde Google-aanroep (sleutel, timeout, foutvertaling)
src/lib/google/plaatsen.ts               (wijzigen) gebruikt http.ts
src/lib/google/routes.ts                 berekenRoute(): Routes API computeRoutes
src/lib/domein/navigatie.ts              (wijzigen) routeUrl(), formatDuur(), formatAfstand()
src/lib/domein/validatie.ts              (wijzigen) puntSchema, ntfyOnderwerpSchema
src/lib/diensten/route.ts                planRoute(): stops + garage + Google → RoutePlan
src/app/(app)/bord/acties.ts             (wijzigen) planRouteActie
src/components/bord/navigatie-blok.tsx   stops met "Navigeer", "Plan route", resultaat en "Start route in Google Maps"
src/components/bord/taak-dialoog.tsx     (wijzigen) gebruikt NavigatieBlok
migrations/003_meldingen.sql             instellingen.ntfy_onderwerp
src/lib/domein/meldingen.ts              isUrgentVerhoogd(), urgentBericht(), type NtfyBericht
src/lib/meldingen/ntfy.ts                stuurNtfy(), NtfyNietIngesteld, NtfyMislukt, ntfyServer()
src/lib/diensten/meldingen.ts            onderwerp lezen/wijzigen, meldUrgenteTaak(), stuurTestmelding()
src/lib/diensten/taken.ts                (wijzigen) melding na maakTaak/wijzigTaak
src/app/(app)/beheer/acties.ts           (wijzigen) wijzigMeldingenActie, stuurTestmeldingActie
src/app/(app)/beheer/instellingen/page.tsx  (wijzigen) paneel Meldingen
src/components/beheer/testmelding-knop.tsx  knop "Stuur testmelding"
```

---

### Task 1: Google Routes-client

**Files:**
- Create: `src/lib/google/http.ts`
- Modify: `src/lib/google/plaatsen.ts` (de functies `sleutel` en `vraag` vervangen door http.ts)
- Create: `src/lib/google/routes.ts`
- Test: `tests/unit/routes.test.ts` (nieuw); `tests/unit/plaatsen.test.ts` blijft ongewijzigd en moet groen blijven

**Interfaces:**
- Consumes: `Punt` uit `src/lib/domein/navigatie.ts` (`{ lat: number; lng: number }`), `Fout` uit `src/lib/fouten.ts`.
- Produces:
  - `googleSleutel(fout: () => Error): string`
  - `vraagGoogle(haal: typeof fetch, url: string, init: RequestInit, opties: { timeoutMs: number; fout: () => Error }): Promise<object>`
  - `class RouteNietBeschikbaar extends Fout` (melding `Volgorde kon niet berekend worden`)
  - `type RouteDeelDuur = { duurSec: number; meters: number }`
  - `type BerekendeRoute = { volgorde: number[]; delen: RouteDeelDuur[]; totaalSec: number; totaalMeters: number }`
  - `berekenRoute(invoer: { start: Punt; bestemming: Punt; stops: Punt[] }, haal?: typeof fetch): Promise<BerekendeRoute>`. Hierin is `volgorde` een lijst met indexen in `invoer.stops`, in rijvolgorde. `delen` heeft `stops.length + 1` items (start → eerste stop … laatste stop → bestemming).

- [ ] **Step 1: Schrijf de falende test**

`tests/unit/routes.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { berekenRoute, RouteNietBeschikbaar } from '@/lib/google/routes';

const antwoord = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const invoer = {
  start: { lat: 51.6, lng: 4.8 },
  bestemming: { lat: 51.55, lng: 4.7 },
  stops: [{ lat: 51.51, lng: 4.71 }, { lat: 51.52, lng: 4.72 }],
};

const goed = {
  routes: [{
    duration: '1500s',
    distanceMeters: 20000,
    optimizedIntermediateWaypointIndex: [1, 0],
    legs: [{ duration: '400s', distanceMeters: 6000 }, { duration: '500.4s' }, { duration: '600s', distanceMeters: 14000 }],
  }],
};

describe('Google Routes-client', () => {
  beforeEach(() => { process.env.GOOGLE_MAPS_API_KEY = 'test-sleutel'; });
  afterEach(() => { delete process.env.GOOGLE_MAPS_API_KEY; });

  it('zonder sleutel: niet beschikbaar, zonder Google aan te roepen', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const haal = antwoord(goed);
    await expect(berekenRoute(invoer, haal)).rejects.toThrow('Volgorde kon niet berekend worden');
    expect(haal).not.toHaveBeenCalled();
  });

  it('stuurt de juiste aanvraag', async () => {
    const haal = antwoord(goed);
    await berekenRoute(invoer, haal);
    const [url, init] = haal.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('test-sleutel');
    expect(headers['X-Goog-FieldMask']).toBe(
      'routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters,routes.optimizedIntermediateWaypointIndex',
    );
    expect(JSON.parse(String(init.body))).toEqual({
      origin: { location: { latLng: { latitude: 51.6, longitude: 4.8 } } },
      destination: { location: { latLng: { latitude: 51.55, longitude: 4.7 } } },
      intermediates: [
        { location: { latLng: { latitude: 51.51, longitude: 4.71 } } },
        { location: { latLng: { latitude: 51.52, longitude: 4.72 } } },
      ],
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      optimizeWaypointOrder: true,
      languageCode: 'nl-NL',
      units: 'METRIC',
    });
  });

  it('vertaalt volgorde, reistijden en afstanden', async () => {
    expect(await berekenRoute(invoer, antwoord(goed))).toEqual({
      volgorde: [1, 0],
      delen: [{ duurSec: 400, meters: 6000 }, { duurSec: 500, meters: 0 }, { duurSec: 600, meters: 14000 }],
      totaalSec: 1500,
      totaalMeters: 20000,
    });
  });

  it('foutstatus, netwerkfout of onleesbaar antwoord: niet beschikbaar', async () => {
    await expect(berekenRoute(invoer, antwoord({}, 429))).rejects.toBeInstanceOf(RouteNietBeschikbaar);
    const kapot = vi.fn(async () => { throw new Error('netwerk'); }) as unknown as typeof fetch;
    await expect(berekenRoute(invoer, kapot)).rejects.toBeInstanceOf(RouteNietBeschikbaar);
    const html = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    await expect(berekenRoute(invoer, html)).rejects.toBeInstanceOf(RouteNietBeschikbaar);
  });

  it('weigert een onvolledig of onlogisch antwoord', async () => {
    const r = goed.routes[0];
    for (const kapot of [
      {},
      { routes: [] },
      { routes: [{ ...r, optimizedIntermediateWaypointIndex: [0, 0] }] },
      { routes: [{ ...r, optimizedIntermediateWaypointIndex: [-1] }] },
      { routes: [{ ...r, legs: r.legs.slice(1) }] },
      { routes: [{ ...r, duration: 'lang' }] },
    ]) {
      await expect(berekenRoute(invoer, antwoord(kapot))).rejects.toBeInstanceOf(RouteNietBeschikbaar);
    }
  });
});
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npx vitest run --project unit tests/unit/routes.test.ts`
Expected: FAIL, want `@/lib/google/routes` bestaat nog niet.

- [ ] **Step 3: Gedeelde Google-aanroep**

`src/lib/google/http.ts`:
```ts
/** Leest de Google-sleutel; zonder sleutel gooit hij de fout van de aanroeper. */
export function googleSleutel(fout: () => Error): string {
  const k = process.env.GOOGLE_MAPS_API_KEY;
  if (!k) throw fout();
  return k;
}

/** Roept Google aan en geeft het JSON-object terug. Elke storing (netwerk, timeout, status, onleesbaar antwoord) wordt `fout()`. */
export async function vraagGoogle(
  haal: typeof fetch,
  url: string,
  init: RequestInit,
  opties: { timeoutMs: number; fout: () => Error },
): Promise<object> {
  let r: Response;
  try {
    r = await haal(url, { ...init, signal: AbortSignal.timeout(opties.timeoutMs) });
  } catch {
    throw opties.fout();
  }
  if (!r.ok) throw opties.fout();
  let data: unknown;
  try {
    data = await r.json();
  } catch {
    throw opties.fout();
  }
  if (typeof data !== 'object' || data === null) throw opties.fout();
  return data;
}
```

Vervang in `src/lib/google/plaatsen.ts` de import en het blok vanaf `const BASIS` tot en met de functie `vraag` (dus `sleutel()` en `vraag()`) door:
```ts
import { Fout, Ongeldig } from '../fouten';
import { googleSleutel, vraagGoogle } from './http';
```
en (onder de types `Suggestie` en `Plaats`):
```ts
const BASIS = 'https://places.googleapis.com/v1';
const TIMEOUT_MS = 5000;
const nietBeschikbaar = () => new GoogleNietBeschikbaar();
const sleutel = () => googleSleutel(nietBeschikbaar);
const vraag = (haal: typeof fetch, url: string, init: RequestInit) =>
  vraagGoogle(haal, url, init, { timeoutMs: TIMEOUT_MS, fout: nietBeschikbaar });
```
`GoogleNietBeschikbaar`, `zoekPlaatsen` en `plaatsDetails` blijven verder ongewijzigd. Ze roepen nog steeds `sleutel()` en `vraag(haal, url, init)` aan.

- [ ] **Step 4: Routes-client**

`src/lib/google/routes.ts`:
```ts
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
```

- [ ] **Step 5: Draai de tests en zie ze slagen**

Run: `npx vitest run --project unit tests/unit/routes.test.ts tests/unit/plaatsen.test.ts`
Expected: PASS (routes 5/5, plaatsen ongewijzigd groen)

Run: `npm test` en `npm run typecheck`
Expected: alles groen, geen typefouten.

- [ ] **Step 6: Commit**

```bash
git add src/lib/google/http.ts src/lib/google/plaatsen.ts src/lib/google/routes.ts tests/unit/routes.test.ts
git commit -m "feat: Google Routes-client voor de snelste volgorde" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Route plannen (domein, dienst en server action)

**Files:**
- Modify: `src/lib/domein/navigatie.ts` (routeUrl, formatDuur, formatAfstand)
- Modify: `src/lib/domein/validatie.ts` (puntSchema)
- Create: `src/lib/diensten/route.ts`
- Modify: `src/app/(app)/bord/acties.ts` (planRouteActie)
- Test: `tests/unit/navigatie.test.ts` (uitbreiden), `tests/integration/route.test.ts` (nieuw)

**Interfaces:**
- Consumes:
  - uit Task 1: `berekenRoute`, `RouteNietBeschikbaar`, `RouteDeelDuur` (`src/lib/google/routes.ts`)
  - `haalTaak(id): Promise<Taak>`, met `taak.stops: Stop[]` (`src/lib/diensten/taken.ts`)
  - `haalInstellingen(): Promise<Instellingen>`, met `naam`, `garageLat` en `garageLng` (`src/lib/diensten/instellingen.ts`)
  - `Ongeldig` (`src/lib/fouten.ts`)
- Produces:
  - `routeUrl(r: { start: Punt | null; bestemming: Punt | null; stops: Punt[] }): string`
  - `formatDuur(sec: number): string` en `formatAfstand(m: number): string`
  - `puntSchema` (Zod: `{ lat: -90..90, lng: -180..180 }`)
  - `MELDING_GEEN_LOCATIE` en `MELDING_GEEN_GARAGE` (strings)
  - `type RouteDeel = RouteDeelDuur & { naar: string }`
  - `type RoutePlan = { volgorde: number[]; geoptimaliseerd: boolean; meldingen: string[]; delen: RouteDeel[] | null; totaalSec: number | null; totaalMeters: number | null; url: string }`
  - `planRoute(taakId: string, start: Punt | null, haal?: typeof fetch): Promise<RoutePlan>`
  - `planRouteActie(taakId: string, start: Punt | null): Promise<ActieResultaat<RoutePlan>>`

- [ ] **Step 1: Schrijf de falende unit-tests**

Voeg in `tests/unit/navigatie.test.ts` de import uit (`import { formatAfstand, formatDuur, navigatieUrl, routeUrl, stopsSamenvatting } from '@/lib/domein/navigatie';`) en zet in het bestaande `describe('navigatie', …)`-blok:
```ts
  it('bouwt een route-link met start, bestemming en tussenstops', () => {
    expect(routeUrl({
      start: { lat: 51.6, lng: 4.8 },
      bestemming: { lat: 51.55, lng: 4.7 },
      stops: [{ lat: 51.51, lng: 4.71 }, { lat: 51.52, lng: 4.72 }],
    })).toBe('https://www.google.com/maps/dir/?api=1&origin=51.6%2C4.8&destination=51.55%2C4.7&waypoints=51.51%2C4.71%7C51.52%2C4.72&travelmode=driving');
  });

  it('zonder start valt origin weg; zonder bestemming eindigt de rit bij de laatste stop', () => {
    expect(routeUrl({ start: null, bestemming: null, stops: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=3%2C4&waypoints=1%2C2&travelmode=driving');
    expect(routeUrl({ start: null, bestemming: null, stops: [{ lat: 1, lng: 2 }] }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=1%2C2&travelmode=driving');
  });

  it('schrijft reistijd en afstand leesbaar', () => {
    expect(formatDuur(20)).toBe('< 1 min');
    expect(formatDuur(600)).toBe('10 min');
    expect(formatDuur(3600)).toBe('1 u');
    expect(formatDuur(3900)).toBe('1 u 5 min');
    expect(formatAfstand(850)).toBe('850 m');
    expect(formatAfstand(12345)).toBe('12,3 km');
  });
```

- [ ] **Step 2: Schrijf de falende integratietest**

`tests/integration/route.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '../../src/lib/context';
import { wijzigInstellingen } from '../../src/lib/diensten/instellingen';
import { MELDING_GEEN_GARAGE, MELDING_GEEN_LOCATIE, planRoute } from '../../src/lib/diensten/route';
import { maakTaak } from '../../src/lib/diensten/taken';
import { Ongeldig } from '../../src/lib/fouten';
import { leegDatabase, maakBeheerderCtx, maakBord, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;
let bordId: string;
let taakId: string;

const stop = (naam: string, lat: number, lng: number) =>
  ({ naam, adres: `${naam}-straat 1`, lat, lng, googlePlaceId: null, locatieId: null, bewaar: false });
const START = { lat: 51.6, lng: 4.8 };

const googleAntwoord = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const geoptimaliseerd = {
  routes: [{
    duration: '2400s',
    distanceMeters: 31000,
    optimizedIntermediateWaypointIndex: [2, 0, 1],
    legs: [
      { duration: '600s', distanceMeters: 8000 },
      { duration: '300s', distanceMeters: 4000 },
      { duration: '700s', distanceMeters: 9000 },
      { duration: '800s', distanceMeters: 10000 },
    ],
  }],
};

const verzondenBody = (haal: ReturnType<typeof vi.fn>) => JSON.parse(String((haal.mock.calls[0] as [string, RequestInit])[1].body));

async function zetGarage() {
  await wijzigInstellingen(beheerder, {
    naam: 'Garage Jansen', garageAdres: 'Dorpsstraat 1', garageLat: 51.55, garageLng: 4.7, werkdagen: [1, 2, 3, 4, 5],
  });
}

async function maakRonde(stops: ReturnType<typeof stop>[]) {
  return (await maakTaak(piet, {
    bordId, herhaling: null, titel: 'Ochtendronde', omschrijving: '', datum: '2026-11-02', tijd: null, prioriteit: 'middel', stops,
  })).id;
}

beforeEach(async () => {
  await leegDatabase();
  process.env.GOOGLE_MAPS_API_KEY = 'test-sleutel';
  beheerder = await maakBeheerderCtx();
  piet = await maakMedewerkerCtx('piet', 'Piet');
  bordId = await maakBord();
  taakId = await maakRonde([stop('A', 51.51, 4.71), stop('B', 51.52, 4.72), stop('C', 51.53, 4.73)]);
});

afterEach(() => { delete process.env.GOOGLE_MAPS_API_KEY; });

describe('route plannen', () => {
  it('berekent de snelste volgorde van de huidige locatie naar de garage', async () => {
    await zetGarage();
    const haal = googleAntwoord(geoptimaliseerd);
    expect(await planRoute(taakId, START, haal)).toEqual({
      volgorde: [2, 0, 1],
      geoptimaliseerd: true,
      meldingen: [],
      delen: [
        { naar: 'C', duurSec: 600, meters: 8000 },
        { naar: 'A', duurSec: 300, meters: 4000 },
        { naar: 'B', duurSec: 700, meters: 9000 },
        { naar: 'Garage Jansen', duurSec: 800, meters: 10000 },
      ],
      totaalSec: 2400,
      totaalMeters: 31000,
      url: 'https://www.google.com/maps/dir/?api=1&origin=51.6%2C4.8&destination=51.55%2C4.7&waypoints=51.53%2C4.73%7C51.51%2C4.71%7C51.52%2C4.72&travelmode=driving',
    });
    const body = verzondenBody(haal);
    expect(body.origin).toEqual({ location: { latLng: { latitude: 51.6, longitude: 4.8 } } });
    expect(body.destination).toEqual({ location: { latLng: { latitude: 51.55, longitude: 4.7 } } });
    expect(body.intermediates).toHaveLength(3);
  });

  it('zonder huidige locatie start de route bij de garage', async () => {
    await zetGarage();
    const haal = googleAntwoord(geoptimaliseerd);
    const plan = await planRoute(taakId, null, haal);
    expect(plan.meldingen).toEqual([MELDING_GEEN_LOCATIE]);
    expect(plan.url).toContain('origin=51.55%2C4.7&destination=51.55%2C4.7');
    expect(verzondenBody(haal).origin).toEqual({ location: { latLng: { latitude: 51.55, longitude: 4.7 } } });
  });

  it('faalt Google, dan de ingevoerde volgorde met een melding', async () => {
    await zetGarage();
    expect(await planRoute(taakId, START, googleAntwoord({}, 500))).toEqual({
      volgorde: [0, 1, 2],
      geoptimaliseerd: false,
      meldingen: ['Volgorde kon niet berekend worden'],
      delen: null,
      totaalSec: null,
      totaalMeters: null,
      url: 'https://www.google.com/maps/dir/?api=1&origin=51.6%2C4.8&destination=51.55%2C4.7&waypoints=51.51%2C4.71%7C51.52%2C4.72%7C51.53%2C4.73&travelmode=driving',
    });
  });

  it('zonder garage-adres: geen berekening, de rit eindigt bij de laatste stop', async () => {
    const haal = googleAntwoord(geoptimaliseerd);
    const plan = await planRoute(taakId, START, haal);
    expect(haal).not.toHaveBeenCalled();
    expect(plan.geoptimaliseerd).toBe(false);
    expect(plan.meldingen).toEqual([MELDING_GEEN_GARAGE]);
    expect(plan.url).toBe('https://www.google.com/maps/dir/?api=1&origin=51.6%2C4.8&destination=51.53%2C4.73&waypoints=51.51%2C4.71%7C51.52%2C4.72&travelmode=driving');
  });

  it('weigert een taak met minder dan 2 stops en een ongeldig startpunt', async () => {
    await zetGarage();
    const eenStop = await maakRonde([stop('A', 51.51, 4.71)]);
    await expect(planRoute(eenStop, START, googleAntwoord(geoptimaliseerd))).rejects.toBeInstanceOf(Ongeldig);
    await expect(planRoute(taakId, { lat: 200, lng: 4.8 }, googleAntwoord(geoptimaliseerd))).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Draai de tests en zie ze falen**

Run: `npx vitest run --project unit tests/unit/navigatie.test.ts`
Expected: FAIL (`routeUrl`, `formatDuur` en `formatAfstand` bestaan niet)

Run (met de Docker-PATH): `npx vitest run --project integratie tests/integration/route.test.ts`
Expected: FAIL (`src/lib/diensten/route.ts` bestaat niet)

- [ ] **Step 4: Domein**

Vervang `src/lib/domein/navigatie.ts` volledig door:
```ts
export type Punt = { lat: number; lng: number };

const coord = (p: Punt) => encodeURIComponent(`${p.lat},${p.lng}`);

export function navigatieUrl(p: Punt): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coord(p)}&travelmode=driving`;
}

/** Google Maps-link langs meerdere stops. Zonder start kiest Maps de huidige locatie; zonder bestemming eindigt de rit bij de laatste stop. */
export function routeUrl(r: { start: Punt | null; bestemming: Punt | null; stops: Punt[] }): string {
  const tussen = [...r.stops];
  const bestemming = r.bestemming ?? tussen.pop();
  if (!bestemming) throw new Error('Een route heeft minstens één stop of bestemming nodig');
  const delen = ['api=1'];
  if (r.start) delen.push(`origin=${coord(r.start)}`);
  delen.push(`destination=${coord(bestemming)}`);
  if (tussen.length > 0) delen.push(`waypoints=${tussen.map(coord).join('%7C')}`);
  delen.push('travelmode=driving');
  return `https://www.google.com/maps/dir/?${delen.join('&')}`;
}

export function stopsSamenvatting(stops: { naam: string }[]): string | null {
  if (stops.length === 0) return null;
  if (stops.length === 1) return stops[0].naam;
  return `${stops.length} stops`;
}

export function formatDuur(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  const rest = min % 60;
  return rest === 0 ? `${Math.floor(min / 60)} u` : `${Math.floor(min / 60)} u ${rest} min`;
}

export function formatAfstand(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
```

Voeg in `src/lib/domein/validatie.ts` direct na `stopsSchema` toe:
```ts
export const puntSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
```

- [ ] **Step 5: Dienst**

`src/lib/diensten/route.ts`:
```ts
import { type Punt, routeUrl } from '../domein/navigatie';
import { puntSchema } from '../domein/validatie';
import { Ongeldig } from '../fouten';
import { berekenRoute, type RouteDeelDuur, RouteNietBeschikbaar } from '../google/routes';
import { haalInstellingen } from './instellingen';
import { haalTaak } from './taken';

export const MELDING_GEEN_LOCATIE = 'Je huidige locatie is niet beschikbaar. De route start bij de garage.';
export const MELDING_GEEN_GARAGE = 'Er is nog geen garage-adres ingesteld (Beheer → Instellingen). De volgorde is niet berekend.';

export type RouteDeel = RouteDeelDuur & { naar: string };
export type RoutePlan = {
  /** Indexen in taak.stops, in rijvolgorde. */
  volgorde: number[];
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
  const zonderBerekening = (meldingen: string[], vertrek: Punt | null, garage: Punt | null): RoutePlan => ({
    volgorde: ingevoerd, geoptimaliseerd: false, meldingen, delen: null, totaalSec: null, totaalMeters: null,
    url: routeUrl({ start: vertrek, bestemming: garage, stops }),
  });

  if (instellingen.garageLat === null || instellingen.garageLng === null) {
    return zonderBerekening([MELDING_GEEN_GARAGE], begin, null);
  }
  const garage = { lat: instellingen.garageLat, lng: instellingen.garageLng };
  const vertrek = begin ?? garage;
  const meldingen = begin ? [] : [MELDING_GEEN_LOCATIE];
  try {
    const r = await berekenRoute({ start: vertrek, bestemming: garage, stops }, haal);
    const namen = [...r.volgorde.map((i) => stops[i].naam), instellingen.naam];
    return {
      volgorde: r.volgorde,
      geoptimaliseerd: true,
      meldingen,
      delen: r.delen.map((d, i) => ({ naar: namen[i], ...d })),
      totaalSec: r.totaalSec,
      totaalMeters: r.totaalMeters,
      url: routeUrl({ start: vertrek, bestemming: garage, stops: r.volgorde.map((i) => stops[i]) }),
    };
  } catch (e) {
    if (!(e instanceof RouteNietBeschikbaar)) throw e;
    return zonderBerekening([...meldingen, e.message], vertrek, garage);
  }
}
```

- [ ] **Step 6: Server action**

Voeg in `src/app/(app)/bord/acties.ts` toe aan de imports:
```ts
import { planRoute, type RoutePlan } from '@/lib/diensten/route';
import type { Punt } from '@/lib/domein/navigatie';
```
en onderaan:
```ts
export async function planRouteActie(taakId: string, start: Punt | null): Promise<ActieResultaat<RoutePlan>> {
  return voerUit(async () => {
    await ctx(); // alleen ingelogde gebruikers
    return planRoute(taakId, start);
  });
}
```

- [ ] **Step 7: Draai de tests en zie ze slagen**

Run: `npx vitest run --project unit tests/unit/navigatie.test.ts`
Expected: PASS

Run (met de Docker-PATH): `npx vitest run --project integratie tests/integration/route.test.ts`
Expected: PASS (5/5)

Run: `npm test`, `npm run test:integratie`, `npm run typecheck`
Expected: alles groen.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domein/navigatie.ts src/lib/domein/validatie.ts src/lib/diensten/route.ts "src/app/(app)/bord/acties.ts" tests/unit/navigatie.test.ts tests/integration/route.test.ts
git commit -m "feat: route plannen met de snelste volgorde naar de garage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Navigatieblok met "Plan route"

**Files:**
- Create: `src/components/bord/navigatie-blok.tsx`
- Modify: `src/components/bord/taak-dialoog.tsx` (het inline navigatieblok vervangen)
- Modify: `tests/e2e/helpers.ts` (zetGarage, maakTaakMetStops)
- Test: `tests/e2e/route.spec.ts` (nieuw)

**Interfaces:**
- Consumes:
  - uit Task 2: `planRouteActie(taakId, start)`, `type RoutePlan`, `formatDuur`, `formatAfstand`, `type Punt`
  - `navigatieUrl` (`src/lib/domein/navigatie.ts`), `type Stop` (`src/lib/diensten/stops.ts`)
  - `Knop` en `Melding` (`src/components/ui.tsx`; `Melding` heeft `soort: 'fout' | 'info'`, waarbij `info` als `role="status"` wordt weergegeven)
- Produces: `NavigatieBlok({ taakId: string; stops: Stop[] })`. In de DOM staan:
  - links met `aria-label="Navigeer naar <naam>"`
  - een knop "Plan route" (na het plannen "Opnieuw plannen")
  - een link "Start route in Google Maps"

- [ ] **Step 1: Schrijf de falende e2e-test**

Voeg toe aan `tests/e2e/helpers.ts`. Zet de import bovenaan (`import { vandaagInAmsterdam } from '../../src/lib/domein/datums';`) en de functies onderaan:
```ts
export async function zetGarage(lat: number, lng: number): Promise<void> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  await sql`update instellingen set garage_adres = 'Dorpsstraat 1, Rijsbergen', garage_lat = ${lat}, garage_lng = ${lng}`;
  await sql.end();
}

/** Zet vandaag een taak met stops op het eerste bord. */
export async function maakTaakMetStops(titel: string, stops: { naam: string; adres: string; lat: number; lng: number }[]): Promise<void> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  const datum = vandaagInAmsterdam();
  const [bord] = await sql<{ id: string }[]>`select id from borden where not gearchiveerd order by aangemaakt_op limit 1`;
  const [taak] = await sql<{ id: string }[]>`
    insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum)
    values (${bord.id}, ${titel}, ${datum}, 'middel', ${datum}) returning id`;
  for (const [i, s] of stops.entries()) {
    await sql`insert into taak_stops (taak_id, volgorde, naam, adres, lat, lng)
      values (${taak.id}, ${i + 1}, ${s.naam}, ${s.adres}, ${s.lat}, ${s.lng})`;
  }
  await sql.end();
}
```

`tests/e2e/route.spec.ts`:
```ts
import { expect, type Page, test } from '@playwright/test';
import { inloggen, maakMedewerker, maakTaakMetStops, zetGarage } from './helpers';

const STOPS = [
  { naam: 'Stop Noord', adres: 'Noordweg 1, Breda', lat: 51.51, lng: 4.71 },
  { naam: 'Stop Zuid', adres: 'Zuidweg 2, Breda', lat: 51.52, lng: 4.72 },
];

async function openTaak(page: Page, titel: string) {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.locator('[data-taak]', { hasText: titel }).click();
  return page.getByRole('dialog', { name: 'Taak bewerken' });
}

test.describe('met toestemming voor de locatie', () => {
  test.use({ geolocation: { latitude: 51.6, longitude: 4.8 }, permissions: ['geolocation'] });

  test('plant een route; zonder Google valt hij terug op de ingevoerde volgorde', async ({ page }) => {
    await zetGarage(51.55, 4.7);
    await maakTaakMetStops('Ronde met locatie', STOPS);
    const dialoog = await openTaak(page, 'Ronde met locatie');
    await expect(dialoog.getByRole('link', { name: 'Navigeer naar Stop Noord' })).toBeVisible();
    await dialoog.getByRole('button', { name: 'Plan route' }).click();
    await expect(dialoog.getByText('Volgorde kon niet berekend worden')).toBeVisible({ timeout: 15_000 });
    await expect(dialoog.getByRole('link', { name: 'Start route in Google Maps' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&origin=51.6%2C4.8&destination=51.55%2C4.7&waypoints=51.51%2C4.71%7C51.52%2C4.72&travelmode=driving',
    );
  });
});

test('zonder toestemming voor de locatie start de route bij de garage', async ({ page }) => {
  await zetGarage(51.55, 4.7);
  await maakTaakMetStops('Ronde zonder locatie', STOPS);
  const dialoog = await openTaak(page, 'Ronde zonder locatie');
  await dialoog.getByRole('button', { name: 'Plan route' }).click();
  await expect(dialoog.getByText('De route start bij de garage')).toBeVisible({ timeout: 15_000 });
  await expect(dialoog.getByRole('link', { name: 'Start route in Google Maps' })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/dir/?api=1&origin=51.55%2C4.7&destination=51.55%2C4.7&waypoints=51.51%2C4.71%7C51.52%2C4.72&travelmode=driving',
  );
});
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npx playwright test tests/e2e/route.spec.ts`
Expected: FAIL. Er is nog geen knop "Plan route".

- [ ] **Step 3: Component**

`src/components/bord/navigatie-blok.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { planRouteActie } from '@/app/(app)/bord/acties';
import { Knop, Melding } from '@/components/ui';
import type { RoutePlan } from '@/lib/diensten/route';
import type { Stop } from '@/lib/diensten/stops';
import { formatAfstand, formatDuur, navigatieUrl, type Punt } from '@/lib/domein/navigatie';

const LOCATIE_TIMEOUT_MS = 8000;
const ACCENT_LINK =
  'inline-flex shrink-0 items-center justify-center rounded-lg bg-accent font-semibold text-accent-donker hover:bg-accent/90';

/** Huidige locatie van het apparaat, of null als die geweigerd of niet beschikbaar is. */
function huidigeLocatie(): Promise<Punt | null> {
  return new Promise((klaar) => {
    if (!('geolocation' in navigator)) {
      klaar(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => klaar({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => klaar(null),
      { timeout: LOCATIE_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}

const reis = (d: { duurSec: number; meters: number }) => `${formatDuur(d.duurSec)} · ${formatAfstand(d.meters)}`;

export function NavigatieBlok({ taakId, stops }: { taakId: string; stops: Stop[] }) {
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, start] = useTransition();
  const meerdere = stops.length > 1;
  const volgorde = plan?.volgorde ?? stops.map((_, i) => i);
  const terug = plan?.delen?.at(-1);

  function planRoute() {
    setFout(null);
    start(async () => {
      try {
        const r = await planRouteActie(taakId, await huidigeLocatie());
        if (r.ok) setPlan(r.data);
        else setFout(r.fout);
      } catch {
        setFout('Route plannen lukt nu niet. Probeer het opnieuw.');
      }
    });
  }

  return (
    <div className="mb-5 rounded-lg border border-rand bg-achtergrond p-3">
      <span className="mb-2 block text-xs font-medium text-tekst-zacht">{meerdere ? 'Locaties' : 'Locatie'}</span>
      <ol className="space-y-2">
        {volgorde.map((i, n) => {
          const s = stops[i];
          const deel = plan?.delen?.[n];
          return (
            <li key={`${i}-${s.adres}`} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{meerdere ? `${n + 1}. ` : ''}{s.naam}</span>
                <span className="block truncate text-xs text-tekst-flauw">{deel ? `${reis(deel)} rijden · ${s.adres}` : s.adres}</span>
              </span>
              <a
                href={navigatieUrl(s)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Navigeer naar ${s.naam}`}
                className={`${ACCENT_LINK} px-3 py-1.5 text-xs`}
              >
                Navigeer
              </a>
            </li>
          );
        })}
      </ol>
      {meerdere && (
        <div className="mt-3 space-y-2 border-t border-rand-zacht pt-3">
          {plan?.meldingen.map((m) => <Melding key={m} soort="info">{m}</Melding>)}
          {fout && <Melding>{fout}</Melding>}
          {plan && terug && plan.totaalSec !== null && plan.totaalMeters !== null && (
            <p className="text-xs text-tekst-zacht">
              Daarna {reis(terug)} naar {terug.naar}. Totaal {formatDuur(plan.totaalSec)} · {formatAfstand(plan.totaalMeters)}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Knop variant={plan ? 'secundair' : 'primair'} onClick={planRoute} disabled={bezig}>
              {bezig ? 'Route berekenen…' : plan ? 'Opnieuw plannen' : 'Plan route'}
            </Knop>
            {plan && (
              <a href={plan.url} target="_blank" rel="noopener noreferrer" className={`${ACCENT_LINK} h-9 px-3.5 text-sm`}>
                Start route in Google Maps
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Dialoog aansluiten**

In `src/components/bord/taak-dialoog.tsx`:
- Vervang de import `import { navigatieUrl } from '@/lib/domein/navigatie';` door `import { NavigatieBlok } from './navigatie-blok';` en zet die naast de andere lokale imports (`./stijl`, `./stops-editor`).
- Vervang het hele blok dat begint met `{taak && taak.stops.length > 0 && (` en eindigt met de bijbehorende `)}` (de `div` met de `ol` en de links "Navigeer") door:
```tsx
        {taak && taak.stops.length > 0 && <NavigatieBlok taakId={taak.id} stops={taak.stops} />}
```

- [ ] **Step 5: Draai de tests en zie ze slagen**

Run (dev-Postgres draait; geen andere `next dev` in deze map): `npx playwright test tests/e2e/route.spec.ts tests/e2e/locaties.spec.ts`
Expected: PASS. Ook de bestaande locaties-tests (link "Navigeer naar Banden-Plus") blijven groen.

Run: `npm run typecheck`, `npm test` en `npx next build`
Expected: groen, en de build slaagt.

- [ ] **Step 6: Commit**

```bash
git add src/components/bord/navigatie-blok.tsx src/components/bord/taak-dialoog.tsx tests/e2e/helpers.ts tests/e2e/route.spec.ts
git commit -m "feat: Plan route en Start route in Google Maps in het taakvenster" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: ntfy-meldingen bij urgente taken

**Files:**
- Create: `migrations/003_meldingen.sql`
- Create: `src/lib/domein/meldingen.ts`
- Modify: `src/lib/domein/validatie.ts` (ntfyOnderwerpSchema)
- Create: `src/lib/meldingen/ntfy.ts`
- Create: `src/lib/diensten/meldingen.ts`
- Modify: `src/lib/diensten/taken.ts` (`maakTaak` en `wijzigTaak` melden na de commit)
- Modify: `tests/integration/helpers.ts` (`leegDatabase` wist het onderwerp)
- Test: `tests/unit/meldingen.test.ts`, `tests/unit/ntfy.test.ts`, `tests/integration/meldingen.test.ts` (nieuw)

**Interfaces:**
- Consumes:
  - `PRIORITEITEN` (van urgent naar niet-urgent), `PRIORITEIT_LABEL`, `type Prioriteit` (`src/lib/domein/taak.ts`)
  - `DAGNAMEN`, `kortDatumLabel`, `weekdag`, `type Datum` (`src/lib/domein/datums.ts`)
  - `vereisBeheerder` (`src/lib/diensten/rechten.ts`), `db` (`src/lib/db/client.ts`), `Fout` (`src/lib/fouten.ts`)
- Produces:
  - `type NtfyBericht = { titel: string; tekst: string; prioriteit: 4 | 5; tags: string[]; link: string }`
  - `isUrgentVerhoogd(oud: Prioriteit | null, nieuw: Prioriteit): boolean`
  - `urgentBericht(t: { titel; prioriteit; bordNaam; datum; tijd }, appUrl: string): NtfyBericht`
  - `ntfyOnderwerpSchema`: een string die wordt getrimd. Een lege string wordt `null`; anders 1–64 tekens `[A-Za-z0-9_-]`.
  - `class NtfyNietIngesteld extends Fout`, `class NtfyMislukt extends Fout`, `ntfyServer(): string | null`, `stuurNtfy(onderwerp: string, b: NtfyBericht, haal?: typeof fetch): Promise<void>`
  - `haalNtfyOnderwerp(): Promise<string | null>`, `wijzigNtfyOnderwerp(ctx, onderwerp: string): Promise<void>`
  - `meldUrgenteTaak(ctx, oud: Prioriteit | null, t: UrgenteTaak, haal?): Promise<void>` (gooit nooit)
  - `stuurTestmelding(ctx, haal?): Promise<void>` (gooit wel; alleen voor de beheerder)

- [ ] **Step 1: Schrijf de falende unit-tests**

`tests/unit/meldingen.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isUrgentVerhoogd, urgentBericht } from '@/lib/domein/meldingen';

describe('meldingen', () => {
  it('meldt nieuwe en verhoogde zsm/nu-taken', () => {
    expect(isUrgentVerhoogd(null, 'nu')).toBe(true);
    expect(isUrgentVerhoogd(null, 'zsm')).toBe(true);
    expect(isUrgentVerhoogd(null, 'hoog')).toBe(false);
    expect(isUrgentVerhoogd('middel', 'zsm')).toBe(true);
    expect(isUrgentVerhoogd('zsm', 'nu')).toBe(true);
    expect(isUrgentVerhoogd('nu', 'zsm')).toBe(false);
    expect(isUrgentVerhoogd('nu', 'nu')).toBe(false);
    expect(isUrgentVerhoogd('laag', 'hoog')).toBe(false);
  });

  it('maakt het bericht met een link naar Vandaag op die dag', () => {
    expect(urgentBericht({ titel: 'Klant wacht', prioriteit: 'nu', bordNaam: 'Werkplaats', datum: '2026-11-02', tijd: '09:30' }, 'https://bord.test/'))
      .toEqual({
        titel: 'Nu: Klant wacht', tekst: 'Werkplaats · maandag 2 nov om 09:30', prioriteit: 5,
        tags: ['rotating_light'], link: 'https://bord.test/vandaag?datum=2026-11-02',
      });
    expect(urgentBericht({ titel: 'Onderdeel halen', prioriteit: 'zsm', bordNaam: 'Werkplaats', datum: '2026-11-03', tijd: null }, 'https://bord.test'))
      .toEqual({
        titel: 'Zo snel mogelijk: Onderdeel halen', tekst: 'Werkplaats · dinsdag 3 nov', prioriteit: 4,
        tags: ['warning'], link: 'https://bord.test/vandaag?datum=2026-11-03',
      });
  });
});
```

`tests/unit/ntfy.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NtfyMislukt, NtfyNietIngesteld, stuurNtfy } from '@/lib/meldingen/ntfy';

const bericht = {
  titel: 'Nu: Klant wacht', tekst: 'Werkplaats · maandag 2 nov', prioriteit: 5 as const,
  tags: ['rotating_light'], link: 'https://bord.test/vandaag?datum=2026-11-02',
};
const ok = () => vi.fn(async () => new Response('{}')) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe('ntfy-client', () => {
  beforeEach(() => {
    process.env.NTFY_URL = 'https://ntfy.test/';
    delete process.env.NTFY_TOKEN;
  });
  afterEach(() => {
    delete process.env.NTFY_URL;
    delete process.env.NTFY_TOKEN;
  });

  it('zonder server: niet ingesteld, zonder iets te versturen', async () => {
    const haal = ok();
    delete process.env.NTFY_URL;
    await expect(stuurNtfy('garage-max', bericht, haal)).rejects.toBeInstanceOf(NtfyNietIngesteld);
    process.env.NTFY_URL = '  ';
    await expect(stuurNtfy('garage-max', bericht, haal)).rejects.toBeInstanceOf(NtfyNietIngesteld);
    expect(haal).not.toHaveBeenCalled();
  });

  it('publiceert als JSON op de server', async () => {
    const haal = ok();
    await stuurNtfy('garage-max', bericht, haal);
    const [url, init] = haal.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ntfy.test');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(String(init.body))).toEqual({
      topic: 'garage-max', title: 'Nu: Klant wacht', message: 'Werkplaats · maandag 2 nov', priority: 5,
      tags: ['rotating_light'], click: 'https://bord.test/vandaag?datum=2026-11-02',
    });
  });

  it('stuurt het token mee als dat er is', async () => {
    process.env.NTFY_TOKEN = 'tk_geheim';
    const haal = ok();
    await stuurNtfy('garage-max', bericht, haal);
    expect(((haal.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe('Bearer tk_geheim');
  });

  it('foutstatus of netwerkfout: mislukt', async () => {
    const geweigerd = vi.fn(async () => new Response('', { status: 403 })) as unknown as typeof fetch;
    await expect(stuurNtfy('garage-max', bericht, geweigerd)).rejects.toBeInstanceOf(NtfyMislukt);
    const kapot = vi.fn(async () => { throw new Error('netwerk'); }) as unknown as typeof fetch;
    await expect(stuurNtfy('garage-max', bericht, kapot)).rejects.toBeInstanceOf(NtfyMislukt);
  });
});
```

- [ ] **Step 2: Schrijf de falende integratietest**

`tests/integration/meldingen.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Context } from '../../src/lib/context';
import { haalNtfyOnderwerp, stuurTestmelding, wijzigNtfyOnderwerp } from '../../src/lib/diensten/meldingen';
import { haalTaak, maakTaak, wijzigTaak } from '../../src/lib/diensten/taken';
import type { Prioriteit } from '../../src/lib/domein/taak';
import { GeenToegang } from '../../src/lib/fouten';
import { NtfyMislukt, NtfyNietIngesteld } from '../../src/lib/meldingen/ntfy';
import { leegDatabase, maakBeheerderCtx, maakBord, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;
let bordId: string;
let haal: MockInstance<typeof fetch>;
const oudeAppUrl = process.env.APP_URL;

const nieuw = (titel: string, prioriteit: Prioriteit) =>
  ({ bordId, herhaling: null, titel, omschrijving: '', datum: '2026-11-02', tijd: '09:30', prioriteit, stops: [] });
const verzonden = () => haal.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  piet = await maakMedewerkerCtx('piet', 'Piet');
  bordId = await maakBord('Werkplaats');
  process.env.NTFY_URL = 'https://ntfy.test';
  process.env.APP_URL = 'https://bord.test';
  delete process.env.NTFY_TOKEN;
  await wijzigNtfyOnderwerp(beheerder, 'garage-max');
  haal = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'));
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NTFY_URL;
  if (oudeAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = oudeAppUrl;
});

describe('pushmeldingen', () => {
  it('een nieuwe Nu-taak van een medewerker geeft een melding', async () => {
    await maakTaak(piet, nieuw('Klant wacht', 'nu'));
    expect(verzonden()).toEqual([{
      topic: 'garage-max', title: 'Nu: Klant wacht', message: 'Werkplaats · maandag 2 nov om 09:30', priority: 5,
      tags: ['rotating_light'], click: 'https://bord.test/vandaag?datum=2026-11-02',
    }]);
  });

  it('een nieuwe reeks met Nu geeft één melding', async () => {
    await maakTaak(piet, { ...nieuw('Elke ochtend', 'nu'), herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 } });
    expect(haal).toHaveBeenCalledTimes(1);
  });

  it('geen melding bij een lagere prioriteit of als de beheerder de taak maakt', async () => {
    await maakTaak(piet, nieuw('Gewoon', 'hoog'));
    await maakTaak(beheerder, nieuw('Zelf gemaakt', 'nu'));
    expect(haal).not.toHaveBeenCalled();
  });

  it('meldt een verhoging naar zsm en van zsm naar nu, niet een verlaging', async () => {
    const { id } = await maakTaak(piet, nieuw('Banden', 'middel'));
    const wijzig = async (prioriteit: Prioriteit) => {
      const t = await haalTaak(id);
      await wijzigTaak(piet, id, t.versie, { titel: t.titel, omschrijving: t.omschrijving, datum: t.datum, tijd: t.tijd, prioriteit, stops: [] });
    };
    await wijzig('zsm');
    await wijzig('nu');
    await wijzig('zsm');
    expect(verzonden().map((b) => b.title)).toEqual(['Zo snel mogelijk: Banden', 'Nu: Banden']);
  });

  it('zonder onderwerp of zonder server: geen melding', async () => {
    await wijzigNtfyOnderwerp(beheerder, '');
    expect(await haalNtfyOnderwerp()).toBeNull();
    await maakTaak(piet, nieuw('A', 'nu'));
    await wijzigNtfyOnderwerp(beheerder, 'garage-max');
    delete process.env.NTFY_URL;
    await maakTaak(piet, nieuw('B', 'nu'));
    expect(haal).not.toHaveBeenCalled();
  });

  it('een mislukte melding wordt gelogd en de taak blijft bewaard', async () => {
    haal.mockRejectedValue(new Error('ntfy plat'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { id } = await maakTaak(piet, nieuw('Toch bewaard', 'nu'));
    expect((await haalTaak(id)).titel).toBe('Toch bewaard');
    expect(log).toHaveBeenCalledWith('[ntfy] melding versturen mislukt', expect.any(Error));
  });

  it('onderwerp en testmelding zijn alleen voor de beheerder', async () => {
    await expect(wijzigNtfyOnderwerp(piet, 'iets')).rejects.toBeInstanceOf(GeenToegang);
    await expect(wijzigNtfyOnderwerp(beheerder, 'met spatie')).rejects.toThrow('Onderwerp');
    await expect(stuurTestmelding(piet)).rejects.toBeInstanceOf(GeenToegang);
    await stuurTestmelding(beheerder);
    expect(verzonden()[0]).toMatchObject({ topic: 'garage-max', title: 'Testmelding' });
  });

  it('de testmelding zegt het als meldingen niet ingesteld zijn of mislukken', async () => {
    await wijzigNtfyOnderwerp(beheerder, '');
    await expect(stuurTestmelding(beheerder)).rejects.toBeInstanceOf(NtfyNietIngesteld);
    await wijzigNtfyOnderwerp(beheerder, 'garage-max');
    haal.mockResolvedValue(new Response('', { status: 500 }));
    await expect(stuurTestmelding(beheerder)).rejects.toBeInstanceOf(NtfyMislukt);
  });
});
```

- [ ] **Step 3: Draai de tests en zie ze falen**

Run: `npx vitest run --project unit tests/unit/meldingen.test.ts tests/unit/ntfy.test.ts`
Expected: FAIL (modules bestaan niet)

Run (met de Docker-PATH): `npx vitest run --project integratie tests/integration/meldingen.test.ts`
Expected: FAIL

- [ ] **Step 4: Migratie en testhulp**

`migrations/003_meldingen.sql`:
```sql
alter table instellingen
  add column ntfy_onderwerp text constraint ntfy_onderwerp_geldig check (ntfy_onderwerp ~ '^[A-Za-z0-9_-]{1,64}$');
```

In `tests/integration/helpers.ts`, `leegDatabase`: zet in de `update instellingen`-regel `ntfy_onderwerp = null` erbij:
```ts
  await db()`update instellingen set naam = 'Garage', garage_adres = null, garage_lat = null, garage_lng = null, werkdagen = '{1,2,3,4,5}', ntfy_onderwerp = null`;
```

- [ ] **Step 5: Domein en validatie**

`src/lib/domein/meldingen.ts`:
```ts
import { DAGNAMEN, type Datum, kortDatumLabel, weekdag } from './datums';
import { PRIORITEIT_LABEL, PRIORITEITEN, type Prioriteit } from './taak';

export type NtfyBericht = { titel: string; tekst: string; prioriteit: 4 | 5; tags: string[]; link: string };

const URGENT: Prioriteit[] = ['zsm', 'nu'];

/** Melden bij een nieuwe taak met zsm/nu, of als de prioriteit daarnaar omhoog gaat (ook zsm → nu). */
export function isUrgentVerhoogd(oud: Prioriteit | null, nieuw: Prioriteit): boolean {
  if (!URGENT.includes(nieuw)) return false;
  return oud === null || PRIORITEITEN.indexOf(nieuw) < PRIORITEITEN.indexOf(oud);
}

export function urgentBericht(
  t: { titel: string; prioriteit: Prioriteit; bordNaam: string; datum: Datum; tijd: string | null },
  appUrl: string,
): NtfyBericht {
  const nu = t.prioriteit === 'nu';
  return {
    titel: `${PRIORITEIT_LABEL[t.prioriteit]}: ${t.titel}`,
    tekst: `${t.bordNaam} · ${DAGNAMEN[weekdag(t.datum)]} ${kortDatumLabel(t.datum)}${t.tijd ? ` om ${t.tijd}` : ''}`,
    prioriteit: nu ? 5 : 4,
    tags: [nu ? 'rotating_light' : 'warning'],
    link: `${appUrl.replace(/\/+$/, '')}/vandaag?datum=${t.datum}`,
  };
}
```

Voeg in `src/lib/domein/validatie.ts` direct na `instellingenSchema` toe:
```ts
export const ntfyOnderwerpSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{0,64}$/, 'Onderwerp: maximaal 64 tekens, alleen letters, cijfers, - en _')
  .transform((v) => v || null);
```

- [ ] **Step 6: ntfy-client**

`src/lib/meldingen/ntfy.ts`:
```ts
import type { NtfyBericht } from '../domein/meldingen';
import { Fout } from '../fouten';

export class NtfyNietIngesteld extends Fout {
  constructor() {
    super('Meldingen zijn niet ingesteld: vul NTFY_URL in .env en een onderwerp bij Meldingen.');
  }
}

export class NtfyMislukt extends Fout {
  constructor() {
    super('De melding kon niet verstuurd worden. Controleer NTFY_URL, het token en het onderwerp.');
  }
}

const TIMEOUT_MS = 5000;

/** De ntfy-server uit .env, zonder slash aan het eind; null als die ontbreekt. */
export function ntfyServer(): string | null {
  return process.env.NTFY_URL?.trim().replace(/\/+$/, '') || null;
}

/** Publiceert via ntfy's JSON-API (POST naar de server-root), zodat titel en tekst UTF-8 mogen bevatten. */
export async function stuurNtfy(onderwerp: string, b: NtfyBericht, haal: typeof fetch = fetch): Promise<void> {
  const server = ntfyServer();
  if (!server) throw new NtfyNietIngesteld();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.NTFY_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  let r: Response;
  try {
    r = await haal(server, {
      method: 'POST',
      headers,
      body: JSON.stringify({ topic: onderwerp, title: b.titel, message: b.tekst, priority: b.prioriteit, tags: b.tags, click: b.link }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new NtfyMislukt();
  }
  if (!r.ok) throw new NtfyMislukt();
}
```

- [ ] **Step 7: Dienst**

`src/lib/diensten/meldingen.ts`:
```ts
import type { Context } from '../context';
import { db } from '../db/client';
import type { Datum } from '../domein/datums';
import { isUrgentVerhoogd, urgentBericht } from '../domein/meldingen';
import type { Prioriteit } from '../domein/taak';
import { ntfyOnderwerpSchema } from '../domein/validatie';
import { NtfyNietIngesteld, ntfyServer, stuurNtfy } from '../meldingen/ntfy';
import { vereisBeheerder } from './rechten';

export type UrgenteTaak = { titel: string; prioriteit: Prioriteit; bordId: string; datum: Datum; tijd: string | null };

const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export async function haalNtfyOnderwerp(): Promise<string | null> {
  const [i] = await db()<{ ntfyOnderwerp: string | null }[]>`select ntfy_onderwerp from instellingen`;
  return i.ntfyOnderwerp;
}

export async function wijzigNtfyOnderwerp(ctx: Context, onderwerp: string): Promise<void> {
  vereisBeheerder(ctx);
  const v = ntfyOnderwerpSchema.parse(onderwerp);
  await db()`update instellingen set ntfy_onderwerp = ${v}`;
}

/** Pusht naar de beheerder als een medewerker een taak met zsm/nu maakt of de prioriteit daarnaar verhoogt. Gooit nooit: een storing wordt gelogd. */
export async function meldUrgenteTaak(ctx: Context, oud: Prioriteit | null, t: UrgenteTaak, haal: typeof fetch = fetch): Promise<void> {
  if (ctx.rol === 'beheerder' || !isUrgentVerhoogd(oud, t.prioriteit)) return; // de beheerder hoeft zichzelf niet te melden
  try {
    const onderwerp = await haalNtfyOnderwerp();
    if (!onderwerp || !ntfyServer()) return;
    const [bord] = await db()<{ naam: string }[]>`select naam from borden where id = ${t.bordId}`;
    await stuurNtfy(onderwerp, urgentBericht({ ...t, bordNaam: bord?.naam ?? 'Takenbord' }, appUrl()), haal);
  } catch (e) {
    console.error('[ntfy] melding versturen mislukt', e);
  }
}

export async function stuurTestmelding(ctx: Context, haal: typeof fetch = fetch): Promise<void> {
  vereisBeheerder(ctx);
  const onderwerp = await haalNtfyOnderwerp();
  if (!onderwerp) throw new NtfyNietIngesteld();
  await stuurNtfy(
    onderwerp,
    { titel: 'Testmelding', tekst: 'Meldingen van het takenbord werken.', prioriteit: 4, tags: ['white_check_mark'], link: `${appUrl()}/vandaag` },
    haal,
  );
}
```

- [ ] **Step 8: Melden na aanmaken en wijzigen**

In `src/lib/diensten/taken.ts`:
- Import toevoegen: `import { meldUrgenteTaak } from './meldingen';`
- **`maakTaak`:** laat de transactie ongewijzigd, maar meld pas na de commit:
```ts
export async function maakTaak(ctx: Context, invoer: NieuweTaakInvoer, vandaag: Datum = vandaagInAmsterdam()): Promise<{ id: string }> {
  const v = nieuweTaakSchema.parse(invoer);
  const resultaat = await transactie(async (tx) => {
    // ... de bestaande inhoud van de transactie blijft precies zoals hij is ...
  });
  await meldUrgenteTaak(ctx, null, v);
  return resultaat;
}
```
  Concreet: verander `return transactie(async (tx) => {` in `const resultaat = await transactie(async (tx) => {`. Zet na de sluitende `});` de twee regels `await meldUrgenteTaak(ctx, null, v);` en `return resultaat;`.
- **`wijzigTaak`:** laat de transactie de vorige prioriteit en het bord teruggeven, en meld daarna:
  - verander `await transactie(async (tx) => {` in `const vorig = await transactie(async (tx) => {`;
  - zet als laatste regel binnen de transactie (na `await meldWijziging(tx, oud.bordId);`) `return { prioriteit: oud.prioriteit, bordId: oud.bordId };`;
  - zet na de sluitende `});`: `await meldUrgenteTaak(ctx, vorig.prioriteit, { ...v, bordId: vorig.bordId });`

- [ ] **Step 9: Draai de tests en zie ze slagen**

Run: `npx vitest run --project unit tests/unit/meldingen.test.ts tests/unit/ntfy.test.ts`
Expected: PASS

Run (met de Docker-PATH): `npx vitest run --project integratie tests/integration/meldingen.test.ts`
Expected: PASS (8/8)

Run: `npm test`, `npm run test:integratie`, `npm run typecheck`
Expected: alles groen, en de testuitvoer is schoon (de `console.error` in de faaltest wordt onderschept).

- [ ] **Step 10: Commit**

```bash
git add migrations/003_meldingen.sql src/lib/domein/meldingen.ts src/lib/domein/validatie.ts src/lib/meldingen/ntfy.ts src/lib/diensten/meldingen.ts src/lib/diensten/taken.ts tests/integration/helpers.ts tests/unit/meldingen.test.ts tests/unit/ntfy.test.ts tests/integration/meldingen.test.ts
git commit -m "feat: ntfy-pushmelding bij taken met Zo snel mogelijk of Nu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Meldingen in Instellingen, documentatie en spec

**Files:**
- Modify: `src/app/(app)/beheer/acties.ts` (wijzigMeldingenActie, stuurTestmeldingActie)
- Create: `src/components/beheer/testmelding-knop.tsx`
- Modify: `src/app/(app)/beheer/instellingen/page.tsx` (paneel "Meldingen")
- Modify: `playwright.config.ts` (`NTFY_URL: ''`)
- Modify: `.env.example`, `README.md`, `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md`
- Test: `tests/e2e/meldingen.spec.ts` (nieuw)

**Interfaces:**
- Consumes:
  - uit Task 4: `haalNtfyOnderwerp`, `wijzigNtfyOnderwerp`, `stuurTestmelding` (`src/lib/diensten/meldingen.ts`), `ntfyServer` (`src/lib/meldingen/ntfy.ts`)
  - `ActieFormulier` (`src/components/actie-formulier.tsx`)
  - `Invoer`, `Knop`, `Melding`, `Paneel`, `Veld` (`src/components/ui.tsx`)
- Produces:
  - `wijzigMeldingenActie(f: FormData): Promise<ActieResultaat>`, die het veld `ntfyOnderwerp` leest
  - `stuurTestmeldingActie(): Promise<ActieResultaat>`
  - `TestmeldingKnop()`
  - een paneel met `aria-label` "Meldingen" (via `Paneel titel="Meldingen"`)

- [ ] **Step 1: Schrijf de falende e2e-test**

Zet in `playwright.config.ts` in `webServer.env` ook `NTFY_URL: ''`:
```ts
    env: { DATABASE_URL: E2E_DATABASE_URL, APP_URL: `http://localhost:${POORT}`, GOOGLE_MAPS_API_KEY: '', NTFY_URL: '' },
```

`tests/e2e/meldingen.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { BEHEERDER } from './gegevens';
import { inloggen } from './helpers';

test('beheerder stelt het meldingsonderwerp in; zonder server zegt de testmelding dat', async ({ page }) => {
  await inloggen(page, BEHEERDER.gebruikersnaam, BEHEERDER.wachtwoord);
  await page.goto('/beheer/instellingen');
  const paneel = page.getByRole('region', { name: 'Meldingen' });
  await expect(paneel.getByText('NTFY_URL is nog niet ingesteld')).toBeVisible();

  await paneel.getByLabel('ntfy-onderwerp').fill('garage-max-e2e');
  await paneel.getByRole('button', { name: 'Opslaan' }).click();
  await expect(paneel.getByText('Opgeslagen')).toBeVisible();

  await paneel.getByRole('button', { name: 'Stuur testmelding' }).click();
  await expect(paneel.getByText('Meldingen zijn niet ingesteld')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('region', { name: 'Meldingen' }).getByLabel('ntfy-onderwerp')).toHaveValue('garage-max-e2e');
});
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npx playwright test tests/e2e/meldingen.spec.ts`
Expected: FAIL, want er is geen paneel "Meldingen".

- [ ] **Step 3: Server actions**

Voeg in `src/app/(app)/beheer/acties.ts` toe aan de imports:
```ts
import { stuurTestmelding, wijzigNtfyOnderwerp } from '@/lib/diensten/meldingen';
```
en onderaan:
```ts
export async function wijzigMeldingenActie(f: FormData): Promise<ActieResultaat> {
  return voerUit(async () => {
    await wijzigNtfyOnderwerp(await ctx(), tekst(f, 'ntfyOnderwerp'));
    return null;
  });
}

export async function stuurTestmeldingActie(): Promise<ActieResultaat> {
  return voerUit(async () => {
    await stuurTestmelding(await ctx());
    return null;
  });
}
```

- [ ] **Step 4: Knop en paneel**

`src/components/beheer/testmelding-knop.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { stuurTestmeldingActie } from '@/app/(app)/beheer/acties';
import { Knop, Melding } from '@/components/ui';

export function TestmeldingKnop() {
  const [uitkomst, setUitkomst] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [bezig, start] = useTransition();

  function versturen() {
    setUitkomst(null);
    start(async () => {
      const r = await stuurTestmeldingActie();
      setUitkomst(r.ok ? { ok: true, tekst: 'Testmelding verstuurd. Kijk op je telefoon.' } : { ok: false, tekst: r.fout });
    });
  }

  return (
    <div className="space-y-2">
      <Knop variant="secundair" onClick={versturen} disabled={bezig}>{bezig ? 'Versturen…' : 'Stuur testmelding'}</Knop>
      {uitkomst && <Melding soort={uitkomst.ok ? 'info' : 'fout'}>{uitkomst.tekst}</Melding>}
    </div>
  );
}
```

In `src/app/(app)/beheer/instellingen/page.tsx`:
- Imports: voeg `wijzigMeldingenActie` toe aan de import uit `'../acties'`. Voeg verder toe:
```tsx
import { TestmeldingKnop } from '@/components/beheer/testmelding-knop';
import { haalNtfyOnderwerp } from '@/lib/diensten/meldingen';
import { ntfyServer } from '@/lib/meldingen/ntfy';
```
- Gegevens: vervang `const [instellingen, locaties] = await Promise.all([haalInstellingen(), lijstLocaties()]);` door:
```tsx
  const [instellingen, locaties, onderwerp] = await Promise.all([haalInstellingen(), lijstLocaties(), haalNtfyOnderwerp()]);
  const server = ntfyServer();
```
- Zet tussen het paneel "Garage" en het paneel "Wachtwoord wijzigen":
```tsx
      <Paneel titel="Meldingen" className="max-w-md">
        <div className="space-y-4">
          <p className="text-xs text-tekst-zacht">
            {server
              ? `Pushmeldingen gaan via ${server} naar de ntfy-app op je telefoon.`
              : 'NTFY_URL is nog niet ingesteld in .env, dus er worden geen meldingen verstuurd.'}
          </p>
          <ActieFormulier actie={wijzigMeldingenActie} knop="Opslaan" knopVariant="secundair" wisNaSucces={false}>
            <Veld label="ntfy-onderwerp" hint="Abonneer je in de ntfy-app op dit onderwerp. Alleen letters, cijfers, - en _. Kies iets dat niet te raden is.">
              <Invoer name="ntfyOnderwerp" defaultValue={onderwerp ?? ''} maxLength={64} pattern="[A-Za-z0-9_\-]*" />
            </Veld>
          </ActieFormulier>
          <TestmeldingKnop />
        </div>
      </Paneel>
```

- [ ] **Step 5: Configuratie en documentatie**

Voeg toe aan `.env.example`:
```
NTFY_URL=
NTFY_TOKEN=
```

In `README.md`, sectie "Google (adressen zoeken)":
- Vervang de kop door `## Google (adressen zoeken en route plannen)`.
- Vervang punt 2 door: `2. Zet **Places API (New)** en **Routes API** aan. Places zoekt adressen, Routes berekent bij "Plan route" de snelste volgorde.`

Voeg daarna een nieuwe sectie toe (vóór "## Testen"):
```markdown
## Meldingen (ntfy)

Bij een taak met "Zo snel mogelijk" of "Nu" van een medewerker krijgt de beheerder een pushmelding via [ntfy](https://ntfy.sh). Taken die de beheerder zelf aanmaakt, geven geen melding.

1. Installeer de ntfy-app op je telefoon.
2. Zet in `.env` de server en, als je server toegangsbeheer heeft, een token:
   ```
   NTFY_URL=https://ntfy.sh
   NTFY_TOKEN=
   ```
3. Vul in **Beheer → Instellingen → Meldingen** een onderwerp in, abonneer je in de app op hetzelfde onderwerp en klik op **Stuur testmelding**.

Let op: op het openbare `ntfy.sh` kan iedereen die het onderwerp kent meelezen. Kies dus een lang, niet te raden onderwerp. Bij de eigen server (fase 4) komt ntfy met toegangsbeheer en een token.
```

- [ ] **Step 6: Spec bijwerken**

In `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md`:
- **§3, de regel "Configuratie":** vervang `via \`.env\`: database-wachtwoorden, Google-sleutel, ntfy-token en de publieke URL.` door `via \`.env\`: database-wachtwoorden, Google-sleutel, ntfy-server en -token (\`NTFY_URL\`, \`NTFY_TOKEN\`) en de publieke URL.`
- **§7.6:** vervang de alinea onder de kop door:
```markdown
Maakt een **medewerker** een taak met prioriteit **zsm** of **nu**, of verhoogt hij de prioriteit daarnaar (ook zsm → nu), dan stuurt de `app` na het opslaan een ntfy-bericht naar het ingestelde onderwerp (Beheer → Instellingen → Meldingen). Het bericht bevat de prioriteit, de titel, het bord, de dag en een link naar "Vandaag" op die dag. Bewuste keuzes: acties van de beheerder zelf geven geen melding, en het wijzigen van een hele reeks ook niet. Mislukt de melding, dan wordt dat alleen gelogd en blijft de taak gewoon opgeslagen. In Instellingen staat een knop "Stuur testmelding".
```
- **§8.3, stap 2:** vervang `` `POST /api/taken/:id/route` met het startpunt. `` door `De server action \`planRouteActie\` krijgt het startpunt (bewuste keuze: een server action zoals de rest van de app, in plaats van een API-route).`. De rest van stap 2 blijft staan.
- **§8.3:** voeg na stap 5 toe:
```markdown
6. **Geen garage-adres ingesteld:** de volgorde wordt niet berekend. De melding "Er is nog geen garage-adres ingesteld (Beheer → Instellingen). De volgorde is niet berekend." verschijnt, en Maps opent met de stops in de ingevoerde volgorde, eindigend bij de laatste stop.
```
- **§9, de regel "Instellingen":** vervang `eigen wachtwoord wijzigen, testmelding versturen.` door `eigen wachtwoord wijzigen, ntfy-onderwerp instellen en een testmelding versturen.`

- [ ] **Step 7: Draai de tests en zie ze slagen**

Run (dev-Postgres draait; geen andere `next dev` in deze map): `npm run test:e2e`
Expected: alle e2e-tests PASS, ook `meldingen.spec.ts` en `route.spec.ts`.

Run: `npm run typecheck`, `npm test`, `npm run test:integratie` (met de Docker-PATH) en `npx next build`
Expected: alles groen.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/beheer/acties.ts" src/components/beheer/testmelding-knop.tsx "src/app/(app)/beheer/instellingen/page.tsx" playwright.config.ts .env.example README.md docs/superpowers/specs/2026-10-22-garage-takenbord-design.md tests/e2e/meldingen.spec.ts
git commit -m "feat: meldingen instellen en testmelding in Instellingen; README en spec" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
