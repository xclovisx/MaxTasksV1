# Addendum: één bedrijf (geldt vóór het plan)

**Datum:** 2026-10-22. **Besluit van Max:** er is maar één bedrijf. Het idee van meerdere bedrijven met elk hun eigen afgeschermde data vervalt. De beheerder kan nog wel **meerdere borden** aanmaken. Garage-naam, garage-adres en werkdagen worden **algemene instellingen** (één rij).

Dit addendum gaat vóór het plan (`2026-10-22-garage-takenbord-fase1-kern.md`). Waar een taak-brief iets anders zegt dan dit addendum, geldt het addendum. Alles wat hier niet genoemd wordt, blijft zoals in de brief.

## Wat vervalt

- Tabel `bedrijven`, alle kolommen `bedrijf_id`, en de view-kolommen `bedrijf_id`/`bedrijf_naam`
- `migrations/002_rls.sql` (rol `takenbord_app`, grants, policies, `app_rol()`/`app_bedrijf_id()`)
- `src/lib/db/tenant.ts` en `metTenant`. In de plaats komen `transactie()` (in `client.ts`) en het type `Context` (in `src/lib/context.ts`).
- Isolatietests ("ander bedrijf ziet niets")
- Beheerpagina "Bedrijven", het bedrijfsveld bij medewerkers en borden, en de bedrijfsgroepering in de bordkiezer
- Het veld `bedrijfId` in `SessieGebruiker` en `Context`

## Wat blijft (rechten worden in de diensten afgedwongen)

- Beheerder: alles. Alleen de beheerder beheert borden, medewerkers en instellingen, en alleen de beheerder wijzigt de status (`GeenToegang`).
- Medewerker: ziet alle borden, en maakt, wijzigt, verplaatst en verwijdert alle taken en reeksen.
- Alle andere regels (blokkade, activatie, versieconflict, historie, doorschuiven, herhalingen, live, Vandaag) blijven gelijk.

## Database (vervangt Task 4 Step 1)

`migrations/001_basis.sql` (volledige inhoud). `migrations/002_rls.sql` bestaat niet.
```sql
create table instellingen (
  id boolean primary key default true check (id),
  naam text not null default 'Garage',
  garage_adres text,
  werkdagen int[] not null default '{1,2,3,4,5}',
  constraint werkdagen_geldig check (cardinality(werkdagen) between 1 and 7 and werkdagen <@ array[1,2,3,4,5,6,7])
);
insert into instellingen default values;

create table gebruikers (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  gebruikersnaam text not null unique,
  wachtwoord_hash text,
  rol text not null check (rol in ('beheerder', 'medewerker')),
  actief boolean not null default true,
  mislukte_pogingen int not null default 0,
  geblokkeerd_tot timestamptz,
  activatie_token_hash text unique,
  activatie_code_hash text,
  activatie_verloopt_op timestamptz,
  aangemaakt_op timestamptz not null default now(),
  constraint gebruikersnaam_klein check (gebruikersnaam = lower(gebruikersnaam))
);

create table sessies (
  id text primary key,
  gebruiker_id uuid not null references gebruikers(id) on delete cascade,
  verloopt_op timestamptz not null,
  aangemaakt_op timestamptz not null default now()
);
create index sessies_gebruiker on sessies (gebruiker_id);

create table borden (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  gearchiveerd boolean not null default false,
  aangemaakt_op timestamptz not null default now()
);
insert into borden (naam) values ('Takenbord');

create table herhalingen (
  id uuid primary key default gen_random_uuid(),
  bord_id uuid not null references borden(id) on delete cascade,
  titel text not null,
  omschrijving text not null default '',
  tijd time,
  prioriteit text not null check (prioriteit in ('laag', 'middel', 'hoog', 'zsm', 'nu')),
  type text not null check (type in ('dagelijks', 'wekelijks', 'maandelijks', 'weekdagen', 'elke_x_weken')),
  weekdagen int[] not null default '{}',
  interval_weken int not null default 1,
  startdatum date not null,
  gegenereerd_tot date,
  actief boolean not null default true,
  aangemaakt_door uuid references gebruikers(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create table taken (
  id uuid primary key default gen_random_uuid(),
  bord_id uuid not null references borden(id) on delete cascade,
  titel text not null,
  omschrijving text not null default '',
  datum date not null,
  tijd time,
  prioriteit text not null check (prioriteit in ('laag', 'middel', 'hoog', 'zsm', 'nu')),
  status text not null default 'open' check (status in ('open', 'bezig', 'klaar')),
  oorspronkelijke_datum date not null,
  uitgesteld_van date,
  gemist boolean not null default false,
  herhaling_id uuid references herhalingen(id) on delete set null,
  afwijkend boolean not null default false,
  versie int not null default 1,
  aangemaakt_door uuid references gebruikers(id) on delete set null,
  aangemaakt_op timestamptz not null default now(),
  gewijzigd_door uuid references gebruikers(id) on delete set null,
  gewijzigd_op timestamptz not null default now(),
  klaar_op timestamptz
);
create index taken_bord_datum on taken (bord_id, datum);
create index taken_datum on taken (datum);
create unique index taken_herhaling_datum on taken (herhaling_id, oorspronkelijke_datum) where herhaling_id is not null;

create table taak_historie (
  id uuid primary key default gen_random_uuid(),
  taak_id uuid not null references taken(id) on delete cascade,
  gebruiker_id uuid references gebruikers(id) on delete set null,
  tijdstip timestamptz not null default now(),
  wijzigingen jsonb not null
);
create index taak_historie_taak on taak_historie (taak_id, tijdstip);

create view taken_weergave as
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
  bo.gearchiveerd as bord_gearchiveerd
from taken t
join borden bo on bo.id = t.bord_id
left join gebruikers ag on ag.id = t.aangemaakt_door
left join gebruikers gg on gg.id = t.gewijzigd_door
left join herhalingen h on h.id = t.herhaling_id;
```

## Gewijzigde interfaces (exact)

**`src/lib/context.ts`** (nieuw, vervangt `tenant.ts`):
```ts
export type Rol = 'beheerder' | 'medewerker';
export type Context = { gebruikerId: string; rol: Rol };
```

**`src/lib/db/client.ts`**: blijft, met één extra functie:
```ts
/** Voert fn uit in één databasetransactie. */
export async function transactie<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin((tx) => fn(tx))) as T;
}
```

**`src/lib/domein/validatie.ts`**:
- `bedrijfSchema` heet nu `instellingenSchema`, met dezelfde velden (`naam`, `garageAdres`, `werkdagen`) en dezelfde regels. Het type `BedrijfInvoer` heet nu `InstellingenInvoer`.
- `medewerkerSchema` verliest `bedrijfId`; alleen `naam` en `gebruikersnaam` blijven. De bijbehorende unit-test past mee.
- Sorteer werkdagen numeriek: `.sort((a, b) => a - b)`.

**`src/lib/auth/sessies.ts`**: `SessieGebruiker = { id: string; naam: string; gebruikersnaam: string; rol: Rol }` (geen `bedrijfId`). Haal de `Rol` uit `../context`.

**`src/lib/auth/activatie.ts`**: `geefActivatie(tx: Tx, gebruikerId)` blijft ongewijzigd. Aanroepers gebruiken `transactie(...)`.

**`src/lib/diensten/instellingen.ts`** (vervangt `bedrijven.ts`):
```ts
export type Instellingen = { naam: string; garageAdres: string | null; werkdagen: number[] };
export async function haalInstellingen(): Promise<Instellingen>
export async function wijzigInstellingen(ctx: Context, invoer: InstellingenInvoer): Promise<void> // alleen beheerder
```

**`src/lib/diensten/borden.ts`**:
```ts
export type Bord = { id: string; naam: string; gearchiveerd: boolean };
export async function lijstBorden(opties?: { metGearchiveerd?: boolean }): Promise<Bord[]> // order by naam
export async function haalBord(id: string): Promise<Bord>                // NietGevonden bij onbekend/ongeldig id
export async function bordInTx(tx: Tx, id: string): Promise<{ id: string }> // NietGevonden als onbekend of gearchiveerd
export async function maakBord(ctx: Context, naam: string): Promise<{ id: string }>  // alleen beheerder
export async function wijzigBord(ctx: Context, id: string, invoer: { naam: string; gearchiveerd: boolean }): Promise<void> // alleen beheerder
```

**`src/lib/diensten/medewerkers.ts`**:
```ts
export type Medewerker = { id: string; naam: string; gebruikersnaam: string; actief: boolean; geactiveerd: boolean; activatieVerlooptOp: Date | null };
export async function lijstMedewerkers(ctx: Context): Promise<Medewerker[]>          // alleen beheerder; order by naam
export async function maakMedewerker(ctx: Context, invoer: MedewerkerInvoer): Promise<{ id: string; activatie: Activatie }>
export async function nieuweActivatie(ctx: Context, gebruikerId: string): Promise<Activatie>
export async function zetActief(ctx: Context, gebruikerId: string, actief: boolean): Promise<void>
```

**`src/lib/diensten/taken.ts`**:
- `Taak` verliest `bedrijfId` en `bedrijfNaam`; de rest blijft, inclusief `bordNaam` en `bordGearchiveerd`.
- Lezen gebeurt zonder context: `takenVoorPeriode(bordId, van, tot)`, `takenOpDatum(datum)`, `haalTaak(id)`, `taakHistorie(id)`.
- Schrijven gebeurt met context (voor `gebruikerId` en rol), met dezelfde signaturen als in de brief: `maakTaak(ctx, invoer, vandaag?)`, `wijzigTaak`, `verplaatsTaak`, `zetStatus`, `verwijderTaak`.
- Inserts hebben geen `bedrijf_id` meer, en elke `metTenant(ctx, …)` wordt `transactie(…)`.

**`src/lib/diensten/herhalingen.ts`**:
- `maakReeks(tx, gebruikerId, bord: { id: string }, velden, regel, vandaag)`.
- `genereerExemplaren` haalt de werkdagen op met `(select werkdagen from instellingen) as werkdagen` in plaats van via een join op `bedrijven`.
- `wijzigReeks(ctx, …)` en `stopReeks(ctx, …)` behouden hun signatuur. Elke ingelogde gebruiker mag ze aanroepen.

**Worker** `doorschuiven(sql?, vandaag?)`: één run over alle taken, met de werkdagen uit `instellingen`, in één transactie. Het resultaat heeft dezelfde vorm.

**Web**: `contextVan(g)` geeft `{ gebruikerId: g.id, rol: g.rol }`.

## Per taak

- **Task 4:** schema zoals hierboven, geen `002_rls.sql`, geen `tenant.ts`, wel `src/lib/context.ts` en `transactie()`. Vervang `tests/integration/rls.test.ts` door `tests/integration/schema.test.ts` met deze tests:
  1. `migreer` geeft bij een tweede run `[]`.
  2. `instellingen` heeft precies één rij (`naam = 'Garage'`, `werkdagen = [1,2,3,4,5]`), en een tweede insert faalt.
  3. Een `date`-kolom komt terug als string `'2026-10-22'`.
  4. `taken_weergave` levert `aangemaakt_door_naam` en `bord_naam`.
  5. De unieke index weigert twee taken met dezelfde `(herhaling_id, oorspronkelijke_datum)`.

  `leegDatabase()` truncate't `taak_historie, taken, herhalingen, borden, sessies, gebruikers` en zet `instellingen` terug op de standaardwaarden (`naam='Garage', garage_adres=null, werkdagen='{1,2,3,4,5}'`). De dev-database moet opnieuw worden opgebouwd: `docker compose -f docker-compose.dev.yml down -v`, daarna `up -d` en `npm run db:migreer`.
- **Task 5:** testhelpers in `tests/integration/helpers.ts`:
  - `maakBeheerderCtx(): Promise<Context>`
  - `maakBord(naam = 'Takenbord'): Promise<string>` (bordId, direct via SQL)
  - `zetWerkdagen(werkdagen: number[]): Promise<void>`
  - `maakMedewerkerCtx(gebruikersnaam, naam = gebruikersnaam, wachtwoord = 'medewerker-wachtwoord'): Promise<Context>`

  In de auth-tests wordt `metTenant(beheerder, …)` vervangen door `transactie(…)`, en de verwachte sessiegebruiker heeft geen `bedrijfId`.
- **Task 6:** `instellingen.ts`, `borden.ts` en `medewerkers.ts` volgens de interfaces hierboven. De tests dekken:
  - instellingen lezen en wijzigen, inclusief de werkdagvalidatie
  - een medewerker krijgt `GeenToegang` bij instellingen, borden en medewerkers
  - gearchiveerde borden alleen tonen met `metGearchiveerd`
  - `haalBord('onzin')` geeft `NietGevonden`
  - medewerker aanmaken met activatie, een dubbele gebruikersnaam geeft `Ongeldig`
  - deactiveren beëindigt de sessies
- **Task 7:** de tests uit de brief zonder bedrijf B. De test "schermt andere bedrijven af" vervalt; daarvoor in de plaats geven `haalTaak`, `wijzigTaak` en `verwijderTaak` op een onbekend uuid `NietGevonden`. De test voor `takenOpDatum` gebruikt twee borden, waarvan er één gearchiveerd wordt.
- **Task 8:** de test "een ander bedrijf…" wordt "onbekende reeks geeft `NietGevonden`", met een geldig maar onbekend uuid (`crypto.randomUUID()`).
- **Task 9:** de weekendtest zet de werkdagen eerst via `zetWerkdagen([1,2,3,4,5,6])` en verwacht dat de taak dan op zaterdag blijft.
- **Task 10:** de sessiegebruiker en `contextVan` volgens het addendum.
- **Task 11:**
  - De beheernavigatie wordt **Instellingen**, **Borden**, **Medewerkers**. `/beheer` stuurt door naar `/beheer/instellingen`.
  - De pagina Instellingen bevat twee panelen: "Garage" (naam, adres van de garage, werkdagen; actie `wijzigInstellingenActie`) en "Wachtwoord wijzigen".
  - Geen pagina Bedrijven. Het formulier voor een nieuw bord heeft alleen een naamveld; de paneeltitels zijn de bordnaam.
  - Het formulier voor een nieuwe medewerker heeft alleen naam en gebruikersnaam.
  - De bordkiezer is een gewone `select` zonder groepen. Bij één bord toont hij alleen de naam, voor iedereen.
  - `TopBalk` krijgt een extra prop `garageNaam`. Het woordmerk toont de garagenaam in plaats van "Takenbord". `(app)/layout.tsx` haalt die op met `haalInstellingen()`.
- **Task 12:** de bordpagina haalt de werkdagen uit `haalInstellingen()`. `weekLabel = \`Week ${n} · ${bord.naam}\``. `takenVoorPeriode(bord.id, …)` heeft geen context meer.
- **Task 13:** de SSE-route controleert het bord met `haalBord(bordId)`. `alle` blijft alleen voor de beheerder.
- **Task 14:** `TaakKaartInhoud` met `toonBord` toont alleen `taak.bordNaam`. De ondertitel wordt "… open taken op alle borden".
- **Task 15:**
  - `maakBedrijfMetMedewerker` wordt `maakMedewerker()`: alleen een gebruiker via SQL, zonder bedrijf. Het bord is het standaardbord uit de migratie.
  - De beheer-e2e-test maakt geen bedrijf aan. In plaats daarvan wijzigt hij in `/beheer/instellingen` de garagenaam naar "Garage Jansen" en verwacht hij "Opgeslagen".
  - Het medewerkerformulier heeft geen bedrijfsveld.
  - De rest van de flow blijft gelijk.
