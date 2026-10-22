# Garage Takenbord: fase 2 (locaties) implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Taken krijgen 0 tot 9 locaties (stops). Die kies je uit opgeslagen locaties of zoek je via Google. Bij elke stop staat een knop "Navigeer" die Google Maps opent. Opgeslagen locaties zijn te beheren, en het garage-adres krijgt coördinaten.

**Architecture:**
- Twee nieuwe tabellen: `locaties` (opgeslagen adressen met gebruiksteller) en `taak_stops` (een kopie per taak, maximaal 9). `herhalingen` krijgt een `stops`-jsonb als sjabloon voor de exemplaren.
- De view `taken_weergave` levert de stops als JSON-array.
- Google Places API (New) wordt alleen op de server aangeroepen, via een kleine client met injecteerbare `fetch`, die server actions beschikbaar maken. Zonder sleutel geeft hij een nette melding.
- De UI krijgt een herbruikbare `LocatieZoeker` (opgeslagen plus Google), een `StopsEditor` in het taakvenster, een pin op de kaart, een pagina Locaties en een garage-adreskiezer in Instellingen.

**Tech Stack:** zoals fase 1: Next.js 16, React 19, TypeScript 5, Tailwind 4, postgres.js 3, Zod 4, Vitest 4 + Testcontainers, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md` §8.1–8.2 (en §6 datamodel), met het addendum `docs/superpowers/plans/2026-10-22-addendum-een-bedrijf.md` (één bedrijf, dus geen `bedrijf_id`). "Plan route" (§8.3) en ntfy horen bij fase 3.

## Global Constraints

- Er is één bedrijf. Geen `bedrijf_id`, geen RLS. Rechten worden in de diensten afgedwongen. Iedere ingelogde gebruiker mag locaties aanmaken, hernoemen en verwijderen (spec §4: "Opgeslagen locaties beheren ✅ medewerker").
- Een taak heeft **0 tot 9 stops** (`MAX_STOPS = 9`). Dit wordt in de UI én op de server gecontroleerd, met de melding `Maximaal 9 locaties`.
- Stops worden naar de taak **gekopieerd** (naam, adres, lat, lng, google_place_id, locatie_id). Een later gewijzigde of verwijderde opgeslagen locatie verandert bestaande taken niet.
- "Vaak gebruikt" toont de **5** opgeslagen locaties met de hoogste `gebruik_teller` (> 0).
- Bij een nieuw Google-adres staat het vinkje "Bewaar als vaste locatie" standaard **aan**.
- Navigatielink voor één stop: `https://www.google.com/maps/dir/?api=1&destination=<lat>%2C<lng>&travelmode=driving`.
- Google wordt **alleen op de server** aangeroepen, met de omgevingsvariabele `GOOGLE_MAPS_API_KEY`. Is die leeg of ontbreekt hij, of faalt Google, dan geeft dat de melding `Adres zoeken tijdelijk niet beschikbaar`. Zoeken in opgeslagen locaties blijft dan werken.
- Tests praten **nooit** met de echte Google: unit-tests gebruiken een nep-`fetch`, e2e draait met een lege sleutel.
- Alle UI-teksten zijn Nederlands. Donker thema met de bestaande kleurtokens en UI-componenten (`src/components/ui.tsx`).
- Elke commit-boodschap eindigt met `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Werkomgeving: Windows en Git Bash. Voor Docker en Testcontainers zet je eerst `export PATH="/c/Users/Max/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"`. Installeer pakketten (als dat al nodig is) met `npx npm@11 install`. Voor `npm run test:e2e` mag er geen andere `next dev` in dezelfde map draaien.

---

## Bestandsstructuur

```
migrations/002_locaties.sql             locaties, taak_stops, herhalingen.stops, garage-coördinaten, view met stops
src/lib/domein/validatie.ts             (wijzigen) locatieSchema, stopSchema, stopsSchema, MAX_STOPS, instellingen lat/lng
src/lib/domein/navigatie.ts             navigatieUrl(), stopsSamenvatting()
src/lib/google/plaatsen.ts              zoekPlaatsen(), plaatsDetails(), GoogleNietBeschikbaar
src/lib/diensten/locaties.ts            opgeslagen locaties (lijst, vaak gebruikt, bewaren, hernoemen, verwijderen)
src/lib/diensten/stops.ts               stops van een taak lezen/schrijven, nieuwe locaties bewaren, teller ophogen
src/lib/diensten/taken.ts               (wijzigen) stops bij aanmaken/wijzigen, historie
src/lib/diensten/herhalingen.ts         (wijzigen) stops in reeks-sjabloon en exemplaren
src/lib/diensten/instellingen.ts        (wijzigen) garage_lat/garage_lng
src/app/(app)/locaties/acties.ts        server actions: Google zoeken/details, locaties beheren
src/app/(app)/locaties/page.tsx         pagina Locaties
src/components/locaties/locatie-zoeker.tsx   zoekveld: opgeslagen + Google
src/components/locaties/nieuwe-locatie.tsx   locatie toevoegen op de Locaties-pagina
src/components/locaties/verwijder-locatie.tsx verwijderknop
src/components/bord/stops-editor.tsx    stops kiezen in het taakvenster
src/components/bord/taak-dialoog.tsx    (wijzigen) stops + navigatieblok
src/components/bord/taak-kaart.tsx      (wijzigen) pin met samenvatting
src/components/beheer/garage-adres-kiezer.tsx  garage-adres via zoeker
src/components/iconen.tsx               (wijzigen) PinIcoon
src/components/schil/top-balk.tsx       (wijzigen) link "Locaties"
```

---

### Task 1: Database en domein voor locaties

**Files:**
- Create: `migrations/002_locaties.sql`, `src/lib/domein/navigatie.ts`
- Modify: `src/lib/domein/validatie.ts`, `tests/integration/helpers.ts`, `tests/unit/validatie.test.ts`
- Test: `tests/unit/navigatie.test.ts`, `tests/integration/schema.test.ts` (uitbreiden)

**Interfaces:**
- Produces (`validatie.ts`):
  - `MAX_STOPS = 9`
  - `locatieSchema` (`naam`, `adres`, `lat`, `lng`, `googlePlaceId: string | null`)
  - `stopSchema` (= locatieSchema + `locatieId: string | null`, `bewaar: boolean`)
  - `stopsSchema` (array, max 9, standaard `[]`)
  - Typen: `LocatieInvoer = z.input<typeof locatieSchema>`, `StopInvoer = z.output<typeof stopSchema>`
  - `taakVeldenSchema` krijgt veld `stops: stopsSchema`. Daardoor hebben ook `nieuweTaakSchema` en `reeksSchema` het.
  - `instellingenSchema` krijgt `garageLat`/`garageLng` (`number | null`). Is er geen adres, dan worden beide `null`.
- Produces (`navigatie.ts`): `type Punt = { lat: number; lng: number }`, `navigatieUrl(p: Punt): string`, `stopsSamenvatting(stops: { naam: string }[]): string | null`
- Produces (database): tabellen `locaties`, `taak_stops`, kolom `herhalingen.stops jsonb`, kolommen `instellingen.garage_lat/garage_lng`, en view-kolom `taken_weergave.stops` (JSON-array van `{naam, adres, lat, lng, googlePlaceId, locatieId}` op volgorde)

- [ ] **Step 1: Falende tests schrijven**

`tests/unit/navigatie.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { navigatieUrl, stopsSamenvatting } from '@/lib/domein/navigatie';

describe('navigatie', () => {
  it('bouwt een Google Maps-link naar één bestemming', () => {
    expect(navigatieUrl({ lat: 51.589, lng: 4.776 }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=51.589%2C4.776&travelmode=driving');
  });

  it('vat stops samen voor op de kaart', () => {
    expect(stopsSamenvatting([])).toBeNull();
    expect(stopsSamenvatting([{ naam: 'Banden-Plus' }])).toBe('Banden-Plus');
    expect(stopsSamenvatting([{ naam: 'A' }, { naam: 'B' }, { naam: 'C' }])).toBe('3 stops');
  });
});
```

Voeg aan `tests/unit/validatie.test.ts` toe (onderaan, met `stopsSchema`, `MAX_STOPS` en `instellingenSchema` in de import):
```ts
describe('stops en locaties', () => {
  const stop = { naam: 'Banden-Plus', adres: 'Industrieweg 12, Breda', lat: 51.589, lng: 4.776 };

  it('vult standaardwaarden aan en staat 0 tot 9 stops toe', () => {
    expect(stopsSchema.parse(undefined)).toEqual([]);
    expect(stopsSchema.parse([stop])).toEqual([{ ...stop, googlePlaceId: null, locatieId: null, bewaar: false }]);
    expect(stopsSchema.safeParse(Array(MAX_STOPS).fill(stop)).success).toBe(true);
  });

  it('weigert meer dan 9 stops en ongeldige coördinaten', () => {
    const r = stopsSchema.safeParse(Array(MAX_STOPS + 1).fill(stop));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Maximaal 9 locaties');
    expect(stopsSchema.safeParse([{ ...stop, lat: 91 }]).success).toBe(false);
    expect(stopsSchema.safeParse([{ ...stop, naam: ' ' }]).success).toBe(false);
  });

  it('nieuwe taak zonder stops krijgt een lege lijst', () => {
    const v = nieuweTaakSchema.parse({ bordId: '7f1c0c8e-2f3a-4b8e-9f00-3d2c1b0a9e8f', titel: 'X', datum: '2026-10-22', tijd: null, prioriteit: 'laag', herhaling: null });
    expect(v.stops).toEqual([]);
  });

  it('instellingen: coördinaten alleen samen met een adres', () => {
    expect(instellingenSchema.parse({ naam: 'G', garageAdres: 'Dorpsstraat 1', garageLat: 51.5, garageLng: 4.7, werkdagen: [1] }))
      .toMatchObject({ garageAdres: 'Dorpsstraat 1', garageLat: 51.5, garageLng: 4.7 });
    expect(instellingenSchema.parse({ naam: 'G', garageAdres: '', garageLat: 51.5, garageLng: 4.7, werkdagen: [1] }))
      .toMatchObject({ garageAdres: null, garageLat: null, garageLng: null });
  });
});
```

Voeg aan `tests/integration/schema.test.ts` toe (onderaan, binnen het bestaande bestand; `db` en `leegDatabase` worden daar al geïmporteerd):
```ts
describe('locaties-schema', () => {
  it('taken_weergave levert stops op volgorde en een lege lijst zonder stops', async () => {
    await leegDatabase();
    const [b] = await db()<{ id: string }[]>`insert into borden (naam) values ('B') returning id`;
    const [t] = await db()<{ id: string }[]>`insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum)
      values (${b.id}, 'Met stops', '2026-10-22', 'laag', '2026-10-22') returning id`;
    await db()`insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum) values (${b.id}, 'Zonder', '2026-10-22', 'laag', '2026-10-22')`;
    await db()`insert into taak_stops (taak_id, volgorde, naam, adres, lat, lng) values
      (${t.id}, 2, 'Tweede', 'Adres 2', 52.0, 5.0), (${t.id}, 1, 'Eerste', 'Adres 1', 51.5, 4.5)`;
    const rijen = await db()<{ titel: string; stops: { naam: string; lat: number; locatieId: string | null }[] }[]>`
      select titel, stops from taken_weergave order by titel`;
    expect(rijen[0].stops.map((s) => s.naam)).toEqual(['Eerste', 'Tweede']);
    expect(rijen[0].stops[0]).toMatchObject({ lat: 51.5, locatieId: null });
    expect(rijen[1].stops).toEqual([]);
  });

  it('bewaakt volgorde 1–9 en unieke google_place_id', async () => {
    await leegDatabase();
    const [b] = await db()<{ id: string }[]>`insert into borden (naam) values ('B') returning id`;
    const [t] = await db()<{ id: string }[]>`insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum)
      values (${b.id}, 'T', '2026-10-22', 'laag', '2026-10-22') returning id`;
    await expect(db()`insert into taak_stops (taak_id, volgorde, naam, adres, lat, lng) values (${t.id}, 10, 'X', 'Y', 1, 1)`)
      .rejects.toThrow(/taak_stops_volgorde_check/);
    await db()`insert into locaties (naam, adres, lat, lng, google_place_id) values ('A', 'a', 1, 1, 'plaats-1')`;
    await expect(db()`insert into locaties (naam, adres, lat, lng, google_place_id) values ('B', 'b', 2, 2, 'plaats-1')`)
      .rejects.toThrow(/locaties_google_place_id_key/);
  });
});
```

- [ ] **Step 2: Tests draaien en zien falen**

Run: `npm test` en `npm run test:integratie`.
Expected: FAIL. `navigatie` en de nieuwe schema-exports bestaan nog niet, en de tabel `taak_stops` evenmin.

- [ ] **Step 3: Migratie schrijven**

`migrations/002_locaties.sql`:
```sql
alter table instellingen add column garage_lat double precision, add column garage_lng double precision;

create table locaties (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  adres text not null,
  lat double precision not null,
  lng double precision not null,
  google_place_id text unique,
  gebruik_teller int not null default 0,
  aangemaakt_op timestamptz not null default now()
);

create table taak_stops (
  id uuid primary key default gen_random_uuid(),
  taak_id uuid not null references taken(id) on delete cascade,
  volgorde int not null check (volgorde between 1 and 9),
  naam text not null,
  adres text not null,
  lat double precision not null,
  lng double precision not null,
  google_place_id text,
  locatie_id uuid references locaties(id) on delete set null,
  unique (taak_id, volgorde)
);

alter table herhalingen add column stops jsonb not null default '[]';

create or replace view taken_weergave as
select
  t.id, t.bord_id, t.titel, t.omschrijving, t.datum,
  to_char(t.tijd, 'HH24:MI') as tijd,
  t.prioriteit, t.status, t.oorspronkelijke_datum, t.uitgesteld_van, t.gemist,
  t.herhaling_id, t.afwijkend, t.versie, t.aangemaakt_op, t.gewijzigd_op, t.klaar_op,
  ag.naam as aangemaakt_door_naam,
  gg.naam as gewijzigd_door_naam,
  h.type as herhaling_type,
  h.weekdagen as herhaling_weekdagen,
  h.interval_weken as herhaling_interval,
  bo.naam as bord_naam,
  bo.gearchiveerd as bord_gearchiveerd,
  coalesce((
    select json_agg(json_build_object(
      'naam', s.naam, 'adres', s.adres, 'lat', s.lat, 'lng', s.lng,
      'googlePlaceId', s.google_place_id, 'locatieId', s.locatie_id) order by s.volgorde)
    from taak_stops s where s.taak_id = t.id
  ), '[]'::json) as stops
from taken t
join borden bo on bo.id = t.bord_id
left join gebruikers ag on ag.id = t.aangemaakt_door
left join gebruikers gg on gg.id = t.gewijzigd_door
left join herhalingen h on h.id = t.herhaling_id;
```
(`create or replace view` mag alleen kolommen achteraan toevoegen. `stops` staat daarom als laatste kolom.)

- [ ] **Step 4: Domeincode schrijven**

`src/lib/domein/navigatie.ts`:
```ts
export type Punt = { lat: number; lng: number };

export function navigatieUrl(p: Punt): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.lat},${p.lng}`)}&travelmode=driving`;
}

export function stopsSamenvatting(stops: { naam: string }[]): string | null {
  if (stops.length === 0) return null;
  if (stops.length === 1) return stops[0].naam;
  return `${stops.length} stops`;
}
```

Wijzig `src/lib/domein/validatie.ts`. Zet direct onder `export const statusSchema = …` dit blok:
```ts
export const MAX_STOPS = 9;

export const locatieSchema = z.object({
  naam: z.string().trim().min(1, 'Naam van de locatie is verplicht').max(100),
  adres: z.string().trim().min(1, 'Adres is verplicht').max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  googlePlaceId: z.string().max(300).nullable().default(null),
});

export const stopSchema = locatieSchema.extend({
  locatieId: z.string().uuid().nullable().default(null),
  bewaar: z.boolean().default(false),
});

export const stopsSchema = z.array(stopSchema).max(MAX_STOPS, `Maximaal ${MAX_STOPS} locaties`).default([]);
```
Voeg in `taakVeldenSchema` na `prioriteit: prioriteitSchema,` het veld `stops: stopsSchema,` toe.

Vervang `instellingenSchema` door:
```ts
export const instellingenSchema = z
  .object({
    naam: z.string().trim().min(1, 'Naam is verplicht').max(100),
    garageAdres: z.string().trim().max(300).nullable().optional().transform((v) => v || null),
    garageLat: z.number().min(-90).max(90).nullable().optional().transform((v) => v ?? null),
    garageLng: z.number().min(-180).max(180).nullable().optional().transform((v) => v ?? null),
    werkdagen: z.array(werkdag).min(1, 'Kies minstens één werkdag').transform((w) => [...new Set(w)].sort((a, b) => a - b)),
  })
  .transform((i) => (i.garageAdres ? i : { ...i, garageLat: null, garageLng: null }));
```
En voeg onderaan toe:
```ts
export type LocatieInvoer = z.input<typeof locatieSchema>;
export type StopInvoer = z.output<typeof stopSchema>;
```

Wijzig in `tests/integration/helpers.ts` de functie `leegDatabase` naar:
```ts
export async function leegDatabase(): Promise<void> {
  await db()`truncate taak_historie, taak_stops, taken, herhalingen, borden, sessies, gebruikers, locaties restart identity cascade`;
  await db()`update instellingen set naam = 'Garage', garage_adres = null, garage_lat = null, garage_lng = null, werkdagen = '{1,2,3,4,5}'`;
}
```

- [ ] **Step 5: Tests draaien en zien slagen**

Run: `npm test && npm run test:integratie && npm run typecheck`
Expected: alles PASS. De bestaande tests blijven groen, omdat `stops` standaard `[]` is.

De dev-database migreren: `npm run db:migreer`. Expected: `Uitgevoerd: 002_locaties.sql`.

- [ ] **Step 6: Commit**

```bash
git add migrations src/lib/domein tests
git commit -m "feat: databaseschema en domein voor locaties en stops" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Google Places-client (alleen server)

**Files:**
- Create: `src/lib/google/plaatsen.ts`
- Modify: `.env.example`
- Test: `tests/unit/plaatsen.test.ts`

**Interfaces:**
- Consumes: `Fout`, `Ongeldig` uit `src/lib/fouten.ts`
- Produces:
  - `class GoogleNietBeschikbaar extends Fout`, met de melding `Adres zoeken tijdelijk niet beschikbaar`
  - `type Suggestie = { placeId: string; hoofdtekst: string; subtekst: string }`
  - `type Plaats = { placeId: string; naam: string; adres: string; lat: number; lng: number }`
  - `zoekPlaatsen(invoer: string, sessie: string, haal?: typeof fetch): Promise<Suggestie[]>` geeft maximaal 5 suggesties, en `[]` bij minder dan 3 tekens (zonder Google aan te roepen)
  - `plaatsDetails(placeId: string, sessie: string, haal?: typeof fetch): Promise<Plaats>`

Google-endpoints:
- Autocomplete: `POST https://places.googleapis.com/v1/places:autocomplete`, met de headers `Content-Type: application/json` en `X-Goog-Api-Key`, en de body `{ input, sessionToken, languageCode: 'nl', includedRegionCodes: ['nl', 'be'] }`.
- Details: `GET https://places.googleapis.com/v1/places/<placeId>?sessionToken=<sessie>&languageCode=nl`, met de headers `X-Goog-Api-Key` en `X-Goog-FieldMask: id,displayName,formattedAddress,location`.

- [ ] **Step 1: Falende test schrijven**

`tests/unit/plaatsen.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleNietBeschikbaar, plaatsDetails, zoekPlaatsen } from '@/lib/google/plaatsen';

const antwoord = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe('Google Places-client', () => {
  beforeEach(() => { process.env.GOOGLE_MAPS_API_KEY = 'test-sleutel'; });
  afterEach(() => { delete process.env.GOOGLE_MAPS_API_KEY; });

  it('zonder sleutel: niet beschikbaar', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    await expect(zoekPlaatsen('Dorpsstraat', 's1', antwoord({}))).rejects.toThrow('Adres zoeken tijdelijk niet beschikbaar');
    process.env.GOOGLE_MAPS_API_KEY = '';
    await expect(zoekPlaatsen('Dorpsstraat', 's1', antwoord({}))).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
  });

  it('korte invoer roept Google niet aan', async () => {
    const haal = antwoord({});
    expect(await zoekPlaatsen(' ab ', 's1', haal)).toEqual([]);
    expect(haal).not.toHaveBeenCalled();
  });

  it('vertaalt suggesties en stuurt de juiste aanvraag', async () => {
    const haal = antwoord({
      suggestions: [
        { placePrediction: { placeId: 'p1', structuredFormat: { mainText: { text: 'Dorpsstraat 4' }, secondaryText: { text: 'Rijsbergen' } } } },
        { queryPrediction: { text: { text: 'negeer mij' } } },
        { placePrediction: { placeId: 'p2', text: { text: 'Industrieweg 12, Breda' } } },
      ],
    });
    expect(await zoekPlaatsen('Dorpsstraat', 'sessie-1', haal)).toEqual([
      { placeId: 'p1', hoofdtekst: 'Dorpsstraat 4', subtekst: 'Rijsbergen' },
      { placeId: 'p2', hoofdtekst: 'Industrieweg 12, Breda', subtekst: '' },
    ]);
    const [url, init] = haal.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-sleutel');
    expect(JSON.parse(String(init.body))).toEqual({
      input: 'Dorpsstraat', sessionToken: 'sessie-1', languageCode: 'nl', includedRegionCodes: ['nl', 'be'],
    });
  });

  it('foutstatus of netwerkfout: niet beschikbaar', async () => {
    await expect(zoekPlaatsen('Dorpsstraat', 's', antwoord({}, 500))).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
    const kapot = vi.fn(async () => { throw new Error('netwerk'); }) as unknown as typeof fetch;
    await expect(zoekPlaatsen('Dorpsstraat', 's', kapot)).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
  });

  it('haalt details op met veldmasker', async () => {
    const haal = antwoord({
      id: 'p1', displayName: { text: 'Banden-Plus' }, formattedAddress: 'Industrieweg 12, 4811 Breda',
      location: { latitude: 51.589, longitude: 4.776 },
    });
    expect(await plaatsDetails('p1', 'sessie-1', haal)).toEqual({
      placeId: 'p1', naam: 'Banden-Plus', adres: 'Industrieweg 12, 4811 Breda', lat: 51.589, lng: 4.776,
    });
    const [url, init] = haal.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places/p1?sessionToken=sessie-1&languageCode=nl');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('id,displayName,formattedAddress,location');
  });

  it('weigert een vreemde placeId en onvolledige details', async () => {
    await expect(plaatsDetails('../x', 's', antwoord({}))).rejects.toThrow('Ongeldige plaats');
    await expect(plaatsDetails('p1', 's', antwoord({ id: 'p1' }))).rejects.toBeInstanceOf(GoogleNietBeschikbaar);
  });
});
```

- [ ] **Step 2: Test draaien en zien falen**

Run: `npx vitest run --project unit tests/unit/plaatsen.test.ts`
Expected: FAIL, de module bestaat nog niet.

- [ ] **Step 3: Implementatie schrijven**

`src/lib/google/plaatsen.ts`:
```ts
import { Fout, Ongeldig } from '../fouten';

export class GoogleNietBeschikbaar extends Fout {
  constructor() {
    super('Adres zoeken tijdelijk niet beschikbaar');
  }
}

export type Suggestie = { placeId: string; hoofdtekst: string; subtekst: string };
export type Plaats = { placeId: string; naam: string; adres: string; lat: number; lng: number };

const BASIS = 'https://places.googleapis.com/v1';
const TIMEOUT_MS = 5000;

function sleutel(): string {
  const k = process.env.GOOGLE_MAPS_API_KEY;
  if (!k) throw new GoogleNietBeschikbaar();
  return k;
}

async function vraag(haal: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  let r: Response;
  try {
    r = await haal(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new GoogleNietBeschikbaar();
  }
  if (!r.ok) throw new GoogleNietBeschikbaar();
  return r.json();
}

type AutocompleteAntwoord = {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      text?: { text: string };
      structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
    };
  }[];
};

export async function zoekPlaatsen(invoer: string, sessie: string, haal: typeof fetch = fetch): Promise<Suggestie[]> {
  const tekst = invoer.trim();
  if (tekst.length < 3) return [];
  const data = (await vraag(haal, `${BASIS}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': sleutel() },
    body: JSON.stringify({ input: tekst, sessionToken: sessie, languageCode: 'nl', includedRegionCodes: ['nl', 'be'] }),
  })) as AutocompleteAntwoord;
  return (data.suggestions ?? [])
    .flatMap((s) => {
      const p = s.placePrediction;
      if (!p) return [];
      return [{
        placeId: p.placeId,
        hoofdtekst: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        subtekst: p.structuredFormat?.secondaryText?.text ?? '',
      }];
    })
    .slice(0, 5);
}

type DetailsAntwoord = {
  id?: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
};

export async function plaatsDetails(placeId: string, sessie: string, haal: typeof fetch = fetch): Promise<Plaats> {
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(placeId)) throw new Ongeldig('Ongeldige plaats');
  const url = `${BASIS}/places/${placeId}?sessionToken=${encodeURIComponent(sessie)}&languageCode=nl`;
  const d = (await vraag(haal, url, {
    headers: { 'X-Goog-Api-Key': sleutel(), 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location' },
  })) as DetailsAntwoord;
  if (!d.location || !d.formattedAddress) throw new GoogleNietBeschikbaar();
  return {
    placeId: d.id ?? placeId,
    naam: d.displayName?.text ?? d.formattedAddress,
    adres: d.formattedAddress,
    lat: d.location.latitude,
    lng: d.location.longitude,
  };
}
```

Voeg aan `.env.example` een regel toe:
```
GOOGLE_MAPS_API_KEY=
```

- [ ] **Step 4: Tests draaien en zien slagen**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google tests/unit/plaatsen.test.ts .env.example
git commit -m "feat: Google Places-client aan de serverkant" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Opgeslagen locaties, stops-hulpfuncties en garage-coördinaten

**Files:**
- Create: `src/lib/diensten/locaties.ts`, `src/lib/diensten/stops.ts`
- Modify: `src/lib/diensten/instellingen.ts`, `src/app/(app)/beheer/acties.ts` (`wijzigInstellingenActie` leest lat/lng)
- Test: `tests/integration/locaties.test.ts`

**Interfaces:**
- Consumes: `locatieSchema`, `LocatieInvoer`, `StopInvoer`, `isUuid`, `instellingenSchema` (Task 1), `db`, `transactie`, `Tx`, `Context`, `NietGevonden`
- Produces (`locaties.ts`):
  - `type Locatie = { id: string; naam: string; adres: string; lat: number; lng: number; googlePlaceId: string | null; gebruikTeller: number }`
  - `lijstLocaties(): Promise<Locatie[]>`, gesorteerd op naam zonder hoofdlettergevoeligheid
  - `vaakGebruikteLocaties(aantal = 5): Promise<Locatie[]>`, alleen locaties met teller > 0, aflopend op teller en daarna op naam
  - `bewaarLocatie(tx: Tx, invoer: LocatieInvoer): Promise<string>`. Is de `googlePlaceId` al bekend, dan geeft hij het bestaande id terug en blijft de naam ongewijzigd.
  - `maakLocatie(ctx, invoer): Promise<{ id: string }>`, `hernoemLocatie(ctx, id, naam): Promise<void>`, `verwijderLocatie(ctx, id): Promise<void>`. Bij een onbekend of ongeldig id geven deze `NietGevonden('Locatie niet gevonden')`.
- Produces (`stops.ts`):
  - `type Stop = { naam: string; adres: string; lat: number; lng: number; googlePlaceId: string | null; locatieId: string | null }`
  - `bewaarNieuweLocaties(tx, stops: StopInvoer[]): Promise<Stop[]>` slaat stops met `bewaar && !locatieId` op als locatie en vult hun `locatieId` in
  - `schrijfStops(tx, taakId, stops: Stop[]): Promise<void>` vervangt de bestaande stops; volgorde begint bij 1
  - `haalStops(tx, taakId): Promise<Stop[]>`
  - `telGebruik(tx, locatieIds: (string | null)[]): Promise<void>` hoogt de teller van elke unieke niet-null id met 1 op
  - `stopsTekst(stops: { naam: string }[]): string` voegt de namen samen met `' → '`
- Produces (`instellingen.ts`): `Instellingen` krijgt `garageLat: number | null; garageLng: number | null`, en `wijzigInstellingen` slaat ze op

- [ ] **Step 1: Falende test schrijven**

`tests/integration/locaties.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Context } from '../../src/lib/context';
import { db, transactie } from '../../src/lib/db/client';
import { haalInstellingen, wijzigInstellingen } from '../../src/lib/diensten/instellingen';
import {
  hernoemLocatie, lijstLocaties, maakLocatie, vaakGebruikteLocaties, verwijderLocatie,
} from '../../src/lib/diensten/locaties';
import { bewaarNieuweLocaties, haalStops, schrijfStops, stopsTekst, telGebruik } from '../../src/lib/diensten/stops';
import { NietGevonden } from '../../src/lib/fouten';
import { leegDatabase, maakBeheerderCtx, maakBord, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;

const plek = (naam: string, extra: Record<string, unknown> = {}) =>
  ({ naam, adres: `${naam}straat 1`, lat: 51.5, lng: 4.7, googlePlaceId: null, ...extra });

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  piet = await maakMedewerkerCtx('piet');
});

describe('opgeslagen locaties', () => {
  it('maakt, sorteert, hernoemt en verwijdert locaties (ook als medewerker)', async () => {
    const { id: b } = await maakLocatie(piet, plek('banden-Plus'));
    await maakLocatie(piet, plek('Apotheek'));
    expect((await lijstLocaties()).map((l) => l.naam)).toEqual(['Apotheek', 'banden-Plus']);
    await hernoemLocatie(piet, b, 'Banden-Plus Breda');
    expect((await lijstLocaties()).find((l) => l.id === b)?.naam).toBe('Banden-Plus Breda');
    await verwijderLocatie(piet, b);
    expect((await lijstLocaties()).map((l) => l.naam)).toEqual(['Apotheek']);
    await expect(verwijderLocatie(piet, b)).rejects.toBeInstanceOf(NietGevonden);
    await expect(hernoemLocatie(piet, 'onzin', 'X')).rejects.toBeInstanceOf(NietGevonden);
  });

  it('dezelfde Google-plaats wordt niet dubbel opgeslagen', async () => {
    const a = await maakLocatie(piet, plek('Origineel', { googlePlaceId: 'g-1' }));
    const b = await maakLocatie(beheerder, plek('Andere naam', { googlePlaceId: 'g-1' }));
    expect(b.id).toBe(a.id);
    expect((await lijstLocaties()).map((l) => l.naam)).toEqual(['Origineel']);
  });

  it('vaak gebruikt: alleen gebruikte, hoogste teller eerst, maximaal 5', async () => {
    const ids: string[] = [];
    for (const n of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) ids.push((await maakLocatie(piet, plek(n))).id);
    await db()`update locaties set gebruik_teller = 1`;
    await db()`update locaties set gebruik_teller = 5 where id = ${ids[6]}`;
    await db()`update locaties set gebruik_teller = 0 where id = ${ids[0]}`;
    expect((await vaakGebruikteLocaties()).map((l) => l.naam)).toEqual(['G', 'B', 'C', 'D', 'E']);
  });
});

describe('stops-hulpfuncties', () => {
  it('bewaart nieuwe locaties, hergebruikt bestaande en schrijft stops op volgorde', async () => {
    const bestaand = (await maakLocatie(piet, plek('Bestaand'))).id;
    const bordId = await maakBord();
    const [t] = await db()<{ id: string }[]>`insert into taken (bord_id, titel, datum, prioriteit, oorspronkelijke_datum)
      values (${bordId}, 'T', '2026-10-22', 'laag', '2026-10-22') returning id`;
    const stops = await transactie(async (tx) => {
      const s = await bewaarNieuweLocaties(tx, [
        { ...plek('Nieuw', { googlePlaceId: 'g-9' }), locatieId: null, bewaar: true },
        { ...plek('Bestaand'), locatieId: bestaand, bewaar: false },
        { ...plek('Eenmalig'), locatieId: null, bewaar: false },
      ]);
      await schrijfStops(tx, t.id, s);
      await telGebruik(tx, [...s.map((x) => x.locatieId), bestaand]);
      return haalStops(tx, t.id);
    });
    expect(stops.map((s) => s.naam)).toEqual(['Nieuw', 'Bestaand', 'Eenmalig']);
    expect(stops[0].locatieId).not.toBeNull();
    expect(stops[1].locatieId).toBe(bestaand);
    expect(stops[2].locatieId).toBeNull();
    const tellers = Object.fromEntries((await lijstLocaties()).map((l) => [l.naam, l.gebruikTeller]));
    expect(tellers).toEqual({ Bestaand: 1, Nieuw: 1 });
    expect(stopsTekst(stops)).toBe('Nieuw → Bestaand → Eenmalig');
  });
});

describe('garage-coördinaten', () => {
  it('slaat het garage-adres met coördinaten op en wist ze samen', async () => {
    await wijzigInstellingen(beheerder, { naam: 'G', garageAdres: 'Dorpsstraat 1, Breda', garageLat: 51.58, garageLng: 4.77, werkdagen: [1, 2, 3, 4, 5] });
    expect(await haalInstellingen()).toMatchObject({ garageAdres: 'Dorpsstraat 1, Breda', garageLat: 51.58, garageLng: 4.77 });
    await wijzigInstellingen(beheerder, { naam: 'G', garageAdres: '', garageLat: 51.58, garageLng: 4.77, werkdagen: [1] });
    expect(await haalInstellingen()).toMatchObject({ garageAdres: null, garageLat: null, garageLng: null });
  });
});
```

- [ ] **Step 2: Test draaien en zien falen**

Run: `npm run test:integratie`
Expected: FAIL, de modules `locaties` en `stops` bestaan nog niet.

- [ ] **Step 3: Implementatie schrijven**

`src/lib/diensten/locaties.ts`:
```ts
import type { Context } from '../context';
import { db, transactie, type Tx } from '../db/client';
import { isUuid, locatieSchema, type LocatieInvoer } from '../domein/validatie';
import { NietGevonden } from '../fouten';

export type Locatie = {
  id: string;
  naam: string;
  adres: string;
  lat: number;
  lng: number;
  googlePlaceId: string | null;
  gebruikTeller: number;
};

const NIET_GEVONDEN = 'Locatie niet gevonden';

export async function lijstLocaties(): Promise<Locatie[]> {
  const rijen = await db()<Locatie[]>`
    select id, naam, adres, lat, lng, google_place_id, gebruik_teller from locaties order by lower(naam), id`;
  return rijen.map((r) => ({ ...r }));
}

export async function vaakGebruikteLocaties(aantal = 5): Promise<Locatie[]> {
  const rijen = await db()<Locatie[]>`
    select id, naam, adres, lat, lng, google_place_id, gebruik_teller from locaties
    where gebruik_teller > 0
    order by gebruik_teller desc, lower(naam)
    limit ${aantal}`;
  return rijen.map((r) => ({ ...r }));
}

/** Slaat een locatie op; een bekende Google-plaats levert het bestaande id (naam blijft staan). */
export async function bewaarLocatie(tx: Tx, invoer: LocatieInvoer): Promise<string> {
  const v = locatieSchema.parse(invoer);
  if (v.googlePlaceId) {
    const [r] = await tx<{ id: string }[]>`
      insert into locaties (naam, adres, lat, lng, google_place_id)
      values (${v.naam}, ${v.adres}, ${v.lat}, ${v.lng}, ${v.googlePlaceId})
      on conflict (google_place_id) do update set google_place_id = excluded.google_place_id
      returning id`;
    return r.id;
  }
  const [r] = await tx<{ id: string }[]>`
    insert into locaties (naam, adres, lat, lng) values (${v.naam}, ${v.adres}, ${v.lat}, ${v.lng}) returning id`;
  return r.id;
}

export async function maakLocatie(_ctx: Context, invoer: LocatieInvoer): Promise<{ id: string }> {
  return { id: await transactie((tx) => bewaarLocatie(tx, invoer)) };
}

export async function hernoemLocatie(_ctx: Context, id: string, naam: string): Promise<void> {
  const n = locatieSchema.shape.naam.parse(naam);
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const rijen = await db()`update locaties set naam = ${n} where id = ${id} returning id`;
  if (rijen.length === 0) throw new NietGevonden(NIET_GEVONDEN);
}

export async function verwijderLocatie(_ctx: Context, id: string): Promise<void> {
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const rijen = await db()`delete from locaties where id = ${id} returning id`;
  if (rijen.length === 0) throw new NietGevonden(NIET_GEVONDEN);
}
```

`src/lib/diensten/stops.ts`:
```ts
import type { Tx } from '../db/client';
import type { StopInvoer } from '../domein/validatie';
import { bewaarLocatie } from './locaties';

export type Stop = {
  naam: string;
  adres: string;
  lat: number;
  lng: number;
  googlePlaceId: string | null;
  locatieId: string | null;
};

export async function bewaarNieuweLocaties(tx: Tx, stops: StopInvoer[]): Promise<Stop[]> {
  const uit: Stop[] = [];
  for (const s of stops) {
    const locatieId = s.locatieId ?? (s.bewaar ? await bewaarLocatie(tx, s) : null);
    uit.push({ naam: s.naam, adres: s.adres, lat: s.lat, lng: s.lng, googlePlaceId: s.googlePlaceId, locatieId });
  }
  return uit;
}

export async function schrijfStops(tx: Tx, taakId: string, stops: Stop[]): Promise<void> {
  await tx`delete from taak_stops where taak_id = ${taakId}`;
  for (const [i, s] of stops.entries()) {
    await tx`
      insert into taak_stops (taak_id, volgorde, naam, adres, lat, lng, google_place_id, locatie_id)
      values (${taakId}, ${i + 1}, ${s.naam}, ${s.adres}, ${s.lat}, ${s.lng}, ${s.googlePlaceId}, ${s.locatieId})`;
  }
}

export async function haalStops(tx: Tx, taakId: string): Promise<Stop[]> {
  const rijen = await tx<Stop[]>`
    select naam, adres, lat, lng, google_place_id, locatie_id from taak_stops where taak_id = ${taakId} order by volgorde`;
  return rijen.map((r) => ({ ...r }));
}

export async function telGebruik(tx: Tx, locatieIds: (string | null)[]): Promise<void> {
  const ids = [...new Set(locatieIds.filter((x): x is string => x !== null))];
  if (ids.length > 0) await tx`update locaties set gebruik_teller = gebruik_teller + 1 where id in ${tx(ids)}`;
}

export function stopsTekst(stops: { naam: string }[]): string {
  return stops.map((s) => s.naam).join(' → ');
}
```

Vervang `src/lib/diensten/instellingen.ts` door:
```ts
import type { Context } from '../context';
import { db, pgIntArray } from '../db/client';
import { instellingenSchema, type InstellingenInvoer } from '../domein/validatie';
import { vereisBeheerder } from './rechten';

export type Instellingen = {
  naam: string;
  garageAdres: string | null;
  garageLat: number | null;
  garageLng: number | null;
  werkdagen: number[];
};

export async function haalInstellingen(): Promise<Instellingen> {
  const [i] = await db()<Instellingen[]>`select naam, garage_adres, garage_lat, garage_lng, werkdagen from instellingen`;
  return { ...i };
}

export async function wijzigInstellingen(ctx: Context, invoer: InstellingenInvoer): Promise<void> {
  vereisBeheerder(ctx);
  const v = instellingenSchema.parse(invoer);
  await db()`
    update instellingen set
      naam = ${v.naam}, garage_adres = ${v.garageAdres}, garage_lat = ${v.garageLat}, garage_lng = ${v.garageLng},
      werkdagen = ${pgIntArray(v.werkdagen)}::int[]`;
}
```

Wijzig in `src/app/(app)/beheer/acties.ts` de functie `wijzigInstellingenActie` zodat ze ook de coördinaten doorgeeft:
```ts
export async function wijzigInstellingenActie(f: FormData): Promise<ActieResultaat> {
  const getal = (k: string) => (tekst(f, k) === '' ? null : Number(tekst(f, k)));
  return voerUit(async () => {
    await wijzigInstellingen(await ctx(), {
      naam: tekst(f, 'naam'),
      garageAdres: tekst(f, 'garageAdres'),
      garageLat: getal('garageLat'),
      garageLng: getal('garageLng'),
      werkdagen: f.getAll('werkdagen').map(Number),
    });
    return null;
  });
}
```

- [ ] **Step 4: Tests draaien en zien slagen**

Run: `npm run test:integratie && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diensten "src/app/(app)/beheer/acties.ts" tests/integration/locaties.test.ts
git commit -m "feat: opgeslagen locaties, stops-hulpfuncties en garage-coördinaten" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Stops bij taken en herhalende reeksen

**Files:**
- Modify: `src/lib/diensten/taken.ts`, `src/lib/diensten/herhalingen.ts`
- Test: `tests/integration/stops.test.ts`

**Interfaces:**
- Consumes: `Stop`, `bewaarNieuweLocaties`, `schrijfStops`, `haalStops`, `telGebruik`, `stopsTekst` (Task 3), `stopsSchema` via `taakVeldenSchema` (Task 1)
- Produces:
  - `Taak` krijgt `stops: Stop[]`, op volgorde, uit de view.
  - `maakTaak` bewaart de locaties die bewaard moeten worden, hoogt de teller op van alle gekoppelde locaties en schrijft de stops. Bij een reeks gaan de stops naar het sjabloon (`herhalingen.stops`) en naar elk exemplaar.
  - `wijzigTaak` vervangt de stops. De teller gaat alleen omhoog voor locaties die nieuw aan de taak zijn toegevoegd. De historie krijgt het veld `stops` met als waarde de namen samengevoegd met " → ".
  - `maakReeks(tx, gebruikerId, bord, velden, regel, vandaag)` krijgt in `velden` een extra veld `stops: Stop[]`.
  - `genereerExemplaren` schrijft de sjabloon-stops naar elk nieuw exemplaar.
  - `wijzigReeks` werkt de sjabloon-stops bij en ook de stops van de bijgewerkte exemplaren (die met status bezig of uitgesteld). Nieuw gegenereerde exemplaren krijgen de nieuwe stops.

- [ ] **Step 1: Falende test schrijven**

`tests/integration/stops.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Context } from '../../src/lib/context';
import { db, transactie } from '../../src/lib/db/client';
import { genereerExemplaren, wijzigReeks } from '../../src/lib/diensten/herhalingen';
import { lijstLocaties, maakLocatie } from '../../src/lib/diensten/locaties';
import { haalTaak, maakTaak, taakHistorie, takenOpDatum, verwijderTaak, wijzigTaak, zetStatus } from '../../src/lib/diensten/taken';
import { leegDatabase, maakBeheerderCtx, maakBord, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;
let bordId: string;

const plek = (naam: string, extra: Record<string, unknown> = {}) =>
  ({ naam, adres: `${naam}straat 1`, lat: 51.5, lng: 4.7, googlePlaceId: null, locatieId: null, bewaar: false, ...extra });
const velden = (titel: string, extra: Record<string, unknown> = {}) =>
  ({ titel, omschrijving: '', datum: '2026-11-02', tijd: null, prioriteit: 'middel' as const, ...extra });

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  piet = await maakMedewerkerCtx('piet', 'Piet');
  bordId = await maakBord();
});

describe('stops bij taken', () => {
  it('maakt een taak met stops, bewaart nieuwe locaties en telt gebruik', async () => {
    const bestaand = (await maakLocatie(piet, plek('Banden-Plus'))).id;
    const { id } = await maakTaak(piet, {
      bordId, herhaling: null,
      ...velden('Ochtendronde', { stops: [plek('Spuiterij', { googlePlaceId: 'g-1', bewaar: true }), plek('Banden-Plus', { locatieId: bestaand })] }),
    });
    const t = await haalTaak(id);
    expect(t.stops.map((s) => s.naam)).toEqual(['Spuiterij', 'Banden-Plus']);
    expect(t.stops[1].locatieId).toBe(bestaand);
    expect(Object.fromEntries((await lijstLocaties()).map((l) => [l.naam, l.gebruikTeller]))).toEqual({ 'Banden-Plus': 1, Spuiterij: 1 });
    expect((await takenOpDatum('2026-11-02'))[0].stops).toHaveLength(2);
  });

  it('weigert meer dan 9 stops', async () => {
    await expect(maakTaak(piet, { bordId, herhaling: null, ...velden('Te veel', { stops: Array(10).fill(plek('X')) }) }))
      .rejects.toThrow('Maximaal 9 locaties');
  });

  it('wijzigen vervangt stops, telt alleen nieuwe locaties en logt historie', async () => {
    const a = (await maakLocatie(piet, plek('A'))).id;
    const b = (await maakLocatie(piet, plek('B'))).id;
    const { id } = await maakTaak(piet, { bordId, herhaling: null, ...velden('T', { stops: [plek('A', { locatieId: a })] }) });
    await wijzigTaak(piet, id, 1, velden('T', { stops: [plek('A', { locatieId: a }), plek('B', { locatieId: b })] }));
    expect((await haalTaak(id)).stops.map((s) => s.naam)).toEqual(['A', 'B']);
    expect(Object.fromEntries((await lijstLocaties()).map((l) => [l.naam, l.gebruikTeller]))).toEqual({ A: 1, B: 1 });
    expect((await taakHistorie(id))[0].wijzigingen).toEqual({ stops: { oud: 'A', nieuw: 'A → B' } });
  });

  it('status wijzigen laat stops staan; verwijderen ruimt ze op', async () => {
    const { id } = await maakTaak(piet, { bordId, herhaling: null, ...velden('T', { stops: [plek('X')] }) });
    await zetStatus(beheerder, id, 1, 'bezig');
    expect((await haalTaak(id)).stops).toHaveLength(1);
    await verwijderTaak(piet, id);
    expect(await db()`select 1 from taak_stops`).toHaveLength(0);
  });
});

describe('stops bij reeksen', () => {
  const VANDAAG = '2026-11-02';

  it('elk exemplaar krijgt de stops, ook later gegenereerde', async () => {
    await maakTaak(piet, {
      bordId, herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
      ...velden('Vegen', { stops: [plek('Werkplaats')] }),
    }, VANDAAG);
    const [{ herhalingId }] = await db()<{ herhalingId: string }[]>`select herhaling_id from taken limit 1`;
    await transactie((tx) => genereerExemplaren(tx, herhalingId, '2026-11-03'));
    const telling = await db()<{ zonder: number }[]>`
      select count(*)::int as zonder from taken t where not exists (select 1 from taak_stops s where s.taak_id = t.id)`;
    expect(telling[0].zonder).toBe(0);
  });

  it('reeks wijzigen past stops toe op nieuwe en bezige exemplaren', async () => {
    const { id } = await maakTaak(piet, {
      bordId, herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
      ...velden('Vegen', { stops: [plek('Oud')] }),
    }, VANDAAG);
    await zetStatus(beheerder, id, 1, 'bezig');
    const [{ herhalingId }] = await db()<{ herhalingId: string }[]>`select herhaling_id from taken where id = ${id}`;
    await wijzigReeks(piet, herhalingId, {
      titel: 'Vegen', omschrijving: '', tijd: null, prioriteit: 'middel',
      herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 }, stops: [plek('Nieuw')],
    }, VANDAAG);
    const namen = await db()<{ naam: string }[]>`select distinct naam from taak_stops`;
    expect(namen.map((n) => n.naam)).toEqual(['Nieuw']);
    expect((await haalTaak(id)).stops.map((s) => s.naam)).toEqual(['Nieuw']);
  });
});
```

- [ ] **Step 2: Test draaien en zien falen**

Run: `npx vitest run --project integratie tests/integration/stops.test.ts` (eerst `export PATH=...` voor Docker)
Expected: FAIL. De stops worden nog niet opgeslagen en `Taak` heeft nog geen `stops`.

- [ ] **Step 3: `taken.ts` aanpassen**

Voeg de import toe:
```ts
import { bewaarNieuweLocaties, haalStops, schrijfStops, type Stop, stopsTekst, telGebruik } from './stops';
```
Voeg aan `type Taak` het veld `stops: Stop[];` toe (na `bordGearchiveerd`).

Vervang `maakTaak` door:
```ts
export async function maakTaak(ctx: Context, invoer: NieuweTaakInvoer, vandaag: Datum = vandaagInAmsterdam()): Promise<{ id: string }> {
  const v = nieuweTaakSchema.parse(invoer);
  return transactie(async (tx) => {
    const bord = await bordInTx(tx, v.bordId);
    const stops = await bewaarNieuweLocaties(tx, v.stops);
    await telGebruik(tx, stops.map((s) => s.locatieId));
    if (v.herhaling) {
      const id = await maakReeks(tx, ctx.gebruikerId, bord, { ...v, stops }, v.herhaling, vandaag);
      await meldWijziging(tx, bord.id);
      return { id };
    }
    const [t] = await tx<{ id: string }[]>`
      insert into taken (bord_id, titel, omschrijving, datum, tijd, prioriteit, oorspronkelijke_datum, aangemaakt_door, gewijzigd_door)
      values (${bord.id}, ${v.titel}, ${v.omschrijving}, ${v.datum}, ${v.tijd}, ${v.prioriteit}, ${v.datum},
              ${ctx.gebruikerId}, ${ctx.gebruikerId})
      returning id`;
    await schrijfStops(tx, t.id, stops);
    await meldWijziging(tx, bord.id);
    return { id: t.id };
  });
}
```

Wijzig `GEVOLGD` naar:
```ts
const GEVOLGD = ['titel', 'omschrijving', 'datum', 'tijd', 'prioriteit', 'status', 'stops'] as const;
```

Vervang `wijzigTaak` door:
```ts
export async function wijzigTaak(ctx: Context, id: string, versie: number, invoer: TaakVeldenInvoer): Promise<void> {
  const v = taakVeldenSchema.parse(invoer);
  await transactie(async (tx) => {
    const oud = await vergrendel(tx, id, versie);
    const oudeStops = await haalStops(tx, id);
    const stops = await bewaarNieuweLocaties(tx, v.stops);
    const alGekoppeld = new Set(oudeStops.map((s) => s.locatieId));
    await telGebruik(tx, stops.map((s) => s.locatieId).filter((l) => !alGekoppeld.has(l)));
    const anderedag = oud.datum !== v.datum;
    await tx`
      update taken set
        titel = ${v.titel}, omschrijving = ${v.omschrijving}, datum = ${v.datum}, tijd = ${v.tijd}, prioriteit = ${v.prioriteit},
        afwijkend = (herhaling_id is not null),
        uitgesteld_van = case when ${anderedag} then null else uitgesteld_van end,
        gemist = case when ${anderedag} then false else gemist end,
        versie = versie + 1, gewijzigd_door = ${ctx.gebruikerId}, gewijzigd_op = now()
      where id = ${id}`;
    await schrijfStops(tx, id, stops);
    await logWijzigingen(tx, id, ctx.gebruikerId, { ...oud, stops: stopsTekst(oudeStops) }, { ...v, stops: stopsTekst(stops) });
    await meldWijziging(tx, oud.bordId);
  });
}
```
(De historie toont bij `stops` de namen samengevoegd met " → ". Een lege lijst wordt `''` en verschijnt in de UI als "–".)

- [ ] **Step 4: `herhalingen.ts` aanpassen**

Voeg de import toe:
```ts
import { bewaarNieuweLocaties, schrijfStops, type Stop } from './stops';
```
Voeg aan `type HerhalingRij` het veld `stops: Stop[];` toe, en neem in de select van `genereerExemplaren` ook `h.stops` op (na `h.aangemaakt_door,`).

Vervang in `genereerExemplaren` de lus door:
```ts
  for (const d of datums) {
    const r = await tx<{ id: string }[]>`
      insert into taken (bord_id, titel, omschrijving, datum, tijd, prioriteit, oorspronkelijke_datum,
                         herhaling_id, aangemaakt_door, gewijzigd_door)
      values (${h.bordId}, ${h.titel}, ${h.omschrijving}, ${d}, ${h.tijd}, ${h.prioriteit}, ${d},
              ${h.id}, ${h.aangemaaktDoor}, ${h.aangemaaktDoor})
      on conflict (herhaling_id, oorspronkelijke_datum) where herhaling_id is not null do nothing
      returning id`;
    if (r.length > 0 && h.stops.length > 0) await schrijfStops(tx, r[0].id, h.stops);
    aantal += r.length;
  }
```

Vervang de signatuur en de insert van `maakReeks` door:
```ts
export async function maakReeks(
  tx: Tx,
  gebruikerId: string,
  bord: { id: string },
  velden: { titel: string; omschrijving: string; datum: Datum; tijd: string | null; prioriteit: Prioriteit; stops: Stop[] },
  regel: HerhalingInvoer,
  vandaag: Datum,
): Promise<string> {
  const [h] = await tx<{ id: string }[]>`
    insert into herhalingen (bord_id, titel, omschrijving, tijd, prioriteit, type, weekdagen, interval_weken, startdatum, aangemaakt_door, stops)
    values (${bord.id}, ${velden.titel}, ${velden.omschrijving}, ${velden.tijd}, ${velden.prioriteit},
            ${regel.type}, ${pgIntArray(regel.weekdagen)}::int[], ${regel.intervalWeken}, ${velden.datum}, ${gebruikerId},
            ${JSON.stringify(velden.stops)}::text::jsonb)
    returning id`;
```
(De rest van `maakReeks` blijft gelijk.)

Vervang in `wijzigReeks` het blok binnen `transactie(async (tx) => { … })` door:
```ts
    const stops = await bewaarNieuweLocaties(tx, v.stops);
    const [h] = await tx<{ bordId: string }[]>`
      update herhalingen set
        titel = ${v.titel}, omschrijving = ${v.omschrijving}, tijd = ${v.tijd}, prioriteit = ${v.prioriteit},
        type = ${v.herhaling.type}, weekdagen = ${pgIntArray(v.herhaling.weekdagen)}::int[], interval_weken = ${v.herhaling.intervalWeken},
        stops = ${JSON.stringify(stops)}::text::jsonb,
        gegenereerd_tot = ${plusDagen(vandaag, -1)}
      where id = ${herhalingId}
      returning bord_id`;
    if (!h) throw new NietGevonden('Reeks niet gevonden');
    const bijgewerkt = await tx<{ id: string }[]>`
      update taken set
        titel = ${v.titel}, omschrijving = ${v.omschrijving}, tijd = ${v.tijd}, prioriteit = ${v.prioriteit},
        versie = versie + 1, gewijzigd_door = ${ctx.gebruikerId}, gewijzigd_op = now()
      where herhaling_id = ${herhalingId} and datum >= ${vandaag} and not afwijkend
        and (status = 'bezig' or (status = 'open' and uitgesteld_van is not null))
      returning id`;
    for (const t of bijgewerkt) await schrijfStops(tx, t.id, stops);
    await OPEN_TOEKOMST(tx, herhalingId, vandaag);
    await genereerExemplaren(tx, herhalingId, vandaag);
    await meldWijziging(tx, h.bordId);
```

- [ ] **Step 5: Tests draaien en zien slagen**

Run: `npm run test:integratie && npm test && npm run typecheck`
Expected: alles PASS, ook de bestaande taken-, herhalingen- en worker-tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/diensten tests/integration/stops.test.ts
git commit -m "feat: stops bij taken en herhalende reeksen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Locaties in het taakvenster en op de kaart

**Files:**
- Create: `src/app/(app)/locaties/acties.ts`, `src/components/locaties/locatie-zoeker.tsx`, `src/components/bord/stops-editor.tsx`
- Modify: `src/components/bord/taak-dialoog.tsx`, `src/components/bord/taak-kaart.tsx`, `src/components/iconen.tsx`

**Interfaces:**
- Consumes: `zoekPlaatsen`, `plaatsDetails`, `Suggestie`, `Plaats` (Task 2), `lijstLocaties`, `vaakGebruikteLocaties`, `maakLocatie`, `hernoemLocatie`, `verwijderLocatie`, `Locatie` (Task 3), `Taak.stops` (Task 4), `navigatieUrl`, `stopsSamenvatting`, `MAX_STOPS`, `StopInvoer`, `LocatieInvoer` (Task 1)
- Produces:
  - Server actions in `src/app/(app)/locaties/acties.ts`:
    - `zoekPlaatsenActie(invoer: string, sessie: string): Promise<ActieResultaat<Suggestie[]>>`
    - `plaatsDetailsActie(placeId: string, sessie: string): Promise<ActieResultaat<Plaats>>`
    - `locatieOverzichtActie(): Promise<ActieResultaat<{ alle: Locatie[]; vaak: Locatie[] }>>`
    - `maakLocatieActie(invoer: LocatieInvoer): Promise<ActieResultaat<string>>`
    - `hernoemLocatieActie(id: string, f: FormData): Promise<ActieResultaat>`
    - `verwijderLocatieActie(id: string): Promise<ActieResultaat>`

    Alle acties vereisen een ingelogde gebruiker.
  - `LocatieZoeker({ opgeslagen: Locatie[]; onKies: (stop: StopInvoer) => void; label?: string; nieuwBewaren?: boolean })`, plus de helper `alsStop(l: Locatie): StopInvoer`
  - `StopsEditor({ stops: StopInvoer[]; onChange: (s: StopInvoer[]) => void; opgeslagen: Locatie[]; vaakGebruikt: Locatie[] })`
  - `PinIcoon`
  - DOM-haakjes voor e2e:
    - het zoekveld heeft het label "Zoek adres of opgeslagen locatie";
    - resultaten zijn `role="option"`, met de naam als toegankelijke naam;
    - de navigatielinks hebben de naam "Navigeer naar <naam>";
    - de foutmelding is "Adres zoeken tijdelijk niet beschikbaar".

Deze UI-taak heeft geen eigen unit-tests. Task 7 test de werking end-to-end. Controle gebeurt met typecheck en build.

- [ ] **Step 1: Server actions schrijven**

`src/app/(app)/locaties/acties.ts`:
```ts
'use server';

import { hernoemLocatie, type Locatie, lijstLocaties, maakLocatie, vaakGebruikteLocaties, verwijderLocatie } from '@/lib/diensten/locaties';
import type { LocatieInvoer } from '@/lib/domein/validatie';
import { type Plaats, plaatsDetails, type Suggestie, zoekPlaatsen } from '@/lib/google/plaatsen';
import { type ActieResultaat, voerUit } from '@/lib/web/actie';
import { contextVan, vereisGebruiker } from '@/lib/web/huidige-gebruiker';

async function ctx() {
  return contextVan(await vereisGebruiker());
}

export async function zoekPlaatsenActie(invoer: string, sessie: string): Promise<ActieResultaat<Suggestie[]>> {
  return voerUit(async () => {
    await ctx();
    return zoekPlaatsen(invoer, sessie);
  });
}

export async function plaatsDetailsActie(placeId: string, sessie: string): Promise<ActieResultaat<Plaats>> {
  return voerUit(async () => {
    await ctx();
    return plaatsDetails(placeId, sessie);
  });
}

export async function locatieOverzichtActie(): Promise<ActieResultaat<{ alle: Locatie[]; vaak: Locatie[] }>> {
  return voerUit(async () => {
    await ctx();
    const [alle, vaak] = await Promise.all([lijstLocaties(), vaakGebruikteLocaties()]);
    return { alle, vaak };
  });
}

export async function maakLocatieActie(invoer: LocatieInvoer): Promise<ActieResultaat<string>> {
  return voerUit(async () => (await maakLocatie(await ctx(), invoer)).id);
}

export async function hernoemLocatieActie(id: string, f: FormData): Promise<ActieResultaat> {
  return voerUit(async () => {
    await hernoemLocatie(await ctx(), id, String(f.get('naam') ?? ''));
    return null;
  });
}

export async function verwijderLocatieActie(id: string): Promise<ActieResultaat> {
  return voerUit(async () => {
    await verwijderLocatie(await ctx(), id);
    return null;
  });
}
```

- [ ] **Step 2: Icoon, zoeker en stops-editor schrijven**

Voeg aan `src/components/iconen.tsx` toe:
```tsx
export const PinIcoon = () => (
  <svg {...basis} width={13} height={13}>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
  </svg>
);
```

`src/components/locaties/locatie-zoeker.tsx`:
```tsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { plaatsDetailsActie, zoekPlaatsenActie } from '@/app/(app)/locaties/acties';
import { Invoer, Melding } from '@/components/ui';
import type { Locatie } from '@/lib/diensten/locaties';
import type { StopInvoer } from '@/lib/domein/validatie';
import type { Suggestie } from '@/lib/google/plaatsen';

export function alsStop(l: Locatie): StopInvoer {
  return { naam: l.naam, adres: l.adres, lat: l.lat, lng: l.lng, googlePlaceId: l.googlePlaceId, locatieId: l.id, bewaar: false };
}

const OPTIE = 'flex w-full flex-col px-3 py-1.5 text-left hover:bg-kaart-hover focus-visible:bg-kaart-hover focus-visible:outline-none';

export function LocatieZoeker({
  opgeslagen,
  onKies,
  label = 'Zoek adres of opgeslagen locatie',
  nieuwBewaren = true,
}: {
  opgeslagen: Locatie[];
  onKies: (stop: StopInvoer) => void;
  label?: string;
  nieuwBewaren?: boolean;
}) {
  const id = useId();
  const [tekst, setTekst] = useState('');
  const [suggesties, setSuggesties] = useState<Suggestie[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [laden, setLaden] = useState(false);
  const sessie = useRef<string>(crypto.randomUUID());

  const term = tekst.trim().toLowerCase();
  const eigen = term
    ? opgeslagen.filter((l) => l.naam.toLowerCase().includes(term) || l.adres.toLowerCase().includes(term)).slice(0, 5)
    : [];

  useEffect(() => {
    if (tekst.trim().length < 3) {
      setSuggesties([]);
      setFout(null);
      return;
    }
    let actueel = true;
    const timer = setTimeout(async () => {
      const r = await zoekPlaatsenActie(tekst, sessie.current);
      if (!actueel) return;
      if (r.ok) {
        setSuggesties(r.data);
        setFout(null);
      } else {
        setSuggesties([]);
        setFout(r.fout);
      }
    }, 300);
    return () => {
      actueel = false;
      clearTimeout(timer);
    };
  }, [tekst]);

  function herstel() {
    setTekst('');
    setSuggesties([]);
    setFout(null);
    sessie.current = crypto.randomUUID();
  }

  async function kiesSuggestie(s: Suggestie) {
    setLaden(true);
    const r = await plaatsDetailsActie(s.placeId, sessie.current);
    setLaden(false);
    if (!r.ok) {
      setFout(r.fout);
      return;
    }
    onKies({
      naam: r.data.naam, adres: r.data.adres, lat: r.data.lat, lng: r.data.lng,
      googlePlaceId: r.data.placeId, locatieId: null, bewaar: nieuwBewaren,
    });
    herstel();
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-tekst-zacht">{label}</label>
      <Invoer
        id={id}
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        placeholder="Bijv. Banden-Plus of Dorpsstraat 4"
        autoComplete="off"
      />
      {(eigen.length > 0 || suggesties.length > 0) && (
        <div role="listbox" aria-label="Zoekresultaten" className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-rand bg-kaart py-1 text-sm shadow-xl">
          {eigen.map((l) => (
            <button key={l.id} type="button" role="option" aria-selected={false} className={OPTIE}
              onClick={() => { onKies(alsStop(l)); herstel(); }}>
              <span className="font-medium">{l.naam}</span>
              <span className="text-xs text-tekst-flauw">{l.adres} · opgeslagen</span>
            </button>
          ))}
          {suggesties.map((s) => (
            <button key={s.placeId} type="button" role="option" aria-selected={false} disabled={laden} className={OPTIE}
              onClick={() => void kiesSuggestie(s)}>
              <span className="font-medium">{s.hoofdtekst}</span>
              {s.subtekst && <span className="text-xs text-tekst-flauw">{s.subtekst}</span>}
            </button>
          ))}
        </div>
      )}
      {fout && <div className="mt-1"><Melding>{fout}</Melding></div>}
    </div>
  );
}
```

`src/components/bord/stops-editor.tsx`:
```tsx
'use client';

import { KruisIcoon } from '@/components/iconen';
import { alsStop, LocatieZoeker } from '@/components/locaties/locatie-zoeker';
import { Invoer } from '@/components/ui';
import type { Locatie } from '@/lib/diensten/locaties';
import { MAX_STOPS, type StopInvoer } from '@/lib/domein/validatie';

export function StopsEditor({
  stops,
  onChange,
  opgeslagen,
  vaakGebruikt,
}: {
  stops: StopInvoer[];
  onChange: (stops: StopInvoer[]) => void;
  opgeslagen: Locatie[];
  vaakGebruikt: Locatie[];
}) {
  const vol = stops.length >= MAX_STOPS;
  const voegToe = (s: StopInvoer) => { if (!vol) onChange([...stops, s]); };
  const wijzig = (i: number, deel: Partial<StopInvoer>) => onChange(stops.map((s, j) => (j === i ? { ...s, ...deel } : s)));
  const verwijder = (i: number) => onChange(stops.filter((_, j) => j !== i));

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-xs font-medium text-tekst-zacht">Locaties (optioneel, maximaal {MAX_STOPS})</legend>
      {stops.length > 0 && (
        <ol className="space-y-1.5">
          {stops.map((s, i) => (
            <li key={`${i}-${s.adres}`} className="flex items-start gap-2 rounded-lg border border-rand bg-achtergrond px-2.5 py-2">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-kaart-hover text-[11px] font-semibold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                {s.locatieId === null && s.bewaar ? (
                  <Invoer aria-label={`Naam voor ${s.adres}`} value={s.naam} onChange={(e) => wijzig(i, { naam: e.target.value })} className="h-8" maxLength={100} />
                ) : (
                  <p className="truncate text-sm font-medium">{s.naam}</p>
                )}
                <p className="truncate text-xs text-tekst-flauw">{s.adres}</p>
                {s.locatieId === null && (
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-tekst-zacht">
                    <input type="checkbox" checked={s.bewaar} onChange={(e) => wijzig(i, { bewaar: e.target.checked })} className="size-3.5 accent-accent" />
                    Bewaar als vaste locatie
                  </label>
                )}
              </div>
              <button type="button" onClick={() => verwijder(i)} aria-label={`Verwijder ${s.naam}`} className="rounded p-1 text-tekst-flauw hover:bg-kaart hover:text-tekst">
                <KruisIcoon />
              </button>
            </li>
          ))}
        </ol>
      )}
      {vol ? (
        <p className="text-xs text-tekst-flauw">Maximaal {MAX_STOPS} locaties.</p>
      ) : (
        <>
          <LocatieZoeker opgeslagen={opgeslagen} onKies={voegToe} />
          {vaakGebruikt.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-tekst-flauw">Vaak gebruikt:</span>
              {vaakGebruikt.map((l) => (
                <button key={l.id} type="button" onClick={() => voegToe(alsStop(l))}
                  className="rounded-full bg-kaart px-2.5 py-1 text-xs text-tekst-zacht hover:bg-kaart-hover hover:text-tekst">
                  {l.naam}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
```

- [ ] **Step 3: Taakvenster aanpassen**

Wijzig in `src/components/bord/taak-dialoog.tsx`:

1. Imports toevoegen:
```tsx
import { locatieOverzichtActie } from '@/app/(app)/locaties/acties';
import type { Locatie } from '@/lib/diensten/locaties';
import { navigatieUrl } from '@/lib/domein/navigatie';
import type { StopInvoer } from '@/lib/domein/validatie';
import { StopsEditor } from './stops-editor';
```
2. `VELDNAAM` uitbreiden met `stops: 'locaties'`.
3. Na de state `prioriteit` toevoegen:
```tsx
  const [stops, setStops] = useState<StopInvoer[]>((taak?.stops ?? []).map((s) => ({ ...s, bewaar: false })));
  const [locaties, setLocaties] = useState<{ alle: Locatie[]; vaak: Locatie[] }>({ alle: [], vaak: [] });

  useEffect(() => {
    let actueel = true;
    void locatieOverzichtActie().then((r) => { if (actueel && r.ok) setLocaties(r.data); });
    return () => { actueel = false; };
  }, []);
```
4. In `opslaan` wordt `velden` dit: `const velden = { titel, omschrijving, datum, tijd: tijd || null, prioriteit, stops };`. De `wijzigReeksActie`-aanroep krijgt ook `stops`: `{ titel, omschrijving, tijd: tijd || null, prioriteit, stops, herhaling: r }`.
5. Direct na het status-blok (`{taak && isBeheerder && (…)}`) komt het navigatieblok:
```tsx
        {taak && taak.stops.length > 0 && (
          <div className="mb-5 rounded-lg border border-rand bg-achtergrond p-3">
            <span className="mb-2 block text-xs font-medium text-tekst-zacht">{taak.stops.length === 1 ? 'Locatie' : 'Locaties'}</span>
            <ol className="space-y-2">
              {taak.stops.map((s, i) => (
                <li key={`${i}-${s.adres}`} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{taak.stops.length > 1 ? `${i + 1}. ` : ''}{s.naam}</span>
                    <span className="block truncate text-xs text-tekst-flauw">{s.adres}</span>
                  </span>
                  <a
                    href={navigatieUrl(s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Navigeer naar ${s.naam}`}
                    className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-donker hover:bg-accent/90"
                  >
                    Navigeer
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}
```
6. In het formulier, direct na het Prioriteit-blok (en vóór het blok met "Herhalen"):
```tsx
          <StopsEditor stops={stops} onChange={setStops} opgeslagen={locaties.alle} vaakGebruikt={locaties.vaak} />
```

- [ ] **Step 4: Kaart aanpassen**

In `src/components/bord/taak-kaart.tsx`: importeer `PinIcoon` uit `@/components/iconen` en `stopsSamenvatting` uit `@/lib/domein/navigatie`. Bereken `const plek = stopsSamenvatting(taak.stops);`, neem `plek` op in `heeftMeta` (`Boolean(taak.tijd || plek || herhaling || …)`) en toon na de tijd:
```tsx
          {plek && <span className="inline-flex min-w-0 items-center gap-1"><PinIcoon /><span className="truncate">{plek}</span></span>}
```

- [ ] **Step 5: Controleren**

Run: `npm run typecheck && npm test && npm run build`
Expected: geen fouten.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/locaties/acties.ts" src/components
git commit -m "feat: locaties kiezen in het taakvenster, navigeren en pin op de kaart" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Pagina Locaties en garage-adres in Instellingen

**Files:**
- Create: `src/app/(app)/locaties/page.tsx`, `src/components/locaties/nieuwe-locatie.tsx`, `src/components/locaties/verwijder-locatie.tsx`, `src/components/beheer/garage-adres-kiezer.tsx`
- Modify: `src/components/schil/top-balk.tsx`, `src/app/(app)/beheer/instellingen/page.tsx`

**Interfaces:**
- Consumes: de acties uit Task 5, `LocatieZoeker`, `ActieFormulier`, `Paneel`, `Melding`, `Knop`, `Invoer`, `Veld`, `lijstLocaties`, `haalInstellingen` (met `garageLat`/`garageLng`)
- Produces:
  - route `/locaties`, voor alle ingelogde gebruikers
  - link "Locaties" in de topbalk, voor iedereen
  - het "Garage"-paneel bevat een `GarageAdresKiezer` met verborgen velden `garageAdres`, `garageLat`, `garageLng`

- [ ] **Step 1: Componenten schrijven**

`src/components/locaties/nieuwe-locatie.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { maakLocatieActie } from '@/app/(app)/locaties/acties';
import { Melding } from '@/components/ui';
import type { Locatie } from '@/lib/diensten/locaties';
import { LocatieZoeker } from './locatie-zoeker';

export function NieuweLocatie({ opgeslagen }: { opgeslagen: Locatie[] }) {
  const router = useRouter();
  const [melding, setMelding] = useState<{ tekst: string; soort: 'fout' | 'info' } | null>(null);
  const [, start] = useTransition();
  return (
    <div className="space-y-2">
      <LocatieZoeker
        opgeslagen={opgeslagen}
        nieuwBewaren={false}
        label="Zoek een adres om op te slaan"
        onKies={(s) => {
          if (s.locatieId) {
            setMelding({ tekst: `${s.naam} staat al in de lijst.`, soort: 'info' });
            return;
          }
          start(async () => {
            const r = await maakLocatieActie(s);
            if (!r.ok) return setMelding({ tekst: r.fout, soort: 'fout' });
            setMelding({ tekst: `${s.naam} is opgeslagen.`, soort: 'info' });
            router.refresh();
          });
        }}
      />
      {melding && <Melding soort={melding.soort}>{melding.tekst}</Melding>}
    </div>
  );
}
```

`src/components/locaties/verwijder-locatie.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { verwijderLocatieActie } from '@/app/(app)/locaties/acties';
import { Knop } from '@/components/ui';

export function VerwijderLocatie({ id, naam }: { id: string; naam: string }) {
  const router = useRouter();
  const [bezig, start] = useTransition();
  return (
    <Knop
      variant="gevaar"
      disabled={bezig}
      onClick={() => {
        if (!confirm(`${naam} verwijderen? Bestaande taken houden hun adres.`)) return;
        start(async () => {
          const r = await verwijderLocatieActie(id);
          if (!r.ok) alert(r.fout);
          router.refresh();
        });
      }}
    >
      Verwijderen
    </Knop>
  );
}
```

`src/components/beheer/garage-adres-kiezer.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { LocatieZoeker } from '@/components/locaties/locatie-zoeker';
import { Knop } from '@/components/ui';
import type { Locatie } from '@/lib/diensten/locaties';

type Adres = { adres: string; lat: number | null; lng: number | null };

export function GarageAdresKiezer({ begin, opgeslagen }: { begin: Adres | null; opgeslagen: Locatie[] }) {
  const [adres, setAdres] = useState<Adres | null>(begin);
  return (
    <div className="space-y-2">
      <input type="hidden" name="garageAdres" value={adres?.adres ?? ''} />
      <input type="hidden" name="garageLat" value={adres?.lat ?? ''} />
      <input type="hidden" name="garageLng" value={adres?.lng ?? ''} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-medium text-tekst-zacht">Adres van de garage:</span>
        <span>{adres ? adres.adres : 'nog niet ingesteld'}</span>
        {adres && adres.lat === null && <span className="text-xs text-fout">zonder coördinaten, kies het adres opnieuw</span>}
        {adres && <Knop variant="stil" className="h-7 px-2 text-xs" onClick={() => setAdres(null)}>Wis</Knop>}
      </div>
      <LocatieZoeker
        opgeslagen={opgeslagen}
        nieuwBewaren={false}
        label="Zoek het adres van de garage"
        onKies={(s) => setAdres({ adres: s.adres, lat: s.lat, lng: s.lng })}
      />
      <p className="text-xs text-tekst-flauw">Wordt het eindpunt van routes. Vergeet niet op te slaan.</p>
    </div>
  );
}
```

`src/app/(app)/locaties/page.tsx`:
```tsx
import { hernoemLocatieActie } from './acties';
import { ActieFormulier } from '@/components/actie-formulier';
import { NieuweLocatie } from '@/components/locaties/nieuwe-locatie';
import { VerwijderLocatie } from '@/components/locaties/verwijder-locatie';
import { Invoer, Paneel, Veld } from '@/components/ui';
import { lijstLocaties } from '@/lib/diensten/locaties';
import { vereisGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function LocatiesPagina() {
  await vereisGebruiker();
  const locaties = await lijstLocaties();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Locaties</h1>
        <p className="text-sm text-tekst-zacht">Vaste adressen die je met één klik aan een taak koppelt.</p>
      </div>
      <Paneel titel="Nieuwe locatie">
        <NieuweLocatie opgeslagen={locaties} />
      </Paneel>
      <Paneel titel="Opgeslagen locaties">
        {locaties.length === 0 ? (
          <p className="text-sm text-tekst-zacht">Nog geen opgeslagen locaties.</p>
        ) : (
          <ul className="divide-y divide-rand-zacht">
            {locaties.map((l) => (
              <li key={l.id} className="flex flex-wrap items-end gap-3 py-3">
                <div className="min-w-56 flex-1">
                  <ActieFormulier actie={hernoemLocatieActie.bind(null, l.id)} knop="Opslaan" knopVariant="secundair" wisNaSucces={false}>
                    <Veld label="Naam"><Invoer name="naam" defaultValue={l.naam} required maxLength={100} /></Veld>
                  </ActieFormulier>
                  <p className="mt-1 text-xs text-tekst-flauw">{l.adres} · {l.gebruikTeller}× gebruikt</p>
                </div>
                <VerwijderLocatie id={l.id} naam={l.naam} />
              </li>
            ))}
          </ul>
        )}
      </Paneel>
    </div>
  );
}
```

- [ ] **Step 2: Topbalk en Instellingen aanpassen**

Voeg in `src/components/schil/top-balk.tsx`, binnen `<nav …>` vóór het beheerder-fragment, toe:
```tsx
          <Link href="/locaties" className={NAV}>Locaties</Link>
```

Wijzig in `src/app/(app)/beheer/instellingen/page.tsx`:
- Importeer `GarageAdresKiezer` uit `@/components/beheer/garage-adres-kiezer` en `lijstLocaties` uit `@/lib/diensten/locaties`.
- Haal de gegevens op met: `const [instellingen, locaties] = await Promise.all([haalInstellingen(), lijstLocaties()]);`
- Vervang het `Veld` "Adres van de garage" door de `GarageAdresKiezer`. Het grid bevat dan alleen het naamveld. Zet de kiezer eronder, vóór `WerkdagenKeuze`:
```tsx
            <GarageAdresKiezer
              opgeslagen={locaties}
              begin={instellingen.garageAdres ? { adres: instellingen.garageAdres, lat: instellingen.garageLat, lng: instellingen.garageLng } : null}
            />
```

- [ ] **Step 3: Controleren**

Run: `npm run typecheck && npm test && npm run build`
Expected: geen fouten. De routelijst bevat `/locaties`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/locaties/page.tsx" src/components "src/app/(app)/beheer/instellingen/page.tsx"
git commit -m "feat: pagina Locaties en garage-adres met coördinaten" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end tests, README en spec

**Files:**
- Modify: `playwright.config.ts`, `tests/e2e/helpers.ts`, `README.md`, `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md`
- Create: `tests/e2e/locaties.spec.ts`

**Interfaces:**
- Consumes: de hele app, `maakSql`, `E2E_DATABASE_URL`
- Produces: `maakOpgeslagenLocatie(naam, adres, lat, lng): Promise<void>` in `tests/e2e/helpers.ts`

- [ ] **Step 1: E2e-tests schrijven**

Zet in `playwright.config.ts` in `webServer.env` een lege sleutel, zodat e2e nooit Google aanroept, ook niet als `.env` een sleutel bevat:
```ts
    env: { DATABASE_URL: E2E_DATABASE_URL, APP_URL: `http://localhost:${POORT}`, GOOGLE_MAPS_API_KEY: '' },
```

Voeg aan `tests/e2e/helpers.ts` toe:
```ts
export async function maakOpgeslagenLocatie(naam: string, adres: string, lat: number, lng: number): Promise<void> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  await sql`insert into locaties (naam, adres, lat, lng) values (${naam}, ${adres}, ${lat}, ${lng})`;
  await sql.end();
}
```

`tests/e2e/locaties.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { inloggen, maakMedewerker, maakOpgeslagenLocatie } from './helpers';

test('medewerker koppelt een opgeslagen locatie en kan erheen navigeren', async ({ page }) => {
  await maakOpgeslagenLocatie('Banden-Plus', 'Industrieweg 12, Breda', 51.589, 4.776);
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);

  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await dialoog.getByLabel('Titel').fill('Banden ophalen');
  await dialoog.getByLabel('Zoek adres of opgeslagen locatie').fill('band');
  await dialoog.getByRole('option', { name: /Banden-Plus/ }).click();
  await expect(dialoog.getByText('Industrieweg 12, Breda')).toBeVisible();
  await dialoog.getByRole('button', { name: 'Opslaan' }).click();
  await expect(dialoog).toBeHidden();

  const kaart = page.locator('[data-taak]', { hasText: 'Banden ophalen' });
  await expect(kaart).toContainText('Banden-Plus');
  await kaart.click();
  const link = page.getByRole('dialog', { name: 'Taak bewerken' }).getByRole('link', { name: 'Navigeer naar Banden-Plus' });
  await expect(link).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=51.589%2C4.776&travelmode=driving');
});

test('zonder Google-sleutel geeft adres zoeken een nette melding', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await dialoog.getByLabel('Zoek adres of opgeslagen locatie').fill('Dorpsstraat 99');
  await expect(dialoog.getByText('Adres zoeken tijdelijk niet beschikbaar')).toBeVisible();
});
```

- [ ] **Step 2: E2e draaien**

Zorg dat de dev-database draait en dat er geen andere `next dev` in deze map draait.
Run: `npm run test:e2e`
Expected: alle specs PASS (de bestaande 4 en de 2 nieuwe).

Faalt er iets, bepaal dan of de app of de test fout zit. Repareer echte app-fouten in de app; pas een test alleen aan als een selector aantoonbaar niet bij de bedoelde UI past.

- [ ] **Step 3: README en spec bijwerken**

Voeg aan `README.md` een sectie toe, direct na "Lokaal starten":
````markdown
## Google (adressen zoeken)

Adressen zoeken via Google is optioneel. Zonder sleutel kun je wel opgeslagen locaties gebruiken.

1. Maak in [Google Cloud](https://console.cloud.google.com/) een project aan en koppel een betaalmethode. Het gratis maandtegoed is ruim genoeg voor één garage.
2. Zet **Places API (New)** aan. Voor fase 3 komt daar **Routes API** bij.
3. Maak een API-sleutel aan, beperk die tot deze API's en (in productie) tot het IP-adres van je server, en stel een budgetwaarschuwing in.
4. Zet de sleutel in `.env`:
   ```
   GOOGLE_MAPS_API_KEY=jouw-sleutel
   ```
De sleutel wordt alleen op de server gebruikt en komt nooit in de browser.
````

Vervang in de spec (`docs/superpowers/specs/2026-10-22-garage-takenbord-design.md`), onder "Belangrijkste keuzes", de regel die met `- **Externe diensten:**` begint door:
```markdown
- **Externe diensten:** Google Places API (New) voor het aanvullen van adressen en Google Routes API (fase 3) voor de optimale volgorde. Beide worden alleen vanaf de server aangeroepen, met één sleutel (`GOOGLE_MAPS_API_KEY`, beperkt tot de server-IP en deze API's), zodat er geen sleutel in de browser staat. In Google Cloud wordt een budgetwaarschuwing ingesteld.
```

- [ ] **Step 4: Alles nog één keer draaien**

Run: `npm run typecheck && npm test && npm run test:integratie && npm run build && npm run test:e2e`
Expected: alles groen.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e README.md docs/superpowers/specs
git commit -m "test: end-to-end tests voor locaties; README en spec over Google" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Na dit plan

- **Fase 3:** knop "Plan route" (Google Routes `computeRoutes` met `optimizeWaypointOrder`, start op de huidige locatie, eind bij de garage), Maps-link met meerdere stops, en ntfy-meldingen bij `zsm`/`nu`.
- **Fase 4:** productie-uitrol (Dockerfile, compose met Caddy en ntfy, migraties bij het opstarten, back-ups).
