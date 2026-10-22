# Garage Takenbord: fase 1 (kern) implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een werkend takenbord in Trello-stijl. Elk bedrijf heeft zijn eigen afgeschermde data. Er zijn accounts met activatielinks, een weekbord met prioriteit, status, slepen, doorschuiven en herhalingen, live bijwerken, een adminpaneel en een "Vandaag"-overzicht voor de beheerder.

**Architecture:** Een Next.js-app (App Router) praat met PostgreSQL via postgres.js en handgeschreven SQL. De scheiding per bedrijf wordt in de database afgedwongen met Row Level Security: elke transactie voor een gebruiker zet `app.rol` en `app.bedrijf_id` en schakelt naar de rol `takenbord_app`. Pure domeinlogica (datums, herhalingen, doorschuiven, sortering) staat los van de database en is met unit-tests gedekt. Een apart worker-proces doet de nachtelijke taken. Live bijwerken loopt via Postgres `LISTEN/NOTIFY`, daarna Server-Sent Events, daarna `router.refresh()`.

**Tech Stack:** Node 24 LTS, Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, postgres.js 3, Zod 4, @node-rs/argon2, @dnd-kit/core 6, node-cron 4, Vitest 4, Testcontainers (PostgreSQL 16), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md`. Dit plan dekt fase 1 uit §12. Locaties, Google, routes, ntfy en de productie-uitrol volgen in aparte plannen.

## Global Constraints

- Node.js **24 LTS** (Next 16 vereist ≥ 20.9). PostgreSQL **16** (`postgres:16-alpine`).
- Alle datumlogica in tijdzone **`Europe/Amsterdam`**. Datums zijn in code altijd strings `YYYY-MM-DD` (type `Datum`), tijden strings `HH:MM`.
- Alle UI-teksten zijn **Nederlands**. Code-identifiers zijn Nederlands waar het domein betreft (`taak`, `bord`, `bedrijf`, `medewerker`).
- Prioriteiten exact: `laag | middel | hoog | zsm | nu`, met labels `Laag`, `Middel`, `Hoog`, `Zo snel mogelijk`, `Nu`. Statussen exact: `open | bezig | klaar`.
- Werkdagen zijn getallen `1=ma … 7=zo`. De standaard is `{1,2,3,4,5}`.
- Wachtwoord minimaal **8** tekens. Na **5** mislukte pogingen volgt **15 minuten** blokkade. Een sessie is **30 dagen** geldig. Activatielink en -code zijn **48 uur** geldig, de code heeft **6 cijfers**.
- Herhalingen worden **14 dagen** vooruit aangemaakt.
- Alleen de beheerder mag de status wijzigen. Medewerkers mogen alle taken van hun eigen bedrijf aanmaken, wijzigen, verplaatsen en verwijderen.
- Donker thema met de kleurtokens uit Task 10. Lettertype: IBM Plex Sans.
- Elke commit-boodschap eindigt met de regel `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (staat in elk commit-commando als tweede `-m`).
- Alle commando's draaien vanuit de projectroot (de worktree). Shell: Git Bash.

---

## Bestandsstructuur

```
docker-compose.dev.yml            PostgreSQL voor lokaal ontwikkelen + e2e-database
docker/initdb/01-e2e.sql          maakt database takenbord_e2e
migrations/001_basis.sql          tabellen, view, indexen
migrations/002_rls.sql            rol takenbord_app, grants, RLS-policies
src/lib/cn.ts                     classnames-helper
src/lib/fouten.ts                 Fout, NietGevonden, GeenToegang, Conflict, Ongeldig
src/lib/domein/datums.ts          pure datumfuncties (Datum = 'YYYY-MM-DD')
src/lib/domein/herhaling.ts       datumsVoorHerhaling()
src/lib/domein/doorschuiven.ts    planDoorschuiven()
src/lib/domein/taak.ts            types Prioriteit/Status, sortering, labels
src/lib/domein/validatie.ts       Zod-schema's (gedeeld door diensten en formulieren)
src/lib/db/client.ts              postgres.js-verbinding (lui), types Db/Tx
src/lib/db/migreer.ts             migratierunner
src/lib/db/tenant.ts              metTenant(ctx, fn) + Context-type
src/lib/db/gebeurtenissen.ts      meldWijziging() / luisterNaarWijzigingen()
src/lib/auth/wachtwoord.ts        argon2 hash/verify
src/lib/auth/tokens.ts            tokens, codes, sha256
src/lib/auth/sessies.ts           sessies aanmaken/lezen/verwijderen
src/lib/auth/inloggen.ts          inloggen met blokkade
src/lib/auth/activatie.ts         activatie uitgeven/gebruiken
src/lib/auth/accounts.ts          maakBeheerder(), wijzigEigenWachtwoord()
src/lib/diensten/bedrijven.ts     bedrijven (beheer)
src/lib/diensten/borden.ts        borden
src/lib/diensten/medewerkers.ts   medewerkers + activatie
src/lib/diensten/herhalingen.ts   reeksen aanmaken/genereren/wijzigen/stoppen
src/lib/diensten/taken.ts         taken lezen/aanmaken/wijzigen/verplaatsen/status/verwijderen/historie
src/lib/web/sessie-cookie.ts      cookie lezen/zetten (next/headers)
src/lib/web/huidige-gebruiker.ts  huidigeGebruiker(), vereisGebruiker(), vereisBeheerderSessie(), contextVan()
src/lib/web/actie.ts              ActieResultaat + voerUit()
src/worker/taken/doorschuiven.ts  nachtjob doorschuiven
src/worker/taken/herhalingen.ts   nachtjob herhalingen
src/worker/index.ts               cron + inhalen bij start
src/scripts/migreer.ts            CLI: migraties draaien
src/scripts/maak-beheerder.ts     CLI: eerste beheerder
src/components/ui.tsx             Knop, Veld, Invoer, Tekstvak, Keuzelijst, Paneel, Melding
src/components/iconen.tsx         kleine SVG-iconen
src/components/actie-formulier.tsx  generiek formulier dat een server action aanroept
src/components/auth/*             AuthKader, InlogFormulier, WachtwoordFormulier
src/components/schil/*            TopBalk, BordKiezer
src/components/bord/*             WeekBord, DagKolom, TaakKaart, TaakDialoog, LiveVernieuwen, stijl
src/components/beheer/*           BeheerNav, MedewerkerActies, ActivatieKaart
src/app/...                       routes (zie taken)
tests/unit/*                      Vitest, pure functies
tests/integration/*               Vitest + Testcontainers PostgreSQL
tests/e2e/*                       Playwright
```

---

### Task 0: Ontwikkelomgeving voorbereiden (handmatig, door Max)

Deze taak is geen code. De uitvoerder controleert alleen of alles klaarstaat, en stopt en meldt het als dat niet zo is.

- [ ] **Step 1: Node 24 LTS installeren.** Download van https://nodejs.org (LTS, Windows Installer). Daarna een nieuwe terminal openen.

- [ ] **Step 2: Docker Desktop installeren en starten.** Download van https://www.docker.com/products/docker-desktop/ en kies de WSL2-backend.

- [ ] **Step 3: Controleren**

Run: `node -v && docker version --format '{{.Server.Version}}' && docker compose version`
Expected: `v24.x.x`, een Docker-serverversie en `Docker Compose version v2.x`. Bij een fout: stoppen en melden.

---

### Task 1: Projectopzet en datumhulpen

**Files:**
- Create: `package.json` (via npm), `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`, `docker-compose.dev.yml`, `docker/initdb/01-e2e.sql`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` (tijdelijk minimaal, Task 10 maakt ze af)
- Create: `src/lib/domein/datums.ts`, `src/lib/cn.ts`
- Modify: `.gitignore`
- Test: `tests/unit/datums.test.ts`

**Interfaces:**
- Produces (`src/lib/domein/datums.ts`):
  - `type Datum = string`
  - `plusDagen(d: Datum, n: number): Datum`
  - `weekdag(d: Datum): number` (1=ma … 7=zo)
  - `verschilInDagen(van: Datum, tot: Datum): number` (tot − van)
  - `maandagVan(d: Datum): Datum`
  - `eersteWerkdagVanaf(d: Datum, werkdagen: number[]): Datum`
  - `vandaagInAmsterdam(nu?: Date): Datum`
  - `isoWeek(d: Datum): { jaar: number; week: number }`
  - `weekCode(d: Datum): string` (bijv. `2026-W43`)
  - `parseWeekCode(code: string): Datum | null` (geeft de maandag)
  - `laatsteDagVanMaand(jaar: number, maand: number): number` (maand 1–12)
  - `DAGNAMEN: string[]`, `DAGNAMEN_KORT: string[]` (index = weekdag, index 0 leeg)
  - `kortDatumLabel(d: Datum): string` (bijv. `22 okt`)
  - `formatMoment(m: Date): string` (bijv. `22 okt 2026, 14:05`)
- Produces (`src/lib/cn.ts`): `cn(...k: (string | false | null | undefined)[]): string`

- [ ] **Step 1: Pakketten installeren**

```bash
npm init -y
npm pkg delete main scripts.test keywords author license description
npm install next@16 react@19 react-dom@19 postgres@3 zod@4 @node-rs/argon2@2 @dnd-kit/core@6 node-cron@4 tsx@4
npm install -D typescript@5 @types/node@24 @types/react@19 @types/react-dom@19 tailwindcss@4 @tailwindcss/postcss@4 vitest@4 @testcontainers/postgresql@12 @playwright/test@1
npm pkg set name=garage-takenbord
npm pkg set private=true --json
npm pkg set scripts.dev="next dev" scripts.build="next build" scripts.start="next start" scripts.typecheck="tsc --noEmit" scripts.test="vitest run --project unit" scripts.test:integratie="vitest run --project integratie" scripts.test:e2e="playwright test" scripts.db:migreer="tsx --env-file=.env src/scripts/migreer.ts" scripts.maak-beheerder="tsx --env-file=.env src/scripts/maak-beheerder.ts" scripts.worker="tsx --env-file=.env src/worker/index.ts"
```

(`--json` zorgt dat `private` een boolean wordt.)

- [ ] **Step 2: Configuratiebestanden schrijven**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".claude", ".superpowers"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@node-rs/argon2'],
  output: 'standalone',
};

export default config;
```

`postcss.config.mjs`:
```js
export default { plugins: { '@tailwindcss/postcss': {} } };
```

`vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'integratie',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/global-setup.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
```

`.env.example`:
```
DATABASE_URL=postgres://takenbord:takenbord@localhost:5432/takenbord
APP_URL=http://localhost:3000
```

`docker-compose.dev.yml`:
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: takenbord
      POSTGRES_PASSWORD: takenbord
      POSTGRES_DB: takenbord
    ports:
      - "5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
      - ./docker/initdb:/docker-entrypoint-initdb.d:ro
volumes:
  db-data:
```

`docker/initdb/01-e2e.sql`:
```sql
create database takenbord_e2e;
```

`.gitignore` (volledige inhoud):
```
node_modules/
.next/
next-env.d.ts
.env
.superpowers/
.impeccable/
.claude/worktrees/
*.tsbuildinfo
test-results/
playwright-report/
```

Minimale app-bestanden, zodat `next build` werkt (Task 10 vervangt ze):

`src/app/globals.css`:
```css
@import "tailwindcss";
```

`src/app/layout.tsx`:
```tsx
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return <main>Takenbord</main>;
}
```

`src/lib/cn.ts`:
```ts
export function cn(...klassen: (string | false | null | undefined)[]): string {
  return klassen.filter(Boolean).join(' ');
}
```

- [ ] **Step 3: De falende test voor datumhulpen schrijven**

`tests/unit/datums.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  eersteWerkdagVanaf, isoWeek, kortDatumLabel, laatsteDagVanMaand, maandagVan, parseWeekCode,
  plusDagen, vandaagInAmsterdam, verschilInDagen, weekCode, weekdag,
} from '@/lib/domein/datums';

const WERKWEEK = [1, 2, 3, 4, 5];

describe('datums', () => {
  it('telt dagen op over maand- en jaargrenzen', () => {
    expect(plusDagen('2026-10-31', 1)).toBe('2026-11-01');
    expect(plusDagen('2026-12-31', 1)).toBe('2027-01-01');
    expect(plusDagen('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('geeft de weekdag met 1=ma en 7=zo', () => {
    expect(weekdag('2026-10-19')).toBe(1);
    expect(weekdag('2026-10-22')).toBe(4);
    expect(weekdag('2026-10-25')).toBe(7);
  });

  it('berekent het verschil in dagen (tot − van)', () => {
    expect(verschilInDagen('2026-10-19', '2026-10-22')).toBe(3);
    expect(verschilInDagen('2026-10-22', '2026-10-19')).toBe(-3);
    expect(verschilInDagen('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('vindt de maandag van een week', () => {
    expect(maandagVan('2026-10-22')).toBe('2026-10-19');
    expect(maandagVan('2026-10-25')).toBe('2026-10-19');
    expect(maandagVan('2026-10-19')).toBe('2026-10-19');
  });

  it('vindt de eerste werkdag op of na een datum', () => {
    expect(eersteWerkdagVanaf('2026-10-24', WERKWEEK)).toBe('2026-10-26');
    expect(eersteWerkdagVanaf('2026-10-22', WERKWEEK)).toBe('2026-10-22');
    expect(eersteWerkdagVanaf('2026-10-24', [1, 2, 3, 4, 5, 6])).toBe('2026-10-24');
    expect(() => eersteWerkdagVanaf('2026-10-24', [])).toThrow();
  });

  it('bepaalt vandaag in Amsterdam, ook rond middernacht', () => {
    expect(vandaagInAmsterdam(new Date('2026-10-21T22:30:00Z'))).toBe('2026-10-22');
    expect(vandaagInAmsterdam(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(vandaagInAmsterdam(new Date('2026-10-22T10:00:00Z'))).toBe('2026-10-22');
  });

  it('rekent ISO-weken uit en terug', () => {
    expect(isoWeek('2026-10-22')).toEqual({ jaar: 2026, week: 43 });
    expect(isoWeek('2027-01-01')).toEqual({ jaar: 2026, week: 53 });
    expect(weekCode('2026-10-22')).toBe('2026-W43');
    expect(parseWeekCode('2026-W43')).toBe('2026-10-19');
    expect(parseWeekCode('2026-W01')).toBe('2025-12-29');
    expect(parseWeekCode('onzin')).toBeNull();
    expect(parseWeekCode('2026-W54')).toBeNull();
  });

  it('kent de laatste dag van de maand', () => {
    expect(laatsteDagVanMaand(2026, 2)).toBe(28);
    expect(laatsteDagVanMaand(2028, 2)).toBe(29);
    expect(laatsteDagVanMaand(2026, 4)).toBe(30);
  });

  it('maakt een kort datumlabel', () => {
    expect(kortDatumLabel('2026-10-22')).toBe('22 okt');
    expect(kortDatumLabel('2026-03-01')).toBe('1 mrt');
  });
});
```

- [ ] **Step 4: Test draaien en zien falen**

Run: `npx vitest run --project unit tests/unit/datums.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/domein/datums"`.

- [ ] **Step 5: Implementatie schrijven**

`src/lib/domein/datums.ts`:
```ts
export type Datum = string; // 'YYYY-MM-DD'

const DAG_MS = 86_400_000;
const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const DAGNAMEN = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
export const DAGNAMEN_KORT = ['', 'ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

function naarUtc(d: Datum): number {
  const [j, m, dag] = d.split('-').map(Number);
  return Date.UTC(j, m - 1, dag);
}

function vanUtc(ms: number): Datum {
  return new Date(ms).toISOString().slice(0, 10);
}

export function plusDagen(d: Datum, n: number): Datum {
  return vanUtc(naarUtc(d) + n * DAG_MS);
}

export function weekdag(d: Datum): number {
  const w = new Date(naarUtc(d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export function verschilInDagen(van: Datum, tot: Datum): number {
  return Math.round((naarUtc(tot) - naarUtc(van)) / DAG_MS);
}

export function maandagVan(d: Datum): Datum {
  return plusDagen(d, 1 - weekdag(d));
}

export function eersteWerkdagVanaf(d: Datum, werkdagen: number[]): Datum {
  if (werkdagen.length === 0) throw new Error('Geen werkdagen ingesteld');
  let x = d;
  while (!werkdagen.includes(weekdag(x))) x = plusDagen(x, 1);
  return x;
}

export function vandaagInAmsterdam(nu: Date = new Date()): Datum {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(nu);
}

export function isoWeek(d: Datum): { jaar: number; week: number } {
  const donderdag = plusDagen(d, 4 - weekdag(d));
  const jaar = Number(donderdag.slice(0, 4));
  const week = Math.floor(verschilInDagen(`${jaar}-01-01`, donderdag) / 7) + 1;
  return { jaar, week };
}

export function weekCode(d: Datum): string {
  const { jaar, week } = isoWeek(d);
  return `${jaar}-W${String(week).padStart(2, '0')}`;
}

export function parseWeekCode(code: string): Datum | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(code);
  if (!m) return null;
  const jaar = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > isoWeek(`${jaar}-12-28`).week) return null;
  return plusDagen(maandagVan(`${jaar}-01-04`), (week - 1) * 7);
}

export function laatsteDagVanMaand(jaar: number, maand: number): number {
  return new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
}

export function kortDatumLabel(d: Datum): string {
  return `${Number(d.slice(8, 10))} ${MAANDEN_KORT[Number(d.slice(5, 7)) - 1]}`;
}

export function formatMoment(m: Date): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(m);
}
```

(`isoWeek('YYYY-12-28').week` is altijd het aantal ISO-weken van dat jaar, dus `2026-W53` is geldig en `2026-W54` niet.)

- [ ] **Step 6: Tests en build draaien**

Run: `npx vitest run --project unit`
Expected: PASS (9 tests).

Run: `npm run typecheck && npm run build`
Expected: geen typefouten. De build eindigt met `✓ Compiled successfully` (of gelijkwaardig) en een routelijst met `/`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: projectopzet en datumhulpen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Herhalingsregels

**Files:**
- Create: `src/lib/domein/herhaling.ts`
- Test: `tests/unit/herhaling.test.ts`

**Interfaces:**
- Consumes: `Datum`, `plusDagen`, `weekdag`, `verschilInDagen`, `eersteWerkdagVanaf`, `laatsteDagVanMaand` uit `datums.ts`
- Produces:
  - `type HerhalingType = 'dagelijks' | 'wekelijks' | 'maandelijks' | 'weekdagen' | 'elke_x_weken'`
  - `type HerhalingRegel = { type: HerhalingType; weekdagen: number[]; intervalWeken: number; startdatum: Datum }`
  - `datumsVoorHerhaling(regel: HerhalingRegel, van: Datum, tot: Datum, werkdagen: number[]): Datum[]` geeft een oplopende, unieke lijst binnen `[max(van, startdatum), tot]`
  - `HERHALING_LABELS: Record<HerhalingType, string>`

Regels (spec §7.4):
- `dagelijks`: elke datum waarvan de weekdag in `werkdagen` zit.
- `weekdagen`: elke datum waarvan de weekdag in `regel.weekdagen` zit (niet verschoven).
- `wekelijks`: zelfde weekdag als `startdatum`, verschoven naar de eerste werkdag.
- `elke_x_weken`: zelfde weekdag als `startdatum`, elke `intervalWeken` weken, verschoven naar de eerste werkdag.
- `maandelijks`: dag van de maand gelijk aan die van `startdatum`. Bestaat die dag niet, dan de laatste dag van de maand. Verschoven naar de eerste werkdag.

- [ ] **Step 1: De falende test schrijven**

`tests/unit/herhaling.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { datumsVoorHerhaling, type HerhalingRegel } from '@/lib/domein/herhaling';

const WERKWEEK = [1, 2, 3, 4, 5];
const ALLE_DAGEN = [1, 2, 3, 4, 5, 6, 7];
const regel = (r: Partial<HerhalingRegel> & Pick<HerhalingRegel, 'type' | 'startdatum'>): HerhalingRegel => ({
  weekdagen: [],
  intervalWeken: 1,
  ...r,
});

describe('datumsVoorHerhaling', () => {
  it('dagelijks: alleen werkdagen, vanaf de startdatum', () => {
    expect(datumsVoorHerhaling(regel({ type: 'dagelijks', startdatum: '2026-10-21' }), '2026-10-19', '2026-10-25', WERKWEEK))
      .toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
  });

  it('weekdagen: op de gekozen dagen', () => {
    expect(datumsVoorHerhaling(regel({ type: 'weekdagen', weekdagen: [1, 4], startdatum: '2026-10-19' }), '2026-10-19', '2026-11-01', WERKWEEK))
      .toEqual(['2026-10-19', '2026-10-22', '2026-10-26', '2026-10-29']);
  });

  it('wekelijks: op zaterdag gestart schuift naar maandag', () => {
    expect(datumsVoorHerhaling(regel({ type: 'wekelijks', startdatum: '2026-10-24' }), '2026-10-19', '2026-11-08', WERKWEEK))
      .toEqual(['2026-10-26', '2026-11-02']);
  });

  it('elke 2 weken: om de week overslaan', () => {
    expect(datumsVoorHerhaling(regel({ type: 'elke_x_weken', intervalWeken: 2, startdatum: '2026-10-19' }), '2026-10-19', '2026-11-30', WERKWEEK))
      .toEqual(['2026-10-19', '2026-11-02', '2026-11-16', '2026-11-30']);
  });

  it('maandelijks: korte maanden krijgen de laatste dag', () => {
    expect(datumsVoorHerhaling(regel({ type: 'maandelijks', startdatum: '2026-01-31' }), '2026-01-01', '2026-04-30', ALLE_DAGEN))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('maandelijks: weekend schuift naar de eerste werkdag', () => {
    expect(datumsVoorHerhaling(regel({ type: 'maandelijks', startdatum: '2026-01-31' }), '2026-01-01', '2026-03-31', WERKWEEK))
      .toEqual(['2026-02-02', '2026-03-02', '2026-03-31']);
  });

  it('een verschoven datum die in het venster valt telt mee, eentje ervoor niet', () => {
    // basis za 24 okt → ma 26 okt; venster begint op 25 okt
    expect(datumsVoorHerhaling(regel({ type: 'wekelijks', startdatum: '2026-10-24' }), '2026-10-25', '2026-10-30', WERKWEEK))
      .toEqual(['2026-10-26']);
  });

  it('geeft niets als de startdatum na het venster ligt of het venster leeg is', () => {
    expect(datumsVoorHerhaling(regel({ type: 'dagelijks', startdatum: '2026-12-01' }), '2026-10-19', '2026-10-25', WERKWEEK)).toEqual([]);
    expect(datumsVoorHerhaling(regel({ type: 'dagelijks', startdatum: '2026-10-01' }), '2026-10-25', '2026-10-19', WERKWEEK)).toEqual([]);
  });
});
```

- [ ] **Step 2: Test draaien en zien falen**

Run: `npx vitest run --project unit tests/unit/herhaling.test.ts`
Expected: FAIL, import van `@/lib/domein/herhaling` kan niet worden opgelost.

- [ ] **Step 3: Implementatie schrijven**

`src/lib/domein/herhaling.ts`:
```ts
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
```

- [ ] **Step 4: Test draaien en zien slagen**

Run: `npx vitest run --project unit`
Expected: PASS (alle tests uit `datums` en `herhaling`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domein/herhaling.ts tests/unit/herhaling.test.ts
git commit -m "feat: herhalingsregels voor taken" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Doorschuiven, sortering, labels en validatie

**Files:**
- Create: `src/lib/domein/doorschuiven.ts`, `src/lib/domein/taak.ts`, `src/lib/domein/validatie.ts`
- Test: `tests/unit/doorschuiven.test.ts`, `tests/unit/taak.test.ts`, `tests/unit/validatie.test.ts`

**Interfaces:**
- Produces (`doorschuiven.ts`):
  - `type OpenTaak = { id: string; datum: Datum; herhalingId: string | null }`
  - `type DoorschuifPlan = { verplaatsen: { id: string; naar: Datum }[]; gemist: string[] }`
  - `reeksSleutel(herhalingId: string, datum: Datum): string`
  - `planDoorschuiven(taken: OpenTaak[], vandaag: Datum, werkdagen: number[], bezetteReeksDatums: Set<string>): DoorschuifPlan`
- Produces (`taak.ts`):
  - `type Prioriteit = 'laag' | 'middel' | 'hoog' | 'zsm' | 'nu'`, `PRIORITEITEN` (urgent → laag), `PRIORITEIT_LABEL`
  - `type Status = 'open' | 'bezig' | 'klaar'`, `STATUSSEN`, `STATUS_LABEL`
  - `vergelijkTaken(a: Sorteerbaar, b: Sorteerbaar): number`, met `Sorteerbaar = { status: Status; prioriteit: Prioriteit; tijd: string | null; aangemaaktOp: Date }`
  - `type TaakLabel = { soort: 'gemist' | 'uitgesteld' | 'achterstallig'; tekst: string }`
  - `taakLabels(t: { status: Status; prioriteit: Prioriteit; gemist: boolean; uitgesteldVan: Datum | null }): TaakLabel[]`
- Produces (`validatie.ts`): `taakVeldenSchema`, `herhalingSchema`, `nieuweTaakSchema`, `reeksSchema`, `bedrijfSchema`, `bordNaamSchema`, `medewerkerSchema`, `isUuid(x: string): boolean`, plus de types `TaakVeldenInvoer = z.input<typeof taakVeldenSchema>`, `NieuweTaakInvoer`, `ReeksInvoer`, `BedrijfInvoer`, `MedewerkerInvoer`, `HerhalingInvoer = z.output<typeof herhalingSchema>`

- [ ] **Step 1: De falende tests schrijven**

`tests/unit/doorschuiven.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { planDoorschuiven, reeksSleutel } from '@/lib/domein/doorschuiven';

const WERKWEEK = [1, 2, 3, 4, 5];

describe('planDoorschuiven', () => {
  it('verplaatst achterstallige taken naar vandaag', () => {
    const plan = planDoorschuiven([{ id: 'a', datum: '2026-11-02', herhalingId: null }], '2026-11-04', WERKWEEK, new Set());
    expect(plan).toEqual({ verplaatsen: [{ id: 'a', naar: '2026-11-04' }], gemist: [] });
  });

  it('laat taken van vandaag en later staan', () => {
    const plan = planDoorschuiven([
      { id: 'a', datum: '2026-11-04', herhalingId: null },
      { id: 'b', datum: '2026-11-05', herhalingId: null },
    ], '2026-11-04', WERKWEEK, new Set());
    expect(plan).toEqual({ verplaatsen: [], gemist: [] });
  });

  it('schuift in het weekend door naar maandag', () => {
    const plan = planDoorschuiven([{ id: 'a', datum: '2026-11-06', herhalingId: null }], '2026-11-07', WERKWEEK, new Set());
    expect(plan.verplaatsen).toEqual([{ id: 'a', naar: '2026-11-09' }]);
  });

  it('markeert een reeks-taak als gemist als de reeks al een taak op de doeldag heeft', () => {
    const plan = planDoorschuiven(
      [{ id: 'a', datum: '2026-11-02', herhalingId: 'h1' }],
      '2026-11-04', WERKWEEK, new Set([reeksSleutel('h1', '2026-11-04')]),
    );
    expect(plan).toEqual({ verplaatsen: [], gemist: ['a'] });
  });

  it('verplaatst van één reeks alleen de nieuwste achterstallige taak', () => {
    const plan = planDoorschuiven([
      { id: 'oud', datum: '2026-11-02', herhalingId: 'h1' },
      { id: 'nieuw', datum: '2026-11-03', herhalingId: 'h1' },
    ], '2026-11-04', WERKWEEK, new Set());
    expect(plan).toEqual({ verplaatsen: [{ id: 'nieuw', naar: '2026-11-04' }], gemist: ['oud'] });
  });
});
```

`tests/unit/taak.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { taakLabels, vergelijkTaken, type Prioriteit, type Status } from '@/lib/domein/taak';

const t = (p: Prioriteit, tijd: string | null, status: Status = 'open', ms = 0) =>
  ({ prioriteit: p, tijd, status, aangemaaktOp: new Date(ms) });

describe('vergelijkTaken', () => {
  it('sorteert op prioriteit, dan tijd, dan aanmaakmoment; klaar onderaan', () => {
    const lijst = [
      t('laag', null, 'open', 1),
      t('middel', '13:00'),
      t('nu', null, 'klaar'),
      t('middel', '08:30'),
      t('middel', null, 'open', 5),
      t('middel', null, 'open', 2),
      t('nu', null),
      t('zsm', null),
    ];
    const sleutels = [...lijst].sort(vergelijkTaken).map((x) => `${x.prioriteit}/${x.tijd ?? '-'}/${x.status}/${x.aangemaaktOp.getTime()}`);
    expect(sleutels).toEqual([
      'nu/-/open/0',
      'zsm/-/open/0',
      'middel/08:30/open/0',
      'middel/13:00/open/0',
      'middel/-/open/2',
      'middel/-/open/5',
      'laag/-/open/1',
      'nu/-/klaar/0',
    ]);
  });
});

describe('taakLabels', () => {
  it('toont uitgesteld met de oude dag', () => {
    expect(taakLabels({ status: 'open', prioriteit: 'middel', gemist: false, uitgesteldVan: '2026-10-20' }))
      .toEqual([{ soort: 'uitgesteld', tekst: 'uitgesteld van di 20 okt' }]);
  });

  it('markeert uitgestelde zsm- en nu-taken als achterstallig', () => {
    expect(taakLabels({ status: 'bezig', prioriteit: 'nu', gemist: false, uitgesteldVan: '2026-10-20' }).map((l) => l.soort))
      .toEqual(['uitgesteld', 'achterstallig']);
  });

  it('toont gemist en verder niets', () => {
    expect(taakLabels({ status: 'open', prioriteit: 'nu', gemist: true, uitgesteldVan: null }))
      .toEqual([{ soort: 'gemist', tekst: 'gemist' }]);
  });

  it('toont geen labels bij klaar', () => {
    expect(taakLabels({ status: 'klaar', prioriteit: 'nu', gemist: false, uitgesteldVan: '2026-10-20' })).toEqual([]);
  });
});
```

`tests/unit/validatie.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { bedrijfSchema, herhalingSchema, isUuid, medewerkerSchema, nieuweTaakSchema } from '@/lib/domein/validatie';

describe('validatie', () => {
  const basis = { bordId: '7f1c0c8e-2f3a-4b8e-9f00-3d2c1b0a9e8f', titel: '  Banden ophalen ', datum: '2026-10-22', tijd: null, prioriteit: 'middel', herhaling: null };

  it('accepteert een geldige taak en trimt de titel', () => {
    const v = nieuweTaakSchema.parse(basis);
    expect(v.titel).toBe('Banden ophalen');
    expect(v.omschrijving).toBe('');
  });

  it('weigert lege titel, ongeldige datum, tijd en prioriteit', () => {
    expect(nieuweTaakSchema.safeParse({ ...basis, titel: ' ' }).success).toBe(false);
    expect(nieuweTaakSchema.safeParse({ ...basis, datum: '22-10-2026' }).success).toBe(false);
    expect(nieuweTaakSchema.safeParse({ ...basis, tijd: '25:00' }).success).toBe(false);
    expect(nieuweTaakSchema.safeParse({ ...basis, prioriteit: 'heel hoog' }).success).toBe(false);
  });

  it('eist weekdagen bij type weekdagen en minstens 2 weken bij elke_x_weken', () => {
    expect(herhalingSchema.safeParse({ type: 'weekdagen', weekdagen: [] }).success).toBe(false);
    expect(herhalingSchema.safeParse({ type: 'weekdagen', weekdagen: [1, 4] }).success).toBe(true);
    expect(herhalingSchema.safeParse({ type: 'elke_x_weken', intervalWeken: 1 }).success).toBe(false);
    expect(herhalingSchema.safeParse({ type: 'elke_x_weken', intervalWeken: 2 }).success).toBe(true);
  });

  it('valideert bedrijven en medewerkers', () => {
    expect(bedrijfSchema.safeParse({ naam: 'Garage', garageAdres: '', werkdagen: [] }).success).toBe(false);
    expect(bedrijfSchema.parse({ naam: 'Garage', garageAdres: '', werkdagen: [1, 2] }).garageAdres).toBeNull();
    expect(medewerkerSchema.parse({ naam: 'Piet', gebruikersnaam: ' Piet.V ', bedrijfId: basis.bordId }).gebruikersnaam).toBe('piet.v');
    expect(medewerkerSchema.safeParse({ naam: 'Piet', gebruikersnaam: 'piet de v', bedrijfId: basis.bordId }).success).toBe(false);
  });

  it('herkent uuids', () => {
    expect(isUuid(basis.bordId)).toBe(true);
    expect(isUuid('abc')).toBe(false);
  });
});
```

- [ ] **Step 2: Tests draaien en zien falen**

Run: `npx vitest run --project unit`
Expected: FAIL in `doorschuiven`, `taak` en `validatie` (imports ontbreken).

- [ ] **Step 3: Implementaties schrijven**

`src/lib/domein/doorschuiven.ts`:
```ts
import { type Datum, eersteWerkdagVanaf } from './datums';

export type OpenTaak = { id: string; datum: Datum; herhalingId: string | null };
export type DoorschuifPlan = { verplaatsen: { id: string; naar: Datum }[]; gemist: string[] };

export function reeksSleutel(herhalingId: string, datum: Datum): string {
  return `${herhalingId}|${datum}`;
}

export function planDoorschuiven(
  taken: OpenTaak[],
  vandaag: Datum,
  werkdagen: number[],
  bezetteReeksDatums: Set<string>,
): DoorschuifPlan {
  const doel = eersteWerkdagVanaf(vandaag, werkdagen);
  const bezet = new Set(bezetteReeksDatums);
  const plan: DoorschuifPlan = { verplaatsen: [], gemist: [] };
  const achterstallig = taken
    .filter((t) => t.datum < vandaag)
    .sort((a, b) => b.datum.localeCompare(a.datum)); // nieuwste eerst
  for (const t of achterstallig) {
    if (t.herhalingId) {
      const sleutel = reeksSleutel(t.herhalingId, doel);
      if (bezet.has(sleutel)) {
        plan.gemist.push(t.id);
        continue;
      }
      bezet.add(sleutel);
    }
    plan.verplaatsen.push({ id: t.id, naar: doel });
  }
  return plan;
}
```

`src/lib/domein/taak.ts`:
```ts
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
```

`src/lib/domein/validatie.ts`:
```ts
import { z } from 'zod';

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ongeldige datum');
const tijd = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ongeldige tijd').nullable();
const werkdag = z.number().int().min(1).max(7);

export const prioriteitSchema = z.enum(['laag', 'middel', 'hoog', 'zsm', 'nu']);
export const statusSchema = z.enum(['open', 'bezig', 'klaar']);

export const taakVeldenSchema = z.object({
  titel: z.string().trim().min(1, 'Titel is verplicht').max(200, 'Titel is te lang'),
  omschrijving: z.string().trim().max(2000, 'Omschrijving is te lang').default(''),
  datum,
  tijd,
  prioriteit: prioriteitSchema,
});

export const herhalingSchema = z
  .object({
    type: z.enum(['dagelijks', 'wekelijks', 'maandelijks', 'weekdagen', 'elke_x_weken']),
    weekdagen: z.array(werkdag).default([]),
    intervalWeken: z.number().int().min(1).max(52).default(1),
  })
  .refine((h) => h.type !== 'weekdagen' || h.weekdagen.length > 0, { message: 'Kies minstens één weekdag', path: ['weekdagen'] })
  .refine((h) => h.type !== 'elke_x_weken' || h.intervalWeken >= 2, { message: 'Kies minstens 2 weken', path: ['intervalWeken'] });

export const nieuweTaakSchema = taakVeldenSchema.extend({
  bordId: z.string().uuid('Ongeldig bord'),
  herhaling: herhalingSchema.nullable(),
});

export const reeksSchema = taakVeldenSchema.omit({ datum: true }).extend({ herhaling: herhalingSchema });

export const bedrijfSchema = z.object({
  naam: z.string().trim().min(1, 'Naam is verplicht').max(100),
  garageAdres: z.string().trim().max(200).nullable().optional().transform((v) => v || null),
  werkdagen: z.array(werkdag).min(1, 'Kies minstens één werkdag').transform((w) => [...new Set(w)].sort()),
});

export const bordNaamSchema = z.string().trim().min(1, 'Naam is verplicht').max(60);

export const medewerkerSchema = z.object({
  naam: z.string().trim().min(1, 'Naam is verplicht').max(100),
  gebruikersnaam: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, 'Gebruikersnaam: 3–32 tekens, alleen letters, cijfers, punt, streepje of underscore'),
  bedrijfId: z.string().uuid('Kies een bedrijf'),
});

export function isUuid(x: string): boolean {
  return z.string().uuid().safeParse(x).success;
}

export type TaakVeldenInvoer = z.input<typeof taakVeldenSchema>;
export type NieuweTaakInvoer = z.input<typeof nieuweTaakSchema>;
export type ReeksInvoer = z.input<typeof reeksSchema>;
export type BedrijfInvoer = z.input<typeof bedrijfSchema>;
export type MedewerkerInvoer = z.input<typeof medewerkerSchema>;
export type HerhalingInvoer = z.output<typeof herhalingSchema>;
```

Let op: `werkdagen` wordt na `sort()` als getallen gesorteerd. `[...new Set(w)].sort()` sorteert lexicografisch, en dat is voor de getallen 1–7 gelijk aan numeriek.

- [ ] **Step 4: Tests draaien en zien slagen**

Run: `npx vitest run --project unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domein tests/unit
git commit -m "feat: doorschuifplan, sortering, labels en validatie" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Database, migraties en Row Level Security

**Files:**
- Create: `migrations/001_basis.sql`, `migrations/002_rls.sql`
- Create: `src/lib/db/client.ts`, `src/lib/db/migreer.ts`, `src/lib/db/tenant.ts`, `src/lib/db/gebeurtenissen.ts`, `src/lib/fouten.ts`, `src/scripts/migreer.ts`
- Create: `tests/integration/global-setup.ts`, `tests/integration/setup.ts`, `tests/integration/helpers.ts`
- Test: `tests/integration/rls.test.ts`

**Interfaces:**
- Produces (`client.ts`): `type Db = postgres.Sql`, `type Tx = postgres.TransactionSql`, `maakSql(url: string, opties?: { max?: number }): Db`, `db(): Db` (lui, leest `DATABASE_URL`), `sluitDb(): Promise<void>`, `pgIntArray(getallen: number[]): string`
- Produces (`migreer.ts`): `migreer(sql: Db, map?: string): Promise<string[]>`
- Produces (`tenant.ts`): `type Rol = 'beheerder' | 'medewerker'`, `type Context = { gebruikerId: string; rol: Rol; bedrijfId: string | null }`, `metTenant<T>(ctx: Context, fn: (tx: Tx) => Promise<T>): Promise<T>`
- Produces (`gebeurtenissen.ts`): `KANAAL = 'bord_wijziging'`, `meldWijziging(tx: Tx, bordId: string): Promise<void>`, `luisterNaarWijzigingen(fn: (bordId: string) => void): Promise<() => Promise<void>>`
- Produces (`fouten.ts`): `Fout`, `NietGevonden`, `GeenToegang`, `Conflict` (veld `doorNaam: string | null`), `Ongeldig`
- Produces (`tests/integration/helpers.ts`): `leegDatabase(): Promise<void>`

De rol- en RLS-opzet: de applicatie verbindt als eigenaar van de tabellen. `metTenant` doet `SET LOCAL ROLE takenbord_app` en zet `app.rol`, `app.bedrijf_id` en `app.gebruiker_id`, zodat RLS geldt. Code buiten `metTenant` (auth, worker) omzeilt RLS bewust.

- [ ] **Step 1: Migraties schrijven**

`migrations/001_basis.sql`:
```sql
create table bedrijven (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  garage_adres text,
  werkdagen int[] not null default '{1,2,3,4,5}',
  aangemaakt_op timestamptz not null default now(),
  constraint werkdagen_geldig check (cardinality(werkdagen) between 1 and 7 and werkdagen <@ array[1,2,3,4,5,6,7])
);

create table gebruikers (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid references bedrijven(id) on delete cascade,
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
  constraint rol_bedrijf check ((rol = 'beheerder' and bedrijf_id is null) or (rol = 'medewerker' and bedrijf_id is not null)),
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
  bedrijf_id uuid not null references bedrijven(id) on delete cascade,
  naam text not null,
  gearchiveerd boolean not null default false,
  aangemaakt_op timestamptz not null default now()
);

create table herhalingen (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijven(id) on delete cascade,
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
  bedrijf_id uuid not null references bedrijven(id) on delete cascade,
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
create index taken_bedrijf_datum on taken (bedrijf_id, datum);
create unique index taken_herhaling_datum on taken (herhaling_id, oorspronkelijke_datum) where herhaling_id is not null;

create table taak_historie (
  id uuid primary key default gen_random_uuid(),
  taak_id uuid not null references taken(id) on delete cascade,
  gebruiker_id uuid references gebruikers(id) on delete set null,
  tijdstip timestamptz not null default now(),
  wijzigingen jsonb not null
);
create index taak_historie_taak on taak_historie (taak_id, tijdstip);

create view taken_weergave with (security_invoker = true) as
select
  t.id, t.bedrijf_id, t.bord_id, t.titel, t.omschrijving, t.datum,
  to_char(t.tijd, 'HH24:MI') as tijd,
  t.prioriteit, t.status, t.oorspronkelijke_datum, t.uitgesteld_van, t.gemist,
  t.herhaling_id, t.afwijkend, t.versie, t.aangemaakt_op, t.gewijzigd_op, t.klaar_op,
  ag.naam as aangemaakt_door_naam,
  gg.naam as gewijzigd_door_naam,
  h.type as herhaling_type,
  h.weekdagen as herhaling_weekdagen,
  h.interval_weken as herhaling_interval,
  bd.naam as bedrijf_naam,
  bo.naam as bord_naam,
  bo.gearchiveerd as bord_gearchiveerd
from taken t
join bedrijven bd on bd.id = t.bedrijf_id
join borden bo on bo.id = t.bord_id
left join gebruikers ag on ag.id = t.aangemaakt_door
left join gebruikers gg on gg.id = t.gewijzigd_door
left join herhalingen h on h.id = t.herhaling_id;
```

`migrations/002_rls.sql`:
```sql
do $$
begin
  if not exists (select from pg_roles where rolname = 'takenbord_app') then
    create role takenbord_app nologin;
  end if;
end
$$;
grant takenbord_app to current_user;

grant usage on schema public to takenbord_app;
grant select, insert, update, delete on bedrijven, gebruikers, borden, herhalingen, taken, taak_historie to takenbord_app;
grant select, delete on sessies to takenbord_app;
grant select on taken_weergave to takenbord_app;

create function app_rol() returns text language sql stable
  as $$ select nullif(current_setting('app.rol', true), '') $$;
create function app_bedrijf_id() returns uuid language sql stable
  as $$ select nullif(current_setting('app.bedrijf_id', true), '')::uuid $$;

alter table bedrijven enable row level security;
alter table gebruikers enable row level security;
alter table sessies enable row level security;
alter table borden enable row level security;
alter table herhalingen enable row level security;
alter table taken enable row level security;
alter table taak_historie enable row level security;

create policy beheerder_alles on bedrijven for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy eigen_lezen on bedrijven for select using (id = app_bedrijf_id());

create policy beheerder_alles on gebruikers for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy collega_lezen on gebruikers for select using (bedrijf_id = app_bedrijf_id());
create policy beheerder_zichtbaar on gebruikers for select using (rol = 'beheerder');

create policy beheerder_alles on sessies for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');

create policy beheerder_alles on borden for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy eigen_lezen on borden for select using (bedrijf_id = app_bedrijf_id());

create policy beheerder_alles on herhalingen for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy eigen_bedrijf on herhalingen for all using (bedrijf_id = app_bedrijf_id()) with check (bedrijf_id = app_bedrijf_id());

create policy beheerder_alles on taken for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy eigen_bedrijf on taken for all using (bedrijf_id = app_bedrijf_id()) with check (bedrijf_id = app_bedrijf_id());

create policy beheerder_alles on taak_historie for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy eigen_bedrijf on taak_historie for all
  using (exists (select 1 from taken t where t.id = taak_historie.taak_id))
  with check (exists (select 1 from taken t where t.id = taak_historie.taak_id));
```

- [ ] **Step 2: Databasecode schrijven**

`src/lib/fouten.ts`:
```ts
export class Fout extends Error {}

export class NietGevonden extends Fout {
  constructor(bericht = 'Niet gevonden') { super(bericht); }
}

export class GeenToegang extends Fout {
  constructor(bericht = 'Geen toegang') { super(bericht); }
}

export class Ongeldig extends Fout {}

export class Conflict extends Fout {
  readonly doorNaam: string | null;
  constructor(doorNaam: string | null) {
    super(`Deze taak is zojuist gewijzigd door ${doorNaam ?? 'iemand anders'}. Herladen?`);
    this.doorNaam = doorNaam;
  }
}
```

`src/lib/db/client.ts`:
```ts
import postgres from 'postgres';

export type Db = postgres.Sql;
export type Tx = postgres.TransactionSql;

let gedeeld: Db | undefined;

export function maakSql(url: string, opties: { max?: number } = {}): Db {
  return postgres(url, {
    max: opties.max ?? 10,
    transform: postgres.camel,
    onnotice: () => {},
    // `date`-kolommen als 'YYYY-MM-DD'-string teruggeven in plaats van een JS Date.
    types: {
      datum: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  }) as unknown as Db;
}

export function db(): Db {
  if (!gedeeld) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL ontbreekt');
    gedeeld = maakSql(url);
  }
  return gedeeld;
}

export async function sluitDb(): Promise<void> {
  if (gedeeld) {
    await gedeeld.end({ timeout: 5 });
    gedeeld = undefined;
  }
}

/** Postgres-arrayliteral voor int[]-parameters, bijv. `${pgIntArray([1,2])}::int[]`. */
export function pgIntArray(getallen: number[]): string {
  return `{${getallen.map((g) => Math.trunc(g)).join(',')}}`;
}
```

`src/lib/db/migreer.ts`:
```ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from './client';

export async function migreer(sql: Db, map = path.join(process.cwd(), 'migrations')): Promise<string[]> {
  await sql`create table if not exists schema_migraties (naam text primary key, uitgevoerd_op timestamptz not null default now())`;
  const bestanden = (await readdir(map)).filter((f) => f.endsWith('.sql')).sort();
  const gedaan = new Set((await sql<{ naam: string }[]>`select naam from schema_migraties`).map((r) => r.naam));
  const nieuw: string[] = [];
  for (const bestand of bestanden) {
    if (gedaan.has(bestand)) continue;
    const inhoud = await readFile(path.join(map, bestand), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(inhoud).simple();
      await tx`insert into schema_migraties (naam) values (${bestand})`;
    });
    nieuw.push(bestand);
  }
  return nieuw;
}
```

`src/lib/db/tenant.ts`:
```ts
import { db, type Tx } from './client';

export type Rol = 'beheerder' | 'medewerker';
export type Context = { gebruikerId: string; rol: Rol; bedrijfId: string | null };

/** Voert fn uit in een transactie waarin Row Level Security voor deze gebruiker geldt. */
export async function metTenant<T>(ctx: Context, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const resultaat = await db().begin(async (tx) => {
    await tx`select
      set_config('app.rol', ${ctx.rol}, true),
      set_config('app.bedrijf_id', ${ctx.bedrijfId ?? ''}, true),
      set_config('app.gebruiker_id', ${ctx.gebruikerId}, true)`;
    await tx`set local role takenbord_app`;
    return fn(tx);
  });
  return resultaat as T;
}
```

`src/lib/db/gebeurtenissen.ts`:
```ts
import { db, type Tx } from './client';

export const KANAAL = 'bord_wijziging';

/** Wordt pas verstuurd als de transactie slaagt (Postgres NOTIFY-semantiek). */
export async function meldWijziging(tx: Tx, bordId: string): Promise<void> {
  await tx`select pg_notify(${KANAAL}, ${bordId})`;
}

export async function luisterNaarWijzigingen(fn: (bordId: string) => void): Promise<() => Promise<void>> {
  const { unlisten } = await db().listen(KANAAL, fn);
  return unlisten;
}
```

`src/scripts/migreer.ts`:
```ts
import { db, sluitDb } from '../lib/db/client';
import { migreer } from '../lib/db/migreer';

async function main() {
  const nieuw = await migreer(db());
  console.log(nieuw.length ? `Uitgevoerd: ${nieuw.join(', ')}` : 'Database is al bijgewerkt.');
  await sluitDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Testinfrastructuur schrijven**

`tests/integration/global-setup.ts`:
```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { maakSql } from '../../src/lib/db/client';
import { migreer } from '../../src/lib/db/migreer';

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  const sql = maakSql(url, { max: 1 });
  await migreer(sql);
  await sql.end();
  project.provide('databaseUrl', url);
}

export async function teardown() {
  await container?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
```

`tests/integration/setup.ts`:
```ts
import { afterAll, inject } from 'vitest';
import { sluitDb } from '../../src/lib/db/client';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = 'http://test.local';

afterAll(async () => {
  await sluitDb();
});
```

`tests/integration/helpers.ts`:
```ts
import { db } from '../../src/lib/db/client';

export async function leegDatabase(): Promise<void> {
  await db()`truncate taak_historie, taken, herhalingen, borden, sessies, gebruikers, bedrijven restart identity cascade`;
}
```

(Task 5 en 6 breiden `helpers.ts` uit met `maakOpzet()`.)

- [ ] **Step 4: De falende RLS-test schrijven**

Deze test maakt de testdata met de eigenaar-verbinding (`db()`, dus zonder RLS) en leest daarna via `metTenant`.

`tests/integration/rls.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/client';
import { metTenant, type Context } from '../../src/lib/db/tenant';
import { leegDatabase } from './helpers';

async function maakBedrijfMetTaak(naam: string) {
  const [b] = await db()<{ id: string }[]>`insert into bedrijven (naam) values (${naam}) returning id`;
  const [bord] = await db()<{ id: string }[]>`insert into borden (bedrijf_id, naam) values (${b.id}, 'Takenbord') returning id`;
  const [g] = await db()<{ id: string }[]>`insert into gebruikers (bedrijf_id, naam, gebruikersnaam, rol) values (${b.id}, ${naam}, ${naam.toLowerCase()}, 'medewerker') returning id`;
  await db()`insert into taken (bedrijf_id, bord_id, titel, datum, prioriteit, oorspronkelijke_datum) values (${b.id}, ${bord.id}, ${'Taak ' + naam}, '2026-10-22', 'middel', '2026-10-22')`;
  const ctx: Context = { gebruikerId: g.id, rol: 'medewerker', bedrijfId: b.id };
  return { bedrijfId: b.id, bordId: bord.id, ctx };
}

describe('row level security', () => {
  beforeEach(leegDatabase);

  it('een medewerker ziet alleen data van het eigen bedrijf', async () => {
    const a = await maakBedrijfMetTaak('A');
    await maakBedrijfMetTaak('B');
    const zicht = await metTenant(a.ctx, async (tx) => ({
      bedrijven: await tx<{ naam: string }[]>`select naam from bedrijven`,
      taken: await tx<{ titel: string }[]>`select titel from taken_weergave`,
      borden: await tx<{ id: string }[]>`select id from borden`,
    }));
    expect(zicht.bedrijven.map((r) => r.naam)).toEqual(['A']);
    expect(zicht.taken.map((r) => r.titel)).toEqual(['Taak A']);
    expect(zicht.borden.map((r) => r.id)).toEqual([a.bordId]);
  });

  it('een medewerker kan geen taak in een ander bedrijf invoegen', async () => {
    const a = await maakBedrijfMetTaak('A');
    const b = await maakBedrijfMetTaak('B');
    await expect(metTenant(a.ctx, (tx) => tx`insert into taken (bedrijf_id, bord_id, titel, datum, prioriteit, oorspronkelijke_datum)
      values (${b.bedrijfId}, ${b.bordId}, 'Inbraak', '2026-10-22', 'laag', '2026-10-22')`)).rejects.toThrow(/row-level security/);
  });

  it('een medewerker kan geen bedrijven aanmaken of sessies lezen', async () => {
    const a = await maakBedrijfMetTaak('A');
    await expect(metTenant(a.ctx, (tx) => tx`insert into bedrijven (naam) values ('Nep')`)).rejects.toThrow(/row-level security/);
    expect(await metTenant(a.ctx, (tx) => tx`select id from sessies`)).toHaveLength(0);
  });

  it('de beheerder ziet alles', async () => {
    await maakBedrijfMetTaak('A');
    await maakBedrijfMetTaak('B');
    const [beheerder] = await db()<{ id: string }[]>`insert into gebruikers (naam, gebruikersnaam, rol) values ('Max', 'max', 'beheerder') returning id`;
    const taken = await metTenant({ gebruikerId: beheerder.id, rol: 'beheerder', bedrijfId: null },
      (tx) => tx<{ titel: string }[]>`select titel from taken_weergave order by titel`);
    expect(taken.map((r) => r.titel)).toEqual(['Taak A', 'Taak B']);
  });

  it('geeft datums terug als string', async () => {
    const a = await maakBedrijfMetTaak('A');
    const [t] = await metTenant(a.ctx, (tx) => tx<{ datum: string }[]>`select datum from taken`);
    expect(t.datum).toBe('2026-10-22');
  });
});
```

- [ ] **Step 5: Docker starten en tests draaien**

Docker Desktop moet draaien.

Run: `npm run test:integratie`
Expected: PASS (5 tests). De eerste keer duurt het langer, omdat `postgres:16-alpine` wordt gedownload.

Faalt het met `.simple is not a function`, vervang dan in `migreer.ts` de regel `await tx.unsafe(inhoud).simple();` door `await tx.unsafe(inhoud);`. postgres.js gebruikt zonder parameters het simple-protocol.

- [ ] **Step 6: Lokale dev-database starten en migreren**

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
npm run db:migreer
```
Expected: `Uitgevoerd: 001_basis.sql, 002_rls.sql`. Een tweede keer `npm run db:migreer` geeft `Database is al bijgewerkt.`

- [ ] **Step 7: Commit**

```bash
git add migrations src/lib/db src/lib/fouten.ts src/scripts/migreer.ts tests/integration
git commit -m "feat: databaseschema, migraties en row level security" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Inloggen, sessies en activatie

**Files:**
- Create: `src/lib/auth/wachtwoord.ts`, `src/lib/auth/tokens.ts`, `src/lib/auth/sessies.ts`, `src/lib/auth/inloggen.ts`, `src/lib/auth/activatie.ts`, `src/lib/auth/accounts.ts`
- Modify: `tests/integration/helpers.ts` (testhelpers toevoegen)
- Test: `tests/unit/tokens.test.ts`, `tests/integration/auth.test.ts`

**Interfaces:**
- Consumes: `db`, `Tx` (client), `Context`, `Rol` (tenant), `Ongeldig` (fouten)
- Produces:
  - `wachtwoord.ts`: `MIN_WACHTWOORD = 8`, `hashWachtwoord(w): Promise<string>`, `controleerWachtwoord(hash, w): Promise<boolean>`, `wachtwoordFout(w): string | null`
  - `tokens.ts`: `sha256(s): string`, `nieuwToken(): string`, `nieuweCode(): string`, `gelijk(a, b): boolean`
  - `sessies.ts`: `type SessieGebruiker = { id: string; naam: string; gebruikersnaam: string; rol: Rol; bedrijfId: string | null }`, `SESSIE_DUUR_MS`, `maakSessie(gebruikerId): Promise<{ token: string; verlooptOp: Date }>`, `gebruikerVoorSessie(token): Promise<SessieGebruiker | null>`, `verwijderSessie(token): Promise<void>`
  - `inloggen.ts`: `MAX_POGINGEN = 5`, `BLOKKADE_MINUTEN = 15`, `type AuthResultaat = { ok: true; gebruikerId: string } | { ok: false; fout: string }`, `inloggen(gebruikersnaam, wachtwoord): Promise<AuthResultaat>`, plus intern gedeeld: `zoekAuthGebruiker`, `blokkadeMelding`, `registreerMislukt`
  - `activatie.ts`: `ACTIVATIE_DUUR_UUR = 48`, `ONGELDIGE_ACTIVATIE`, `type Activatie = { token: string; code: string; verlooptOp: Date }`, `geefActivatie(tx: Tx, gebruikerId): Promise<Activatie>`, `activatieVoorToken(token): Promise<{ naam: string } | null>`, `activeerMetToken(token, wachtwoord): Promise<AuthResultaat>`, `activeerMetCode(gebruikersnaam, code, wachtwoord): Promise<AuthResultaat>`
  - `accounts.ts`: `maakBeheerder(naam, gebruikersnaam, wachtwoord): Promise<string>`, `wijzigEigenWachtwoord(gebruikerId, huidig, nieuw): Promise<void>`
  - `tests/integration/helpers.ts`: `maakBeheerderCtx(): Promise<Context>`, `maakBedrijfMetBord(naam: string, werkdagen?: number[]): Promise<{ bedrijfId: string; bordId: string }>`, `maakMedewerkerCtx(bedrijfId: string, gebruikersnaam: string, naam?: string, wachtwoord?: string): Promise<Context>`

Auth-code draait bewust buiten `metTenant` (op de eigenaar-verbinding), omdat bij inloggen nog niet bekend is bij welk bedrijf iemand hoort. Alleen `geefActivatie` draait binnen de transactie van de beheerder.

- [ ] **Step 1: De falende unit-test voor tokens schrijven**

`tests/unit/tokens.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { gelijk, nieuweCode, nieuwToken, sha256 } from '@/lib/auth/tokens';

describe('tokens', () => {
  it('maakt een url-veilig token van 32 bytes', () => {
    const t = nieuwToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(nieuwToken()).not.toBe(t);
  });

  it('maakt een code van precies 6 cijfers', () => {
    for (let i = 0; i < 50; i++) expect(nieuweCode()).toMatch(/^\d{6}$/);
  });

  it('hasht deterministisch en vergelijkt veilig', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(gelijk('abc', 'abc')).toBe(true);
    expect(gelijk('abc', 'abd')).toBe(false);
    expect(gelijk('abc', 'abcd')).toBe(false);
  });
});
```

- [ ] **Step 2: De falende integratietest schrijven**

Vervang `tests/integration/helpers.ts` door:
```ts
import { maakBeheerder } from '../../src/lib/auth/accounts';
import { hashWachtwoord } from '../../src/lib/auth/wachtwoord';
import { db, pgIntArray } from '../../src/lib/db/client';
import type { Context } from '../../src/lib/db/tenant';

export async function leegDatabase(): Promise<void> {
  await db()`truncate taak_historie, taken, herhalingen, borden, sessies, gebruikers, bedrijven restart identity cascade`;
}

export async function maakBeheerderCtx(): Promise<Context> {
  const id = await maakBeheerder('Max', 'max', 'beheer-wachtwoord');
  return { gebruikerId: id, rol: 'beheerder', bedrijfId: null };
}

export async function maakBedrijfMetBord(naam: string, werkdagen = [1, 2, 3, 4, 5]): Promise<{ bedrijfId: string; bordId: string }> {
  const [b] = await db()<{ id: string }[]>`insert into bedrijven (naam, werkdagen) values (${naam}, ${pgIntArray(werkdagen)}::int[]) returning id`;
  const [bord] = await db()<{ id: string }[]>`insert into borden (bedrijf_id, naam) values (${b.id}, 'Takenbord') returning id`;
  return { bedrijfId: b.id, bordId: bord.id };
}

export async function maakMedewerkerCtx(
  bedrijfId: string,
  gebruikersnaam: string,
  naam = gebruikersnaam,
  wachtwoord = 'medewerker-wachtwoord',
): Promise<Context> {
  const [g] = await db()<{ id: string }[]>`insert into gebruikers (bedrijf_id, naam, gebruikersnaam, wachtwoord_hash, rol)
    values (${bedrijfId}, ${naam}, ${gebruikersnaam}, ${await hashWachtwoord(wachtwoord)}, 'medewerker') returning id`;
  return { gebruikerId: g.id, rol: 'medewerker', bedrijfId };
}
```

`tests/integration/auth.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { wijzigEigenWachtwoord } from '../../src/lib/auth/accounts';
import { activatieVoorToken, activeerMetCode, activeerMetToken, geefActivatie, ONGELDIGE_ACTIVATIE } from '../../src/lib/auth/activatie';
import { inloggen } from '../../src/lib/auth/inloggen';
import { gebruikerVoorSessie, maakSessie, verwijderSessie } from '../../src/lib/auth/sessies';
import { db } from '../../src/lib/db/client';
import { metTenant, type Context } from '../../src/lib/db/tenant';
import { leegDatabase, maakBedrijfMetBord, maakBeheerderCtx, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  const { bedrijfId } = await maakBedrijfMetBord('Garage A');
  piet = await maakMedewerkerCtx(bedrijfId, 'piet', 'Piet', 'juist-wachtwoord');
});

const nieuweActivatie = () => metTenant(beheerder, (tx) => geefActivatie(tx, piet.gebruikerId));

describe('inloggen', () => {
  it('slaagt met het juiste wachtwoord, ook met hoofdletters in de gebruikersnaam', async () => {
    expect(await inloggen(' Piet ', 'juist-wachtwoord')).toEqual({ ok: true, gebruikerId: piet.gebruikerId });
  });

  it('geeft dezelfde melding bij onbekende gebruiker en fout wachtwoord', async () => {
    const fout = { ok: false, fout: 'Gebruikersnaam of wachtwoord onjuist.' };
    expect(await inloggen('onbekend', 'x')).toEqual(fout);
    expect(await inloggen('piet', 'fout')).toEqual(fout);
  });

  it('blokkeert na 5 mislukte pogingen, ook met het juiste wachtwoord', async () => {
    for (let i = 0; i < 5; i++) await inloggen('piet', 'fout');
    expect(await inloggen('piet', 'juist-wachtwoord')).toEqual({ ok: false, fout: expect.stringMatching(/^Te veel mislukte pogingen/) });
  });

  it('laat weer toe als de blokkade voorbij is', async () => {
    for (let i = 0; i < 5; i++) await inloggen('piet', 'fout');
    await db()`update gebruikers set geblokkeerd_tot = now() - interval '1 minute' where id = ${piet.gebruikerId}`;
    expect((await inloggen('piet', 'juist-wachtwoord')).ok).toBe(true);
  });

  it('weigert een gedeactiveerd account', async () => {
    await db()`update gebruikers set actief = false where id = ${piet.gebruikerId}`;
    expect((await inloggen('piet', 'juist-wachtwoord')).ok).toBe(false);
  });
});

describe('sessies', () => {
  it('maakt, leest en verwijdert een sessie', async () => {
    const { token, verlooptOp } = await maakSessie(piet.gebruikerId);
    expect(verlooptOp.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600_000);
    expect(await gebruikerVoorSessie(token)).toEqual({
      id: piet.gebruikerId, naam: 'Piet', gebruikersnaam: 'piet', rol: 'medewerker', bedrijfId: piet.bedrijfId,
    });
    await verwijderSessie(token);
    expect(await gebruikerVoorSessie(token)).toBeNull();
  });

  it('negeert verlopen sessies en sessies van gedeactiveerde gebruikers', async () => {
    const a = await maakSessie(piet.gebruikerId);
    await db()`update sessies set verloopt_op = now() - interval '1 second'`;
    expect(await gebruikerVoorSessie(a.token)).toBeNull();
    const b = await maakSessie(piet.gebruikerId);
    await db()`update gebruikers set actief = false where id = ${piet.gebruikerId}`;
    expect(await gebruikerVoorSessie(b.token)).toBeNull();
  });
});

describe('activatie', () => {
  it('maakt het oude wachtwoord en alle sessies ongeldig', async () => {
    const sessie = await maakSessie(piet.gebruikerId);
    await nieuweActivatie();
    expect(await gebruikerVoorSessie(sessie.token)).toBeNull();
    expect((await inloggen('piet', 'juist-wachtwoord')).ok).toBe(false);
  });

  it('activeert eenmalig met de link', async () => {
    const { token } = await nieuweActivatie();
    expect(await activatieVoorToken(token)).toEqual({ naam: 'Piet' });
    expect(await activeerMetToken(token, 'kort')).toEqual({ ok: false, fout: 'Kies een wachtwoord van minstens 8 tekens.' });
    expect(await activeerMetToken(token, 'nieuw-wachtwoord')).toEqual({ ok: true, gebruikerId: piet.gebruikerId });
    expect((await inloggen('piet', 'nieuw-wachtwoord')).ok).toBe(true);
    expect(await activeerMetToken(token, 'nog-een-wachtwoord')).toEqual({ ok: false, fout: ONGELDIGE_ACTIVATIE });
    expect(await activatieVoorToken(token)).toBeNull();
  });

  it('weigert een verlopen link', async () => {
    const { token } = await nieuweActivatie();
    await db()`update gebruikers set activatie_verloopt_op = now() - interval '1 minute'`;
    expect(await activeerMetToken(token, 'nieuw-wachtwoord')).toEqual({ ok: false, fout: ONGELDIGE_ACTIVATIE });
  });

  it('activeert met gebruikersnaam en code; foute codes tellen mee voor de blokkade', async () => {
    const { code } = await nieuweActivatie();
    const fout = code === '000000' ? '111111' : '000000';
    expect(await activeerMetCode('piet', fout, 'nieuw-wachtwoord')).toEqual({ ok: false, fout: 'Activatiecode onjuist.' });
    expect(await activeerMetCode('piet', code, 'nieuw-wachtwoord')).toEqual({ ok: true, gebruikerId: piet.gebruikerId });

    const tweede = await nieuweActivatie();
    const fout2 = tweede.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await activeerMetCode('piet', fout2, 'nieuw-wachtwoord');
    expect(await activeerMetCode('piet', tweede.code, 'nieuw-wachtwoord'))
      .toEqual({ ok: false, fout: expect.stringMatching(/^Te veel mislukte pogingen/) });
  });
});

describe('wijzigEigenWachtwoord', () => {
  it('wijzigt alleen met het juiste huidige wachtwoord', async () => {
    await expect(wijzigEigenWachtwoord(piet.gebruikerId, 'fout', 'nieuw-wachtwoord')).rejects.toThrow('Huidig wachtwoord onjuist.');
    await expect(wijzigEigenWachtwoord(piet.gebruikerId, 'juist-wachtwoord', 'kort')).rejects.toThrow(/minstens 8/);
    await wijzigEigenWachtwoord(piet.gebruikerId, 'juist-wachtwoord', 'nieuw-wachtwoord');
    expect((await inloggen('piet', 'nieuw-wachtwoord')).ok).toBe(true);
  });
});
```

- [ ] **Step 3: Tests draaien en zien falen**

Run: `npx vitest run --project unit tests/unit/tokens.test.ts && npm run test:integratie`
Expected: FAIL (modules onder `src/lib/auth` bestaan niet).

- [ ] **Step 4: Implementatie schrijven**

`src/lib/auth/wachtwoord.ts`:
```ts
import { hash, verify } from '@node-rs/argon2';

export const MIN_WACHTWOORD = 8;

/** Argon2id (standaard van @node-rs/argon2). */
export function hashWachtwoord(wachtwoord: string): Promise<string> {
  return hash(wachtwoord);
}

export async function controleerWachtwoord(opgeslagen: string, wachtwoord: string): Promise<boolean> {
  try {
    return await verify(opgeslagen, wachtwoord);
  } catch {
    return false;
  }
}

export function wachtwoordFout(wachtwoord: string): string | null {
  return wachtwoord.length < MIN_WACHTWOORD ? `Kies een wachtwoord van minstens ${MIN_WACHTWOORD} tekens.` : null;
}
```

`src/lib/auth/tokens.ts`:
```ts
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function sha256(tekst: string): string {
  return createHash('sha256').update(tekst).digest('hex');
}

export function nieuwToken(): string {
  return randomBytes(32).toString('base64url');
}

export function nieuweCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function gelijk(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
```

`src/lib/auth/sessies.ts`:
```ts
import { db } from '../db/client';
import type { Rol } from '../db/tenant';
import { nieuwToken, sha256 } from './tokens';

export type SessieGebruiker = { id: string; naam: string; gebruikersnaam: string; rol: Rol; bedrijfId: string | null };

export const SESSIE_DUUR_MS = 30 * 24 * 60 * 60 * 1000;

export async function maakSessie(gebruikerId: string): Promise<{ token: string; verlooptOp: Date }> {
  const token = nieuwToken();
  const verlooptOp = new Date(Date.now() + SESSIE_DUUR_MS);
  await db()`insert into sessies (id, gebruiker_id, verloopt_op) values (${sha256(token)}, ${gebruikerId}, ${verlooptOp})`;
  return { token, verlooptOp };
}

export async function gebruikerVoorSessie(token: string): Promise<SessieGebruiker | null> {
  const [r] = await db()<SessieGebruiker[]>`
    select g.id, g.naam, g.gebruikersnaam, g.rol, g.bedrijf_id
    from sessies s join gebruikers g on g.id = s.gebruiker_id
    where s.id = ${sha256(token)} and s.verloopt_op > now() and g.actief and g.wachtwoord_hash is not null`;
  return r ? { ...r } : null;
}

export async function verwijderSessie(token: string): Promise<void> {
  await db()`delete from sessies where id = ${sha256(token)}`;
}
```

`src/lib/auth/inloggen.ts`:
```ts
import { db } from '../db/client';
import { controleerWachtwoord } from './wachtwoord';

export const MAX_POGINGEN = 5;
export const BLOKKADE_MINUTEN = 15;

export type AuthResultaat = { ok: true; gebruikerId: string } | { ok: false; fout: string };

export type AuthGebruiker = {
  id: string;
  actief: boolean;
  wachtwoordHash: string | null;
  geblokkeerdTot: Date | null;
  activatieCodeHash: string | null;
  activatieVerlooptOp: Date | null;
};

const ONJUIST = 'Gebruikersnaam of wachtwoord onjuist.';

export async function zoekAuthGebruiker(gebruikersnaam: string): Promise<AuthGebruiker | null> {
  const [g] = await db()<AuthGebruiker[]>`
    select id, actief, wachtwoord_hash, geblokkeerd_tot, activatie_code_hash, activatie_verloopt_op
    from gebruikers where gebruikersnaam = ${gebruikersnaam.trim().toLowerCase()}`;
  return g ?? null;
}

export function blokkadeMelding(g: AuthGebruiker, nu = new Date()): string | null {
  if (!g.geblokkeerdTot || g.geblokkeerdTot <= nu) return null;
  const minuten = Math.ceil((g.geblokkeerdTot.getTime() - nu.getTime()) / 60_000);
  return `Te veel mislukte pogingen. Probeer het over ${minuten} ${minuten === 1 ? 'minuut' : 'minuten'} opnieuw.`;
}

export async function registreerMislukt(gebruikerId: string): Promise<void> {
  await db()`
    update gebruikers set
      geblokkeerd_tot = case when mislukte_pogingen + 1 >= ${MAX_POGINGEN}
        then now() + make_interval(mins => ${BLOKKADE_MINUTEN}) else geblokkeerd_tot end,
      mislukte_pogingen = case when mislukte_pogingen + 1 >= ${MAX_POGINGEN} then 0 else mislukte_pogingen + 1 end
    where id = ${gebruikerId}`;
}

export async function inloggen(gebruikersnaam: string, wachtwoord: string): Promise<AuthResultaat> {
  const g = await zoekAuthGebruiker(gebruikersnaam);
  if (!g) return { ok: false, fout: ONJUIST };
  const blokkade = blokkadeMelding(g);
  if (blokkade) return { ok: false, fout: blokkade };
  if (!g.actief || !g.wachtwoordHash) return { ok: false, fout: ONJUIST };
  if (!(await controleerWachtwoord(g.wachtwoordHash, wachtwoord))) {
    await registreerMislukt(g.id);
    return { ok: false, fout: ONJUIST };
  }
  await db()`update gebruikers set mislukte_pogingen = 0, geblokkeerd_tot = null where id = ${g.id}`;
  return { ok: true, gebruikerId: g.id };
}
```

`src/lib/auth/activatie.ts`:
```ts
import { db, type Tx } from '../db/client';
import { NietGevonden } from '../fouten';
import { type AuthResultaat, blokkadeMelding, registreerMislukt, zoekAuthGebruiker } from './inloggen';
import { gelijk, nieuweCode, nieuwToken, sha256 } from './tokens';
import { hashWachtwoord, wachtwoordFout } from './wachtwoord';

export const ACTIVATIE_DUUR_UUR = 48;
export const ONGELDIGE_ACTIVATIE = 'Deze link of code is niet meer geldig. Vraag een nieuwe aan bij de beheerder.';

export type Activatie = { token: string; code: string; verlooptOp: Date };

/** Draait binnen de transactie van de beheerder. Maakt wachtwoord en sessies ongeldig. */
export async function geefActivatie(tx: Tx, gebruikerId: string): Promise<Activatie> {
  const token = nieuwToken();
  const code = nieuweCode();
  const verlooptOp = new Date(Date.now() + ACTIVATIE_DUUR_UUR * 3600_000);
  const rijen = await tx`
    update gebruikers set
      wachtwoord_hash = null,
      activatie_token_hash = ${sha256(token)},
      activatie_code_hash = ${sha256(code)},
      activatie_verloopt_op = ${verlooptOp},
      mislukte_pogingen = 0,
      geblokkeerd_tot = null
    where id = ${gebruikerId} and rol = 'medewerker'
    returning id`;
  if (rijen.length === 0) throw new NietGevonden('Medewerker niet gevonden');
  await tx`delete from sessies where gebruiker_id = ${gebruikerId}`;
  return { token, code, verlooptOp };
}

export async function activatieVoorToken(token: string): Promise<{ naam: string } | null> {
  const [g] = await db()<{ naam: string }[]>`
    select naam from gebruikers
    where activatie_token_hash = ${sha256(token)} and activatie_verloopt_op > now() and actief`;
  return g ? { naam: g.naam } : null;
}

async function zetWachtwoord(gebruikerId: string, wachtwoord: string): Promise<void> {
  await db()`
    update gebruikers set
      wachtwoord_hash = ${await hashWachtwoord(wachtwoord)},
      activatie_token_hash = null,
      activatie_code_hash = null,
      activatie_verloopt_op = null,
      mislukte_pogingen = 0,
      geblokkeerd_tot = null
    where id = ${gebruikerId}`;
}

export async function activeerMetToken(token: string, wachtwoord: string): Promise<AuthResultaat> {
  const fout = wachtwoordFout(wachtwoord);
  if (fout) return { ok: false, fout };
  const [g] = await db()<{ id: string }[]>`
    select id from gebruikers
    where activatie_token_hash = ${sha256(token)} and activatie_verloopt_op > now() and actief`;
  if (!g) return { ok: false, fout: ONGELDIGE_ACTIVATIE };
  await zetWachtwoord(g.id, wachtwoord);
  return { ok: true, gebruikerId: g.id };
}

export async function activeerMetCode(gebruikersnaam: string, code: string, wachtwoord: string): Promise<AuthResultaat> {
  const fout = wachtwoordFout(wachtwoord);
  if (fout) return { ok: false, fout };
  const g = await zoekAuthGebruiker(gebruikersnaam);
  if (!g || !g.actief) return { ok: false, fout: ONGELDIGE_ACTIVATIE };
  const blokkade = blokkadeMelding(g);
  if (blokkade) return { ok: false, fout: blokkade };
  if (!g.activatieCodeHash || !g.activatieVerlooptOp || g.activatieVerlooptOp <= new Date()) {
    return { ok: false, fout: ONGELDIGE_ACTIVATIE };
  }
  if (!gelijk(sha256(code.trim()), g.activatieCodeHash)) {
    await registreerMislukt(g.id);
    return { ok: false, fout: 'Activatiecode onjuist.' };
  }
  await zetWachtwoord(g.id, wachtwoord);
  return { ok: true, gebruikerId: g.id };
}
```

`src/lib/auth/accounts.ts`:
```ts
import { db } from '../db/client';
import { Ongeldig } from '../fouten';
import { controleerWachtwoord, hashWachtwoord, wachtwoordFout } from './wachtwoord';

export async function maakBeheerder(naam: string, gebruikersnaam: string, wachtwoord: string): Promise<string> {
  const fout = wachtwoordFout(wachtwoord);
  if (fout) throw new Ongeldig(fout);
  const [r] = await db()<{ id: string }[]>`
    insert into gebruikers (naam, gebruikersnaam, wachtwoord_hash, rol)
    values (${naam.trim()}, ${gebruikersnaam.trim().toLowerCase()}, ${await hashWachtwoord(wachtwoord)}, 'beheerder')
    returning id`;
  return r.id;
}

export async function wijzigEigenWachtwoord(gebruikerId: string, huidig: string, nieuw: string): Promise<void> {
  const [g] = await db()<{ wachtwoordHash: string | null }[]>`select wachtwoord_hash from gebruikers where id = ${gebruikerId}`;
  if (!g?.wachtwoordHash || !(await controleerWachtwoord(g.wachtwoordHash, huidig))) {
    throw new Ongeldig('Huidig wachtwoord onjuist.');
  }
  const fout = wachtwoordFout(nieuw);
  if (fout) throw new Ongeldig(fout);
  await db()`update gebruikers set wachtwoord_hash = ${await hashWachtwoord(nieuw)} where id = ${gebruikerId}`;
}
```

- [ ] **Step 5: Tests draaien en zien slagen**

Run: `npm test && npm run test:integratie`
Expected: PASS (unit en integratie, inclusief de RLS-tests uit Task 4).

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth tests
git commit -m "feat: inloggen, sessies en activatie met blokkade" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Beheerdiensten: bedrijven, borden en medewerkers

**Files:**
- Create: `src/lib/diensten/rechten.ts`, `src/lib/diensten/bedrijven.ts`, `src/lib/diensten/borden.ts`, `src/lib/diensten/medewerkers.ts`
- Test: `tests/integration/beheer.test.ts`

**Interfaces:**
- Consumes: `metTenant`, `Context` (tenant), `pgIntArray`, `Tx` (client), `geefActivatie`, `Activatie` (activatie), schema's en `isUuid` (validatie), fouten
- Produces:
  - `rechten.ts`: `vereisBeheerder(ctx: Context): void` (gooit `GeenToegang`)
  - `bedrijven.ts`: `type Bedrijf = { id: string; naam: string; garageAdres: string | null; werkdagen: number[] }`, `lijstBedrijven(ctx): Promise<Bedrijf[]>`, `maakBedrijf(ctx, invoer: BedrijfInvoer): Promise<{ id: string; bordId: string }>`, `wijzigBedrijf(ctx, id: string, invoer: BedrijfInvoer): Promise<void>`
  - `borden.ts`: `type Bord = { id: string; bedrijfId: string; naam: string; gearchiveerd: boolean; bedrijfNaam: string; werkdagen: number[] }`, `lijstBorden(ctx, opties?: { metGearchiveerd?: boolean }): Promise<Bord[]>`, `haalBord(ctx, id): Promise<Bord>`, `bordInTx(tx: Tx, id): Promise<{ id: string; bedrijfId: string; werkdagen: number[] }>`, `maakBord(ctx, bedrijfId, naam): Promise<{ id: string }>`, `wijzigBord(ctx, id, invoer: { naam: string; gearchiveerd: boolean }): Promise<void>`
  - `medewerkers.ts`: `type Medewerker = { id: string; naam: string; gebruikersnaam: string; bedrijfId: string; bedrijfNaam: string; actief: boolean; geactiveerd: boolean; activatieVerlooptOp: Date | null }`, `lijstMedewerkers(ctx): Promise<Medewerker[]>`, `maakMedewerker(ctx, invoer: MedewerkerInvoer): Promise<{ id: string; activatie: Activatie }>`, `nieuweActivatie(ctx, gebruikerId): Promise<Activatie>`, `zetActief(ctx, gebruikerId, actief: boolean): Promise<void>`

- [ ] **Step 1: De falende test schrijven**

`tests/integration/beheer.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { activeerMetToken } from '../../src/lib/auth/activatie';
import { gebruikerVoorSessie, maakSessie } from '../../src/lib/auth/sessies';
import type { Context } from '../../src/lib/db/tenant';
import { lijstBedrijven, maakBedrijf, wijzigBedrijf } from '../../src/lib/diensten/bedrijven';
import { haalBord, lijstBorden, maakBord, wijzigBord } from '../../src/lib/diensten/borden';
import { lijstMedewerkers, maakMedewerker, nieuweActivatie, zetActief } from '../../src/lib/diensten/medewerkers';
import { GeenToegang, NietGevonden, Ongeldig } from '../../src/lib/fouten';
import { leegDatabase, maakBeheerderCtx, maakMedewerkerCtx } from './helpers';

let beheerder: Context;

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
});

describe('bedrijven', () => {
  it('maakt een bedrijf met een standaardbord', async () => {
    const { id, bordId } = await maakBedrijf(beheerder, { naam: 'Garage Jansen', garageAdres: 'Dorpsstraat 1', werkdagen: [1, 2, 3, 4, 5, 6] });
    expect(await lijstBedrijven(beheerder)).toEqual([{ id, naam: 'Garage Jansen', garageAdres: 'Dorpsstraat 1', werkdagen: [1, 2, 3, 4, 5, 6] }]);
    expect((await haalBord(beheerder, bordId)).naam).toBe('Takenbord');
  });

  it('wijzigt een bedrijf en valideert werkdagen', async () => {
    const { id } = await maakBedrijf(beheerder, { naam: 'A', werkdagen: [1] });
    await wijzigBedrijf(beheerder, id, { naam: 'B', garageAdres: '', werkdagen: [5, 1] });
    expect((await lijstBedrijven(beheerder))[0]).toMatchObject({ naam: 'B', garageAdres: null, werkdagen: [1, 5] });
    await expect(wijzigBedrijf(beheerder, id, { naam: 'B', werkdagen: [] })).rejects.toThrow();
    await expect(wijzigBedrijf(beheerder, 'geen-uuid', { naam: 'B', werkdagen: [1] })).rejects.toBeInstanceOf(NietGevonden);
  });

  it('een medewerker mag niets beheren en ziet alleen het eigen bedrijf', async () => {
    const a = await maakBedrijf(beheerder, { naam: 'A', werkdagen: [1] });
    await maakBedrijf(beheerder, { naam: 'B', werkdagen: [1] });
    const piet = await maakMedewerkerCtx(a.id, 'piet');
    await expect(maakBedrijf(piet, { naam: 'X', werkdagen: [1] })).rejects.toBeInstanceOf(GeenToegang);
    await expect(maakBord(piet, a.id, 'Extra')).rejects.toBeInstanceOf(GeenToegang);
    await expect(maakMedewerker(piet, { naam: 'X', gebruikersnaam: 'xxx', bedrijfId: a.id })).rejects.toBeInstanceOf(GeenToegang);
    expect((await lijstBedrijven(piet)).map((b) => b.naam)).toEqual(['A']);
  });
});

describe('borden', () => {
  it('toont gearchiveerde borden alleen op verzoek en schermt andere bedrijven af', async () => {
    const a = await maakBedrijf(beheerder, { naam: 'A', werkdagen: [1, 2, 3, 4, 5] });
    const b = await maakBedrijf(beheerder, { naam: 'B', werkdagen: [1] });
    const extra = await maakBord(beheerder, a.id, 'Werkplaats');
    await wijzigBord(beheerder, extra.id, { naam: 'Werkplaats oud', gearchiveerd: true });
    const piet = await maakMedewerkerCtx(a.id, 'piet');

    expect((await lijstBorden(piet)).map((x) => x.naam)).toEqual(['Takenbord']);
    expect((await lijstBorden(piet, { metGearchiveerd: true })).map((x) => x.naam)).toEqual(['Takenbord', 'Werkplaats oud']);
    expect((await lijstBorden(beheerder)).map((x) => `${x.bedrijfNaam}/${x.naam}`)).toEqual(['A/Takenbord', 'B/Takenbord']);
    expect((await haalBord(piet, a.bordId)).werkdagen).toEqual([1, 2, 3, 4, 5]);
    await expect(haalBord(piet, b.bordId)).rejects.toBeInstanceOf(NietGevonden);
    await expect(haalBord(piet, 'onzin')).rejects.toBeInstanceOf(NietGevonden);
  });
});

describe('medewerkers', () => {
  it('maakt een medewerker met activatie en toont de status', async () => {
    const a = await maakBedrijf(beheerder, { naam: 'A', werkdagen: [1] });
    const { id, activatie } = await maakMedewerker(beheerder, { naam: 'Piet', gebruikersnaam: 'Piet', bedrijfId: a.id });
    expect(activatie.code).toMatch(/^\d{6}$/);
    expect((await lijstMedewerkers(beheerder))[0]).toMatchObject({ id, gebruikersnaam: 'piet', bedrijfNaam: 'A', actief: true, geactiveerd: false });
    await activeerMetToken(activatie.token, 'piet-wachtwoord');
    expect((await lijstMedewerkers(beheerder))[0].geactiveerd).toBe(true);
  });

  it('weigert een dubbele gebruikersnaam', async () => {
    const a = await maakBedrijf(beheerder, { naam: 'A', werkdagen: [1] });
    await maakMedewerker(beheerder, { naam: 'Piet', gebruikersnaam: 'piet', bedrijfId: a.id });
    await expect(maakMedewerker(beheerder, { naam: 'Piet 2', gebruikersnaam: 'piet', bedrijfId: a.id }))
      .rejects.toEqual(new Ongeldig('Deze gebruikersnaam is al in gebruik.'));
  });

  it('deactiveren beëindigt sessies; een nieuwe link werkt opnieuw', async () => {
    const a = await maakBedrijf(beheerder, { naam: 'A', werkdagen: [1] });
    const { id, activatie } = await maakMedewerker(beheerder, { naam: 'Piet', gebruikersnaam: 'piet', bedrijfId: a.id });
    await activeerMetToken(activatie.token, 'piet-wachtwoord');
    const sessie = await maakSessie(id);
    await zetActief(beheerder, id, false);
    expect(await gebruikerVoorSessie(sessie.token)).toBeNull();
    await zetActief(beheerder, id, true);
    const nieuw = await nieuweActivatie(beheerder, id);
    expect((await activeerMetToken(nieuw.token, 'ander-wachtwoord')).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Test draaien en zien falen**

Run: `npm run test:integratie`
Expected: FAIL (modules onder `src/lib/diensten` ontbreken).

- [ ] **Step 3: Implementatie schrijven**

`src/lib/diensten/rechten.ts`:
```ts
import type { Context } from '../db/tenant';
import { GeenToegang } from '../fouten';

export function vereisBeheerder(ctx: Context): void {
  if (ctx.rol !== 'beheerder') throw new GeenToegang('Alleen de beheerder kan dit doen.');
}
```

`src/lib/diensten/bedrijven.ts`:
```ts
import { pgIntArray } from '../db/client';
import { metTenant, type Context } from '../db/tenant';
import { bedrijfSchema, isUuid, type BedrijfInvoer } from '../domein/validatie';
import { NietGevonden } from '../fouten';
import { vereisBeheerder } from './rechten';

export type Bedrijf = { id: string; naam: string; garageAdres: string | null; werkdagen: number[] };

export async function lijstBedrijven(ctx: Context): Promise<Bedrijf[]> {
  const rijen = await metTenant(ctx, (tx) => tx<Bedrijf[]>`select id, naam, garage_adres, werkdagen from bedrijven order by naam`);
  return rijen.map((r) => ({ ...r }));
}

export async function maakBedrijf(ctx: Context, invoer: BedrijfInvoer): Promise<{ id: string; bordId: string }> {
  vereisBeheerder(ctx);
  const v = bedrijfSchema.parse(invoer);
  return metTenant(ctx, async (tx) => {
    const [b] = await tx<{ id: string }[]>`
      insert into bedrijven (naam, garage_adres, werkdagen)
      values (${v.naam}, ${v.garageAdres}, ${pgIntArray(v.werkdagen)}::int[]) returning id`;
    const [bord] = await tx<{ id: string }[]>`insert into borden (bedrijf_id, naam) values (${b.id}, 'Takenbord') returning id`;
    return { id: b.id, bordId: bord.id };
  });
}

export async function wijzigBedrijf(ctx: Context, id: string, invoer: BedrijfInvoer): Promise<void> {
  vereisBeheerder(ctx);
  const v = bedrijfSchema.parse(invoer);
  if (!isUuid(id)) throw new NietGevonden('Bedrijf niet gevonden');
  const rijen = await metTenant(ctx, (tx) => tx`
    update bedrijven set naam = ${v.naam}, garage_adres = ${v.garageAdres}, werkdagen = ${pgIntArray(v.werkdagen)}::int[]
    where id = ${id} returning id`);
  if (rijen.length === 0) throw new NietGevonden('Bedrijf niet gevonden');
}
```

`src/lib/diensten/borden.ts`:
```ts
import type { Tx } from '../db/client';
import { metTenant, type Context } from '../db/tenant';
import { bordNaamSchema, isUuid } from '../domein/validatie';
import { NietGevonden, Ongeldig } from '../fouten';
import { vereisBeheerder } from './rechten';

export type Bord = { id: string; bedrijfId: string; naam: string; gearchiveerd: boolean; bedrijfNaam: string; werkdagen: number[] };

export async function lijstBorden(ctx: Context, opties: { metGearchiveerd?: boolean } = {}): Promise<Bord[]> {
  const rijen = await metTenant(ctx, (tx) => tx<Bord[]>`
    select b.id, b.bedrijf_id, b.naam, b.gearchiveerd, bd.naam as bedrijf_naam, bd.werkdagen
    from borden b join bedrijven bd on bd.id = b.bedrijf_id
    where (${opties.metGearchiveerd ?? false} or not b.gearchiveerd)
    order by bd.naam, b.naam`);
  return rijen.map((r) => ({ ...r }));
}

export async function haalBord(ctx: Context, id: string): Promise<Bord> {
  if (!isUuid(id)) throw new NietGevonden('Bord niet gevonden');
  const [b] = await metTenant(ctx, (tx) => tx<Bord[]>`
    select b.id, b.bedrijf_id, b.naam, b.gearchiveerd, bd.naam as bedrijf_naam, bd.werkdagen
    from borden b join bedrijven bd on bd.id = b.bedrijf_id
    where b.id = ${id}`);
  if (!b) throw new NietGevonden('Bord niet gevonden');
  return { ...b };
}

/** Voor gebruik binnen een bestaande tenant-transactie. Gearchiveerde borden tellen niet mee. */
export async function bordInTx(tx: Tx, id: string): Promise<{ id: string; bedrijfId: string; werkdagen: number[] }> {
  if (!isUuid(id)) throw new NietGevonden('Bord niet gevonden');
  const [b] = await tx<{ id: string; bedrijfId: string; werkdagen: number[] }[]>`
    select b.id, b.bedrijf_id, bd.werkdagen
    from borden b join bedrijven bd on bd.id = b.bedrijf_id
    where b.id = ${id} and not b.gearchiveerd`;
  if (!b) throw new NietGevonden('Bord niet gevonden');
  return b;
}

export async function maakBord(ctx: Context, bedrijfId: string, naam: string): Promise<{ id: string }> {
  vereisBeheerder(ctx);
  const n = bordNaamSchema.parse(naam);
  if (!isUuid(bedrijfId)) throw new Ongeldig('Kies een bedrijf');
  const [b] = await metTenant(ctx, (tx) => tx<{ id: string }[]>`
    insert into borden (bedrijf_id, naam) select id, ${n} from bedrijven where id = ${bedrijfId} returning id`);
  if (!b) throw new NietGevonden('Bedrijf niet gevonden');
  return { id: b.id };
}

export async function wijzigBord(ctx: Context, id: string, invoer: { naam: string; gearchiveerd: boolean }): Promise<void> {
  vereisBeheerder(ctx);
  const n = bordNaamSchema.parse(invoer.naam);
  if (!isUuid(id)) throw new NietGevonden('Bord niet gevonden');
  const rijen = await metTenant(ctx, (tx) => tx`
    update borden set naam = ${n}, gearchiveerd = ${invoer.gearchiveerd} where id = ${id} returning id`);
  if (rijen.length === 0) throw new NietGevonden('Bord niet gevonden');
}
```

`src/lib/diensten/medewerkers.ts`:
```ts
import { type Activatie, geefActivatie } from '../auth/activatie';
import { metTenant, type Context } from '../db/tenant';
import { isUuid, medewerkerSchema, type MedewerkerInvoer } from '../domein/validatie';
import { NietGevonden, Ongeldig } from '../fouten';
import { vereisBeheerder } from './rechten';

export type Medewerker = {
  id: string;
  naam: string;
  gebruikersnaam: string;
  bedrijfId: string;
  bedrijfNaam: string;
  actief: boolean;
  geactiveerd: boolean;
  activatieVerlooptOp: Date | null;
};

function pgFoutcode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}

export async function lijstMedewerkers(ctx: Context): Promise<Medewerker[]> {
  vereisBeheerder(ctx);
  const rijen = await metTenant(ctx, (tx) => tx<Medewerker[]>`
    select g.id, g.naam, g.gebruikersnaam, g.bedrijf_id, bd.naam as bedrijf_naam, g.actief,
           (g.wachtwoord_hash is not null) as geactiveerd, g.activatie_verloopt_op
    from gebruikers g join bedrijven bd on bd.id = g.bedrijf_id
    where g.rol = 'medewerker'
    order by bd.naam, g.naam`);
  return rijen.map((r) => ({ ...r }));
}

export async function maakMedewerker(ctx: Context, invoer: MedewerkerInvoer): Promise<{ id: string; activatie: Activatie }> {
  vereisBeheerder(ctx);
  const v = medewerkerSchema.parse(invoer);
  try {
    return await metTenant(ctx, async (tx) => {
      const [g] = await tx<{ id: string }[]>`
        insert into gebruikers (bedrijf_id, naam, gebruikersnaam, rol)
        values (${v.bedrijfId}, ${v.naam}, ${v.gebruikersnaam}, 'medewerker') returning id`;
      return { id: g.id, activatie: await geefActivatie(tx, g.id) };
    });
  } catch (e) {
    if (pgFoutcode(e) === '23505') throw new Ongeldig('Deze gebruikersnaam is al in gebruik.');
    if (pgFoutcode(e) === '23503') throw new Ongeldig('Dit bedrijf bestaat niet.');
    throw e;
  }
}

export async function nieuweActivatie(ctx: Context, gebruikerId: string): Promise<Activatie> {
  vereisBeheerder(ctx);
  if (!isUuid(gebruikerId)) throw new NietGevonden('Medewerker niet gevonden');
  return metTenant(ctx, (tx) => geefActivatie(tx, gebruikerId));
}

export async function zetActief(ctx: Context, gebruikerId: string, actief: boolean): Promise<void> {
  vereisBeheerder(ctx);
  if (!isUuid(gebruikerId)) throw new NietGevonden('Medewerker niet gevonden');
  await metTenant(ctx, async (tx) => {
    const rijen = await tx`update gebruikers set actief = ${actief} where id = ${gebruikerId} and rol = 'medewerker' returning id`;
    if (rijen.length === 0) throw new NietGevonden('Medewerker niet gevonden');
    if (!actief) await tx`delete from sessies where gebruiker_id = ${gebruikerId}`;
  });
}
```

- [ ] **Step 4: Tests draaien en zien slagen**

Run: `npm run test:integratie`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diensten tests/integration/beheer.test.ts
git commit -m "feat: beheer van bedrijven, borden en medewerkers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Takendienst

**Files:**
- Create: `src/lib/diensten/taken.ts`
- Test: `tests/integration/taken.test.ts`

**Interfaces:**
- Consumes: `metTenant`, `Context`, `Tx`, `meldWijziging`, `bordInTx`, schema's, `vergelijkTaken`, fouten
- Produces:
  - `type Taak` (één rij uit `taken_weergave`; velden zie code)
  - `type HistorieRegel = { tijdstip: Date; naam: string | null; wijzigingen: Record<string, { oud: unknown; nieuw: unknown }> }`
  - `takenVoorPeriode(ctx, bordId, van: Datum, tot: Datum): Promise<Taak[]>` (gesorteerd op datum, daarna `vergelijkTaken`)
  - `takenOpDatum(ctx, datum: Datum): Promise<Taak[]>` (alle zichtbare, niet-gearchiveerde borden)
  - `haalTaak(ctx, id): Promise<Taak>`
  - `taakHistorie(ctx, id): Promise<HistorieRegel[]>` (nieuwste eerst)
  - `maakTaak(ctx, invoer: NieuweTaakInvoer, vandaag?: Datum): Promise<{ id: string }>`
  - `wijzigTaak(ctx, id, versie: number, invoer: TaakVeldenInvoer): Promise<void>`
  - `verplaatsTaak(ctx, id, versie: number, datum: Datum): Promise<void>`
  - `zetStatus(ctx, id, versie: number, status: Status): Promise<void>` (alleen de beheerder)
  - `verwijderTaak(ctx, id): Promise<void>`
  - `verschillen(oud: object, nieuw: object): Record<string, { oud: unknown; nieuw: unknown }>`

In deze taak gooit `maakTaak` nog een `Ongeldig('Herhalen volgt in Task 8')` als `herhaling` niet `null` is. Task 8 vervangt dat.

- [ ] **Step 1: De falende test schrijven**

`tests/integration/taken.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/client';
import type { Context } from '../../src/lib/db/tenant';
import { wijzigBord } from '../../src/lib/diensten/borden';
import {
  haalTaak, maakTaak, taakHistorie, takenOpDatum, takenVoorPeriode, verplaatsTaak, verwijderTaak, wijzigTaak, zetStatus,
} from '../../src/lib/diensten/taken';
import { Conflict, GeenToegang, NietGevonden } from '../../src/lib/fouten';
import { leegDatabase, maakBedrijfMetBord, maakBeheerderCtx, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;
let klaas: Context;
let vreemde: Context;
let bordA: string;
let bordB: string;

const velden = (titel: string, extra: Record<string, unknown> = {}) => ({
  titel, omschrijving: '', datum: '2026-10-22', tijd: null, prioriteit: 'middel' as const, ...extra,
});

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  const a = await maakBedrijfMetBord('A');
  const b = await maakBedrijfMetBord('B');
  bordA = a.bordId;
  bordB = b.bordId;
  piet = await maakMedewerkerCtx(a.bedrijfId, 'piet', 'Piet');
  klaas = await maakMedewerkerCtx(a.bedrijfId, 'klaas', 'Klaas');
  vreemde = await maakMedewerkerCtx(b.bedrijfId, 'vreemde', 'Vreemde');
});

const nieuw = (ctx: Context, titel: string, extra: Record<string, unknown> = {}) =>
  maakTaak(ctx, { bordId: bordA, herhaling: null, ...velden(titel, extra) });

describe('taken lezen en aanmaken', () => {
  it('maakt taken en geeft ze gesorteerd terug met namen', async () => {
    await nieuw(piet, 'Later', { tijd: '13:00' });
    await nieuw(piet, 'Vroeg', { tijd: '08:30' });
    await nieuw(piet, 'Dringend', { prioriteit: 'nu' });
    await nieuw(piet, 'Morgen', { datum: '2026-10-23', prioriteit: 'nu' });
    await nieuw(piet, 'Buiten week', { datum: '2026-10-30' });
    const taken = await takenVoorPeriode(piet, bordA, '2026-10-19', '2026-10-25');
    expect(taken.map((t) => t.titel)).toEqual(['Dringend', 'Vroeg', 'Later', 'Morgen']);
    expect(taken[1]).toMatchObject({ datum: '2026-10-22', tijd: '08:30', status: 'open', versie: 1, aangemaaktDoorNaam: 'Piet', bedrijfNaam: 'A' });
  });

  it('schermt andere bedrijven volledig af', async () => {
    const { id } = await nieuw(piet, 'Geheim');
    expect(await takenVoorPeriode(vreemde, bordA, '2026-10-19', '2026-10-25')).toEqual([]);
    await expect(haalTaak(vreemde, id)).rejects.toBeInstanceOf(NietGevonden);
    await expect(wijzigTaak(vreemde, id, 1, velden('Gehackt'))).rejects.toBeInstanceOf(NietGevonden);
    await expect(verwijderTaak(vreemde, id)).rejects.toBeInstanceOf(NietGevonden);
    await expect(maakTaak(vreemde, { bordId: bordA, herhaling: null, ...velden('Inbraak') })).rejects.toBeInstanceOf(NietGevonden);
  });

  it('weigert taken op een gearchiveerd bord', async () => {
    await wijzigBord(beheerder, bordA, { naam: 'Oud', gearchiveerd: true });
    await expect(nieuw(piet, 'X')).rejects.toBeInstanceOf(NietGevonden);
  });
});

describe('taken wijzigen', () => {
  it('een collega kan wijzigen; versie en gewijzigd-door lopen mee', async () => {
    const { id } = await nieuw(piet, 'Banden');
    await wijzigTaak(klaas, id, 1, velden('Banden ophalen', { prioriteit: 'hoog' }));
    expect(await haalTaak(piet, id)).toMatchObject({ titel: 'Banden ophalen', prioriteit: 'hoog', versie: 2, gewijzigdDoorNaam: 'Klaas' });
  });

  it('geeft een conflict bij een verouderde versie', async () => {
    const { id } = await nieuw(piet, 'Banden');
    await wijzigTaak(klaas, id, 1, velden('Versie Klaas'));
    const fout = await wijzigTaak(piet, id, 1, velden('Versie Piet')).catch((e) => e);
    expect(fout).toBeInstanceOf(Conflict);
    expect(fout.message).toBe('Deze taak is zojuist gewijzigd door Klaas. Herladen?');
    expect((await haalTaak(piet, id)).titel).toBe('Versie Klaas');
  });

  it('verplaatsen wist uitgesteld en gemist', async () => {
    const { id } = await nieuw(piet, 'Tanken');
    await db()`update taken set uitgesteld_van = '2026-10-20', gemist = true where id = ${id}`;
    await verplaatsTaak(piet, id, 1, '2026-10-23');
    expect(await haalTaak(piet, id)).toMatchObject({ datum: '2026-10-23', uitgesteldVan: null, gemist: false, versie: 2 });
  });

  it('alleen de beheerder wijzigt de status', async () => {
    const { id } = await nieuw(piet, 'Tanken');
    await expect(zetStatus(piet, id, 1, 'bezig')).rejects.toBeInstanceOf(GeenToegang);
    await zetStatus(beheerder, id, 1, 'klaar');
    const klaar = await haalTaak(beheerder, id);
    expect(klaar.status).toBe('klaar');
    expect(klaar.klaarOp).toBeInstanceOf(Date);
    await zetStatus(beheerder, id, 2, 'open');
    expect((await haalTaak(beheerder, id)).klaarOp).toBeNull();
  });

  it('verwijdert een taak', async () => {
    const { id } = await nieuw(piet, 'Weg');
    await verwijderTaak(klaas, id);
    await expect(haalTaak(piet, id)).rejects.toBeInstanceOf(NietGevonden);
    await expect(verwijderTaak(klaas, id)).rejects.toBeInstanceOf(NietGevonden);
  });

  it('houdt historie bij, nieuwste eerst', async () => {
    const { id } = await nieuw(piet, 'Banden');
    await wijzigTaak(klaas, id, 1, velden('Banden ophalen'));
    await zetStatus(beheerder, id, 2, 'bezig');
    const historie = await taakHistorie(piet, id);
    expect(historie.map((h) => [h.naam, h.wijzigingen])).toEqual([
      ['Max', { status: { oud: 'open', nieuw: 'bezig' } }],
      ['Klaas', { titel: { oud: 'Banden', nieuw: 'Banden ophalen' } }],
    ]);
  });
});

describe('takenOpDatum', () => {
  it('geeft de beheerder taken van alle bedrijven, zonder gearchiveerde borden', async () => {
    await nieuw(piet, 'A-taak', { prioriteit: 'laag' });
    await maakTaak(vreemde, { bordId: bordB, herhaling: null, ...velden('B-taak', { prioriteit: 'nu' }) });
    expect((await takenOpDatum(beheerder, '2026-10-22')).map((t) => `${t.bedrijfNaam}:${t.titel}`)).toEqual(['B:B-taak', 'A:A-taak']);
    await wijzigBord(beheerder, bordB, { naam: 'Oud', gearchiveerd: true });
    expect((await takenOpDatum(beheerder, '2026-10-22')).map((t) => t.titel)).toEqual(['A-taak']);
  });
});
```

- [ ] **Step 2: Test draaien en zien falen**

Run: `npm run test:integratie`
Expected: FAIL (`src/lib/diensten/taken` ontbreekt).

- [ ] **Step 3: Implementatie schrijven**

`src/lib/diensten/taken.ts`:
```ts
import type { Tx } from '../db/client';
import { meldWijziging } from '../db/gebeurtenissen';
import { metTenant, type Context } from '../db/tenant';
import { type Datum, vandaagInAmsterdam } from '../domein/datums';
import type { HerhalingType } from '../domein/herhaling';
import { type Prioriteit, type Status, vergelijkTaken } from '../domein/taak';
import {
  isUuid, nieuweTaakSchema, statusSchema, taakVeldenSchema, type NieuweTaakInvoer, type TaakVeldenInvoer,
} from '../domein/validatie';
import { Conflict, GeenToegang, NietGevonden, Ongeldig } from '../fouten';
import { bordInTx } from './borden';

export type Taak = {
  id: string;
  bedrijfId: string;
  bordId: string;
  titel: string;
  omschrijving: string;
  datum: Datum;
  tijd: string | null;
  prioriteit: Prioriteit;
  status: Status;
  oorspronkelijkeDatum: Datum;
  uitgesteldVan: Datum | null;
  gemist: boolean;
  herhalingId: string | null;
  afwijkend: boolean;
  versie: number;
  aangemaaktOp: Date;
  gewijzigdOp: Date;
  klaarOp: Date | null;
  aangemaaktDoorNaam: string | null;
  gewijzigdDoorNaam: string | null;
  herhalingType: HerhalingType | null;
  herhalingWeekdagen: number[] | null;
  herhalingInterval: number | null;
  bedrijfNaam: string;
  bordNaam: string;
  bordGearchiveerd: boolean;
};

export type HistorieRegel = { tijdstip: Date; naam: string | null; wijzigingen: Record<string, { oud: unknown; nieuw: unknown }> };

const plat = <T extends object>(rijen: readonly T[]): T[] => rijen.map((r) => ({ ...r }));
const NIET_GEVONDEN = 'Taak niet gevonden';

export async function takenVoorPeriode(ctx: Context, bordId: string, van: Datum, tot: Datum): Promise<Taak[]> {
  if (!isUuid(bordId)) return [];
  const rijen = await metTenant(ctx, (tx) => tx<Taak[]>`
    select * from taken_weergave where bord_id = ${bordId} and datum between ${van} and ${tot}`);
  return plat(rijen).sort((a, b) => a.datum.localeCompare(b.datum) || vergelijkTaken(a, b));
}

export async function takenOpDatum(ctx: Context, datum: Datum): Promise<Taak[]> {
  const rijen = await metTenant(ctx, (tx) => tx<Taak[]>`
    select * from taken_weergave where datum = ${datum} and not bord_gearchiveerd`);
  return plat(rijen).sort(vergelijkTaken);
}

export async function haalTaak(ctx: Context, id: string): Promise<Taak> {
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const [t] = await metTenant(ctx, (tx) => tx<Taak[]>`select * from taken_weergave where id = ${id}`);
  if (!t) throw new NietGevonden(NIET_GEVONDEN);
  return { ...t };
}

export async function taakHistorie(ctx: Context, id: string): Promise<HistorieRegel[]> {
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const rijen = await metTenant(ctx, (tx) => tx<HistorieRegel[]>`
    select h.tijdstip, g.naam, h.wijzigingen
    from taak_historie h left join gebruikers g on g.id = h.gebruiker_id
    where h.taak_id = ${id}
    order by h.tijdstip desc, h.id desc`);
  return plat(rijen);
}

export async function maakTaak(ctx: Context, invoer: NieuweTaakInvoer, vandaag: Datum = vandaagInAmsterdam()): Promise<{ id: string }> {
  const v = nieuweTaakSchema.parse(invoer);
  void vandaag; // gebruikt door herhalingen (Task 8)
  return metTenant(ctx, async (tx) => {
    const bord = await bordInTx(tx, v.bordId);
    if (v.herhaling) throw new Ongeldig('Herhalen volgt in Task 8');
    const [t] = await tx<{ id: string }[]>`
      insert into taken (bedrijf_id, bord_id, titel, omschrijving, datum, tijd, prioriteit, oorspronkelijke_datum, aangemaakt_door, gewijzigd_door)
      values (${bord.bedrijfId}, ${bord.id}, ${v.titel}, ${v.omschrijving}, ${v.datum}, ${v.tijd}, ${v.prioriteit}, ${v.datum},
              ${ctx.gebruikerId}, ${ctx.gebruikerId})
      returning id`;
    await meldWijziging(tx, bord.id);
    return { id: t.id };
  });
}

type Vergrendeld = {
  id: string;
  bordId: string;
  titel: string;
  omschrijving: string;
  datum: Datum;
  tijd: string | null;
  prioriteit: Prioriteit;
  status: Status;
  versie: number;
  herhalingId: string | null;
  gewijzigdDoorNaam: string | null;
};

async function vergrendel(tx: Tx, id: string, versie: number): Promise<Vergrendeld> {
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  const [t] = await tx<Vergrendeld[]>`
    select t.id, t.bord_id, t.titel, t.omschrijving, t.datum, to_char(t.tijd, 'HH24:MI') as tijd, t.prioriteit,
           t.status, t.versie, t.herhaling_id, g.naam as gewijzigd_door_naam
    from taken t left join gebruikers g on g.id = t.gewijzigd_door
    where t.id = ${id}
    for update of t`;
  if (!t) throw new NietGevonden(NIET_GEVONDEN);
  if (t.versie !== versie) throw new Conflict(t.gewijzigdDoorNaam);
  return t;
}

const GEVOLGD = ['titel', 'omschrijving', 'datum', 'tijd', 'prioriteit', 'status'] as const;

export function verschillen(oud: object, nieuw: object): Record<string, { oud: unknown; nieuw: unknown }> {
  const o = oud as Record<string, unknown>;
  const n = nieuw as Record<string, unknown>;
  const uit: Record<string, { oud: unknown; nieuw: unknown }> = {};
  for (const veld of GEVOLGD) {
    if (!(veld in n)) continue;
    const a = o[veld] ?? null;
    const b = n[veld] ?? null;
    if (a !== b) uit[veld] = { oud: a, nieuw: b };
  }
  return uit;
}

async function logWijzigingen(tx: Tx, taakId: string, gebruikerId: string, oud: object, nieuw: object): Promise<void> {
  const w = verschillen(oud, nieuw);
  if (Object.keys(w).length === 0) return;
  await tx`insert into taak_historie (taak_id, gebruiker_id, wijzigingen) values (${taakId}, ${gebruikerId}, ${JSON.stringify(w)}::jsonb)`;
}

export async function wijzigTaak(ctx: Context, id: string, versie: number, invoer: TaakVeldenInvoer): Promise<void> {
  const v = taakVeldenSchema.parse(invoer);
  await metTenant(ctx, async (tx) => {
    const oud = await vergrendel(tx, id, versie);
    const anderedag = oud.datum !== v.datum;
    await tx`
      update taken set
        titel = ${v.titel}, omschrijving = ${v.omschrijving}, datum = ${v.datum}, tijd = ${v.tijd}, prioriteit = ${v.prioriteit},
        afwijkend = (herhaling_id is not null),
        uitgesteld_van = case when ${anderedag} then null else uitgesteld_van end,
        gemist = case when ${anderedag} then false else gemist end,
        versie = versie + 1, gewijzigd_door = ${ctx.gebruikerId}, gewijzigd_op = now()
      where id = ${id}`;
    await logWijzigingen(tx, id, ctx.gebruikerId, oud, v);
    await meldWijziging(tx, oud.bordId);
  });
}

export async function verplaatsTaak(ctx: Context, id: string, versie: number, datum: Datum): Promise<void> {
  const nieuweDatum = taakVeldenSchema.shape.datum.parse(datum);
  await metTenant(ctx, async (tx) => {
    const oud = await vergrendel(tx, id, versie);
    await tx`
      update taken set
        datum = ${nieuweDatum}, afwijkend = (herhaling_id is not null), uitgesteld_van = null, gemist = false,
        versie = versie + 1, gewijzigd_door = ${ctx.gebruikerId}, gewijzigd_op = now()
      where id = ${id}`;
    await logWijzigingen(tx, id, ctx.gebruikerId, oud, { datum: nieuweDatum });
    await meldWijziging(tx, oud.bordId);
  });
}

export async function zetStatus(ctx: Context, id: string, versie: number, status: Status): Promise<void> {
  if (ctx.rol !== 'beheerder') throw new GeenToegang('Alleen de beheerder kan de status wijzigen.');
  const s = statusSchema.parse(status);
  await metTenant(ctx, async (tx) => {
    const oud = await vergrendel(tx, id, versie);
    await tx`
      update taken set
        status = ${s}, klaar_op = case when ${s} = 'klaar' then now() else null end,
        versie = versie + 1, gewijzigd_door = ${ctx.gebruikerId}, gewijzigd_op = now()
      where id = ${id}`;
    await logWijzigingen(tx, id, ctx.gebruikerId, oud, { status: s });
    await meldWijziging(tx, oud.bordId);
  });
}

export async function verwijderTaak(ctx: Context, id: string): Promise<void> {
  if (!isUuid(id)) throw new NietGevonden(NIET_GEVONDEN);
  await metTenant(ctx, async (tx) => {
    const [t] = await tx<{ bordId: string }[]>`delete from taken where id = ${id} returning bord_id`;
    if (!t) throw new NietGevonden(NIET_GEVONDEN);
    await meldWijziging(tx, t.bordId);
  });
}
```

Postgres kan bij `${s} = 'klaar'` het parametertype niet altijd afleiden. Faalt de query met `could not determine data type of parameter`, schrijf dan `${s}::text = 'klaar'`. Doe hetzelfde voor `${anderedag}::boolean`.

- [ ] **Step 4: Tests draaien en zien slagen**

Run: `npm run test:integratie`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diensten/taken.ts tests/integration/taken.test.ts
git commit -m "feat: takendienst met versiecontrole, status en historie" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Herhalende reeksen

**Files:**
- Create: `src/lib/diensten/herhalingen.ts`
- Modify: `src/lib/diensten/taken.ts` (`maakTaak`)
- Test: `tests/integration/herhalingen.test.ts`

**Interfaces:**
- Consumes: `datumsVoorHerhaling`, `plusDagen`, `vandaagInAmsterdam`, `pgIntArray`, `meldWijziging`, `metTenant`, `reeksSchema`, `HerhalingInvoer`
- Produces:
  - `HORIZON_DAGEN = 14`
  - `genereerExemplaren(tx: Tx, herhalingId: string, vandaag: Datum): Promise<number>`
  - `maakReeks(tx: Tx, gebruikerId: string, bord: { id: string; bedrijfId: string }, velden: { titel: string; omschrijving: string; datum: Datum; tijd: string | null; prioriteit: Prioriteit }, regel: HerhalingInvoer, vandaag: Datum): Promise<string>` (id van de eerste taak)
  - `wijzigReeks(ctx, herhalingId, invoer: ReeksInvoer, vandaag?: Datum): Promise<void>`
  - `stopReeks(ctx, herhalingId, vandaag?: Datum): Promise<void>`

Regels (spec §7.4):
- Er worden taken aangemaakt tot en met `max(vandaag, startdatum) + 13`.
- `gegenereerd_tot` onthoudt tot waar de reeks al is aangemaakt.
- Een reeks wijzigen werkt de toekomstige exemplaren bij die niet afwijkend en nog open zijn (inclusief vandaag). Zulke exemplaren worden verwijderd en opnieuw aangemaakt. Exemplaren met status `bezig` of die zijn doorgeschoven, krijgen alleen de nieuwe velden.
- Een reeks stoppen zet `actief = false` en verwijdert dezelfde open, toekomstige exemplaren.

- [ ] **Step 1: De falende test schrijven**

`tests/integration/herhalingen.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/client';
import type { Context } from '../../src/lib/db/tenant';
import { genereerExemplaren, stopReeks, wijzigReeks } from '../../src/lib/diensten/herhalingen';
import { maakTaak, verwijderTaak, wijzigTaak, zetStatus } from '../../src/lib/diensten/taken';
import { NietGevonden } from '../../src/lib/fouten';
import { leegDatabase, maakBedrijfMetBord, maakBeheerderCtx, maakMedewerkerCtx } from './helpers';

const VANDAAG = '2026-11-02'; // maandag

let beheerder: Context;
let piet: Context;
let vreemde: Context;
let bordId: string;

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  const a = await maakBedrijfMetBord('A');
  const b = await maakBedrijfMetBord('B');
  bordId = a.bordId;
  piet = await maakMedewerkerCtx(a.bedrijfId, 'piet', 'Piet');
  vreemde = await maakMedewerkerCtx(b.bedrijfId, 'vreemde');
});

const maakDagelijks = () => maakTaak(piet, {
  bordId, titel: 'Werkplaats vegen', omschrijving: '', datum: VANDAAG, tijd: '17:00', prioriteit: 'laag',
  herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
}, VANDAAG);

async function reeks() {
  return db()<{ id: string; datum: string; titel: string; status: string; herhalingId: string }[]>`
    select id, datum, titel, status, herhaling_id from taken order by datum`;
}

const genereer = (herhalingId: string, vandaag: string) => db().begin((tx) => genereerExemplaren(tx, herhalingId, vandaag));

describe('herhalende reeksen', () => {
  it('maakt 14 dagen vooruit taken op werkdagen en geeft de eerste terug', async () => {
    const { id } = await maakDagelijks();
    const taken = await reeks();
    expect(taken.map((t) => t.datum)).toEqual([
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
    ]);
    expect(taken[0].id).toBe(id);
  });

  it('genereert idempotent en schuift de horizon op', async () => {
    await maakDagelijks();
    const h = (await reeks())[0].herhalingId;
    expect(await genereer(h, VANDAAG)).toBe(0);
    expect(await genereer(h, '2026-11-03')).toBe(1);
    expect((await reeks()).at(-1)?.datum).toBe('2026-11-16');
  });

  it('maakt een los verwijderd exemplaar niet opnieuw aan', async () => {
    await maakDagelijks();
    const taken = await reeks();
    await verwijderTaak(piet, taken[2].id); // 2026-11-04
    await genereer(taken[0].herhalingId, '2026-11-03');
    expect((await reeks()).map((t) => t.datum)).not.toContain('2026-11-04');
  });

  it('reeks wijzigen: los gewijzigde exemplaren blijven, de rest volgt het nieuwe schema', async () => {
    await maakDagelijks();
    const taken = await reeks();
    await wijzigTaak(piet, taken[1].id, 1, { titel: 'Los', omschrijving: '', datum: '2026-11-03', tijd: '17:00', prioriteit: 'laag' });
    await wijzigReeks(piet, taken[0].herhalingId, {
      titel: 'Nieuw', omschrijving: '', tijd: '16:00', prioriteit: 'middel',
      herhaling: { type: 'weekdagen', weekdagen: [1, 4], intervalWeken: 1 },
    }, VANDAAG);
    expect((await reeks()).map((t) => [t.datum, t.titel])).toEqual([
      ['2026-11-02', 'Nieuw'], ['2026-11-03', 'Los'], ['2026-11-05', 'Nieuw'], ['2026-11-09', 'Nieuw'], ['2026-11-12', 'Nieuw'],
    ]);
  });

  it('reeks wijzigen: een exemplaar dat bezig is blijft bestaan en krijgt de nieuwe titel', async () => {
    await maakDagelijks();
    const taken = await reeks();
    await zetStatus(beheerder, taken[2].id, 1, 'bezig');
    await wijzigReeks(piet, taken[0].herhalingId, {
      titel: 'Nieuw', omschrijving: '', tijd: '17:00', prioriteit: 'laag',
      herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
    }, VANDAAG);
    const bezig = (await reeks()).find((t) => t.id === taken[2].id);
    expect(bezig).toMatchObject({ titel: 'Nieuw', status: 'bezig' });
  });

  it('reeks stoppen verwijdert toekomstige open exemplaren en genereert niets meer', async () => {
    await maakDagelijks();
    const h = (await reeks())[0].herhalingId;
    await stopReeks(piet, h, '2026-11-04');
    expect((await reeks()).map((t) => t.datum)).toEqual(['2026-11-02', '2026-11-03']);
    expect(await genereer(h, '2026-11-05')).toBe(0);
  });

  it('een ander bedrijf kan de reeks niet wijzigen of stoppen', async () => {
    await maakDagelijks();
    const h = (await reeks())[0].herhalingId;
    const invoer = { titel: 'X', omschrijving: '', tijd: null, prioriteit: 'laag' as const, herhaling: { type: 'dagelijks' as const, weekdagen: [], intervalWeken: 1 } };
    await expect(wijzigReeks(vreemde, h, invoer, VANDAAG)).rejects.toBeInstanceOf(NietGevonden);
    await expect(stopReeks(vreemde, h, VANDAAG)).rejects.toBeInstanceOf(NietGevonden);
  });
});
```

- [ ] **Step 2: Test draaien en zien falen**

Run: `npm run test:integratie`
Expected: FAIL (`herhalingen` ontbreekt, en `maakTaak` gooit "Herhalen volgt in Task 8").

- [ ] **Step 3: Implementatie schrijven**

`src/lib/diensten/herhalingen.ts`:
```ts
import { pgIntArray, type Tx } from '../db/client';
import { meldWijziging } from '../db/gebeurtenissen';
import { metTenant, type Context } from '../db/tenant';
import { type Datum, plusDagen, vandaagInAmsterdam } from '../domein/datums';
import { datumsVoorHerhaling, type HerhalingType } from '../domein/herhaling';
import type { Prioriteit } from '../domein/taak';
import { isUuid, reeksSchema, type HerhalingInvoer, type ReeksInvoer } from '../domein/validatie';
import { NietGevonden } from '../fouten';

export const HORIZON_DAGEN = 14;

type HerhalingRij = {
  id: string;
  bedrijfId: string;
  bordId: string;
  titel: string;
  omschrijving: string;
  tijd: string | null;
  prioriteit: Prioriteit;
  type: HerhalingType;
  weekdagen: number[];
  intervalWeken: number;
  startdatum: Datum;
  gegenereerdTot: Datum | null;
  actief: boolean;
  aangemaaktDoor: string | null;
  werkdagen: number[];
};

const laterVan = (a: Datum, b: Datum): Datum => (a > b ? a : b);

export async function genereerExemplaren(tx: Tx, herhalingId: string, vandaag: Datum): Promise<number> {
  const [h] = await tx<HerhalingRij[]>`
    select h.id, h.bedrijf_id, h.bord_id, h.titel, h.omschrijving, h.tijd, h.prioriteit, h.type, h.weekdagen,
           h.interval_weken, h.startdatum, h.gegenereerd_tot, h.actief, h.aangemaakt_door, bd.werkdagen
    from herhalingen h join bedrijven bd on bd.id = h.bedrijf_id
    where h.id = ${herhalingId}`;
  if (!h || !h.actief) return 0;
  const tot = plusDagen(laterVan(h.startdatum, vandaag), HORIZON_DAGEN - 1);
  const van = h.gegenereerdTot ? laterVan(plusDagen(h.gegenereerdTot, 1), vandaag) : h.startdatum;
  if (van > tot) return 0;
  const datums = datumsVoorHerhaling(
    { type: h.type, weekdagen: h.weekdagen, intervalWeken: h.intervalWeken, startdatum: h.startdatum },
    van, tot, h.werkdagen,
  );
  let aantal = 0;
  for (const d of datums) {
    const r = await tx`
      insert into taken (bedrijf_id, bord_id, titel, omschrijving, datum, tijd, prioriteit, oorspronkelijke_datum,
                         herhaling_id, aangemaakt_door, gewijzigd_door)
      values (${h.bedrijfId}, ${h.bordId}, ${h.titel}, ${h.omschrijving}, ${d}, ${h.tijd}, ${h.prioriteit}, ${d},
              ${h.id}, ${h.aangemaaktDoor}, ${h.aangemaaktDoor})
      on conflict (herhaling_id, oorspronkelijke_datum) where herhaling_id is not null do nothing
      returning id`;
    aantal += r.length;
  }
  await tx`update herhalingen set gegenereerd_tot = ${tot} where id = ${h.id}`;
  if (aantal > 0) await meldWijziging(tx, h.bordId);
  return aantal;
}

export async function maakReeks(
  tx: Tx,
  gebruikerId: string,
  bord: { id: string; bedrijfId: string },
  velden: { titel: string; omschrijving: string; datum: Datum; tijd: string | null; prioriteit: Prioriteit },
  regel: HerhalingInvoer,
  vandaag: Datum,
): Promise<string> {
  const [h] = await tx<{ id: string }[]>`
    insert into herhalingen (bedrijf_id, bord_id, titel, omschrijving, tijd, prioriteit, type, weekdagen, interval_weken, startdatum, aangemaakt_door)
    values (${bord.bedrijfId}, ${bord.id}, ${velden.titel}, ${velden.omschrijving}, ${velden.tijd}, ${velden.prioriteit},
            ${regel.type}, ${pgIntArray(regel.weekdagen)}::int[], ${regel.intervalWeken}, ${velden.datum}, ${gebruikerId})
    returning id`;
  await genereerExemplaren(tx, h.id, vandaag);
  const [eerste] = await tx<{ id: string }[]>`select id from taken where herhaling_id = ${h.id} order by datum limit 1`;
  if (!eerste) throw new Error('Reeks leverde geen taken op');
  return eerste.id;
}

const OPEN_TOEKOMST = (tx: Tx, herhalingId: string, vandaag: Datum) => tx`
  delete from taken
  where herhaling_id = ${herhalingId} and datum >= ${vandaag} and not afwijkend and status = 'open' and uitgesteld_van is null`;

export async function wijzigReeks(ctx: Context, herhalingId: string, invoer: ReeksInvoer, vandaag: Datum = vandaagInAmsterdam()): Promise<void> {
  const v = reeksSchema.parse(invoer);
  if (!isUuid(herhalingId)) throw new NietGevonden('Reeks niet gevonden');
  await metTenant(ctx, async (tx) => {
    const [h] = await tx<{ bordId: string }[]>`
      update herhalingen set
        titel = ${v.titel}, omschrijving = ${v.omschrijving}, tijd = ${v.tijd}, prioriteit = ${v.prioriteit},
        type = ${v.herhaling.type}, weekdagen = ${pgIntArray(v.herhaling.weekdagen)}::int[], interval_weken = ${v.herhaling.intervalWeken},
        gegenereerd_tot = ${plusDagen(vandaag, -1)}
      where id = ${herhalingId}
      returning bord_id`;
    if (!h) throw new NietGevonden('Reeks niet gevonden');
    await tx`
      update taken set
        titel = ${v.titel}, omschrijving = ${v.omschrijving}, tijd = ${v.tijd}, prioriteit = ${v.prioriteit},
        versie = versie + 1, gewijzigd_door = ${ctx.gebruikerId}, gewijzigd_op = now()
      where herhaling_id = ${herhalingId} and datum >= ${vandaag} and not afwijkend
        and (status = 'bezig' or (status = 'open' and uitgesteld_van is not null))`;
    await OPEN_TOEKOMST(tx, herhalingId, vandaag);
    await genereerExemplaren(tx, herhalingId, vandaag);
    await meldWijziging(tx, h.bordId);
  });
}

export async function stopReeks(ctx: Context, herhalingId: string, vandaag: Datum = vandaagInAmsterdam()): Promise<void> {
  if (!isUuid(herhalingId)) throw new NietGevonden('Reeks niet gevonden');
  await metTenant(ctx, async (tx) => {
    const [h] = await tx<{ bordId: string }[]>`update herhalingen set actief = false where id = ${herhalingId} returning bord_id`;
    if (!h) throw new NietGevonden('Reeks niet gevonden');
    await OPEN_TOEKOMST(tx, herhalingId, vandaag);
    await meldWijziging(tx, h.bordId);
  });
}
```

Pas in `src/lib/diensten/taken.ts` de functie `maakTaak` aan. Voeg de import toe:
```ts
import { maakReeks } from './herhalingen';
```
Vervang dan in `maakTaak` deze twee regels:
```ts
  void vandaag; // gebruikt door herhalingen (Task 8)
```
en
```ts
    if (v.herhaling) throw new Ongeldig('Herhalen volgt in Task 8');
```
door (de eerste regel vervalt helemaal, de tweede wordt):
```ts
    if (v.herhaling) {
      const id = await maakReeks(tx, ctx.gebruikerId, bord, v, v.herhaling, vandaag);
      await meldWijziging(tx, bord.id);
      return { id };
    }
```
Verwijder daarna `Ongeldig` uit de imports van `taken.ts` als het nergens meer gebruikt wordt (`npm run typecheck` meldt dat niet; controleer het met de hand).

- [ ] **Step 4: Tests draaien en zien slagen**

Run: `npm run test:integratie && npm run typecheck`
Expected: PASS, geen typefouten.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diensten tests/integration/herhalingen.test.ts
git commit -m "feat: herhalende reeksen aanmaken, wijzigen en stoppen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Worker: doorschuiven en herhalingen

**Files:**
- Create: `src/worker/taken/doorschuiven.ts`, `src/worker/taken/herhalingen.ts`, `src/worker/index.ts`
- Test: `tests/integration/worker.test.ts`

**Interfaces:**
- Consumes: `planDoorschuiven`, `reeksSleutel`, `OpenTaak`, `vandaagInAmsterdam`, `genereerExemplaren`, `meldWijziging`, `db`, `Db`
- Produces:
  - `doorschuiven(sql?: Db, vandaag?: Datum): Promise<{ verplaatst: number; gemist: number }>`
  - `genereerAlleHerhalingen(sql?: Db, vandaag?: Datum): Promise<number>`
  - `src/worker/index.ts`: een proces dat bij de start één keer `nachtrun()` draait en daarna elke dag om 00:05 (Europe/Amsterdam)

De worker draait op de eigenaar-verbinding en omzeilt RLS bewust, omdat hij voor alle bedrijven werkt. Hij genereert eerst de herhalingen en schuift daarna door, zodat de "gemist"-controle de nieuwe exemplaren ziet.

- [ ] **Step 1: De falende test schrijven**

`tests/integration/worker.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/lib/db/client';
import type { Context } from '../../src/lib/db/tenant';
import { maakTaak, zetStatus } from '../../src/lib/diensten/taken';
import { doorschuiven } from '../../src/worker/taken/doorschuiven';
import { genereerAlleHerhalingen } from '../../src/worker/taken/herhalingen';
import { leegDatabase, maakBedrijfMetBord, maakBeheerderCtx, maakMedewerkerCtx } from './helpers';

let beheerder: Context;
let piet: Context;
let bordId: string;

beforeEach(async () => {
  await leegDatabase();
  beheerder = await maakBeheerderCtx();
  const a = await maakBedrijfMetBord('A');
  bordId = a.bordId;
  piet = await maakMedewerkerCtx(a.bedrijfId, 'piet');
});

const taak = (titel: string, datum: string) =>
  maakTaak(piet, { bordId, titel, omschrijving: '', datum, tijd: null, prioriteit: 'middel', herhaling: null });

const staat = async (id: string) =>
  (await db()<{ datum: string; uitgesteldVan: string | null; gemist: boolean }[]>`select datum, uitgesteld_van, gemist from taken where id = ${id}`)[0];

describe('doorschuiven', () => {
  it('verplaatst open en bezige taken, niet klare; onthoudt de eerste oude datum', async () => {
    const a = await taak('A', '2026-11-02');
    const b = await taak('B', '2026-11-02');
    const c = await taak('C', '2026-11-03');
    await zetStatus(beheerder, b.id, 1, 'klaar');
    await zetStatus(beheerder, c.id, 1, 'bezig');

    expect(await doorschuiven(db(), '2026-11-04')).toEqual({ verplaatst: 2, gemist: 0 });
    expect(await staat(a.id)).toEqual({ datum: '2026-11-04', uitgesteldVan: '2026-11-02', gemist: false });
    expect((await staat(b.id)).datum).toBe('2026-11-02');
    expect(await staat(c.id)).toMatchObject({ datum: '2026-11-04', uitgesteldVan: '2026-11-03' });

    expect(await doorschuiven(db(), '2026-11-04')).toEqual({ verplaatst: 0, gemist: 0 });
    await doorschuiven(db(), '2026-11-05');
    expect(await staat(a.id)).toMatchObject({ datum: '2026-11-05', uitgesteldVan: '2026-11-02' });
  });

  it('schuift in het weekend door naar de eerste werkdag van het bedrijf', async () => {
    const a = await taak('A', '2026-11-06');
    await doorschuiven(db(), '2026-11-07');
    expect((await staat(a.id)).datum).toBe('2026-11-09');

    const zat = await maakBedrijfMetBord('Zaterdaggarage', [1, 2, 3, 4, 5, 6]);
    const kees = await maakMedewerkerCtx(zat.bedrijfId, 'kees');
    const z = await maakTaak(kees, { bordId: zat.bordId, titel: 'Z', omschrijving: '', datum: '2026-11-06', tijd: null, prioriteit: 'laag', herhaling: null });
    await doorschuiven(db(), '2026-11-07');
    expect((await staat(z.id)).datum).toBe('2026-11-07');
  });

  it('markeert achterstallige reeks-exemplaren als gemist als de reeks vandaag al een exemplaar heeft', async () => {
    await maakTaak(piet, {
      bordId, titel: 'Vegen', omschrijving: '', datum: '2026-11-02', tijd: null, prioriteit: 'laag',
      herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
    }, '2026-11-02');
    expect(await doorschuiven(db(), '2026-11-04')).toEqual({ verplaatst: 0, gemist: 2 });
    const rijen = await db()<{ datum: string; gemist: boolean }[]>`select datum, gemist from taken where datum < '2026-11-05' order by datum`;
    expect(rijen).toEqual([
      { datum: '2026-11-02', gemist: true },
      { datum: '2026-11-03', gemist: true },
      { datum: '2026-11-04', gemist: false },
    ]);
  });
});

describe('genereerAlleHerhalingen', () => {
  it('vult alle actieve reeksen aan', async () => {
    await maakTaak(piet, {
      bordId, titel: 'Vegen', omschrijving: '', datum: '2026-11-02', tijd: null, prioriteit: 'laag',
      herhaling: { type: 'dagelijks', weekdagen: [], intervalWeken: 1 },
    }, '2026-11-02');
    expect(await genereerAlleHerhalingen(db(), '2026-11-03')).toBe(1);
    await db()`update herhalingen set actief = false`;
    expect(await genereerAlleHerhalingen(db(), '2026-11-10')).toBe(0);
  });
});
```

- [ ] **Step 2: Test draaien en zien falen**

Run: `npm run test:integratie`
Expected: FAIL (`src/worker/...` ontbreekt).

- [ ] **Step 3: Implementatie schrijven**

`src/worker/taken/doorschuiven.ts`:
```ts
import { db, type Db } from '../../lib/db/client';
import { meldWijziging } from '../../lib/db/gebeurtenissen';
import { type Datum, eersteWerkdagVanaf, vandaagInAmsterdam } from '../../lib/domein/datums';
import { type OpenTaak, planDoorschuiven, reeksSleutel } from '../../lib/domein/doorschuiven';

export async function doorschuiven(sql: Db = db(), vandaag: Datum = vandaagInAmsterdam()): Promise<{ verplaatst: number; gemist: number }> {
  const bedrijven = await sql<{ id: string; werkdagen: number[] }[]>`select id, werkdagen from bedrijven`;
  let verplaatst = 0;
  let gemist = 0;
  for (const b of bedrijven) {
    await sql.begin(async (tx) => {
      const open = await tx<(OpenTaak & { bordId: string })[]>`
        select id, datum, herhaling_id, bord_id from taken
        where bedrijf_id = ${b.id} and status in ('open', 'bezig') and not gemist and datum < ${vandaag}
        for update`;
      if (open.length === 0) return;
      const doel = eersteWerkdagVanaf(vandaag, b.werkdagen);
      const bezet = await tx<{ herhalingId: string; datum: Datum }[]>`
        select herhaling_id, datum from taken
        where bedrijf_id = ${b.id} and datum = ${doel} and herhaling_id is not null`;
      const plan = planDoorschuiven(open, vandaag, b.werkdagen, new Set(bezet.map((r) => reeksSleutel(r.herhalingId, r.datum))));
      for (const v of plan.verplaatsen) {
        await tx`update taken set datum = ${v.naar}, uitgesteld_van = coalesce(uitgesteld_van, datum), versie = versie + 1 where id = ${v.id}`;
      }
      if (plan.gemist.length > 0) {
        await tx`update taken set gemist = true, versie = versie + 1 where id in ${tx(plan.gemist)}`;
      }
      for (const bordId of new Set(open.map((t) => t.bordId))) await meldWijziging(tx, bordId);
      verplaatst += plan.verplaatsen.length;
      gemist += plan.gemist.length;
    });
  }
  return { verplaatst, gemist };
}
```

`src/worker/taken/herhalingen.ts`:
```ts
import { db, type Db } from '../../lib/db/client';
import { type Datum, vandaagInAmsterdam } from '../../lib/domein/datums';
import { genereerExemplaren } from '../../lib/diensten/herhalingen';

export async function genereerAlleHerhalingen(sql: Db = db(), vandaag: Datum = vandaagInAmsterdam()): Promise<number> {
  const reeksen = await sql<{ id: string }[]>`select id from herhalingen where actief`;
  let totaal = 0;
  for (const { id } of reeksen) {
    totaal += (await sql.begin((tx) => genereerExemplaren(tx, id, vandaag))) as number;
  }
  return totaal;
}
```

`src/worker/index.ts`:
```ts
import cron from 'node-cron';
import { vandaagInAmsterdam } from '../lib/domein/datums';
import { doorschuiven } from './taken/doorschuiven';
import { genereerAlleHerhalingen } from './taken/herhalingen';

async function nachtrun(): Promise<void> {
  const vandaag = vandaagInAmsterdam();
  try {
    const nieuw = await genereerAlleHerhalingen(undefined, vandaag);
    const { verplaatst, gemist } = await doorschuiven(undefined, vandaag);
    console.log(`[worker] ${vandaag}: ${nieuw} herhaalde taken aangemaakt, ${verplaatst} doorgeschoven, ${gemist} gemist`);
  } catch (e) {
    console.error('[worker] nachtrun mislukt', e);
  }
}

async function main(): Promise<void> {
  console.log('[worker] gestart; inhalen…');
  await nachtrun();
  cron.schedule('5 0 * * *', () => void nachtrun(), { timezone: 'Europe/Amsterdam' });
}

void main();
```

- [ ] **Step 4: Tests draaien en zien slagen**

Run: `npm run test:integratie && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Worker met de hand proberen**

Run: `timeout 8 npm run worker || true`
Expected: in de uitvoer staan `[worker] gestart; inhalen…` en een regel `[worker] 20xx-xx-xx: 0 herhaalde taken aangemaakt, 0 doorgeschoven, 0 gemist`.

- [ ] **Step 6: Commit**

```bash
git add src/worker tests/integration/worker.test.ts
git commit -m "feat: worker voor doorschuiven en herhalingen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Thema, UI-basis en inlogschermen

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` (tijdelijk, Task 12 verwijdert hem)
- Create: `src/app/error.tsx`, `src/app/not-found.tsx`
- Create: `src/lib/web/actie.ts`, `src/lib/web/sessie-cookie.ts`, `src/lib/web/huidige-gebruiker.ts`
- Create: `src/components/ui.tsx`, `src/components/iconen.tsx`
- Create: `src/components/auth/auth-kader.tsx`, `src/components/auth/inlog-formulier.tsx`, `src/components/auth/wachtwoord-formulier.tsx`
- Create: `src/app/login/page.tsx`, `src/app/login/acties.ts`, `src/app/activeren/page.tsx`, `src/app/activeren/[token]/page.tsx`, `src/app/activeren/acties.ts`
- Create: `src/scripts/maak-beheerder.ts`
- Test: `tests/unit/actie.test.ts`

**Interfaces:**
- Consumes: `inloggen`, `activeerMetToken`, `activeerMetCode`, `activatieVoorToken`, `maakSessie`, `gebruikerVoorSessie`, `verwijderSessie`, `maakBeheerder`, fouten, `Context`
- Produces:
  - `src/lib/web/actie.ts`: `type ActieResultaat<T = null> = { ok: true; data: T } | { ok: false; fout: string; conflict?: boolean }`, `type FormStaat = { fout: string } | null`, `type ActivatieWeergave = { link: string; code: string; verlooptOp: string }`, `voerUit<T>(fn: () => Promise<T>): Promise<ActieResultaat<T>>`
  - `src/lib/web/sessie-cookie.ts`: `zetSessieCookie(token, verlooptOp)`, `leesSessieToken(): Promise<string | null>`, `wisSessieCookie()`
  - `src/lib/web/huidige-gebruiker.ts`: `huidigeGebruiker(): Promise<SessieGebruiker | null>`, `vereisGebruiker(): Promise<SessieGebruiker>`, `vereisBeheerderSessie(): Promise<SessieGebruiker>`, `contextVan(g): Context`
  - `src/components/ui.tsx`: `Knop` (props + `variant?: 'primair' | 'secundair' | 'gevaar' | 'stil'`), `Invoer`, `Tekstvak`, `Keuzelijst`, `Veld({ label, hint?, children })`, `Paneel({ titel?, acties?, className?, children })` (een `<section aria-label={titel}>`), `Melding({ soort?: 'fout' | 'info', children })`
  - `src/components/iconen.tsx`: `KlokIcoon`, `HerhaalIcoon`, `PlusIcoon`, `PijlLinks`, `PijlRechts`, `KruisIcoon`
  - `src/app/login/acties.ts`: `inlogActie(staat: FormStaat, form: FormData)`, `uitlogActie()`

`voerUit` zet fouten uit diensten om naar nette meldingen. Interne Next-fouten (redirect, notFound) gooit hij door, herkenbaar aan een `digest` die begint met `NEXT_`.

- [ ] **Step 1: De falende test voor `voerUit` schrijven**

`tests/unit/actie.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Conflict, NietGevonden } from '@/lib/fouten';
import { voerUit } from '@/lib/web/actie';

describe('voerUit', () => {
  afterEach(() => vi.restoreAllMocks());

  it('geeft data terug bij succes', async () => {
    expect(await voerUit(async () => 42)).toEqual({ ok: true, data: 42 });
  });

  it('zet domeinfouten, conflicten en validatiefouten om', async () => {
    expect(await voerUit(async () => { throw new NietGevonden('Taak niet gevonden'); })).toEqual({ ok: false, fout: 'Taak niet gevonden' });
    expect(await voerUit(async () => { throw new Conflict('Klaas'); }))
      .toEqual({ ok: false, fout: 'Deze taak is zojuist gewijzigd door Klaas. Herladen?', conflict: true });
    expect(await voerUit(async () => z.string().min(1, 'Titel is verplicht').parse(''))).toEqual({ ok: false, fout: 'Titel is verplicht' });
  });

  it('verbergt onverwachte fouten achter een foutcode', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await voerUit(async () => { throw new Error('database stuk'); });
    expect(r).toEqual({ ok: false, fout: expect.stringMatching(/^Er ging iets mis \(foutcode [0-9a-f]{8}\)/) });
  });

  it('gooit interne Next-fouten (redirect) door', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
    await expect(voerUit(async () => { throw redirect; })).rejects.toBe(redirect);
  });
});
```

- [ ] **Step 2: Test draaien en zien falen**

Run: `npx vitest run --project unit tests/unit/actie.test.ts`
Expected: FAIL (`@/lib/web/actie` ontbreekt).

- [ ] **Step 3: Webhelpers schrijven**

`src/lib/web/actie.ts`:
```ts
import { ZodError } from 'zod';
import { Conflict, Fout } from '../fouten';

export type ActieResultaat<T = null> = { ok: true; data: T } | { ok: false; fout: string; conflict?: boolean };
export type FormStaat = { fout: string } | null;
export type ActivatieWeergave = { link: string; code: string; verlooptOp: string };

function isNextIntern(e: unknown): boolean {
  if (typeof e !== 'object' || e === null || !('digest' in e)) return false;
  const digest = String((e as { digest: unknown }).digest);
  return digest.startsWith('NEXT_') || digest === 'DYNAMIC_SERVER_USAGE';
}

export async function voerUit<T>(fn: () => Promise<T>): Promise<ActieResultaat<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (isNextIntern(e)) throw e;
    if (e instanceof Conflict) return { ok: false, fout: e.message, conflict: true };
    if (e instanceof ZodError) return { ok: false, fout: e.issues[0]?.message ?? 'Ongeldige invoer' };
    if (e instanceof Fout) return { ok: false, fout: e.message };
    const code = crypto.randomUUID().slice(0, 8);
    console.error(`[fout ${code}]`, e);
    return { ok: false, fout: `Er ging iets mis (foutcode ${code}). Probeer het opnieuw.` };
  }
}
```

`src/lib/web/sessie-cookie.ts`:
```ts
import { cookies } from 'next/headers';

const NAAM = 'sessie';

export async function zetSessieCookie(token: string, verlooptOp: Date): Promise<void> {
  (await cookies()).set(NAAM, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: verlooptOp,
  });
}

export async function leesSessieToken(): Promise<string | null> {
  return (await cookies()).get(NAAM)?.value ?? null;
}

export async function wisSessieCookie(): Promise<void> {
  (await cookies()).delete(NAAM);
}
```

`src/lib/web/huidige-gebruiker.ts`:
```ts
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { gebruikerVoorSessie, type SessieGebruiker } from '../auth/sessies';
import type { Context } from '../db/tenant';
import { leesSessieToken } from './sessie-cookie';

export const huidigeGebruiker = cache(async (): Promise<SessieGebruiker | null> => {
  const token = await leesSessieToken();
  return token ? gebruikerVoorSessie(token) : null;
});

export async function vereisGebruiker(): Promise<SessieGebruiker> {
  const g = await huidigeGebruiker();
  if (!g) redirect('/login');
  return g;
}

export async function vereisBeheerderSessie(): Promise<SessieGebruiker> {
  const g = await vereisGebruiker();
  if (g.rol !== 'beheerder') redirect('/');
  return g;
}

export function contextVan(g: SessieGebruiker): Context {
  return { gebruikerId: g.id, rol: g.rol, bedrijfId: g.bedrijfId };
}
```

- [ ] **Step 4: Test draaien en zien slagen**

Run: `npx vitest run --project unit`
Expected: PASS.

- [ ] **Step 5: Thema en basiscomponenten schrijven**

`src/app/globals.css`:
```css
@import "tailwindcss";

@theme {
  --color-achtergrond: #0b0f14;
  --color-paneel: #11161d;
  --color-kaart: #18202a;
  --color-kaart-hover: #1f2935;
  --color-rand: #263244;
  --color-rand-zacht: #1b2330;
  --color-tekst: #e6e8eb;
  --color-tekst-zacht: #9aa4b2;
  --color-tekst-flauw: #6b7584;
  --color-accent: #22c55e;
  --color-accent-donker: #052e16;
  --color-prio-laag: #6b7280;
  --color-prio-middel: #3b82f6;
  --color-prio-hoog: #f97316;
  --color-prio-zsm: #ef4444;
  --color-prio-nu: #dc2626;
  --color-bezig-bg: #451a03;
  --color-bezig-tekst: #fcd34d;
  --color-klaar-bg: #14532d;
  --color-klaar-tekst: #86efac;
  --color-fout: #f87171;
}

@theme inline {
  --font-sans: var(--font-plex), ui-sans-serif, system-ui, sans-serif;
}

:root {
  color-scheme: dark;
}
```

`src/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex', display: 'swap' });

export const metadata: Metadata = { title: 'Takenbord', description: 'Takenbord voor de garage' };
export const viewport: Viewport = { themeColor: '#0b0f14', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={plex.variable}>
      <body className="min-h-dvh bg-achtergrond font-sans text-tekst antialiased">{children}</body>
    </html>
  );
}
```

`src/app/error.tsx`:
```tsx
'use client';

export default function Foutpagina({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Er ging iets mis</h1>
      <p className="mt-2 text-sm text-tekst-zacht">Probeer het opnieuw. Blijft het misgaan, laat het de beheerder weten.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-lg border border-rand bg-kaart px-4 py-2 text-sm hover:bg-kaart-hover">
        Opnieuw proberen
      </button>
    </div>
  );
}
```

`src/app/not-found.tsx`:
```tsx
import Link from 'next/link';

export default function NietGevondenPagina() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Niet gevonden</h1>
      <p className="mt-2 text-sm text-tekst-zacht">Deze pagina bestaat niet, of je hebt er geen toegang toe.</p>
      <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">Naar de startpagina</Link>
    </div>
  );
}
```

`src/components/ui.tsx`:
```tsx
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type KnopVariant = 'primair' | 'secundair' | 'gevaar' | 'stil';

const KNOP: Record<KnopVariant, string> = {
  primair: 'bg-accent text-accent-donker hover:bg-accent/90',
  secundair: 'border border-rand bg-kaart text-tekst hover:bg-kaart-hover',
  gevaar: 'border border-prio-nu/50 text-fout hover:bg-prio-nu/10',
  stil: 'text-tekst-zacht hover:bg-kaart hover:text-tekst',
};

export function Knop({ variant = 'primair', className, ...rest }: ComponentProps<'button'> & { variant?: KnopVariant }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
        KNOP[variant],
        className,
      )}
    />
  );
}

const VELD =
  'w-full rounded-lg border border-rand bg-achtergrond px-3 text-sm text-tekst placeholder:text-tekst-flauw ' +
  'focus:border-accent focus:outline-none disabled:opacity-50';

export function Invoer({ className, ...rest }: ComponentProps<'input'>) {
  return <input {...rest} className={cn(VELD, 'h-9', className)} />;
}

export function Tekstvak({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea {...rest} className={cn(VELD, 'py-2', className)} />;
}

export function Keuzelijst({ className, ...rest }: ComponentProps<'select'>) {
  return <select {...rest} className={cn(VELD, 'h-9', className)} />;
}

export function Veld({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-tekst-zacht">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-tekst-flauw">{hint}</span>}
    </label>
  );
}

export function Paneel({ titel, acties, className, children }: { titel?: string; acties?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-label={titel} className={cn('rounded-xl border border-rand-zacht bg-paneel p-4', className)}>
      {titel && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{titel}</h2>
          {acties}
        </header>
      )}
      {children}
    </section>
  );
}

export function Melding({ soort = 'fout', children }: { soort?: 'fout' | 'info'; children: ReactNode }) {
  return (
    <p
      role={soort === 'fout' ? 'alert' : 'status'}
      className={cn('rounded-lg px-3 py-2 text-sm', soort === 'fout' ? 'bg-prio-nu/10 text-fout' : 'bg-kaart text-tekst-zacht')}
    >
      {children}
    </p>
  );
}
```

`src/components/iconen.tsx`:
```tsx
const basis = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const KlokIcoon = () => (
  <svg {...basis} width={13} height={13}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const HerhaalIcoon = () => (
  <svg {...basis} width={13} height={13}>
    <path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" />
  </svg>
);
export const PlusIcoon = () => (<svg {...basis} width={16} height={16}><path d="M12 5v14M5 12h14" /></svg>);
export const PijlLinks = () => (<svg {...basis} width={16} height={16}><path d="M15 18l-6-6 6-6" /></svg>);
export const PijlRechts = () => (<svg {...basis} width={16} height={16}><path d="M9 18l6-6-6-6" /></svg>);
export const KruisIcoon = () => (<svg {...basis} width={16} height={16}><path d="M18 6L6 18M6 6l12 12" /></svg>);
```

- [ ] **Step 6: Inlog- en activatieschermen schrijven**

`src/components/auth/auth-kader.tsx`:
```tsx
import type { ReactNode } from 'react';

export function AuthKader({ titel, ondertitel, children }: { titel: string; ondertitel?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <span className="inline-flex items-center gap-2 text-sm font-bold tracking-tight">
            <span className="size-2.5 rounded-sm bg-accent" />
            Takenbord
          </span>
        </div>
        <div className="rounded-2xl border border-rand-zacht bg-paneel p-6 shadow-xl shadow-black/30">
          <h1 className="text-lg font-semibold">{titel}</h1>
          {ondertitel && <p className="mt-1 text-sm text-tekst-zacht">{ondertitel}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
```

`src/app/login/acties.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { inloggen } from '@/lib/auth/inloggen';
import { maakSessie, verwijderSessie } from '@/lib/auth/sessies';
import type { FormStaat } from '@/lib/web/actie';
import { leesSessieToken, wisSessieCookie, zetSessieCookie } from '@/lib/web/sessie-cookie';

export async function inlogActie(_: FormStaat, form: FormData): Promise<FormStaat> {
  const r = await inloggen(String(form.get('gebruikersnaam') ?? ''), String(form.get('wachtwoord') ?? ''));
  if (!r.ok) return { fout: r.fout };
  const sessie = await maakSessie(r.gebruikerId);
  await zetSessieCookie(sessie.token, sessie.verlooptOp);
  redirect('/');
}

export async function uitlogActie(): Promise<void> {
  const token = await leesSessieToken();
  if (token) await verwijderSessie(token);
  await wisSessieCookie();
  redirect('/login');
}
```

`src/components/auth/inlog-formulier.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { inlogActie } from '@/app/login/acties';
import { Invoer, Knop, Melding, Veld } from '@/components/ui';

export function InlogFormulier() {
  const [staat, verstuur, bezig] = useActionState(inlogActie, null);
  return (
    <form action={verstuur} className="space-y-4">
      <Veld label="Gebruikersnaam">
        <Invoer name="gebruikersnaam" autoComplete="username" autoCapitalize="none" required autoFocus />
      </Veld>
      <Veld label="Wachtwoord">
        <Invoer name="wachtwoord" type="password" autoComplete="current-password" required />
      </Veld>
      {staat?.fout && <Melding>{staat.fout}</Melding>}
      <Knop type="submit" className="w-full" disabled={bezig}>{bezig ? 'Bezig…' : 'Inloggen'}</Knop>
    </form>
  );
}
```

`src/components/auth/wachtwoord-formulier.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { Invoer, Knop, Melding, Veld } from '@/components/ui';
import type { FormStaat } from '@/lib/web/actie';

export function WachtwoordFormulier({
  actie,
  metCode = false,
}: {
  actie: (staat: FormStaat, form: FormData) => Promise<FormStaat>;
  metCode?: boolean;
}) {
  const [staat, verstuur, bezig] = useActionState(actie, null);
  return (
    <form action={verstuur} className="space-y-4">
      {metCode && (
        <>
          <Veld label="Gebruikersnaam">
            <Invoer name="gebruikersnaam" autoComplete="username" autoCapitalize="none" required />
          </Veld>
          <Veld label="Activatiecode">
            <Invoer name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
          </Veld>
        </>
      )}
      <Veld label="Nieuw wachtwoord" hint="Minimaal 8 tekens">
        <Invoer name="wachtwoord" type="password" autoComplete="new-password" minLength={8} required />
      </Veld>
      <Veld label="Herhaal wachtwoord">
        <Invoer name="herhaal" type="password" autoComplete="new-password" minLength={8} required />
      </Veld>
      {staat?.fout && <Melding>{staat.fout}</Melding>}
      <Knop type="submit" className="w-full" disabled={bezig}>{bezig ? 'Bezig…' : 'Wachtwoord instellen'}</Knop>
    </form>
  );
}
```

`src/app/login/page.tsx`:
```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthKader } from '@/components/auth/auth-kader';
import { InlogFormulier } from '@/components/auth/inlog-formulier';
import { huidigeGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function LoginPagina() {
  if (await huidigeGebruiker()) redirect('/');
  return (
    <AuthKader titel="Inloggen" ondertitel="Log in met je gebruikersnaam en wachtwoord.">
      <InlogFormulier />
      <p className="mt-6 text-center text-sm text-tekst-zacht">
        Nieuw account of wachtwoord vergeten? Vraag de beheerder om een code.{' '}
        <Link href="/activeren" className="font-medium text-tekst underline-offset-4 hover:underline">Ik heb een activatiecode</Link>
      </p>
    </AuthKader>
  );
}
```

`src/app/activeren/acties.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { activeerMetCode, activeerMetToken } from '@/lib/auth/activatie';
import { maakSessie } from '@/lib/auth/sessies';
import type { FormStaat } from '@/lib/web/actie';
import { zetSessieCookie } from '@/lib/web/sessie-cookie';

const veld = (f: FormData, k: string) => String(f.get(k) ?? '');

async function rondAf(gebruikerId: string): Promise<never> {
  const sessie = await maakSessie(gebruikerId);
  await zetSessieCookie(sessie.token, sessie.verlooptOp);
  redirect('/');
}

export async function activeerLinkActie(token: string, _: FormStaat, form: FormData): Promise<FormStaat> {
  if (veld(form, 'wachtwoord') !== veld(form, 'herhaal')) return { fout: 'De wachtwoorden zijn niet gelijk.' };
  const r = await activeerMetToken(token, veld(form, 'wachtwoord'));
  if (!r.ok) return { fout: r.fout };
  return rondAf(r.gebruikerId);
}

export async function activeerCodeActie(_: FormStaat, form: FormData): Promise<FormStaat> {
  if (veld(form, 'wachtwoord') !== veld(form, 'herhaal')) return { fout: 'De wachtwoorden zijn niet gelijk.' };
  const r = await activeerMetCode(veld(form, 'gebruikersnaam'), veld(form, 'code'), veld(form, 'wachtwoord'));
  if (!r.ok) return { fout: r.fout };
  return rondAf(r.gebruikerId);
}
```

`src/app/activeren/page.tsx`:
```tsx
import Link from 'next/link';
import { activeerCodeActie } from './acties';
import { AuthKader } from '@/components/auth/auth-kader';
import { WachtwoordFormulier } from '@/components/auth/wachtwoord-formulier';

export default function ActiverenMetCodePagina() {
  return (
    <AuthKader titel="Account activeren" ondertitel="Vul je gebruikersnaam en de 6-cijferige code van de beheerder in, en kies een wachtwoord.">
      <WachtwoordFormulier actie={activeerCodeActie} metCode />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-tekst-zacht underline-offset-4 hover:underline">Terug naar inloggen</Link>
      </p>
    </AuthKader>
  );
}
```

`src/app/activeren/[token]/page.tsx`:
```tsx
import Link from 'next/link';
import { activeerLinkActie } from '../acties';
import { AuthKader } from '@/components/auth/auth-kader';
import { WachtwoordFormulier } from '@/components/auth/wachtwoord-formulier';
import { activatieVoorToken, ONGELDIGE_ACTIVATIE } from '@/lib/auth/activatie';

export default async function ActiverenMetLinkPagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const activatie = await activatieVoorToken(token);
  if (!activatie) {
    return (
      <AuthKader titel="Link niet geldig">
        <p className="text-sm text-tekst-zacht">{ONGELDIGE_ACTIVATIE}</p>
        <p className="mt-6 text-sm"><Link href="/activeren" className="underline underline-offset-4">Ik heb een activatiecode</Link></p>
      </AuthKader>
    );
  }
  return (
    <AuthKader titel={`Welkom, ${activatie.naam}`} ondertitel="Kies een wachtwoord om je account te activeren.">
      <WachtwoordFormulier actie={activeerLinkActie.bind(null, token)} />
    </AuthKader>
  );
}
```

Tijdelijke startpagina `src/app/page.tsx` (Task 12 verwijdert hem):
```tsx
import Link from 'next/link';
import { uitlogActie } from './login/acties';
import { vereisGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function Start() {
  const g = await vereisGebruiker();
  return (
    <main className="p-8">
      <p>Ingelogd als {g.naam}</p>
      {g.rol === 'beheerder' && <Link href="/beheer" className="underline">Beheer</Link>}
      <form action={uitlogActie}><button type="submit" className="underline">Uitloggen</button></form>
    </main>
  );
}
```

`src/scripts/maak-beheerder.ts`:
```ts
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { maakBeheerder } from '../lib/auth/accounts';
import { sluitDb } from '../lib/db/client';

async function main() {
  const [naam, gebruikersnaam] = process.argv.slice(2);
  if (!naam || !gebruikersnaam) {
    console.error('Gebruik: npm run maak-beheerder -- "<naam>" <gebruikersnaam>');
    process.exit(1);
  }
  let wachtwoord = process.env.BEHEERDER_WACHTWOORD;
  if (!wachtwoord) {
    const rl = createInterface({ input: stdin, output: stdout });
    wachtwoord = await rl.question('Wachtwoord (minimaal 8 tekens): ');
    rl.close();
  }
  const id = await maakBeheerder(naam, gebruikersnaam, wachtwoord);
  console.log(`Beheerder aangemaakt (${id}).`);
  await sluitDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await sluitDb();
  process.exit(1);
});
```

- [ ] **Step 7: Controleren**

Run: `npm run typecheck && npm test && npm run build`
Expected: geen fouten. De build toont onder andere de routes `/login`, `/activeren` en `/activeren/[token]`.

Daarna met de hand controleren (dev-database draait sinds Task 4):
```bash
BEHEERDER_WACHTWOORD=lokaal-wachtwoord npm run maak-beheerder -- "Max" max
npm run dev
```
Open http://localhost:3000. Je wordt naar `/login` gestuurd en ziet een donker, gecentreerd inlogvenster. Log in met `max` / `lokaal-wachtwoord`; daarna staat er "Ingelogd als Max". Na 5 foute pogingen met een ander wachtwoord verschijnt "Te veel mislukte pogingen…". Stop de dev-server daarna.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: donker thema, UI-basis en inlog- en activatieschermen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: App-schil en adminpaneel

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/components/schil/top-balk.tsx`, `src/components/schil/bord-kiezer.tsx`
- Create: `src/components/actie-formulier.tsx`
- Create: `src/components/beheer/beheer-nav.tsx`, `src/components/beheer/werkdagen-keuze.tsx`, `src/components/beheer/activatie-kaart.tsx`, `src/components/beheer/nieuwe-medewerker.tsx`, `src/components/beheer/medewerker-acties.tsx`
- Create: `src/app/(app)/beheer/layout.tsx`, `src/app/(app)/beheer/page.tsx`, `src/app/(app)/beheer/acties.ts`
- Create: `src/app/(app)/beheer/bedrijven/page.tsx`, `src/app/(app)/beheer/borden/page.tsx`, `src/app/(app)/beheer/medewerkers/page.tsx`, `src/app/(app)/beheer/instellingen/page.tsx`

**Interfaces:**
- Consumes: diensten uit Task 6, `wijzigEigenWachtwoord`, webhelpers en UI uit Task 10
- Produces:
  - `ActieFormulier<T>({ actie: (f: FormData) => Promise<ActieResultaat<T>>, knop: string, children, bijSucces?: (data: T) => void, wisNaSucces?: boolean, knopVariant?: 'primair' | 'secundair' })`
  - `TopBalk({ gebruiker: SessieGebruiker, borden: BordOptie[] })`, `type BordOptie = { id: string; naam: string; bedrijfNaam: string }`
  - Server actions in `beheer/acties.ts`: `maakBedrijfActie`, `wijzigBedrijfActie(id, f)`, `maakBordActie`, `wijzigBordActie(id, f)`, `maakMedewerkerActie` → `ActivatieWeergave`, `nieuweLinkActie(id)` → `ActivatieWeergave`, `zetActiefActie(id, actief)`, `wijzigWachtwoordActie`

Deze taak heeft geen eigen unit-tests: de diensten zijn al getest en de schermen worden in Task 15 end-to-end getest. Controle gebeurt met typecheck, build en een handmatige ronde.

- [ ] **Step 1: Generiek actieformulier schrijven**

`src/components/actie-formulier.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useRef, useState, useTransition } from 'react';
import type { ActieResultaat } from '@/lib/web/actie';
import { Knop, Melding } from './ui';

export function ActieFormulier<T>({
  actie,
  knop,
  children,
  bijSucces,
  wisNaSucces = true,
  knopVariant = 'primair',
}: {
  actie: (formulier: FormData) => Promise<ActieResultaat<T>>;
  knop: string;
  children: ReactNode;
  bijSucces?: (data: T) => void;
  wisNaSucces?: boolean;
  knopVariant?: 'primair' | 'secundair';
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [gelukt, setGelukt] = useState(false);
  const [bezig, start] = useTransition();

  return (
    <form
      ref={ref}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const gegevens = new FormData(e.currentTarget);
        setGelukt(false);
        start(async () => {
          const r = await actie(gegevens);
          if (!r.ok) {
            setFout(r.fout);
            return;
          }
          setFout(null);
          if (wisNaSucces) ref.current?.reset();
          else setGelukt(true);
          bijSucces?.(r.data);
          router.refresh();
        });
      }}
    >
      {children}
      {fout && <Melding>{fout}</Melding>}
      <div className="flex items-center gap-3">
        <Knop type="submit" variant={knopVariant} disabled={bezig}>{bezig ? 'Bezig…' : knop}</Knop>
        {gelukt && <span role="status" className="text-xs text-tekst-zacht">Opgeslagen</span>}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: App-schil schrijven**

`src/components/schil/bord-kiezer.tsx`:
```tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';

export type BordOptie = { id: string; naam: string; bedrijfNaam: string };

export function BordKiezer({ borden, toonBedrijf }: { borden: BordOptie[]; toonBedrijf: boolean }) {
  const router = useRouter();
  const pad = usePathname();
  const huidig = pad.startsWith('/bord/') ? pad.split('/')[2] : '';
  if (borden.length === 0) return null;
  if (borden.length === 1 && !toonBedrijf) {
    return <span className="truncate text-sm text-tekst-zacht">{borden[0].bedrijfNaam} · {borden[0].naam}</span>;
  }
  const groepen = new Map<string, BordOptie[]>();
  for (const b of borden) groepen.set(b.bedrijfNaam, [...(groepen.get(b.bedrijfNaam) ?? []), b]);
  return (
    <select
      aria-label="Bord kiezen"
      value={huidig}
      onChange={(e) => e.target.value && router.push(`/bord/${e.target.value}`)}
      className="h-9 max-w-[16rem] truncate rounded-lg border border-rand bg-kaart px-2 text-sm text-tekst"
    >
      <option value="" disabled>Kies een bord…</option>
      {toonBedrijf
        ? [...groepen].map(([bedrijf, lijst]) => (
            <optgroup key={bedrijf} label={bedrijf}>
              {lijst.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}
            </optgroup>
          ))
        : borden.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}
    </select>
  );
}
```

`src/components/schil/top-balk.tsx`:
```tsx
import Link from 'next/link';
import { uitlogActie } from '@/app/login/acties';
import type { SessieGebruiker } from '@/lib/auth/sessies';
import { BordKiezer, type BordOptie } from './bord-kiezer';

const NAV = 'rounded-lg px-2.5 py-1.5 text-tekst-zacht transition-colors hover:bg-kaart hover:text-tekst';

export function TopBalk({ gebruiker, borden }: { gebruiker: SessieGebruiker; borden: BordOptie[] }) {
  return (
    <header className="sticky top-0 z-30 border-b border-rand-zacht bg-achtergrond/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-sm font-bold tracking-tight">
          <span className="size-2.5 rounded-sm bg-accent" />
          <span className="hidden sm:inline">Takenbord</span>
        </Link>
        <BordKiezer borden={borden} toonBedrijf={gebruiker.rol === 'beheerder'} />
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {gebruiker.rol === 'beheerder' && (
            <>
              <Link href="/vandaag" className={NAV}>Vandaag</Link>
              <Link href="/beheer" className={NAV}>Beheer</Link>
            </>
          )}
          <span className="hidden px-2 text-tekst-flauw md:inline">{gebruiker.naam}</span>
          <form action={uitlogActie}>
            <button type="submit" className={NAV}>Uitloggen</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
```

`src/app/(app)/layout.tsx`:
```tsx
import type { ReactNode } from 'react';
import { TopBalk } from '@/components/schil/top-balk';
import { lijstBorden } from '@/lib/diensten/borden';
import { contextVan, vereisGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const gebruiker = await vereisGebruiker();
  const borden = await lijstBorden(contextVan(gebruiker));
  return (
    <div className="min-h-dvh">
      <TopBalk gebruiker={gebruiker} borden={borden.map((b) => ({ id: b.id, naam: b.naam, bedrijfNaam: b.bedrijfNaam }))} />
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Beheeracties schrijven**

`src/app/(app)/beheer/acties.ts`:
```ts
'use server';

import { wijzigEigenWachtwoord } from '@/lib/auth/accounts';
import type { Activatie } from '@/lib/auth/activatie';
import { maakBedrijf, wijzigBedrijf } from '@/lib/diensten/bedrijven';
import { maakBord, wijzigBord } from '@/lib/diensten/borden';
import { maakMedewerker, nieuweActivatie, zetActief } from '@/lib/diensten/medewerkers';
import { Ongeldig } from '@/lib/fouten';
import { type ActieResultaat, type ActivatieWeergave, voerUit } from '@/lib/web/actie';
import { contextVan, vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

const tekst = (f: FormData, k: string) => String(f.get(k) ?? '');

async function ctx() {
  return contextVan(await vereisBeheerderSessie());
}

function weergave(a: Activatie): ActivatieWeergave {
  const basis = process.env.APP_URL ?? 'http://localhost:3000';
  return { link: `${basis}/activeren/${a.token}`, code: a.code, verlooptOp: a.verlooptOp.toISOString() };
}

function bedrijfInvoer(f: FormData) {
  return { naam: tekst(f, 'naam'), garageAdres: tekst(f, 'garageAdres'), werkdagen: f.getAll('werkdagen').map(Number) };
}

export async function maakBedrijfActie(f: FormData): Promise<ActieResultaat> {
  return voerUit(async () => {
    await maakBedrijf(await ctx(), bedrijfInvoer(f));
    return null;
  });
}

export async function wijzigBedrijfActie(id: string, f: FormData): Promise<ActieResultaat> {
  return voerUit(async () => {
    await wijzigBedrijf(await ctx(), id, bedrijfInvoer(f));
    return null;
  });
}

export async function maakBordActie(f: FormData): Promise<ActieResultaat> {
  return voerUit(async () => {
    await maakBord(await ctx(), tekst(f, 'bedrijfId'), tekst(f, 'naam'));
    return null;
  });
}

export async function wijzigBordActie(id: string, f: FormData): Promise<ActieResultaat> {
  return voerUit(async () => {
    await wijzigBord(await ctx(), id, { naam: tekst(f, 'naam'), gearchiveerd: f.get('gearchiveerd') === 'on' });
    return null;
  });
}

export async function maakMedewerkerActie(f: FormData): Promise<ActieResultaat<ActivatieWeergave>> {
  return voerUit(async () => {
    const r = await maakMedewerker(await ctx(), {
      naam: tekst(f, 'naam'), gebruikersnaam: tekst(f, 'gebruikersnaam'), bedrijfId: tekst(f, 'bedrijfId'),
    });
    return weergave(r.activatie);
  });
}

export async function nieuweLinkActie(gebruikerId: string): Promise<ActieResultaat<ActivatieWeergave>> {
  return voerUit(async () => weergave(await nieuweActivatie(await ctx(), gebruikerId)));
}

export async function zetActiefActie(gebruikerId: string, actief: boolean): Promise<ActieResultaat> {
  return voerUit(async () => {
    await zetActief(await ctx(), gebruikerId, actief);
    return null;
  });
}

export async function wijzigWachtwoordActie(f: FormData): Promise<ActieResultaat> {
  return voerUit(async () => {
    const g = await vereisBeheerderSessie();
    if (tekst(f, 'nieuw') !== tekst(f, 'herhaal')) throw new Ongeldig('De nieuwe wachtwoorden zijn niet gelijk.');
    await wijzigEigenWachtwoord(g.id, tekst(f, 'huidig'), tekst(f, 'nieuw'));
    return null;
  });
}
```

- [ ] **Step 4: Beheercomponenten schrijven**

`src/components/beheer/beheer-nav.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const LINKS = [
  ['/beheer/bedrijven', 'Bedrijven'],
  ['/beheer/borden', 'Borden'],
  ['/beheer/medewerkers', 'Medewerkers'],
  ['/beheer/instellingen', 'Instellingen'],
] as const;

export function BeheerNav() {
  const pad = usePathname();
  return (
    <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-rand-zacht" aria-label="Beheer">
      {LINKS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={pad === href ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
            pad === href ? 'border-accent text-tekst' : 'border-transparent text-tekst-zacht hover:text-tekst',
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
```

`src/components/beheer/werkdagen-keuze.tsx`:
```tsx
import { DAGNAMEN_KORT } from '@/lib/domein/datums';

export function WerkdagenKeuze({ gekozen = [1, 2, 3, 4, 5] }: { gekozen?: number[] }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-tekst-zacht">Werkdagen</legend>
      <div className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <label key={d} className="cursor-pointer">
            <input type="checkbox" name="werkdagen" value={d} defaultChecked={gekozen.includes(d)} className="peer sr-only" />
            <span className="inline-flex h-8 w-10 items-center justify-center rounded-lg border border-rand text-xs text-tekst-zacht peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-tekst peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
              {DAGNAMEN_KORT[d]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

`src/components/beheer/activatie-kaart.tsx`:
```tsx
'use client';

import { useId, useState } from 'react';
import { Invoer, Knop } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMoment } from '@/lib/domein/datums';
import type { ActivatieWeergave } from '@/lib/web/actie';

function KopieerVeld({ label, waarde, groot = false }: { label: string; waarde: string; groot?: boolean }) {
  const id = useId();
  const [gekopieerd, setGekopieerd] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-tekst-zacht">{label}</label>
      <div className="flex gap-2">
        <Invoer
          id={id}
          readOnly
          value={waarde}
          onFocus={(e) => e.currentTarget.select()}
          className={cn('font-mono', groot ? 'text-lg tracking-[0.3em]' : 'text-xs')}
        />
        <Knop
          variant="secundair"
          onClick={async () => {
            await navigator.clipboard.writeText(waarde);
            setGekopieerd(true);
            setTimeout(() => setGekopieerd(false), 1500);
          }}
        >
          {gekopieerd ? 'Gekopieerd' : 'Kopieer'}
        </Knop>
      </div>
    </div>
  );
}

export function ActivatieKaart({ activatie }: { activatie: ActivatieWeergave }) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
      <p className="text-tekst-zacht">
        Stuur de link of de code naar de medewerker. Geldig tot {formatMoment(new Date(activatie.verlooptOp))}.
      </p>
      <KopieerVeld label="Activatielink" waarde={activatie.link} />
      <KopieerVeld label="Activatiecode" waarde={activatie.code} groot />
    </div>
  );
}
```

`src/components/beheer/nieuwe-medewerker.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { maakMedewerkerActie } from '@/app/(app)/beheer/acties';
import { ActieFormulier } from '@/components/actie-formulier';
import { Invoer, Keuzelijst, Veld } from '@/components/ui';
import type { ActivatieWeergave } from '@/lib/web/actie';
import { ActivatieKaart } from './activatie-kaart';

export function NieuweMedewerker({ bedrijven }: { bedrijven: { id: string; naam: string }[] }) {
  const [activatie, setActivatie] = useState<ActivatieWeergave | null>(null);
  if (bedrijven.length === 0) return <p className="text-sm text-tekst-zacht">Maak eerst een bedrijf aan.</p>;
  return (
    <>
      <ActieFormulier actie={maakMedewerkerActie} knop="Medewerker toevoegen" bijSucces={setActivatie}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Veld label="Naam"><Invoer name="naam" required maxLength={100} /></Veld>
          <Veld label="Gebruikersnaam">
            <Invoer name="gebruikersnaam" required autoCapitalize="none" pattern="[A-Za-z0-9._\-]{3,32}" />
          </Veld>
          <Veld label="Bedrijf">
            <Keuzelijst name="bedrijfId" required defaultValue="">
              <option value="" disabled>Kies…</option>
              {bedrijven.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}
            </Keuzelijst>
          </Veld>
        </div>
      </ActieFormulier>
      {activatie && <ActivatieKaart activatie={activatie} />}
    </>
  );
}
```

`src/components/beheer/medewerker-acties.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { nieuweLinkActie, zetActiefActie } from '@/app/(app)/beheer/acties';
import { Knop, Melding } from '@/components/ui';
import type { ActivatieWeergave } from '@/lib/web/actie';
import { ActivatieKaart } from './activatie-kaart';

export function MedewerkerActies({ id, naam, actief }: { id: string; naam: string; actief: boolean }) {
  const router = useRouter();
  const [activatie, setActivatie] = useState<ActivatieWeergave | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, start] = useTransition();

  function nieuweLink() {
    if (!confirm(`Nieuwe link maken voor ${naam}? Het huidige wachtwoord vervalt meteen.`)) return;
    start(async () => {
      const r = await nieuweLinkActie(id);
      if (!r.ok) return setFout(r.fout);
      setFout(null);
      setActivatie(r.data);
      router.refresh();
    });
  }

  function wisselActief() {
    if (actief && !confirm(`${naam} deactiveren? Inloggen kan dan niet meer.`)) return;
    start(async () => {
      const r = await zetActiefActie(id, !actief);
      if (!r.ok) return setFout(r.fout);
      setFout(null);
      router.refresh();
    });
  }

  return (
    <div className="w-full sm:w-auto">
      <div className="flex gap-2 sm:justify-end">
        <Knop variant="secundair" onClick={nieuweLink} disabled={bezig}>Nieuwe link</Knop>
        <Knop variant={actief ? 'gevaar' : 'secundair'} onClick={wisselActief} disabled={bezig}>
          {actief ? 'Deactiveren' : 'Activeren'}
        </Knop>
      </div>
      {fout && <div className="mt-2"><Melding>{fout}</Melding></div>}
      {activatie && <ActivatieKaart activatie={activatie} />}
    </div>
  );
}
```

- [ ] **Step 5: Beheerpagina's schrijven**

`src/app/(app)/beheer/layout.tsx`:
```tsx
import type { ReactNode } from 'react';
import { BeheerNav } from '@/components/beheer/beheer-nav';
import { vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

export default async function BeheerLayout({ children }: { children: ReactNode }) {
  await vereisBeheerderSessie();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-semibold">Beheer</h1>
      <BeheerNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
```

`src/app/(app)/beheer/page.tsx`:
```tsx
import { redirect } from 'next/navigation';

export default function BeheerStart() {
  redirect('/beheer/bedrijven');
}
```

`src/app/(app)/beheer/bedrijven/page.tsx`:
```tsx
import { maakBedrijfActie, wijzigBedrijfActie } from '../acties';
import { ActieFormulier } from '@/components/actie-formulier';
import { WerkdagenKeuze } from '@/components/beheer/werkdagen-keuze';
import { Invoer, Paneel, Veld } from '@/components/ui';
import { type Bedrijf, lijstBedrijven } from '@/lib/diensten/bedrijven';
import { contextVan, vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

function BedrijfVelden({ bedrijf }: { bedrijf?: Bedrijf }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Veld label="Naam"><Invoer name="naam" defaultValue={bedrijf?.naam} required maxLength={100} /></Veld>
        <Veld label="Adres van de garage" hint="Wordt later het eindpunt van routes">
          <Invoer name="garageAdres" defaultValue={bedrijf?.garageAdres ?? ''} maxLength={200} />
        </Veld>
      </div>
      <WerkdagenKeuze gekozen={bedrijf?.werkdagen} />
    </div>
  );
}

export default async function BedrijvenPagina() {
  const g = await vereisBeheerderSessie();
  const bedrijven = await lijstBedrijven(contextVan(g));
  return (
    <div className="space-y-4">
      <Paneel titel="Nieuw bedrijf">
        <ActieFormulier actie={maakBedrijfActie} knop="Bedrijf toevoegen">
          <BedrijfVelden />
        </ActieFormulier>
      </Paneel>
      {bedrijven.length === 0 && <p className="text-sm text-tekst-zacht">Nog geen bedrijven.</p>}
      {bedrijven.map((b) => (
        <Paneel key={b.id} titel={b.naam}>
          <ActieFormulier actie={wijzigBedrijfActie.bind(null, b.id)} knop="Opslaan" knopVariant="secundair" wisNaSucces={false}>
            <BedrijfVelden bedrijf={b} />
          </ActieFormulier>
        </Paneel>
      ))}
    </div>
  );
}
```

`src/app/(app)/beheer/borden/page.tsx`:
```tsx
import { maakBordActie, wijzigBordActie } from '../acties';
import { ActieFormulier } from '@/components/actie-formulier';
import { Invoer, Keuzelijst, Paneel, Veld } from '@/components/ui';
import { lijstBedrijven } from '@/lib/diensten/bedrijven';
import { lijstBorden } from '@/lib/diensten/borden';
import { contextVan, vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

export default async function BordenPagina() {
  const ctx = contextVan(await vereisBeheerderSessie());
  const [bedrijven, borden] = await Promise.all([lijstBedrijven(ctx), lijstBorden(ctx, { metGearchiveerd: true })]);
  return (
    <div className="space-y-4">
      <Paneel titel="Nieuw bord">
        {bedrijven.length === 0 ? (
          <p className="text-sm text-tekst-zacht">Maak eerst een bedrijf aan.</p>
        ) : (
          <ActieFormulier actie={maakBordActie} knop="Bord toevoegen">
            <div className="grid gap-3 sm:grid-cols-2">
              <Veld label="Bedrijf">
                <Keuzelijst name="bedrijfId" required defaultValue="">
                  <option value="" disabled>Kies…</option>
                  {bedrijven.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}
                </Keuzelijst>
              </Veld>
              <Veld label="Naam"><Invoer name="naam" required maxLength={60} /></Veld>
            </div>
          </ActieFormulier>
        )}
      </Paneel>
      {borden.map((b) => (
        <Paneel key={b.id} titel={`${b.bedrijfNaam} · ${b.naam}`}>
          <ActieFormulier actie={wijzigBordActie.bind(null, b.id)} knop="Opslaan" knopVariant="secundair" wisNaSucces={false}>
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-56 flex-1"><Veld label="Naam"><Invoer name="naam" defaultValue={b.naam} required maxLength={60} /></Veld></div>
              <label className="flex h-9 items-center gap-2 text-sm text-tekst-zacht">
                <input type="checkbox" name="gearchiveerd" defaultChecked={b.gearchiveerd} className="size-4 accent-accent" />
                Gearchiveerd
              </label>
            </div>
          </ActieFormulier>
        </Paneel>
      ))}
    </div>
  );
}
```

`src/app/(app)/beheer/medewerkers/page.tsx`:
```tsx
import { MedewerkerActies } from '@/components/beheer/medewerker-acties';
import { NieuweMedewerker } from '@/components/beheer/nieuwe-medewerker';
import { Paneel } from '@/components/ui';
import { lijstBedrijven } from '@/lib/diensten/bedrijven';
import { lijstMedewerkers, type Medewerker } from '@/lib/diensten/medewerkers';
import { formatMoment } from '@/lib/domein/datums';
import { contextVan, vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

function statusTekst(m: Medewerker): string {
  if (!m.actief) return 'Gedeactiveerd';
  if (m.geactiveerd) return 'Actief';
  if (m.activatieVerlooptOp && m.activatieVerlooptOp > new Date()) return `Wacht op activatie (link geldig tot ${formatMoment(m.activatieVerlooptOp)})`;
  return 'Link verlopen: maak een nieuwe link';
}

export default async function MedewerkersPagina() {
  const ctx = contextVan(await vereisBeheerderSessie());
  const [medewerkers, bedrijven] = await Promise.all([lijstMedewerkers(ctx), lijstBedrijven(ctx)]);
  return (
    <div className="space-y-4">
      <Paneel titel="Nieuwe medewerker">
        <NieuweMedewerker bedrijven={bedrijven.map((b) => ({ id: b.id, naam: b.naam }))} />
      </Paneel>
      <Paneel titel="Medewerkers">
        {medewerkers.length === 0 ? (
          <p className="text-sm text-tekst-zacht">Nog geen medewerkers.</p>
        ) : (
          <ul className="divide-y divide-rand-zacht">
            {medewerkers.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{m.naam} <span className="font-normal text-tekst-flauw">@{m.gebruikersnaam}</span></p>
                  <p className="text-xs text-tekst-zacht">{m.bedrijfNaam} · {statusTekst(m)}</p>
                </div>
                <MedewerkerActies id={m.id} naam={m.naam} actief={m.actief} />
              </li>
            ))}
          </ul>
        )}
      </Paneel>
    </div>
  );
}
```

`src/app/(app)/beheer/instellingen/page.tsx`:
```tsx
import { wijzigWachtwoordActie } from '../acties';
import { ActieFormulier } from '@/components/actie-formulier';
import { Invoer, Paneel, Veld } from '@/components/ui';

export default function InstellingenPagina() {
  return (
    <Paneel titel="Wachtwoord wijzigen" className="max-w-md">
      <ActieFormulier actie={wijzigWachtwoordActie} knop="Wachtwoord wijzigen">
        <Veld label="Huidig wachtwoord"><Invoer name="huidig" type="password" autoComplete="current-password" required /></Veld>
        <Veld label="Nieuw wachtwoord" hint="Minimaal 8 tekens">
          <Invoer name="nieuw" type="password" autoComplete="new-password" minLength={8} required />
        </Veld>
        <Veld label="Herhaal nieuw wachtwoord">
          <Invoer name="herhaal" type="password" autoComplete="new-password" minLength={8} required />
        </Veld>
      </ActieFormulier>
    </Paneel>
  );
}
```

- [ ] **Step 6: Controleren**

Run: `npm run typecheck && npm test && npm run build`
Expected: geen fouten.

Handmatige ronde (`npm run dev`, inloggen als `max`):
1. `/beheer/bedrijven`: voeg "Garage Test" toe met werkdagen ma–za. Het bedrijf verschijnt als paneel, en wijzigen toont "Opgeslagen".
2. `/beheer/borden`: "Garage Test · Takenbord" staat er. Voeg een tweede bord toe en archiveer het.
3. `/beheer/medewerkers`: voeg een medewerker toe. Link en code verschijnen met kopieerknoppen. Open de link in een privévenster en stel een wachtwoord in. Je komt dan op de tijdelijke startpagina, want het bord volgt in Task 12. In de lijst staat de medewerker nu als "Actief".
4. `/beheer/instellingen`: wijzig het wachtwoord met een fout huidig wachtwoord. Dan verschijnt "Huidig wachtwoord onjuist."

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: app-schil en adminpaneel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Weekbord, taakdialoog en slepen

**Files:**
- Delete: `src/app/page.tsx`
- Create: `src/app/(app)/page.tsx`, `src/app/(app)/bord/[bordId]/page.tsx`, `src/app/(app)/bord/acties.ts`
- Create: `src/components/bord/stijl.ts`, `src/components/bord/taak-kaart.tsx`, `src/components/bord/dag-kolom.tsx`, `src/components/bord/week-bord.tsx`, `src/components/bord/taak-dialoog.tsx`

**Interfaces:**
- Consumes: `takenVoorPeriode`, `maakTaak`, `wijzigTaak`, `verplaatsTaak`, `zetStatus`, `verwijderTaak`, `taakHistorie`, `Taak`, `HistorieRegel`, `wijzigReeks`, `stopReeks`, `haalBord`, `lijstBorden`, datumhulpen, `taakLabels`, `vergelijkTaken`, UI uit Task 10
- Produces:
  - `TaakKaartInhoud({ taak: Taak, toonBord?: boolean })`
  - `TaakDialoog({ modus: DialoogModus, isBeheerder: boolean, onSluit: () => void })`, `type DialoogModus = { soort: 'nieuw'; bordId: string; datum: Datum } | { soort: 'bewerk'; taak: Taak }`
  - `WeekBord(props)` (zie code)
  - DOM-haakjes voor de tests: kolommen hebben `data-dag="YYYY-MM-DD"`, kaarten hebben `data-taak="<id>"`
  - Server actions: `maakTaakActie`, `wijzigTaakActie`, `wijzigReeksActie`, `stopReeksActie`, `verplaatsTaakActie`, `zetStatusActie`, `verwijderTaakActie`, `historieActie`

- [ ] **Step 1: Startpagina in de app-groep zetten**

```bash
git rm src/app/page.tsx
```

`src/app/(app)/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { lijstBorden } from '@/lib/diensten/borden';
import { contextVan, vereisGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function Start() {
  const g = await vereisGebruiker();
  const [eerste] = await lijstBorden(contextVan(g));
  if (eerste) redirect(`/bord/${eerste.id}`);
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-tekst-zacht">
      {g.rol === 'beheerder'
        ? 'Er zijn nog geen borden. Maak in Beheer een bedrijf aan; dat krijgt automatisch een bord.'
        : 'Er is nog geen bord voor jouw bedrijf. Vraag de beheerder om er een aan te maken.'}
    </div>
  );
}
```

- [ ] **Step 2: Server actions voor taken schrijven**

`src/app/(app)/bord/acties.ts`:
```ts
'use server';

import { stopReeks, wijzigReeks } from '@/lib/diensten/herhalingen';
import {
  type HistorieRegel, maakTaak, taakHistorie, verplaatsTaak, verwijderTaak, wijzigTaak, zetStatus,
} from '@/lib/diensten/taken';
import type { Status } from '@/lib/domein/taak';
import type { NieuweTaakInvoer, ReeksInvoer, TaakVeldenInvoer } from '@/lib/domein/validatie';
import { type ActieResultaat, voerUit } from '@/lib/web/actie';
import { contextVan, vereisGebruiker } from '@/lib/web/huidige-gebruiker';

async function ctx() {
  return contextVan(await vereisGebruiker());
}

export async function maakTaakActie(invoer: NieuweTaakInvoer): Promise<ActieResultaat<string>> {
  return voerUit(async () => (await maakTaak(await ctx(), invoer)).id);
}

export async function wijzigTaakActie(id: string, versie: number, invoer: TaakVeldenInvoer): Promise<ActieResultaat> {
  return voerUit(async () => { await wijzigTaak(await ctx(), id, versie, invoer); return null; });
}

export async function wijzigReeksActie(herhalingId: string, invoer: ReeksInvoer): Promise<ActieResultaat> {
  return voerUit(async () => { await wijzigReeks(await ctx(), herhalingId, invoer); return null; });
}

export async function stopReeksActie(herhalingId: string): Promise<ActieResultaat> {
  return voerUit(async () => { await stopReeks(await ctx(), herhalingId); return null; });
}

export async function verplaatsTaakActie(id: string, versie: number, datum: string): Promise<ActieResultaat> {
  return voerUit(async () => { await verplaatsTaak(await ctx(), id, versie, datum); return null; });
}

export async function zetStatusActie(id: string, versie: number, status: Status): Promise<ActieResultaat> {
  return voerUit(async () => { await zetStatus(await ctx(), id, versie, status); return null; });
}

export async function verwijderTaakActie(id: string): Promise<ActieResultaat> {
  return voerUit(async () => { await verwijderTaak(await ctx(), id); return null; });
}

export async function historieActie(id: string): Promise<ActieResultaat<HistorieRegel[]>> {
  return voerUit(async () => taakHistorie(await ctx(), id));
}
```

- [ ] **Step 3: Kaart en stijlen schrijven**

`src/components/bord/stijl.ts`:
```ts
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
```

`src/components/bord/taak-kaart.tsx`:
```tsx
import { HerhaalIcoon, KlokIcoon } from '@/components/iconen';
import { cn } from '@/lib/cn';
import type { Taak } from '@/lib/diensten/taken';
import { PRIORITEIT_LABEL, STATUS_LABEL, taakLabels } from '@/lib/domein/taak';
import { herhalingKort, LABEL_STIJL, PRIO_STIP, STATUS_PIL } from './stijl';

export function TaakKaartInhoud({ taak, toonBord = false }: { taak: Taak; toonBord?: boolean }) {
  const klaar = taak.status === 'klaar';
  const herhaling = herhalingKort(taak);
  const labels = taakLabels(taak);
  const heeftMeta = Boolean(taak.tijd || herhaling || taak.status !== 'open' || labels.length);
  return (
    <div
      className={cn(
        'rounded-lg border bg-kaart px-3 py-2.5 transition-colors hover:bg-kaart-hover',
        taak.prioriteit === 'nu' && !klaar ? 'border-prio-nu/60' : 'border-rand',
        klaar && 'opacity-55',
      )}
    >
      {toonBord && (
        <p className="mb-1 truncate text-[11px] font-medium tracking-wide text-tekst-flauw uppercase">
          {taak.bedrijfNaam} · {taak.bordNaam}
        </p>
      )}
      <div className="flex items-start gap-2">
        {taak.prioriteit === 'nu' ? (
          <span className="mt-px shrink-0 rounded bg-prio-nu px-1.5 text-[10px] leading-4 font-bold tracking-wide text-white">NU</span>
        ) : (
          <span
            className={cn('mt-1.5 size-2 shrink-0 rounded-full', PRIO_STIP[taak.prioriteit])}
            title={`Prioriteit: ${PRIORITEIT_LABEL[taak.prioriteit]}`}
          />
        )}
        <span className={cn('min-w-0 text-sm leading-snug font-medium break-words', klaar && 'line-through')}>{taak.titel}</span>
      </div>
      {heeftMeta && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-tekst-zacht">
          {taak.tijd && <span className="inline-flex items-center gap-1"><KlokIcoon />{taak.tijd}</span>}
          {herhaling && <span className="inline-flex items-center gap-1"><HerhaalIcoon />{herhaling}</span>}
          {taak.status !== 'open' && (
            <span className={cn('rounded px-1.5 py-px font-semibold', STATUS_PIL[taak.status])}>{STATUS_LABEL[taak.status]}</span>
          )}
          {labels.map((l) => (
            <span key={l.soort} className={cn('rounded px-1.5 py-px', LABEL_STIJL[l.soort])}>{l.tekst}</span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Dagkolom met slepen schrijven**

`src/components/bord/dag-kolom.tsx`:
```tsx
'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { PlusIcoon } from '@/components/iconen';
import { cn } from '@/lib/cn';
import type { Taak } from '@/lib/diensten/taken';
import { DAGNAMEN, type Datum, kortDatumLabel, weekdag } from '@/lib/domein/datums';
import { TaakKaartInhoud } from './taak-kaart';

function SleepbareKaart({ taak, onOpen }: { taak: Taak; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: taak.id, data: { taak } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-taak={taak.id}
      onClick={onOpen}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        'block w-full rounded-lg text-left focus-visible:outline-2 focus-visible:outline-accent',
        isDragging && 'relative z-20 cursor-grabbing shadow-2xl shadow-black/50',
      )}
    >
      <TaakKaartInhoud taak={taak} />
    </button>
  );
}

export function DagKolom({
  datum,
  taken,
  isVandaag,
  verborgenOpMobiel,
  onNieuw,
  onOpen,
}: {
  datum: Datum;
  taken: Taak[];
  isVandaag: boolean;
  verborgenOpMobiel: boolean;
  onNieuw: () => void;
  onOpen: (taak: Taak) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: datum });
  const dagnaam = DAGNAMEN[weekdag(datum)];
  return (
    <section
      ref={setNodeRef}
      data-dag={datum}
      aria-label={`${dagnaam} ${kortDatumLabel(datum)}`}
      className={cn(
        'min-h-72 flex-col rounded-xl border p-2 transition-colors',
        verborgenOpMobiel ? 'hidden md:flex' : 'flex',
        isVandaag ? 'border-accent/50 bg-paneel' : 'border-rand-zacht bg-paneel/60',
        isOver && 'border-prio-middel/70 bg-kaart/60',
      )}
    >
      <header className="mb-2 flex items-baseline justify-between px-1.5 pt-1">
        <h2 className={cn('text-sm font-semibold capitalize', isVandaag && 'text-accent')}>{dagnaam}</h2>
        <span className="text-xs text-tekst-flauw">{isVandaag ? 'vandaag' : kortDatumLabel(datum)}</span>
      </header>
      <ul className="flex flex-1 flex-col gap-2">
        {taken.map((t) => (
          <li key={t.id}><SleepbareKaart taak={t} onOpen={() => onOpen(t)} /></li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onNieuw}
        aria-label={`Taak toevoegen op ${dagnaam}`}
        className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-tekst-flauw transition-colors hover:bg-kaart hover:text-tekst"
      >
        <PlusIcoon />Taak
      </button>
    </section>
  );
}
```

- [ ] **Step 5: Taakdialoog schrijven**

`src/components/bord/taak-dialoog.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import {
  historieActie, maakTaakActie, stopReeksActie, verwijderTaakActie, wijzigReeksActie, wijzigTaakActie, zetStatusActie,
} from '@/app/(app)/bord/acties';
import { KruisIcoon } from '@/components/iconen';
import { Invoer, Keuzelijst, Knop, Melding, Tekstvak, Veld } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { HistorieRegel, Taak } from '@/lib/diensten/taken';
import { DAGNAMEN_KORT, type Datum, formatMoment, weekdag } from '@/lib/domein/datums';
import { HERHALING_LABELS, type HerhalingType } from '@/lib/domein/herhaling';
import { PRIORITEIT_LABEL, PRIORITEITEN, type Prioriteit, type Status, STATUS_LABEL, STATUSSEN } from '@/lib/domein/taak';
import type { ActieResultaat } from '@/lib/web/actie';
import { PRIO_KNOP_AAN, STATUS_PIL } from './stijl';

export type DialoogModus = { soort: 'nieuw'; bordId: string; datum: Datum } | { soort: 'bewerk'; taak: Taak };

type Herhalen = 'geen' | HerhalingType;

const VELDNAAM: Record<string, string> = {
  titel: 'titel', omschrijving: 'omschrijving', datum: 'dag', tijd: 'tijd', prioriteit: 'prioriteit', status: 'status',
};

const toon = (w: unknown) => (w === null || w === '' ? '–' : String(w));

export function TaakDialoog({ modus, isBeheerder, onSluit }: { modus: DialoogModus; isBeheerder: boolean; onSluit: () => void }) {
  const router = useRouter();
  const taak = modus.soort === 'bewerk' ? modus.taak : null;
  const startDatum = taak ? taak.datum : modus.soort === 'nieuw' ? modus.datum : '';

  const [titel, setTitel] = useState(taak?.titel ?? '');
  const [omschrijving, setOmschrijving] = useState(taak?.omschrijving ?? '');
  const [datum, setDatum] = useState<Datum>(startDatum);
  const [tijd, setTijd] = useState(taak?.tijd ?? '');
  const [prioriteit, setPrioriteit] = useState<Prioriteit>(taak?.prioriteit ?? 'middel');
  const [herhalen, setHerhalen] = useState<Herhalen>(taak?.herhalingType ?? 'geen');
  const [weekdagen, setWeekdagen] = useState<number[]>(
    taak?.herhalingWeekdagen?.length ? taak.herhalingWeekdagen : [weekdag(startDatum)],
  );
  const [intervalWeken, setIntervalWeken] = useState(Math.max(2, taak?.herhalingInterval ?? 2));
  const [bereik, setBereik] = useState<'deze' | 'reeks'>('deze');
  const [fout, setFout] = useState<{ tekst: string; conflict: boolean } | null>(null);
  const [historie, setHistorie] = useState<HistorieRegel[] | null>(null);
  const [bezig, start] = useTransition();
  const titelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titelRef.current?.focus();
    const bijToets = (e: KeyboardEvent) => { if (e.key === 'Escape') onSluit(); };
    window.addEventListener('keydown', bijToets);
    return () => window.removeEventListener('keydown', bijToets);
  }, [onSluit]);

  const isReeks = Boolean(taak?.herhalingId);
  const reeksBewerken = isReeks && bereik === 'reeks';
  const herhalingBewerkbaar = modus.soort === 'nieuw' || reeksBewerken;

  function regel() {
    if (herhalen === 'geen') return null;
    return {
      type: herhalen,
      weekdagen: herhalen === 'weekdagen' ? weekdagen : [],
      intervalWeken: herhalen === 'elke_x_weken' ? intervalWeken : 1,
    };
  }

  function afronden(r: ActieResultaat<unknown>) {
    if (!r.ok) {
      setFout({ tekst: r.fout, conflict: Boolean(r.conflict) });
      return;
    }
    onSluit();
    router.refresh();
  }

  function opslaan(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    const velden = { titel, omschrijving, datum, tijd: tijd || null, prioriteit };
    start(async () => {
      if (modus.soort === 'nieuw') {
        afronden(await maakTaakActie({ ...velden, bordId: modus.bordId, herhaling: regel() }));
        return;
      }
      if (!taak) return;
      if (reeksBewerken && taak.herhalingId) {
        const r = regel();
        if (!r) {
          setFout({ tekst: 'Kies hoe de reeks herhaalt, of gebruik "Reeks stoppen".', conflict: false });
          return;
        }
        afronden(await wijzigReeksActie(taak.herhalingId, { titel, omschrijving, tijd: tijd || null, prioriteit, herhaling: r }));
        return;
      }
      afronden(await wijzigTaakActie(taak.id, taak.versie, velden));
    });
  }

  function kiesStatus(s: Status) {
    if (!taak || s === taak.status) return;
    start(async () => afronden(await zetStatusActie(taak.id, taak.versie, s)));
  }

  function verwijder() {
    if (!taak || !confirm(`"${taak.titel}" verwijderen?`)) return;
    start(async () => afronden(await verwijderTaakActie(taak.id)));
  }

  function stopDeReeks() {
    const herhalingId = taak?.herhalingId;
    if (!herhalingId || !confirm('De reeks stoppen? Toekomstige open taken van deze reeks worden verwijderd.')) return;
    start(async () => afronden(await stopReeksActie(herhalingId)));
  }

  function laadHistorie() {
    if (!taak || historie) return;
    start(async () => {
      const r = await historieActie(taak.id);
      if (r.ok) setHistorie(r.data);
      else setFout({ tekst: r.fout, conflict: false });
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={taak ? 'Taak bewerken' : 'Nieuwe taak'}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-rand bg-paneel p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{taak ? 'Taak bewerken' : 'Nieuwe taak'}</h2>
          <button type="button" onClick={onSluit} aria-label="Sluiten" className="rounded-lg p-1.5 text-tekst-zacht hover:bg-kaart hover:text-tekst">
            <KruisIcoon />
          </button>
        </div>

        {taak && isBeheerder && (
          <div className="mb-5">
            <span className="mb-1.5 block text-xs font-medium text-tekst-zacht">Status</span>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Status">
              {STATUSSEN.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={bezig}
                  aria-pressed={taak.status === s}
                  onClick={() => kiesStatus(s)}
                  className={cn(
                    'h-10 rounded-lg border text-sm font-semibold transition-colors',
                    taak.status === s ? cn('border-transparent', STATUS_PIL[s]) : 'border-rand text-tekst-zacht hover:bg-kaart',
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {isReeks && (
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-achtergrond p-1" role="radiogroup" aria-label="Wat wil je bewerken?">
            {(['deze', 'reeks'] as const).map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={bereik === b}
                onClick={() => setBereik(b)}
                className={cn('h-8 rounded-md text-sm', bereik === b ? 'bg-kaart font-semibold text-tekst' : 'text-tekst-zacht')}
              >
                {b === 'deze' ? 'Alleen deze taak' : 'Hele reeks'}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={opslaan} className="space-y-4">
          <Veld label="Titel">
            <Invoer ref={titelRef} value={titel} onChange={(e) => setTitel(e.target.value)} required maxLength={200} />
          </Veld>
          <Veld label="Omschrijving (optioneel)">
            <Tekstvak value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} rows={3} maxLength={2000} />
          </Veld>
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Dag">
              <Invoer type="date" value={datum} onChange={(e) => setDatum(e.target.value)} required disabled={reeksBewerken} />
            </Veld>
            <Veld label="Tijd (optioneel)">
              <Invoer type="time" value={tijd} onChange={(e) => setTijd(e.target.value)} />
            </Veld>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-tekst-zacht">Prioriteit</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Prioriteit">
              {[...PRIORITEITEN].reverse().map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={prioriteit === p}
                  onClick={() => setPrioriteit(p)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                    prioriteit === p ? cn(PRIO_KNOP_AAN[p], 'text-tekst') : 'border-rand text-tekst-zacht hover:bg-kaart',
                  )}
                >
                  {PRIORITEIT_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Veld label="Herhalen">
              <Keuzelijst value={herhalen} onChange={(e) => setHerhalen(e.target.value as Herhalen)} disabled={!herhalingBewerkbaar}>
                <option value="geen">Niet herhalen</option>
                {(Object.keys(HERHALING_LABELS) as HerhalingType[]).map((h) => (
                  <option key={h} value={h}>{HERHALING_LABELS[h]}</option>
                ))}
              </Keuzelijst>
            </Veld>
            {herhalingBewerkbaar && herhalen === 'weekdagen' && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekdagen">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={weekdagen.includes(d)}
                    onClick={() => setWeekdagen((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()))}
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
            {herhalingBewerkbaar && herhalen === 'elke_x_weken' && (
              <Veld label="Om de hoeveel weken?">
                <Invoer type="number" min={2} max={52} value={intervalWeken} onChange={(e) => setIntervalWeken(Number(e.target.value))} className="w-24" />
              </Veld>
            )}
          </div>

          {fout && (
            <Melding>
              {fout.tekst}
              {fout.conflict && (
                <>
                  {' '}
                  <button type="button" className="underline" onClick={() => { onSluit(); router.refresh(); }}>Herladen</button>
                </>
              )}
            </Melding>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            {taak && <Knop variant="gevaar" onClick={verwijder} disabled={bezig}>Verwijderen</Knop>}
            {isReeks && <Knop variant="stil" onClick={stopDeReeks} disabled={bezig}>Reeks stoppen</Knop>}
            <div className="ml-auto flex gap-2">
              <Knop variant="secundair" onClick={onSluit}>Annuleren</Knop>
              <Knop type="submit" disabled={bezig}>{bezig ? 'Bezig…' : 'Opslaan'}</Knop>
            </div>
          </div>
        </form>

        {taak && (
          <div className="mt-5 border-t border-rand-zacht pt-4 text-xs text-tekst-flauw">
            <p>Aangemaakt door {taak.aangemaaktDoorNaam ?? 'onbekend'} · {formatMoment(new Date(taak.aangemaaktOp))}</p>
            <p>Laatst gewijzigd door {taak.gewijzigdDoorNaam ?? 'onbekend'} · {formatMoment(new Date(taak.gewijzigdOp))}</p>
            <details className="mt-2" onToggle={(e) => { if (e.currentTarget.open) laadHistorie(); }}>
              <summary className="cursor-pointer text-tekst-zacht hover:text-tekst">Geschiedenis</summary>
              {historie === null ? (
                <p className="mt-2">Laden…</p>
              ) : historie.length === 0 ? (
                <p className="mt-2">Nog geen wijzigingen.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {historie.map((h, i) => (
                    <li key={i}>
                      <span className="text-tekst-zacht">{formatMoment(new Date(h.tijdstip))} · {h.naam ?? 'onbekend'}:</span>{' '}
                      {Object.entries(h.wijzigingen)
                        .map(([veld, w]) => `${VELDNAAM[veld] ?? veld} ${toon(w.oud)} → ${toon(w.nieuw)}`)
                        .join(', ')}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Weekbord en bordpagina schrijven**

`src/components/bord/week-bord.tsx`:
```tsx
'use client';

import { DndContext, type DragEndEvent, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { verplaatsTaakActie } from '@/app/(app)/bord/acties';
import { PijlLinks, PijlRechts, PlusIcoon } from '@/components/iconen';
import { Knop, Melding } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Taak } from '@/lib/diensten/taken';
import { DAGNAMEN_KORT, type Datum, kortDatumLabel, weekdag } from '@/lib/domein/datums';
import { vergelijkTaken } from '@/lib/domein/taak';
import { DagKolom } from './dag-kolom';
import { type DialoogModus, TaakDialoog } from './taak-dialoog';

const WEEKKNOP =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-rand bg-kaart text-tekst-zacht transition-colors hover:bg-kaart-hover hover:text-tekst';

export type WeekBordProps = {
  bordId: string;
  dagen: Datum[];
  taken: Taak[];
  vandaag: Datum;
  isBeheerder: boolean;
  gearchiveerd: boolean;
  weekLabel: string;
  periodeLabel: string;
  links: { vorige: string; deze: string; volgende: string };
};

export function WeekBord({ bordId, dagen, taken, vandaag, isBeheerder, gearchiveerd, weekLabel, periodeLabel, links }: WeekBordProps) {
  const router = useRouter();
  const [dialoog, setDialoog] = useState<DialoogModus | null>(null);
  const [verplaatst, setVerplaatst] = useState<Record<string, Datum>>({});
  const [fout, setFout] = useState<string | null>(null);
  const [actieveDag, setActieveDag] = useState<Datum>(dagen.includes(vandaag) ? vandaag : dagen[0]);
  const zojuistGesleept = useRef(false);
  const veegStart = useRef<number | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));

  // Nieuwe serverdata vervangt optimistische verplaatsingen.
  useEffect(() => setVerplaatst({}), [taken]);

  const perDag = useMemo(() => {
    const m = new Map<Datum, Taak[]>(dagen.map((d) => [d, []]));
    for (const t of taken) m.get(verplaatst[t.id] ?? t.datum)?.push(t);
    for (const lijst of m.values()) lijst.sort(vergelijkTaken);
    return m;
  }, [dagen, taken, verplaatst]);

  async function bijLoslaten(e: DragEndEvent) {
    setTimeout(() => { zojuistGesleept.current = false; }, 50);
    const taak = e.active.data.current?.taak as Taak | undefined;
    const naar = e.over?.id as Datum | undefined;
    if (!taak || !naar || naar === (verplaatst[taak.id] ?? taak.datum)) return;
    setVerplaatst((v) => ({ ...v, [taak.id]: naar }));
    const r = await verplaatsTaakActie(taak.id, taak.versie, naar);
    if (!r.ok) {
      setFout(r.fout);
      setVerplaatst((v) => {
        const kopie = { ...v };
        delete kopie[taak.id];
        return kopie;
      });
    } else {
      setFout(null);
    }
    router.refresh();
  }

  function openTaak(taak: Taak) {
    if (zojuistGesleept.current) return;
    setDialoog({ soort: 'bewerk', taak });
  }

  function nieuweTaak(datum: Datum) {
    setDialoog({ soort: 'nieuw', bordId, datum });
  }

  function veeg(eindX: number) {
    if (veegStart.current === null) return;
    const dx = eindX - veegStart.current;
    veegStart.current = null;
    if (Math.abs(dx) < 60) return;
    const i = dagen.indexOf(actieveDag) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < dagen.length) setActieveDag(dagen[i]);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">{weekLabel}</h1>
          <p className="text-sm text-tekst-zacht">{periodeLabel}</p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Weeknavigatie">
          <Link href={links.vorige} className={WEEKKNOP} aria-label="Vorige week"><PijlLinks /></Link>
          <Link href={links.deze} className={cn(WEEKKNOP, 'px-3 text-sm')}>Deze week</Link>
          <Link href={links.volgende} className={WEEKKNOP} aria-label="Volgende week"><PijlRechts /></Link>
        </nav>
        <Knop onClick={() => nieuweTaak(dagen.includes(vandaag) ? vandaag : actieveDag)} disabled={gearchiveerd}>
          <PlusIcoon />Nieuwe taak
        </Knop>
      </div>

      {gearchiveerd && <div className="mb-3"><Melding soort="info">Dit bord is gearchiveerd. Nieuwe taken toevoegen kan niet.</Melding></div>}
      {fout && <div className="mb-3"><Melding>{fout}</Melding></div>}

      <div className="mb-3 flex gap-1 overflow-x-auto md:hidden" role="tablist" aria-label="Dagen">
        {dagen.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === actieveDag}
            onClick={() => setActieveDag(d)}
            className={cn(
              'flex min-w-14 flex-col items-center rounded-lg px-2 py-1.5 text-xs',
              d === actieveDag ? 'bg-kaart text-tekst' : 'text-tekst-zacht',
              d === vandaag && 'ring-1 ring-accent/60',
            )}
          >
            <span className="font-semibold uppercase">{DAGNAMEN_KORT[weekdag(d)]}</span>
            <span>{kortDatumLabel(d)}</span>
          </button>
        ))}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={() => { zojuistGesleept.current = true; }}
        onDragEnd={bijLoslaten}
        onDragCancel={() => { zojuistGesleept.current = false; }}
      >
        <div
          className="gap-3 md:grid"
          style={{ gridTemplateColumns: `repeat(${dagen.length}, minmax(0, 1fr))` }}
          onTouchStart={(e) => { veegStart.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => veeg(e.changedTouches[0].clientX)}
        >
          {dagen.map((d) => (
            <DagKolom
              key={d}
              datum={d}
              taken={perDag.get(d) ?? []}
              isVandaag={d === vandaag}
              verborgenOpMobiel={d !== actieveDag}
              onNieuw={() => nieuweTaak(d)}
              onOpen={openTaak}
            />
          ))}
        </div>
      </DndContext>

      {dialoog && <TaakDialoog modus={dialoog} isBeheerder={isBeheerder} onSluit={() => setDialoog(null)} />}
    </div>
  );
}
```

`src/app/(app)/bord/[bordId]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { WeekBord } from '@/components/bord/week-bord';
import { haalBord } from '@/lib/diensten/borden';
import { takenVoorPeriode } from '@/lib/diensten/taken';
import {
  isoWeek, kortDatumLabel, maandagVan, parseWeekCode, plusDagen, vandaagInAmsterdam, weekCode,
} from '@/lib/domein/datums';
import { NietGevonden } from '@/lib/fouten';
import { contextVan, vereisGebruiker } from '@/lib/web/huidige-gebruiker';

export default async function BordPagina({
  params,
  searchParams,
}: {
  params: Promise<{ bordId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const gebruiker = await vereisGebruiker();
  const ctx = contextVan(gebruiker);
  const { bordId } = await params;
  const { week } = await searchParams;

  const bord = await haalBord(ctx, bordId).catch((e: unknown) => {
    if (e instanceof NietGevonden) notFound();
    throw e;
  });

  const vandaag = vandaagInAmsterdam();
  const maandag = (week && parseWeekCode(week)) || maandagVan(vandaag);
  const dagen = [...bord.werkdagen].sort((a, b) => a - b).map((w) => plusDagen(maandag, w - 1));
  const taken = (await takenVoorPeriode(ctx, bord.id, maandag, plusDagen(maandag, 6))).filter((t) => dagen.includes(t.datum));

  return (
    <WeekBord
      key={maandag}
      bordId={bord.id}
      dagen={dagen}
      taken={taken}
      vandaag={vandaag}
      isBeheerder={gebruiker.rol === 'beheerder'}
      gearchiveerd={bord.gearchiveerd}
      weekLabel={`Week ${isoWeek(maandag).week} · ${bord.bedrijfNaam}`}
      periodeLabel={`${kortDatumLabel(dagen[0])} – ${kortDatumLabel(dagen[dagen.length - 1])} ${maandag.slice(0, 4)}`}
      links={{
        vorige: `/bord/${bord.id}?week=${weekCode(plusDagen(maandag, -7))}`,
        deze: `/bord/${bord.id}`,
        volgende: `/bord/${bord.id}?week=${weekCode(plusDagen(maandag, 7))}`,
      }}
    />
  );
}
```

- [ ] **Step 7: Controleren**

Run: `npm run typecheck && npm test && npm run build`
Expected: geen fouten. De routelijst bevat `/bord/[bordId]` en geen losse `/` buiten de `(app)`-groep.

Handmatige ronde (`npm run dev`):
1. Log in als `max`. Je komt op het bord van het eerste bedrijf, met een kolom per werkdag waarin vandaag groen gemarkeerd is.
2. "Nieuwe taak": vul titel, tijd 08:30 en prioriteit "Nu" in en sla op. De kaart staat bovenaan de dag, met het rode label NU.
3. Klik de kaart, zet de status op "Bezig". Het dialoogvenster sluit en de kaart toont "Bezig".
4. Sleep de kaart naar een andere dag. Hij blijft daar staan, ook na herladen.
5. Maak een taak met "Op gekozen weekdagen" ma+do. Op de juiste dagen verschijnen kaarten met het herhaalicoon. Blader een week vooruit met ›: de reeks loopt door. Open een exemplaar, kies "Hele reeks", wijzig de titel en sla op. Alle toekomstige exemplaren veranderen mee.
6. Open de geschiedenis van een gewijzigde taak; de wijzigingen staan erin.
7. Maak het browservenster smal (< 768px). Je ziet dan één dag met dagtabs erboven.
8. Log in als medewerker (privévenster): die ziet geen statusknoppen in het dialoogvenster.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: weekbord met taakdialoog, herhalingen en slepen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Live bijwerken

**Files:**
- Create: `src/app/api/borden/[bordId]/gebeurtenissen/route.ts`, `src/components/bord/live-vernieuwen.tsx`
- Modify: `src/app/(app)/bord/[bordId]/page.tsx` (LiveVernieuwen toevoegen)
- Test: `tests/integration/gebeurtenissen.test.ts`

**Interfaces:**
- Consumes: `luisterNaarWijzigingen`, `meldWijziging`, `huidigeGebruiker`, `haalBord`, `contextVan`
- Produces:
  - `GET /api/borden/:bordId/gebeurtenissen` (SSE). Bij elke wijziging op het bord komt er een bericht `data: <bordId>`. `bordId = alle` is alleen voor de beheerder en geeft wijzigingen van alle borden.
  - `LiveVernieuwen({ bron: string })` roept `router.refresh()` aan bij elk bericht, en ook na het herstellen van een verbroken verbinding.

- [ ] **Step 1: De falende test schrijven**

`tests/integration/gebeurtenissen.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { meldWijziging, luisterNaarWijzigingen } from '../../src/lib/db/gebeurtenissen';
import { metTenant, type Context } from '../../src/lib/db/tenant';
import { maakTaak } from '../../src/lib/diensten/taken';
import { leegDatabase, maakBedrijfMetBord, maakMedewerkerCtx } from './helpers';

let piet: Context;
let bordId: string;

beforeEach(async () => {
  await leegDatabase();
  const a = await maakBedrijfMetBord('A');
  bordId = a.bordId;
  piet = await maakMedewerkerCtx(a.bedrijfId, 'piet');
});

describe('gebeurtenissen', () => {
  it('meldt een nieuwe taak aan luisteraars', async () => {
    const ontvangen: string[] = [];
    const stop = await luisterNaarWijzigingen((id) => ontvangen.push(id));
    await maakTaak(piet, { bordId, titel: 'Live', omschrijving: '', datum: '2026-10-22', tijd: null, prioriteit: 'laag', herhaling: null });
    await vi.waitFor(() => expect(ontvangen).toContain(bordId), { timeout: 3000 });
    await stop();
  });

  it('meldt niets als de transactie mislukt', async () => {
    const ontvangen: string[] = [];
    const stop = await luisterNaarWijzigingen((id) => ontvangen.push(id));
    await expect(metTenant(piet, async (tx) => {
      await meldWijziging(tx, bordId);
      throw new Error('terugdraaien');
    })).rejects.toThrow('terugdraaien');
    await new Promise((r) => setTimeout(r, 300));
    expect(ontvangen).toEqual([]);
    await stop();
  });
});
```

- [ ] **Step 2: Test draaien**

Run: `npm run test:integratie`
Expected: PASS. `meldWijziging` en `luisterNaarWijzigingen` bestaan al sinds Task 4; deze test legt het gedrag vast. Faalt de test, repareer dan `src/lib/db/gebeurtenissen.ts` voordat je verdergaat.

- [ ] **Step 3: SSE-route en client schrijven**

`src/app/api/borden/[bordId]/gebeurtenissen/route.ts`:
```ts
import { luisterNaarWijzigingen } from '@/lib/db/gebeurtenissen';
import { haalBord } from '@/lib/diensten/borden';
import { contextVan, huidigeGebruiker } from '@/lib/web/huidige-gebruiker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(verzoek: Request, { params }: { params: Promise<{ bordId: string }> }) {
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) return new Response('Niet ingelogd', { status: 401 });
  const { bordId } = await params;
  const alle = bordId === 'alle';
  if (alle && gebruiker.rol !== 'beheerder') return new Response('Geen toegang', { status: 403 });
  if (!alle) {
    try {
      await haalBord(contextVan(gebruiker), bordId);
    } catch {
      return new Response('Niet gevonden', { status: 404 });
    }
  }

  const encoder = new TextEncoder();
  let stop: (() => Promise<void>) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  const opruimen = () => {
    clearInterval(ping);
    void stop?.();
    stop = undefined;
  };

  const stroom = new ReadableStream<Uint8Array>({
    async start(controller) {
      const stuur = (tekst: string) => {
        try {
          controller.enqueue(encoder.encode(tekst));
        } catch {
          opruimen();
        }
      };
      stuur(': verbonden\n\n');
      stop = await luisterNaarWijzigingen((id) => {
        if (alle || id === bordId) stuur(`data: ${id}\n\n`);
      });
      ping = setInterval(() => stuur(': ping\n\n'), 25_000);
      verzoek.signal.addEventListener('abort', () => {
        opruimen();
        try { controller.close(); } catch { /* al gesloten */ }
      });
    },
    cancel: opruimen,
  });

  return new Response(stroom, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

`src/components/bord/live-vernieuwen.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function LiveVernieuwen({ bron }: { bron: string }) {
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource(bron);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let eerderVerbonden = false;
    const vernieuw = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };
    es.onopen = () => {
      if (eerderVerbonden) vernieuw(); // na herverbinden: alles opnieuw ophalen
      eerderVerbonden = true;
    };
    es.onmessage = vernieuw;
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [bron, router]);
  return null;
}
```

Voeg in `src/app/(app)/bord/[bordId]/page.tsx` de import toe:
```tsx
import { LiveVernieuwen } from '@/components/bord/live-vernieuwen';
```
en vervang `return (\n    <WeekBord` … `/>\n  );` door een fragment met beide onderdelen:
```tsx
  return (
    <>
      <WeekBord
        key={maandag}
        bordId={bord.id}
        dagen={dagen}
        taken={taken}
        vandaag={vandaag}
        isBeheerder={gebruiker.rol === 'beheerder'}
        gearchiveerd={bord.gearchiveerd}
        weekLabel={`Week ${isoWeek(maandag).week} · ${bord.bedrijfNaam}`}
        periodeLabel={`${kortDatumLabel(dagen[0])} – ${kortDatumLabel(dagen[dagen.length - 1])} ${maandag.slice(0, 4)}`}
        links={{
          vorige: `/bord/${bord.id}?week=${weekCode(plusDagen(maandag, -7))}`,
          deze: `/bord/${bord.id}`,
          volgende: `/bord/${bord.id}?week=${weekCode(plusDagen(maandag, 7))}`,
        }}
      />
      <LiveVernieuwen bron={`/api/borden/${bord.id}/gebeurtenissen`} />
    </>
  );
```

- [ ] **Step 4: Controleren**

Run: `npm run typecheck && npm run build`
Expected: geen fouten. De route `/api/borden/[bordId]/gebeurtenissen` staat in de lijst als dynamisch (ƒ).

Handmatig: open hetzelfde bord in twee vensters (beheerder en medewerker). Maak in het ene venster een taak aan. Binnen ongeveer een seconde staat hij in het andere venster, zonder herladen. Controleer ook `curl -i http://localhost:3000/api/borden/alle/gebeurtenissen` zonder cookie: dat geeft `401`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: live bijwerken van borden via server-sent events" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Vandaag-overzicht voor de beheerder

**Files:**
- Create: `src/app/(app)/vandaag/page.tsx`, `src/components/bord/vandaag-lijst.tsx`
- Modify: `src/app/(app)/page.tsx` (de beheerder gaat naar `/vandaag`)

**Interfaces:**
- Consumes: `takenOpDatum`, `TaakKaartInhoud`, `TaakDialoog`, `LiveVernieuwen`, datumhulpen
- Produces: route `/vandaag` (alleen voor de beheerder)

- [ ] **Step 1: Lijstcomponent schrijven**

`src/components/bord/vandaag-lijst.tsx`:
```tsx
'use client';

import { useState } from 'react';
import type { Taak } from '@/lib/diensten/taken';
import { TaakDialoog } from './taak-dialoog';
import { TaakKaartInhoud } from './taak-kaart';

export function VandaagLijst({ taken }: { taken: Taak[] }) {
  const [open, setOpen] = useState<Taak | null>(null);
  if (taken.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-rand p-10 text-center text-sm text-tekst-zacht">
        Geen taken voor vandaag.
      </p>
    );
  }
  return (
    <>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {taken.map((t) => (
          <li key={t.id}>
            <button type="button" data-taak={t.id} onClick={() => setOpen(t)} className="block w-full text-left">
              <TaakKaartInhoud taak={t} toonBord />
            </button>
          </li>
        ))}
      </ul>
      {open && <TaakDialoog modus={{ soort: 'bewerk', taak: open }} isBeheerder onSluit={() => setOpen(null)} />}
    </>
  );
}
```

`src/app/(app)/vandaag/page.tsx`:
```tsx
import { LiveVernieuwen } from '@/components/bord/live-vernieuwen';
import { VandaagLijst } from '@/components/bord/vandaag-lijst';
import { takenOpDatum } from '@/lib/diensten/taken';
import { DAGNAMEN, kortDatumLabel, vandaagInAmsterdam, weekdag } from '@/lib/domein/datums';
import { contextVan, vereisBeheerderSessie } from '@/lib/web/huidige-gebruiker';

export default async function VandaagPagina() {
  const gebruiker = await vereisBeheerderSessie();
  const vandaag = vandaagInAmsterdam();
  const taken = await takenOpDatum(contextVan(gebruiker), vandaag);
  const open = taken.filter((t) => t.status !== 'klaar').length;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold capitalize">{DAGNAMEN[weekdag(vandaag)]} {kortDatumLabel(vandaag)}</h1>
        <p className="text-sm text-tekst-zacht">{open} open {open === 1 ? 'taak' : 'taken'} bij alle bedrijven</p>
      </div>
      <VandaagLijst taken={taken} />
      <LiveVernieuwen bron="/api/borden/alle/gebeurtenissen" />
    </div>
  );
}
```

- [ ] **Step 2: De beheerder naar Vandaag sturen**

Voeg in `src/app/(app)/page.tsx` direct na `const g = await vereisGebruiker();` deze regel toe:
```tsx
  if (g.rol === 'beheerder') redirect('/vandaag');
```

- [ ] **Step 3: Controleren**

Run: `npm run typecheck && npm run build`
Expected: geen fouten; `/vandaag` staat in de routelijst.

Handmatig: log in als `max`. Je komt op "Vandaag", met de taken van vandaag van alle bedrijven en per kaart de bedrijfs- en bordnaam. "Nu"-taken staan bovenaan. Maak in een ander venster als medewerker een taak voor vandaag aan; die verschijnt live. Ga als medewerker naar `/vandaag`; je wordt teruggestuurd naar je bord.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: vandaag-overzicht over alle bedrijven voor de beheerder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: End-to-end tests en README

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/gegevens.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/helpers.ts`
- Create: `tests/e2e/beheer-en-live.spec.ts`, `tests/e2e/slepen.spec.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: de hele app, `maakSql`, `migreer`, `maakBeheerder`, `hashWachtwoord`, `pgIntArray`

De e2e-tests draaien tegen database `takenbord_e2e` (aangemaakt door `docker/initdb/01-e2e.sql`) en een eigen dev-server op poort 3100. Stop een lopende `npm run dev` eerst, omdat twee Next-devservers in dezelfde map elkaar kunnen blokkeren.

Heeft de dev-database al bestaan vóór `docker/initdb` werd toegevoegd, dan draait dat init-script niet. Maak de database dan eenmalig met de hand aan: `docker compose -f docker-compose.dev.yml exec db psql -U takenbord -c "create database takenbord_e2e"`.

- [ ] **Step 1: Playwright installeren en configureren**

```bash
npx playwright install chromium
```

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';
import { E2E_DATABASE_URL, POORT } from './tests/e2e/gegevens';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${POORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev -p ${POORT}`,
    url: `http://localhost:${POORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { DATABASE_URL: E2E_DATABASE_URL, APP_URL: `http://localhost:${POORT}` },
  },
});
```

`tests/e2e/gegevens.ts`:
```ts
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://takenbord:takenbord@localhost:5432/takenbord_e2e';
export const POORT = 3100;
export const BEHEERDER = { naam: 'Max', gebruikersnaam: 'max', wachtwoord: 'e2e-beheer-wachtwoord' };
```

`tests/e2e/global-setup.ts`:
```ts
import { maakBeheerder } from '../../src/lib/auth/accounts';
import { maakSql, sluitDb } from '../../src/lib/db/client';
import { migreer } from '../../src/lib/db/migreer';
import { BEHEERDER, E2E_DATABASE_URL } from './gegevens';

export default async function globalSetup() {
  process.env.DATABASE_URL = E2E_DATABASE_URL;
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  await sql.unsafe('drop schema public cascade; create schema public;').simple();
  await migreer(sql);
  await sql.end();
  await maakBeheerder(BEHEERDER.naam, BEHEERDER.gebruikersnaam, BEHEERDER.wachtwoord);
  await sluitDb();
}
```

`tests/e2e/helpers.ts`:
```ts
import { expect, type Page } from '@playwright/test';
import { hashWachtwoord } from '../../src/lib/auth/wachtwoord';
import { maakSql } from '../../src/lib/db/client';
import { E2E_DATABASE_URL } from './gegevens';

export async function inloggen(page: Page, gebruikersnaam: string, wachtwoord: string) {
  await page.goto('/login');
  await page.getByLabel('Gebruikersnaam').fill(gebruikersnaam);
  await page.getByLabel('Wachtwoord').fill(wachtwoord);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Zet direct in de database een bedrijf met bord en een geactiveerde medewerker klaar. */
export async function maakBedrijfMetMedewerker(naam: string): Promise<{ gebruikersnaam: string; wachtwoord: string }> {
  const sql = maakSql(E2E_DATABASE_URL, { max: 1 });
  const gebruikersnaam = `mw${Date.now()}`;
  const wachtwoord = 'e2e-medewerker-wachtwoord';
  const [b] = await sql<{ id: string }[]>`insert into bedrijven (naam) values (${naam}) returning id`;
  await sql`insert into borden (bedrijf_id, naam) values (${b.id}, 'Takenbord')`;
  await sql`insert into gebruikers (bedrijf_id, naam, gebruikersnaam, wachtwoord_hash, rol)
    values (${b.id}, 'Test Medewerker', ${gebruikersnaam}, ${await hashWachtwoord(wachtwoord)}, 'medewerker')`;
  await sql.end();
  return { gebruikersnaam, wachtwoord };
}
```

- [ ] **Step 2: De e2e-tests schrijven**

`tests/e2e/beheer-en-live.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { BEHEERDER } from './gegevens';
import { inloggen } from './helpers';

test('beheerder richt een bedrijf in, medewerker activeert en taken komen live binnen', async ({ page, browser }) => {
  await inloggen(page, BEHEERDER.gebruikersnaam, BEHEERDER.wachtwoord);
  await expect(page).toHaveURL(/\/vandaag$/);

  // Bedrijf aanmaken
  await page.goto('/beheer/bedrijven');
  const nieuwBedrijf = page.getByRole('region', { name: 'Nieuw bedrijf' });
  await nieuwBedrijf.getByLabel('Naam', { exact: true }).fill('Garage Jansen');
  await nieuwBedrijf.getByRole('button', { name: 'Bedrijf toevoegen' }).click();
  await expect(page.getByRole('region', { name: 'Garage Jansen' })).toBeVisible();

  // Medewerker aanmaken
  await page.goto('/beheer/medewerkers');
  const nieuwMw = page.getByRole('region', { name: 'Nieuwe medewerker' });
  await nieuwMw.getByLabel('Naam', { exact: true }).fill('Piet de Vries');
  await nieuwMw.getByLabel('Gebruikersnaam').fill('piet');
  await nieuwMw.getByLabel('Bedrijf').selectOption({ label: 'Garage Jansen' });
  await nieuwMw.getByRole('button', { name: 'Medewerker toevoegen' }).click();
  const link = await page.getByLabel('Activatielink').inputValue();
  expect(link).toMatch(/\/activeren\//);

  // Medewerker activeert in een eigen browsercontext
  const pietContext = await browser.newContext();
  const piet = await pietContext.newPage();
  await piet.goto(link);
  await piet.getByLabel('Nieuw wachtwoord').fill('piet-wachtwoord-1');
  await piet.getByLabel('Herhaal wachtwoord').fill('piet-wachtwoord-1');
  await piet.getByRole('button', { name: 'Wachtwoord instellen' }).click();
  await piet.waitForURL(/\/bord\//);

  // Beheerder opent hetzelfde bord
  await page.goto(new URL(piet.url()).pathname);
  await expect(page.locator('[data-dag]').first()).toBeVisible();

  // Piet maakt een taak met prioriteit Nu
  await piet.getByRole('button', { name: 'Nieuwe taak' }).click();
  const dialoog = piet.getByRole('dialog', { name: 'Nieuwe taak' });
  await dialoog.getByLabel('Titel').fill('Ruitenwisser klant');
  await dialoog.getByRole('button', { name: 'Nu', exact: true }).click();
  await dialoog.getByRole('button', { name: 'Opslaan' }).click();
  await expect(dialoog).toBeHidden();

  // De beheerder ziet hem zonder herladen
  const kaartBijMax = page.locator('[data-taak]', { hasText: 'Ruitenwisser klant' });
  await expect(kaartBijMax).toBeVisible({ timeout: 10_000 });
  await expect(kaartBijMax.getByText('NU', { exact: true })).toBeVisible();

  // De beheerder zet hem op Bezig; Piet ziet dat live
  await kaartBijMax.click();
  await page.getByRole('dialog', { name: 'Taak bewerken' }).getByRole('button', { name: 'Bezig', exact: true }).click();
  const kaartBijPiet = piet.locator('[data-taak]', { hasText: 'Ruitenwisser klant' });
  await expect(kaartBijPiet.getByText('Bezig', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Piet krijgt geen statusknoppen
  await kaartBijPiet.click();
  const pietDialoog = piet.getByRole('dialog', { name: 'Taak bewerken' });
  await expect(pietDialoog).toBeVisible();
  await expect(pietDialoog.getByRole('group', { name: 'Status' })).toHaveCount(0);

  await pietContext.close();
});
```

`tests/e2e/slepen.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { inloggen, maakBedrijfMetMedewerker } from './helpers';

test('een kaart naar een andere dag slepen blijft bewaard', async ({ page }) => {
  const mw = await maakBedrijfMetMedewerker('Garage Sleep');
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);

  const dagen = page.locator('[data-dag]');
  const eerste = dagen.nth(0);
  const tweede = dagen.nth(1);
  const tweedeDatum = await tweede.getAttribute('data-dag');

  await eerste.getByRole('button', { name: /Taak toevoegen/ }).click();
  const dialoog = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await dialoog.getByLabel('Titel').fill('Sleeptaak');
  await dialoog.getByRole('button', { name: 'Opslaan' }).click();
  await expect(dialoog).toBeHidden();

  const kaart = eerste.locator('[data-taak]', { hasText: 'Sleeptaak' });
  await expect(kaart).toBeVisible();
  const van = await kaart.boundingBox();
  const naar = await tweede.boundingBox();
  if (!van || !naar) throw new Error('geen afmetingen');

  await page.mouse.move(van.x + van.width / 2, van.y + van.height / 2);
  await page.mouse.down();
  await page.mouse.move(van.x + van.width / 2 + 20, van.y + van.height / 2, { steps: 5 });
  await page.mouse.move(naar.x + naar.width / 2, naar.y + 80, { steps: 15 });
  await page.mouse.up();

  const verplaatst = page.locator(`[data-dag="${tweedeDatum}"] [data-taak]`, { hasText: 'Sleeptaak' });
  await expect(verplaatst).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-dag="${tweedeDatum}"] [data-taak]`, { hasText: 'Sleeptaak' })).toBeVisible();
});
```

- [ ] **Step 3: E2E draaien**

Zorg dat de dev-database draait (`docker compose -f docker-compose.dev.yml up -d`) en dat er geen andere `next dev` actief is.

Run: `npm run test:e2e`
Expected: `2 passed`.

Faalt een test, bekijk dan het trace-bestand (`npx playwright show-trace test-results/**/trace.zip`). Herstel het probleem in de app, niet in de test, tenzij een selector aantoonbaar niet klopt met de bedoelde UI.

- [ ] **Step 4: README schrijven**

`README.md`:
````markdown
# Takenbord

Takenbord in Trello-stijl voor garages. Medewerkers zetten taken per dag op het bord; de beheerder voert ze uit.
Ontwerp: `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md`.

## Vereisten

- Node.js 24 LTS
- Docker Desktop

## Lokaal starten

```bash
npm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
npm run db:migreer
npm run maak-beheerder -- "Max" max
npm run dev        # http://localhost:3000
npm run worker     # in een tweede terminal: doorschuiven en herhalingen (elke nacht 00:05)
```

## Testen

```bash
npm test                  # unit-tests
npm run test:integratie   # integratietests (start zelf een PostgreSQL-container)
npm run test:e2e          # end-to-end; stop eerst een lopende `npm run dev`
npm run typecheck
```

## Structuur

- `migrations/`: SQL-migraties (tabellen, view, Row Level Security)
- `src/lib/domein/`: pure logica (datums, herhalingen, doorschuiven, sortering, validatie)
- `src/lib/db/`: databaseverbinding, migraties, `metTenant` (RLS per bedrijf), live-meldingen
- `src/lib/auth/`: wachtwoorden, sessies, inloggen, activatie
- `src/lib/diensten/`: bedrijven, borden, medewerkers, taken, reeksen
- `src/worker/`: nachtelijke taken
- `src/app/`: Next.js-routes; `src/components/`: UI
````

- [ ] **Step 5: Alles nog één keer draaien**

Run: `npm run typecheck && npm test && npm run test:integratie && npm run build && npm run test:e2e`
Expected: alles groen.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: end-to-end tests en README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Na dit plan

Volgende plannen (elk een eigen spec-sectie):
1. **Fase 2, locaties:** `locaties` en `taak_stops` (max 9), Google Places Autocomplete, opgeslagen locaties met "Vaak gebruikt", de knop "Navigeer", `garage_lat/lng`.
2. **Fase 3, route en meldingen:** Google Routes `computeRoutes` met `optimizeWaypointOrder`, de knop "Plan route", de Maps-link met meerdere stops, ntfy-meldingen bij `zsm`/`nu`.
3. **Fase 4, uitrol:** productie-Dockerfile, `docker-compose.yml` (app, worker, postgres, ntfy, caddy), migraties bij het opstarten, nachtelijke `pg_dump` en installatie-instructies voor de VPS.
