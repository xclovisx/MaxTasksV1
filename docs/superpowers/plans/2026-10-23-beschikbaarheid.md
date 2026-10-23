# Beschikbaarheid implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De beheerder legt afwezigheidsblokken vast: hele dagen, periodes, tijdvakken, ook terugkerend. Die blokken zijn te zien op het weekbord en op Vandaag. Het taakvenster waarschuwt als iemand een taak in een blok plant.

**Architecture:**
- **Opslag:** één tabel `afwezigheden` met de regel per blok. Welke dagen een blok raakt, wordt bij het tonen uitgerekend met een pure domeinfunctie. Die gebruikt dezelfde herhaalregels als taken (`datumsVoorHerhaling`), maar met alle 7 dagen als werkdag. Er worden geen kopieën opgeslagen.
- **Live bijwerken:** een wijziging seint via het bestaande `bord_wijziging`-kanaal met het id `afwezigheid`, zodat alle borden zich verversen.
- **Toegang:** alleen de beheerder beheert blokken. Iedereen ziet ze.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4, postgres.js 3 (camel-transform), Zod 4, Vitest 4 + Testcontainers, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-beschikbaarheid-design.md`.

## Global Constraints

- **Rechten:** alleen de beheerder maakt, wijzigt en verwijdert blokken (`GeenToegang` voor anderen). Iedere ingelogde gebruiker ziet de blokken en de waarschuwing.
- **Velden van een blok:**
  - **begindatum:** verplicht.
  - **einddatum:** optioneel en ≥ begindatum. Zonder herhaling is het de laatste dag van een periode (leeg betekent alleen de begindatum). Met herhaling is het de laatste dag waarop de reeks geldt (leeg betekent onbeperkt).
  - **Tijd:** een hele dag, of een tijdvak `van < tot` (`HH:MM`).
  - **reden:** optioneel, maximaal 100 tekens, voor iedereen zichtbaar.
  - **herhaling:** optioneel. Dezelfde typen en validatie als bij taken (`herhalingSchema`).
- **Welke dagen een blok raakt:**
  - **Zonder herhaling:** elke dag van begin- tot einddatum.
  - **Met herhaling:** `datumsVoorHerhaling` met werkdagen `[1,2,3,4,5,6,7]`. Een blok schuift dus nooit naar een werkdag, en "dagelijks" betekent elke dag. De einddatum begrenst de reeks.
- **Exacte teksten:**
  - Balk bij een tijdvak: `Max niet beschikbaar · 13:00–15:00 · tandarts`.
  - Balk bij een hele dag: `Max niet beschikbaar (hele dag) · tandarts`. De ` · reden` valt weg zonder reden. "Max" is de naam van de beheerder.
  - Waarschuwing bij een raak (hele dag, of tijd binnen een tijdvak, met van ≤ tijd < tot): `Max is dan niet beschikbaar (tandarts).` Zonder reden: `Max is dan niet beschikbaar.`
  - Waarschuwing zonder tijd, op een dag met tijdvakken: `Let op: Max is die dag van 09:00 tot 10:00 en van 13:00 tot 15:00 niet beschikbaar.`
  - Ongeldige invoer: `De einddatum ligt vóór de begindatum`, `Kies een tijdvak waarbij "van" vóór "tot" ligt`, `Reden is te lang (max 100 tekens)`, en `Blok niet gevonden` voor een onbekend of verwijderd blok.
- **Opslaan blijft mogelijk:** een waarschuwing houdt een taak nooit tegen. Faalt het ophalen van de waarschuwing, dan verschijnt er geen waarschuwing.
- Alle UI-teksten zijn Nederlands. Donker thema met de bestaande kleurtokens en de UI-componenten uit `src/components/ui.tsx`. `cn()` voegt alleen klassen samen en lost geen Tailwind-conflicten op: kies elkaar uitsluitende klassen met een ternary.
- Elke commit-boodschap eindigt met `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- **Werkomgeving:** Windows en Git Bash.
  - Docker en Testcontainers: zet eerst `export PATH="/c/Users/Max/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"`.
  - Installeer geen pakketten.
  - `npm run test:e2e` heeft de dev-Postgres (`maxtasksv1-db-1`, poort 5432) nodig, en er mag geen andere `next dev` in dezelfde map draaien.
- Lees eerst AGENTS.md: deze Next.js-versie wijkt af van je trainingsdata. Lees de relevante gids in `node_modules/next/dist/docs/` voordat je pagina's of server actions schrijft.

---

## Bestandsstructuur

```
migrations/004_afwezigheden.sql                    tabel afwezigheden
src/lib/domein/afwezigheid.ts                      type Afwezigheid, dagenberekening, teksten, waarschuwing
src/lib/domein/validatie.ts                        (wijzigen) afwezigheidSchema, AfwezigheidInvoer
src/lib/db/gebeurtenissen.ts                       (wijzigen) AFWEZIGHEID_SEIN, meldAfwezigheidGewijzigd()
src/app/api/borden/[bordId]/gebeurtenissen/route.ts (wijzigen) seintje afwezigheid naar elk bord
src/lib/diensten/afwezigheden.ts                   lijst, per periode, waarschuwing, maken/wijzigen/verwijderen
src/components/afwezigheid/afwezigheid-balken.tsx  balken voor één dag
src/components/bord/dag-kolom.tsx                  (wijzigen) balken + gedimd bij hele dag
src/components/bord/week-bord.tsx                  (wijzigen) afwezigheid doorgeven
src/app/(app)/bord/[bordId]/page.tsx               (wijzigen) afwezigheid ophalen
src/app/(app)/vandaag/page.tsx                     (wijzigen) balken boven de lijst
src/app/(app)/bord/acties.ts                       (wijzigen) afwezigheidWaarschuwingActie
src/components/bord/taak-dialoog.tsx               (wijzigen) waarschuwing bij dag/tijd
src/app/(app)/beschikbaarheid/acties.ts            beheeracties
src/app/(app)/beschikbaarheid/page.tsx             pagina Beschikbaarheid
src/components/afwezigheid/afwezigheid-formulier.tsx  formulier toevoegen/wijzigen
src/components/afwezigheid/afwezigheid-regel.tsx   regel in de lijst (wijzigen/verwijderen)
src/components/schil/top-balk.tsx                  (wijzigen) link Beschikbaarheid
docker-compose.dev.yml, README.md                  (wijzigen) restart-beleid, uitleg
```

---

### Task 1: Domein en validatie

**Files:**
- Create: `src/lib/domein/afwezigheid.ts`
- Modify: `src/lib/domein/validatie.ts` (afwezigheidSchema achteraan toevoegen)
- Test: `tests/unit/afwezigheid.test.ts` (nieuw)

**Interfaces:**
- Consumes:
  - `datumsVoorHerhaling(regel, van, tot, werkdagen)`, `type HerhalingType` (`src/lib/domein/herhaling.ts`)
  - `type Datum`, `plusDagen`, `weekdag`, `kortDatumLabel`, `DAGNAMEN_KORT` (`src/lib/domein/datums.ts`)
  - `herhalingSchema` (`src/lib/domein/validatie.ts`)
- Produces:
  - `type Afwezigheid = { id: string; begindatum: Datum; einddatum: Datum | null; heleDag: boolean; van: string | null; tot: string | null; reden: string | null; herhalingType: HerhalingType | null; weekdagen: number[]; intervalWeken: number }`
  - `HERHALING_LABELS_AFWEZIG: Record<HerhalingType, string>`
  - `afwezigheidsDagen(a, van, tot): Datum[]`
  - `vergelijkAfwezigheden(a, b): number` (eerst hele dagen, dan op `van`)
  - `tijdvakLabel(a): string`, `balkTekst(naam, a): string`, `periodeTekst(a): string`, `herhalingTekst(a): string`
  - `afwezigheidWaarschuwing(naam, blokken, tijd: string | null): string | null`
  - `afwezigheidSchema` (Zod) en `type AfwezigheidInvoer = z.input<typeof afwezigheidSchema>`. Het geparste resultaat is `{ begindatum, einddatum: Datum | null, heleDag, van: string | null, tot: string | null, reden: string | null, herhaling: { type, weekdagen, intervalWeken } | null }`.

- [ ] **Step 1: Schrijf de falende test**

`tests/unit/afwezigheid.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  type Afwezigheid, afwezigheidsDagen, afwezigheidWaarschuwing, balkTekst, herhalingTekst, periodeTekst, tijdvakLabel,
  vergelijkAfwezigheden,
} from '@/lib/domein/afwezigheid';
import { afwezigheidSchema } from '@/lib/domein/validatie';

const blok = (extra: Partial<Afwezigheid> = {}): Afwezigheid => ({
  id: 'b1', begindatum: '2026-11-02', einddatum: null, heleDag: true, van: null, tot: null, reden: null,
  herhalingType: null, weekdagen: [], intervalWeken: 1, ...extra,
});
const tandarts = blok({ heleDag: false, van: '13:00', tot: '15:00', reden: 'tandarts' });

describe('afwezigheidsdagen', () => {
  it('eenmalig: alleen de begindatum, binnen de periode', () => {
    expect(afwezigheidsDagen(blok(), '2026-11-02', '2026-11-08')).toEqual(['2026-11-02']);
    expect(afwezigheidsDagen(blok(), '2026-11-03', '2026-11-08')).toEqual([]);
  });

  it('een periode zonder herhaling, afgekapt op de gevraagde week', () => {
    expect(afwezigheidsDagen(blok({ begindatum: '2026-10-30', einddatum: '2026-11-04' }), '2026-11-02', '2026-11-08'))
      .toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('wekelijks op zaterdag schuift niet door naar maandag', () => {
    expect(afwezigheidsDagen(blok({ begindatum: '2026-10-31', herhalingType: 'wekelijks' }), '2026-11-02', '2026-11-15'))
      .toEqual(['2026-11-07', '2026-11-14']);
  });

  it('gekozen weekdagen tot en met de einddatum', () => {
    const woensdag = blok({ begindatum: '2026-11-02', einddatum: '2026-11-11', herhalingType: 'weekdagen', weekdagen: [3] });
    expect(afwezigheidsDagen(woensdag, '2026-11-01', '2026-11-30')).toEqual(['2026-11-04', '2026-11-11']);
  });

  it('dagelijks is echt elke dag', () => {
    expect(afwezigheidsDagen(blok({ begindatum: '2026-11-06', herhalingType: 'dagelijks' }), '2026-11-06', '2026-11-09'))
      .toEqual(['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
  });

  it('elke 2 weken vanaf de begindatum', () => {
    const tweewekelijks = blok({ begindatum: '2026-11-02', herhalingType: 'elke_x_weken', intervalWeken: 2 });
    expect(afwezigheidsDagen(tweewekelijks, '2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-16', '2026-11-30']);
  });
});

describe('teksten', () => {
  it('tijdvak, balk en volgorde', () => {
    expect(tijdvakLabel(blok())).toBe('hele dag');
    expect(tijdvakLabel(tandarts)).toBe('13:00–15:00');
    expect(balkTekst('Max', blok({ reden: 'vrij' }))).toBe('Max niet beschikbaar (hele dag) · vrij');
    expect(balkTekst('Max', blok())).toBe('Max niet beschikbaar (hele dag)');
    expect(balkTekst('Max', tandarts)).toBe('Max niet beschikbaar · 13:00–15:00 · tandarts');
    const ochtend = blok({ id: 'b2', heleDag: false, van: '09:00', tot: '10:00' });
    expect([tandarts, ochtend, blok({ id: 'b3' })].sort(vergelijkAfwezigheden).map((b) => b.id)).toEqual(['b3', 'b2', 'b1']);
  });

  it('periode en herhaling voor de lijst', () => {
    expect(periodeTekst(blok())).toBe('ma 2 nov');
    expect(periodeTekst(blok({ begindatum: '2026-10-30', einddatum: '2026-11-04' }))).toBe('vr 30 okt t/m wo 4 nov');
    expect(periodeTekst(blok({ begindatum: '2026-10-31', herhalingType: 'wekelijks' }))).toBe('vanaf za 31 okt');
    expect(periodeTekst(blok({ begindatum: '2026-10-31', einddatum: '2026-11-14', herhalingType: 'wekelijks' }))).toBe('vanaf za 31 okt t/m za 14 nov');
    expect(herhalingTekst(blok())).toBe('Eenmalig');
    expect(herhalingTekst(blok({ herhalingType: 'dagelijks' }))).toBe('Elke dag');
    expect(herhalingTekst(blok({ herhalingType: 'wekelijks' }))).toBe('Wekelijks');
    expect(herhalingTekst(blok({ herhalingType: 'weekdagen', weekdagen: [1, 3] }))).toBe('Op ma, wo');
    expect(herhalingTekst(blok({ herhalingType: 'elke_x_weken', intervalWeken: 3 }))).toBe('Elke 3 weken');
  });

  it('waarschuwt bij een hele dag of een tijd binnen een tijdvak', () => {
    expect(afwezigheidWaarschuwing('Max', [blok({ reden: 'vrij' })], null)).toBe('Max is dan niet beschikbaar (vrij).');
    expect(afwezigheidWaarschuwing('Max', [tandarts], '14:00')).toBe('Max is dan niet beschikbaar (tandarts).');
    expect(afwezigheidWaarschuwing('Max', [tandarts], '13:00')).toBe('Max is dan niet beschikbaar (tandarts).');
    expect(afwezigheidWaarschuwing('Max', [blok({ heleDag: false, van: '13:00', tot: '15:00' })], '14:00')).toBe('Max is dan niet beschikbaar.');
  });

  it('geen waarschuwing buiten het tijdvak; zonder tijd een let-op met alle tijdvakken', () => {
    expect(afwezigheidWaarschuwing('Max', [tandarts], '15:00')).toBeNull();
    expect(afwezigheidWaarschuwing('Max', [], null)).toBeNull();
    const ochtend = blok({ id: 'b2', heleDag: false, van: '09:00', tot: '10:00' });
    expect(afwezigheidWaarschuwing('Max', [tandarts, ochtend], null))
      .toBe('Let op: Max is die dag van 09:00 tot 10:00 en van 13:00 tot 15:00 niet beschikbaar.');
  });
});

describe('afwezigheidSchema', () => {
  it('wist het tijdvak bij een hele dag en maakt een lege reden null', () => {
    expect(afwezigheidSchema.parse({ begindatum: '2026-11-02', heleDag: true, van: '09:00', tot: '10:00', reden: '  ' }))
      .toEqual({ begindatum: '2026-11-02', einddatum: null, heleDag: true, van: null, tot: null, reden: null, herhaling: null });
  });

  it('weigert een einddatum vóór de begindatum en een omgekeerd of ontbrekend tijdvak', () => {
    expect(() => afwezigheidSchema.parse({ begindatum: '2026-11-02', einddatum: '2026-11-01', heleDag: true }))
      .toThrow('De einddatum ligt vóór de begindatum');
    expect(() => afwezigheidSchema.parse({ begindatum: '2026-11-02', heleDag: false, van: '15:00', tot: '13:00' }))
      .toThrow('Kies een tijdvak');
    expect(() => afwezigheidSchema.parse({ begindatum: '2026-11-02', heleDag: false })).toThrow('Kies een tijdvak');
    expect(() => afwezigheidSchema.parse({ begindatum: '2026-11-02', heleDag: true, reden: 'x'.repeat(101) }))
      .toThrow('Reden is te lang');
  });

  it('controleert de herhaling zoals bij taken', () => {
    expect(() => afwezigheidSchema.parse({ begindatum: '2026-11-02', heleDag: true, herhaling: { type: 'weekdagen', weekdagen: [] } }))
      .toThrow('Kies minstens één weekdag');
  });
});
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npx vitest run --project unit tests/unit/afwezigheid.test.ts`
Expected: FAIL (`@/lib/domein/afwezigheid` bestaat niet)

- [ ] **Step 3: Domein**

`src/lib/domein/afwezigheid.ts`:
```ts
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
```

- [ ] **Step 4: Validatie**

Voeg achteraan in `src/lib/domein/validatie.ts` toe (na de bestaande schema's, dus ná `herhalingSchema`):
```ts
export const afwezigheidSchema = z
  .object({
    begindatum: datum,
    einddatum: datum.nullable().default(null),
    heleDag: z.boolean(),
    van: tijd.default(null),
    tot: tijd.default(null),
    reden: z.string().trim().max(100, 'Reden is te lang (max 100 tekens)').nullable().default(null).transform((v) => v || null),
    herhaling: herhalingSchema.nullable().default(null),
  })
  .refine((a) => a.einddatum === null || a.einddatum >= a.begindatum, {
    message: 'De einddatum ligt vóór de begindatum',
    path: ['einddatum'],
  })
  .refine((a) => a.heleDag || (a.van !== null && a.tot !== null && a.van < a.tot), {
    message: 'Kies een tijdvak waarbij "van" vóór "tot" ligt',
    path: ['van'],
  })
  .transform((a) => (a.heleDag ? { ...a, van: null, tot: null } : a));

export type AfwezigheidInvoer = z.input<typeof afwezigheidSchema>;
```
(`datum`, `tijd` en `herhalingSchema` bestaan al bovenin dit bestand; `tijd` is al `.nullable()`.)

- [ ] **Step 5: Draai de tests en zie ze slagen**

Run: `npx vitest run --project unit tests/unit/afwezigheid.test.ts`
Expected: PASS

Run: `npm test` en `npm run typecheck`
Expected: alles groen.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domein/afwezigheid.ts src/lib/domein/validatie.ts tests/unit/afwezigheid.test.ts
git commit -m "feat: domeinregels en validatie voor afwezigheid" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database, dienst en live-seintje

**Files:**
- Create: `migrations/004_afwezigheden.sql`
- Modify: `src/lib/db/gebeurtenissen.ts` (AFWEZIGHEID_SEIN, meldAfwezigheidGewijzigd)
- Modify: `src/app/api/borden/[bordId]/gebeurtenissen/route.ts` (seintje doorgeven)
- Create: `src/lib/diensten/afwezigheden.ts`
- Modify: `tests/integration/helpers.ts` (`leegDatabase` leegt ook `afwezigheden`)
- Test: `tests/integration/afwezigheden.test.ts` (nieuw)

**Interfaces:**
- Consumes:
  - uit Task 1: `type Afwezigheid`, `afwezigheidsDagen`, `vergelijkAfwezigheden`, `afwezigheidWaarschuwing`, `afwezigheidSchema`, `type AfwezigheidInvoer`
  - `db`, `pgIntArray` (`src/lib/db/client.ts`)
  - `KANAAL`, `luisterNaarWijzigingen` (`src/lib/db/gebeurtenissen.ts`)
  - `vereisBeheerder` (`src/lib/diensten/rechten.ts`), `NietGevonden` (`src/lib/fouten.ts`)
  - `isUuid` (`src/lib/domein/validatie.ts`), `isGeldigeDatum` (`src/lib/domein/datums.ts`)
- Produces:
  - `AFWEZIGHEID_SEIN = 'afwezigheid'` en `meldAfwezigheidGewijzigd(): Promise<void>`
  - `type AfwezighedenOverzicht = { naam: string; perDag: Record<Datum, Afwezigheid[]> }`
  - `lijstAfwezigheden(): Promise<Afwezigheid[]>`
  - `afwezighedenInPeriode(van: Datum, tot: Datum): Promise<AfwezighedenOverzicht>`
  - `afwezigheidWaarschuwing(datum: string, tijd: string | null): Promise<string | null>` (in de dienst; importeer de domeinfunctie onder een andere naam)
  - `maakAfwezigheid(ctx, invoer): Promise<{ id: string }>`, `wijzigAfwezigheid(ctx, id, invoer): Promise<void>`, `verwijderAfwezigheid(ctx, id): Promise<void>`

- [ ] **Step 1: Schrijf de falende integratietest**

`tests/integration/afwezigheden.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '../../src/lib/context';
import { luisterNaarWijzigingen } from '../../src/lib/db/gebeurtenissen';
import {
  afwezighedenInPeriode, afwezigheidWaarschuwing, lijstAfwezigheden, maakAfwezigheid, verwijderAfwezigheid, wijzigAfwezigheid,
} from '../../src/lib/diensten/afwezigheden';
import { GeenToegang, NietGevonden } from '../../src/lib/fouten';
import { leegDatabase, maakBeheerderCtx, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;
const tandarts = { begindatum: '2026-11-03', heleDag: false, van: '13:00', tot: '15:00', reden: 'tandarts' };

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  piet = await maakMedewerkerCtx('piet', 'Piet');
});

describe('afwezigheden', () => {
  it('alleen de beheerder beheert blokken', async () => {
    await expect(maakAfwezigheid(piet, tandarts)).rejects.toBeInstanceOf(GeenToegang);
    const { id } = await maakAfwezigheid(beheerder, tandarts);
    await expect(wijzigAfwezigheid(piet, id, tandarts)).rejects.toBeInstanceOf(GeenToegang);
    await expect(verwijderAfwezigheid(piet, id)).rejects.toBeInstanceOf(GeenToegang);
  });

  it('bewaart, wijzigt en verwijdert een blok', async () => {
    const { id } = await maakAfwezigheid(beheerder, { ...tandarts, herhaling: { type: 'weekdagen', weekdagen: [2, 4] } });
    expect(await lijstAfwezigheden()).toEqual([{
      id, begindatum: '2026-11-03', einddatum: null, heleDag: false, van: '13:00', tot: '15:00', reden: 'tandarts',
      herhalingType: 'weekdagen', weekdagen: [2, 4], intervalWeken: 1,
    }]);
    await wijzigAfwezigheid(beheerder, id, { begindatum: '2026-11-03', einddatum: '2026-11-07', heleDag: true, reden: '' });
    expect(await lijstAfwezigheden()).toEqual([{
      id, begindatum: '2026-11-03', einddatum: '2026-11-07', heleDag: true, van: null, tot: null, reden: null,
      herhalingType: null, weekdagen: [], intervalWeken: 1,
    }]);
    await verwijderAfwezigheid(beheerder, id);
    expect(await lijstAfwezigheden()).toEqual([]);
    await expect(verwijderAfwezigheid(beheerder, id)).rejects.toBeInstanceOf(NietGevonden);
    await expect(wijzigAfwezigheid(beheerder, 'geen-uuid', tandarts)).rejects.toBeInstanceOf(NietGevonden);
  });

  it('geeft per dag de blokken met de naam van de beheerder', async () => {
    await maakAfwezigheid(beheerder, tandarts);
    await maakAfwezigheid(beheerder, {
      begindatum: '2026-11-05', heleDag: true, reden: 'vrij', herhaling: { type: 'wekelijks', weekdagen: [], intervalWeken: 1 },
    });
    const { naam, perDag } = await afwezighedenInPeriode('2026-11-02', '2026-11-15');
    expect(naam).toBe('Max');
    expect(Object.keys(perDag).sort()).toEqual(['2026-11-03', '2026-11-05', '2026-11-12']);
    expect(perDag['2026-11-03'].map((b) => b.reden)).toEqual(['tandarts']);
  });

  it('geeft de waarschuwing voor het taakvenster', async () => {
    await maakAfwezigheid(beheerder, tandarts);
    expect(await afwezigheidWaarschuwing('2026-11-03', '14:00')).toBe('Max is dan niet beschikbaar (tandarts).');
    expect(await afwezigheidWaarschuwing('2026-11-03', null)).toBe('Let op: Max is die dag van 13:00 tot 15:00 niet beschikbaar.');
    expect(await afwezigheidWaarschuwing('2026-11-04', '14:00')).toBeNull();
    expect(await afwezigheidWaarschuwing('onzin', '14:00')).toBeNull();
  });

  it('seint alle borden na een wijziging', async () => {
    const ontvangen: string[] = [];
    const stop = await luisterNaarWijzigingen((id) => ontvangen.push(id));
    await maakAfwezigheid(beheerder, tandarts);
    await vi.waitFor(() => expect(ontvangen).toContain('afwezigheid'), { timeout: 3000 });
    await stop();
  });
});
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run (met de Docker-PATH): `npx vitest run --project integratie tests/integration/afwezigheden.test.ts`
Expected: FAIL (`src/lib/diensten/afwezigheden.ts` bestaat niet)

- [ ] **Step 3: Migratie en testhulp**

`migrations/004_afwezigheden.sql`:
```sql
create table afwezigheden (
  id uuid primary key default gen_random_uuid(),
  begindatum date not null,
  einddatum date,
  hele_dag boolean not null,
  van time,
  tot time,
  reden text check (char_length(reden) <= 100),
  herhaling_type text check (herhaling_type in ('dagelijks', 'wekelijks', 'maandelijks', 'weekdagen', 'elke_x_weken')),
  weekdagen int[] not null default '{}' check (weekdagen <@ array[1, 2, 3, 4, 5, 6, 7]),
  interval_weken int not null default 1 check (interval_weken between 1 and 52),
  aangemaakt_door uuid references gebruikers(id) on delete set null,
  aangemaakt_op timestamptz not null default now(),
  constraint afwezigheid_einde check (einddatum is null or einddatum >= begindatum),
  constraint afwezigheid_tijdvak check (
    (hele_dag and van is null and tot is null) or (not hele_dag and van is not null and tot is not null and van < tot)
  )
);
```

In `tests/integration/helpers.ts`, `leegDatabase`: zet `afwezigheden` vooraan in de truncate-lijst:
```ts
  await db()`truncate afwezigheden, taak_historie, taak_stops, taken, herhalingen, borden, sessies, gebruikers, locaties restart identity cascade`;
```

- [ ] **Step 4: Live-seintje**

Voeg toe aan `src/lib/db/gebeurtenissen.ts`:
```ts
/** Id waarmee een wijziging in de beschikbaarheid aan alle borden wordt gemeld. */
export const AFWEZIGHEID_SEIN = 'afwezigheid';

export async function meldAfwezigheidGewijzigd(): Promise<void> {
  await db()`select pg_notify(${KANAAL}, ${AFWEZIGHEID_SEIN})`;
}
```

In `src/app/api/borden/[bordId]/gebeurtenissen/route.ts`:
- Wijzig de import naar `import { AFWEZIGHEID_SEIN, luisterNaarWijzigingen } from '@/lib/db/gebeurtenissen';`.
- Vervang de regel `if (alle || id === bordId) stuur(\`data: ${id}\n\n\`);` door:
```ts
        if (alle || id === bordId || id === AFWEZIGHEID_SEIN) stuur(`data: ${id}\n\n`);
```

- [ ] **Step 5: Dienst**

`src/lib/diensten/afwezigheden.ts`:
```ts
import type { Context } from '../context';
import { db, pgIntArray } from '../db/client';
import { meldAfwezigheidGewijzigd } from '../db/gebeurtenissen';
import {
  type Afwezigheid, afwezigheidsDagen, afwezigheidWaarschuwing as waarschuwingTekst, vergelijkAfwezigheden,
} from '../domein/afwezigheid';
import { type Datum, isGeldigeDatum } from '../domein/datums';
import { afwezigheidSchema, type AfwezigheidInvoer, isUuid } from '../domein/validatie';
import { NietGevonden } from '../fouten';
import { vereisBeheerder } from './rechten';

export type AfwezighedenOverzicht = { naam: string; perDag: Record<Datum, Afwezigheid[]> };

const NIET_GEVONDEN = 'Blok niet gevonden';
const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function lijstAfwezigheden(): Promise<Afwezigheid[]> {
  const rijen = await db()<Afwezigheid[]>`
    select id, begindatum, einddatum, hele_dag, to_char(van, 'HH24:MI') as van, to_char(tot, 'HH24:MI') as tot,
           reden, herhaling_type, weekdagen, interval_weken
    from afwezigheden
    order by begindatum, van nulls first, aangemaakt_op`;
  return rijen.map((r) => ({ ...r }));
}

async function beheerderNaam(): Promise<string> {
  const [g] = await db()<{ naam: string }[]>`select naam from gebruikers where rol = 'beheerder' order by aangemaakt_op limit 1`;
  return g?.naam ?? 'De beheerder';
}

export async function afwezighedenInPeriode(van: Datum, tot: Datum): Promise<AfwezighedenOverzicht> {
  const [naam, blokken] = await Promise.all([beheerderNaam(), lijstAfwezigheden()]);
  const perDag: Record<Datum, Afwezigheid[]> = {};
  for (const b of blokken) {
    for (const d of afwezigheidsDagen(b, van, tot)) (perDag[d] ??= []).push(b);
  }
  for (const lijst of Object.values(perDag)) lijst.sort(vergelijkAfwezigheden);
  return { naam, perDag };
}

/** Invoer komt van de browser: een ongeldige datum geeft geen waarschuwing, een ongeldige tijd telt als "geen tijd". */
export async function afwezigheidWaarschuwing(datum: string, tijd: string | null): Promise<string | null> {
  if (!isGeldigeDatum(datum)) return null;
  const { naam, perDag } = await afwezighedenInPeriode(datum, datum);
  return waarschuwingTekst(naam, perDag[datum] ?? [], tijd && TIJD.test(tijd) ? tijd : null);
}

function herhaalKolommen(h: { type: Afwezigheid['herhalingType'] & string; weekdagen: number[]; intervalWeken: number } | null) {
  return {
    type: h?.type ?? null,
    weekdagen: pgIntArray(h?.type === 'weekdagen' ? h.weekdagen : []),
    interval: h?.type === 'elke_x_weken' ? h.intervalWeken : 1,
  };
}

export async function maakAfwezigheid(ctx: Context, invoer: AfwezigheidInvoer): Promise<{ id: string }> {
  vereisBeheerder(ctx);
  const v = afwezigheidSchema.parse(invoer);
  const h = herhaalKolommen(v.herhaling);
  const [r] = await db()<{ id: string }[]>`
    insert into afwezigheden (begindatum, einddatum, hele_dag, van, tot, reden, herhaling_type, weekdagen, interval_weken, aangemaakt_door)
    values (${v.begindatum}, ${v.einddatum}, ${v.heleDag}, ${v.van}, ${v.tot}, ${v.reden}, ${h.type},
            ${h.weekdagen}::int[], ${h.interval}, ${ctx.gebruikerId})
    returning id`;
  await meldAfwezigheidGewijzigd();
  return { id: r.id };
}

export async function wijzigAfwezigheid(ctx: Context, id: string, invoer: AfwezigheidInvoer): Promise<void> {
  vereisBeheerder(ctx);
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const v = afwezigheidSchema.parse(invoer);
  const h = herhaalKolommen(v.herhaling);
  const rijen = await db()`
    update afwezigheden set
      begindatum = ${v.begindatum}, einddatum = ${v.einddatum}, hele_dag = ${v.heleDag}, van = ${v.van}, tot = ${v.tot},
      reden = ${v.reden}, herhaling_type = ${h.type}, weekdagen = ${h.weekdagen}::int[], interval_weken = ${h.interval}
    where id = ${id}
    returning id`;
  if (rijen.length === 0) throw new NietGevonden(NIET_GEVONDEN);
  await meldAfwezigheidGewijzigd();
}

export async function verwijderAfwezigheid(ctx: Context, id: string): Promise<void> {
  vereisBeheerder(ctx);
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const rijen = await db()`delete from afwezigheden where id = ${id} returning id`;
  if (rijen.length === 0) throw new NietGevonden(NIET_GEVONDEN);
  await meldAfwezigheidGewijzigd();
}
```

- [ ] **Step 6: Draai de tests en zie ze slagen**

Run (met de Docker-PATH): `npx vitest run --project integratie tests/integration/afwezigheden.test.ts`
Expected: PASS (5/5)

Run: `npm run test:integratie`, `npm test`, `npm run typecheck`
Expected: alles groen.

- [ ] **Step 7: Commit**

```bash
git add migrations/004_afwezigheden.sql src/lib/db/gebeurtenissen.ts "src/app/api/borden/[bordId]/gebeurtenissen/route.ts" src/lib/diensten/afwezigheden.ts tests/integration/helpers.ts tests/integration/afwezigheden.test.ts
git commit -m "feat: afwezigheden opslaan en per periode berekenen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Afwezigheid tonen op het bord, op Vandaag en in het taakvenster

**Files:**
- Create: `src/components/afwezigheid/afwezigheid-balken.tsx`
- Modify: `src/components/bord/dag-kolom.tsx`, `src/components/bord/week-bord.tsx`, `src/app/(app)/bord/[bordId]/page.tsx`
- Modify: `src/app/(app)/vandaag/page.tsx`
- Modify: `src/app/(app)/bord/acties.ts` (afwezigheidWaarschuwingActie)
- Modify: `src/components/bord/taak-dialoog.tsx` (waarschuwing)
- Modify: `tests/e2e/helpers.ts` (maakAfwezigheidInDb, verwijderAfwezigheidInDb)
- Test: `tests/e2e/afwezigheid-weergave.spec.ts` (nieuw)

**Interfaces:**
- Consumes:
  - uit Task 1: `type Afwezigheid`, `balkTekst`
  - uit Task 2: `afwezighedenInPeriode(van, tot)`, `type AfwezighedenOverzicht`, `afwezigheidWaarschuwing(datum, tijd)`
  - `Melding` (`soort="info"` geeft `role="status"`)
- Produces:
  - `AfwezigheidBalken({ naam, blokken })`
  - `DagKolom` krijgt de props `afwezig: Afwezigheid[]` en `afwezigNaam: string`
  - `WeekBord` krijgt de prop `afwezigheid: AfwezighedenOverzicht`
  - `afwezigheidWaarschuwingActie(datum: string, tijd: string | null): Promise<ActieResultaat<string | null>>`

- [ ] **Step 1: Schrijf de falende e2e-test**

Voeg toe aan `tests/e2e/helpers.ts` (de import van `maakSql` en `E2E_DATABASE_URL` bestaat al):
```ts
export async function maakAfwezigheidInDb(datum: string, van: string, tot: string, reden: string): Promise<string> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  const [r] = await sql<{ id: string }[]>`
    insert into afwezigheden (begindatum, hele_dag, van, tot, reden) values (${datum}, false, ${van}, ${tot}, ${reden}) returning id`;
  await sql.end();
  return r.id;
}

export async function verwijderAfwezigheidInDb(id: string): Promise<void> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  await sql`delete from afwezigheden where id = ${id}`;
  await sql.end();
}
```

`tests/e2e/afwezigheid-weergave.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { eersteWerkdagVanaf, vandaagInAmsterdam, weekCode } from '../../src/lib/domein/datums';
import { inloggen, maakAfwezigheidInDb, maakMedewerker, verwijderAfwezigheidInDb } from './helpers';

test('medewerker ziet de afwezigheid op het bord en krijgt een waarschuwing bij het inplannen', async ({ page }) => {
  const dag = eersteWerkdagVanaf(vandaagInAmsterdam(), [1, 2, 3, 4, 5]);
  const id = await maakAfwezigheidInDb(dag, '13:00', '15:00', 'tandarts');
  try {
    const mw = await maakMedewerker();
    await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
    await page.waitForURL(/\/bord\//);
    await page.goto(`${new URL(page.url()).pathname}?week=${weekCode(dag)}`);

    const kolom = page.locator(`[data-dag="${dag}"]`);
    await expect(kolom.getByText('Max niet beschikbaar · 13:00–15:00 · tandarts')).toBeVisible();

    await kolom.getByRole('button', { name: /Taak toevoegen/ }).click();
    const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
    await expect(dialoog.getByText('Let op: Max is die dag van 13:00 tot 15:00 niet beschikbaar.')).toBeVisible();
    await dialoog.getByLabel('Tijd (optioneel)').fill('14:00');
    await expect(dialoog.getByText('Max is dan niet beschikbaar (tandarts).')).toBeVisible();
    await dialoog.getByLabel('Tijd (optioneel)').fill('16:00');
    await expect(dialoog.getByText('Max is dan niet beschikbaar (tandarts).')).toBeHidden();
  } finally {
    await verwijderAfwezigheidInDb(id);
  }
});
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run (dev-Postgres draait; geen andere `next dev` in deze map; de migratie 004 wordt door de e2e-setup uitgevoerd): `npx playwright test tests/e2e/afwezigheid-weergave.spec.ts`
Expected: FAIL (geen balk op het bord)

- [ ] **Step 3: Balken en dagkolom**

`src/components/afwezigheid/afwezigheid-balken.tsx`:
```tsx
import { type Afwezigheid, balkTekst } from '@/lib/domein/afwezigheid';

export function AfwezigheidBalken({ naam, blokken }: { naam: string; blokken: Afwezigheid[] }) {
  if (blokken.length === 0) return null;
  return (
    <ul className="mb-2 space-y-1" aria-label="Niet beschikbaar">
      {blokken.map((b) => (
        <li key={b.id} className="rounded-md border border-rand-zacht bg-kaart/70 px-2 py-1 text-xs text-tekst-zacht">
          {balkTekst(naam, b)}
        </li>
      ))}
    </ul>
  );
}
```

In `src/components/bord/dag-kolom.tsx`:
- Imports toevoegen:
```tsx
import { AfwezigheidBalken } from '@/components/afwezigheid/afwezigheid-balken';
import type { Afwezigheid } from '@/lib/domein/afwezigheid';
```
- Props: voeg `afwezig` en `afwezigNaam` toe aan de destructuring en aan het props-type:
```tsx
  afwezig,
  afwezigNaam,
```
```tsx
  afwezig: Afwezigheid[];
  afwezigNaam: string;
```
- Zet bovenin de functie, na `const dagnaam = …`: `const heleDagAfwezig = afwezig.some((b) => b.heleDag);`
- Vervang in de `className` van `<section>` de regel `isVandaag ? 'border-accent/50 bg-paneel' : 'border-rand-zacht bg-paneel/60',` door:
```tsx
        isVandaag ? 'border-accent/50' : 'border-rand-zacht',
        heleDagAfwezig ? 'border-dashed bg-paneel/25' : isVandaag ? 'bg-paneel' : 'bg-paneel/60',
```
- Zet direct na de afsluitende `</header>`: `<AfwezigheidBalken naam={afwezigNaam} blokken={afwezig} />`

In `src/components/bord/week-bord.tsx`:
- Import: `import type { AfwezighedenOverzicht } from '@/lib/diensten/afwezigheden';`
- Voeg aan `WeekBordProps` toe: `afwezigheid: AfwezighedenOverzicht;` en neem `afwezigheid` op in de destructuring van `WeekBord`.
- Geef in de `<DagKolom …>`-aanroep mee:
```tsx
              afwezig={afwezigheid.perDag[d] ?? []}
              afwezigNaam={afwezigheid.naam}
```

In `src/app/(app)/bord/[bordId]/page.tsx`:
- Import: `import { afwezighedenInPeriode } from '@/lib/diensten/afwezigheden';`
- Na `const taken = await takenVoorPeriode(…);`: `const afwezigheid = await afwezighedenInPeriode(maandag, plusDagen(maandag, 6));`
- Geef aan `<WeekBord>` mee: `afwezigheid={afwezigheid}`

- [ ] **Step 4: Vandaag**

In `src/app/(app)/vandaag/page.tsx`:
- Imports:
```tsx
import { AfwezigheidBalken } from '@/components/afwezigheid/afwezigheid-balken';
import { afwezighedenInPeriode } from '@/lib/diensten/afwezigheden';
```
- Vervang `const taken = await takenOpDatum(datum);` door:
```tsx
  const [taken, afwezigheid] = await Promise.all([takenOpDatum(datum), afwezighedenInPeriode(datum, datum)]);
```
- Zet direct vóór `<VandaagLijst …>`: `<AfwezigheidBalken naam={afwezigheid.naam} blokken={afwezigheid.perDag[datum] ?? []} />`

- [ ] **Step 5: Waarschuwing in het taakvenster**

In `src/app/(app)/bord/acties.ts`:
- Import: `import { afwezigheidWaarschuwing } from '@/lib/diensten/afwezigheden';`
- Onderaan:
```ts
export async function afwezigheidWaarschuwingActie(datum: string, tijd: string | null): Promise<ActieResultaat<string | null>> {
  return voerUit(async () => {
    await ctx(); // alleen ingelogde gebruikers
    return afwezigheidWaarschuwing(datum, tijd);
  });
}
```

In `src/components/bord/taak-dialoog.tsx`:
- Voeg `afwezigheidWaarschuwingActie` toe aan de import uit `'@/app/(app)/bord/acties'`.
- State, na de bestaande `useState`-regels: `const [afwezig, setAfwezig] = useState<string | null>(null);`
- Effect, na het bestaande `locatieOverzichtActie`-effect:
```tsx
  // Waarschuw als de beheerder op de gekozen dag/tijd niet beschikbaar is; plannen blijft altijd mogelijk.
  useEffect(() => {
    let actueel = true;
    const timer = setTimeout(() => {
      afwezigheidWaarschuwingActie(datum, tijd || null)
        .then((r) => { if (actueel) setAfwezig(r.ok ? r.data : null); })
        .catch(() => { if (actueel) setAfwezig(null); });
    }, 300);
    return () => {
      actueel = false;
      clearTimeout(timer);
    };
  }, [datum, tijd]);
```
- Zet direct na de `<div className="grid grid-cols-2 gap-3">…</div>` met de velden "Dag" en "Tijd (optioneel)":
```tsx
          {afwezig && <Melding soort="info">{afwezig}</Melding>}
```

- [ ] **Step 6: Draai de tests en zie ze slagen**

Run: `npx playwright test tests/e2e/afwezigheid-weergave.spec.ts tests/e2e/slepen.spec.ts tests/e2e/locaties.spec.ts`
Expected: PASS

Run: `npm run typecheck`, `npm test` en `npx next build`
Expected: groen, de build slaagt.

- [ ] **Step 7: Commit**

```bash
git add src/components/afwezigheid/afwezigheid-balken.tsx src/components/bord/dag-kolom.tsx src/components/bord/week-bord.tsx "src/app/(app)/bord/[bordId]/page.tsx" "src/app/(app)/vandaag/page.tsx" "src/app/(app)/bord/acties.ts" src/components/bord/taak-dialoog.tsx tests/e2e/helpers.ts tests/e2e/afwezigheid-weergave.spec.ts
git commit -m "feat: afwezigheid zichtbaar op bord en Vandaag, waarschuwing bij inplannen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pagina Beschikbaarheid, link, Docker-herstart en README

**Files:**
- Create: `src/app/(app)/beschikbaarheid/acties.ts`
- Create: `src/app/(app)/beschikbaarheid/page.tsx`
- Create: `src/components/afwezigheid/afwezigheid-formulier.tsx`
- Create: `src/components/afwezigheid/afwezigheid-regel.tsx`
- Modify: `src/components/schil/top-balk.tsx` (link voor de beheerder)
- Modify: `docker-compose.dev.yml`, `README.md`
- Test: `tests/e2e/beschikbaarheid.spec.ts` (nieuw)

**Interfaces:**
- Consumes:
  - uit Task 1: `type Afwezigheid`, `HERHALING_LABELS_AFWEZIG`, `periodeTekst`, `tijdvakLabel`, `herhalingTekst`, `type AfwezigheidInvoer`
  - uit Task 2: `lijstAfwezigheden`, `maakAfwezigheid`, `wijzigAfwezigheid`, `verwijderAfwezigheid`
  - `vereisBeheerderSessie`, `contextVan` (`src/lib/web/huidige-gebruiker.ts`), `voerUit`
  - UI: `Invoer`, `Keuzelijst`, `Knop`, `Melding`, `Paneel`, `Veld`
- Produces:
  - `maakAfwezigheidActie(invoer): Promise<ActieResultaat<string>>`, `wijzigAfwezigheidActie(id, invoer): Promise<ActieResultaat>`, `verwijderAfwezigheidActie(id): Promise<ActieResultaat>`
  - de pagina `/beschikbaarheid` met de panelen "Nieuw blok" en "Blokken"

- [ ] **Step 1: Schrijf de falende e2e-test**

`tests/e2e/beschikbaarheid.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { BEHEERDER } from './gegevens';
import { inloggen } from './helpers';

test('beheerder legt een blok vast, past het aan en verwijdert het', async ({ page }) => {
  await inloggen(page, BEHEERDER.gebruikersnaam, BEHEERDER.wachtwoord);
  await page.getByRole('link', { name: 'Beschikbaarheid' }).click();
  await expect(page).toHaveURL(/\/beschikbaarheid$/);

  const nieuw = page.getByRole('region', { name: 'Nieuw blok' });
  await nieuw.getByLabel('Begindatum').fill('2030-01-07');
  await nieuw.getByLabel('Hele dag').uncheck();
  await nieuw.getByLabel('Van', { exact: true }).fill('09:00');
  await nieuw.getByLabel('Tot', { exact: true }).fill('10:30');
  await nieuw.getByLabel('Reden').fill('e2e-overleg');
  await nieuw.getByLabel('Herhalen').selectOption('wekelijks');
  await nieuw.getByRole('button', { name: 'Blok toevoegen' }).click();

  const blokken = page.getByRole('region', { name: 'Blokken' });
  const regel = blokken.getByRole('listitem').filter({ hasText: 'e2e-overleg' });
  await expect(regel).toContainText('vanaf ma 7 jan');
  await expect(regel).toContainText('09:00–10:30');
  await expect(regel).toContainText('Wekelijks');

  await regel.getByRole('button', { name: 'Wijzigen' }).click();
  await blokken.getByLabel('Reden').fill('e2e-overleg-2');
  await blokken.getByRole('button', { name: 'Opslaan' }).click();
  await expect(blokken.getByText('e2e-overleg-2')).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await blokken.getByRole('listitem').filter({ hasText: 'e2e-overleg-2' }).getByRole('button', { name: 'Verwijderen' }).click();
  await expect(blokken.getByText('e2e-overleg-2')).toHaveCount(0);
});
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npx playwright test tests/e2e/beschikbaarheid.spec.ts`
Expected: FAIL (er is geen link "Beschikbaarheid")

- [ ] **Step 3: Server actions**

`src/app/(app)/beschikbaarheid/acties.ts`:
```ts
'use server';

import { maakAfwezigheid, verwijderAfwezigheid, wijzigAfwezigheid } from '@/lib/diensten/afwezigheden';
import type { AfwezigheidInvoer } from '@/lib/domein/validatie';
import { type ActieResultaat, voerUit } from '@/lib/web/actie';
import { contextVan, vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

async function ctx() {
  return contextVan(await vereisBeheerderSessie());
}

export async function maakAfwezigheidActie(invoer: AfwezigheidInvoer): Promise<ActieResultaat<string>> {
  return voerUit(async () => (await maakAfwezigheid(await ctx(), invoer)).id);
}

export async function wijzigAfwezigheidActie(id: string, invoer: AfwezigheidInvoer): Promise<ActieResultaat> {
  return voerUit(async () => {
    await wijzigAfwezigheid(await ctx(), id, invoer);
    return null;
  });
}

export async function verwijderAfwezigheidActie(id: string): Promise<ActieResultaat> {
  return voerUit(async () => {
    await verwijderAfwezigheid(await ctx(), id);
    return null;
  });
}
```

- [ ] **Step 4: Formulier en regel**

`src/components/afwezigheid/afwezigheid-formulier.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { maakAfwezigheidActie, wijzigAfwezigheidActie } from '@/app/(app)/beschikbaarheid/acties';
import { Invoer, Keuzelijst, Knop, Melding, Veld } from '@/components/ui';
import { cn } from '@/lib/cn';
import { type Afwezigheid, HERHALING_LABELS_AFWEZIG } from '@/lib/domein/afwezigheid';
import { DAGNAMEN_KORT, type Datum, weekdag } from '@/lib/domein/datums';
import type { HerhalingType } from '@/lib/domein/herhaling';

type Herhalen = 'geen' | HerhalingType;

/** Zonder `begin` voegt het formulier een blok toe; met `begin` wijzigt het dat blok. */
export function AfwezigheidFormulier({
  begin,
  standaardDatum,
  onKlaar,
}: {
  begin: Afwezigheid | null;
  standaardDatum: Datum;
  onKlaar?: () => void;
}) {
  const router = useRouter();
  const [begindatum, setBegindatum] = useState<Datum>(begin?.begindatum ?? standaardDatum);
  const [einddatum, setEinddatum] = useState(begin?.einddatum ?? '');
  const [heleDag, setHeleDag] = useState(begin?.heleDag ?? true);
  const [van, setVan] = useState(begin?.van ?? '');
  const [tot, setTot] = useState(begin?.tot ?? '');
  const [reden, setReden] = useState(begin?.reden ?? '');
  const [herhalen, setHerhalen] = useState<Herhalen>(begin?.herhalingType ?? 'geen');
  const [weekdagen, setWeekdagen] = useState<number[]>(
    begin?.weekdagen.length ? begin.weekdagen : [weekdag(begin?.begindatum ?? standaardDatum)],
  );
  const [intervalWeken, setIntervalWeken] = useState(Math.max(2, begin?.intervalWeken ?? 2));
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, start] = useTransition();

  function opslaan(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    const invoer = {
      begindatum,
      einddatum: einddatum || null,
      heleDag,
      van: heleDag ? null : van || null,
      tot: heleDag ? null : tot || null,
      reden,
      herhaling: herhalen === 'geen'
        ? null
        : {
          type: herhalen,
          weekdagen: herhalen === 'weekdagen' ? weekdagen : [],
          intervalWeken: herhalen === 'elke_x_weken' ? intervalWeken : 1,
        },
    };
    start(async () => {
      const r = begin ? await wijzigAfwezigheidActie(begin.id, invoer) : await maakAfwezigheidActie(invoer);
      if (!r.ok) {
        setFout(r.fout);
        return;
      }
      if (!begin) {
        setEinddatum('');
        setHeleDag(true);
        setVan('');
        setTot('');
        setReden('');
        setHerhalen('geen');
      }
      onKlaar?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={opslaan} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Veld label="Begindatum">
          <Invoer type="date" value={begindatum} onChange={(e) => setBegindatum(e.target.value)} required />
        </Veld>
        <Veld label="Einddatum (optioneel)" hint={herhalen === 'geen' ? 'Leeg: alleen de begindatum' : 'Leeg: blijft doorgaan'}>
          <Invoer type="date" value={einddatum} min={begindatum} onChange={(e) => setEinddatum(e.target.value)} />
        </Veld>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={heleDag} onChange={(e) => setHeleDag(e.target.checked)} className="size-4 accent-accent" />
        Hele dag
      </label>
      {!heleDag && (
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Van"><Invoer type="time" value={van} onChange={(e) => setVan(e.target.value)} required /></Veld>
          <Veld label="Tot"><Invoer type="time" value={tot} onChange={(e) => setTot(e.target.value)} required /></Veld>
        </div>
      )}
      <Veld label="Reden (optioneel)" hint="Zichtbaar voor iedereen">
        <Invoer value={reden} onChange={(e) => setReden(e.target.value)} maxLength={100} />
      </Veld>
      <Veld label="Herhalen">
        <Keuzelijst value={herhalen} onChange={(e) => setHerhalen(e.target.value as Herhalen)}>
          <option value="geen">Niet herhalen</option>
          {(Object.keys(HERHALING_LABELS_AFWEZIG) as HerhalingType[]).map((h) => (
            <option key={h} value={h}>{HERHALING_LABELS_AFWEZIG[h]}</option>
          ))}
        </Keuzelijst>
      </Veld>
      {herhalen === 'weekdagen' && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekdagen">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={weekdagen.includes(d)}
              onClick={() => setWeekdagen((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort((a, b) => a - b)))}
              className={cn(
                'h-8 w-10 rounded-lg border text-xs',
                weekdagen.includes(d) ? 'border-accent bg-accent/15 text-tekst' : 'border-rand text-tekst-zacht',
              )}
            >
              {DAGNAMEN_KORT[d]}
            </button>
          ))}
        </div>
      )}
      {herhalen === 'elke_x_weken' && (
        <Veld label="Om de hoeveel weken?">
          <Invoer type="number" min={2} max={52} value={intervalWeken} onChange={(e) => setIntervalWeken(Number(e.target.value))} className="w-24" />
        </Veld>
      )}
      {fout && <Melding>{fout}</Melding>}
      <div className="flex gap-2">
        <Knop type="submit" disabled={bezig}>{bezig ? 'Bezig…' : begin ? 'Opslaan' : 'Blok toevoegen'}</Knop>
        {onKlaar && <Knop variant="secundair" onClick={onKlaar}>Annuleren</Knop>}
      </div>
    </form>
  );
}
```

`src/components/afwezigheid/afwezigheid-regel.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { verwijderAfwezigheidActie } from '@/app/(app)/beschikbaarheid/acties';
import { Knop, Melding } from '@/components/ui';
import { type Afwezigheid, herhalingTekst, periodeTekst, tijdvakLabel } from '@/lib/domein/afwezigheid';
import { AfwezigheidFormulier } from './afwezigheid-formulier';

export function AfwezigheidRegel({ blok }: { blok: Afwezigheid }) {
  const router = useRouter();
  const [bewerken, setBewerken] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, start] = useTransition();

  if (bewerken) {
    return (
      <li className="py-3">
        <AfwezigheidFormulier begin={blok} standaardDatum={blok.begindatum} onKlaar={() => setBewerken(false)} />
      </li>
    );
  }

  function verwijder() {
    if (!confirm('Dit blok verwijderen?')) return;
    start(async () => {
      const r = await verwijderAfwezigheidActie(blok.id);
      if (!r.ok) setFout(r.fout);
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium">{periodeTekst(blok)} · {tijdvakLabel(blok)}</p>
        <p className="text-xs text-tekst-flauw">{herhalingTekst(blok)}{blok.reden ? ` · ${blok.reden}` : ''}</p>
        {fout && <Melding>{fout}</Melding>}
      </div>
      <Knop variant="secundair" onClick={() => setBewerken(true)}>Wijzigen</Knop>
      <Knop variant="gevaar" onClick={verwijder} disabled={bezig}>Verwijderen</Knop>
    </li>
  );
}
```

- [ ] **Step 5: Pagina en link**

`src/app/(app)/beschikbaarheid/page.tsx`:
```tsx
import { AfwezigheidFormulier } from '@/components/afwezigheid/afwezigheid-formulier';
import { AfwezigheidRegel } from '@/components/afwezigheid/afwezigheid-regel';
import { Paneel } from '@/components/ui';
import { lijstAfwezigheden } from '@/lib/diensten/afwezigheden';
import { vandaagInAmsterdam } from '@/lib/domein/datums';
import { vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

export default async function BeschikbaarheidPagina() {
  await vereisBeheerderSessie();
  const blokken = await lijstAfwezigheden();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Beschikbaarheid</h1>
        <p className="text-sm text-tekst-zacht">
          Geef aan wanneer je niet beschikbaar bent. Collega&apos;s zien dit op het bord en krijgen een waarschuwing bij het inplannen.
        </p>
      </div>
      <Paneel titel="Nieuw blok">
        <AfwezigheidFormulier begin={null} standaardDatum={vandaagInAmsterdam()} />
      </Paneel>
      <Paneel titel="Blokken">
        {blokken.length === 0 ? (
          <p className="text-sm text-tekst-zacht">Nog geen blokken.</p>
        ) : (
          <ul className="divide-y divide-rand-zacht">
            {blokken.map((b) => <AfwezigheidRegel key={b.id} blok={b} />)}
          </ul>
        )}
      </Paneel>
    </div>
  );
}
```

In `src/components/schil/top-balk.tsx` zet je binnen het beheerdersfragment, tussen de links "Vandaag" en "Beheer":
```tsx
              <Link href="/beschikbaarheid" className={NAV}>Beschikbaarheid</Link>
```

- [ ] **Step 6: Docker-herstart en README**

In `docker-compose.dev.yml`: zet onder `db:` (op hetzelfde niveau als `image:`) de regel:
```yaml
    restart: unless-stopped
```

In `README.md`:
- Voeg onder "## Vereisten", na de regel over Docker Desktop, toe:
  `- Tip: zet in Docker Desktop "Start Docker Desktop when you sign in" aan. De database start dan vanzelf mee (\`restart: unless-stopped\`).`
- Voeg vóór "## Google (adressen zoeken en route plannen)" een sectie toe:
```markdown
## Beschikbaarheid

Onder **Beschikbaarheid** (alleen voor de beheerder) leg je vast wanneer je niet beschikbaar bent. Dat kan een hele dag zijn, een periode of een tijdvak, eenmalig of terugkerend. Collega's zien een balk op het bord, en het taakvenster waarschuwt als ze in zo'n blok plannen. Opslaan blijft mogelijk.
```

- [ ] **Step 7: Draai de tests en zie ze slagen**

Run (dev-Postgres draait; geen andere `next dev` in deze map): `npm run test:e2e`
Expected: alle e2e-tests PASS.

Run: `npm run typecheck`, `npm test`, `npm run test:integratie` (met de Docker-PATH) en `npx next build`
Expected: alles groen.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/beschikbaarheid/acties.ts" "src/app/(app)/beschikbaarheid/page.tsx" src/components/afwezigheid/afwezigheid-formulier.tsx src/components/afwezigheid/afwezigheid-regel.tsx src/components/schil/top-balk.tsx docker-compose.dev.yml README.md tests/e2e/beschikbaarheid.spec.ts
git commit -m "feat: pagina Beschikbaarheid om afwezigheid te beheren" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
