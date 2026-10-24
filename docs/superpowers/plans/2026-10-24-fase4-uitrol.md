# Garage Takenbord: fase 4 (uitrol) implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het takenbord draait met één `docker compose up -d --build` op een eigen Linux-server. HTTPS loopt via Caddy en de pushmeldingen via een eigen ntfy-server met token. De database wordt elke nacht geback-upt (14 dagen bewaard), en de README bevat een volledige installatie-instructie.

**Architecture:**
- **Eén Dockerfile met twee doelen:**
  - `app`: de Next.js-standalone-server.
  - `worker`: de broncode met productie-afhankelijkheden, `tsx` en `pg_dump`. Dit image draait de nachtelijke taken, de migraties en de beheercommando's.
- **`docker-compose.yml`** start `db`, de eenmalige `migreer`, `app`, `worker`, `ntfy` en `caddy`. Alleen Caddy is van buiten bereikbaar, op poort 80 en 443.
  - Caddy regelt automatisch HTTPS voor `DOMEIN` en `ntfy.DOMEIN`.
  - De app praat intern met `http://ntfy`.
  - De worker maakt om 03:00 een `pg_dump`-back-up.

**Tech Stack:** Docker (Compose v2), node:24-alpine, postgres:16-alpine, caddy, binwiederhier/ntfy, bestaande stack (Next.js 16, postgres.js, node-cron, tsx).

**Spec:** `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md` §3 (architectuur, back-up, configuratie) en §12.4 (uitrol).

**Bewuste keuzes (Task 4 legt ze vast in de spec):**
1. **Doelserver:** een algemene Linux-VPS (Ubuntu/Debian) met Docker. Er is nog geen server gekozen; dit werkt ook op de meeste thuisservers.
2. **Zonder eigen domein:** `DOMEIN` mag een sslip.io-naam zijn, bijvoorbeeld `203-0-113-5.sslip.io`. Die wijst gratis naar het IP-adres, en Caddy krijgt er een geldig certificaat voor. Later zet je het eigen domein in `.env`.
3. **ntfy:** draait op `ntfy.DOMEIN` met `deny-all`. Je maakt één gebruiker met token aan. Die gebruikt de telefoon-app om in te loggen en de app om te publiceren. De app gebruikt het interne adres `http://ntfy`.
4. **Migraties:** draaien als eenmalige dienst `migreer`, vóór `app` en `worker` starten.
5. **Back-ups:** komen in het volume `backups` van de worker. De README legt uit hoe je ze terugzet en hoe je ze naar een andere plek kopieert.

## Global Constraints

- Back-up: elke nacht om **03:00 Europe/Amsterdam** een `pg_dump` (custom format) naar `takenbord-YYYY-MM-DD.dump` in de back-upmap. Back-ups ouder dan **14 dagen** worden verwijderd, waarbij die van vandaag meetelt. Andere bestanden in de map blijven staan. Een mislukte back-up wordt gelogd met `[worker] back-up mislukt` en laat geen half bestand achter.
- Productieconfiguratie gaat via `.env` (zie `.env.productie.example`). Verplicht zijn `DOMEIN` en `POSTGRES_PASSWORD`; optioneel `GOOGLE_MAPS_API_KEY` en `NTFY_TOKEN`.
  - `APP_URL` wordt `https://${DOMEIN}`.
  - `DATABASE_URL` wordt in compose samengesteld.
  - De database is niet van buiten bereikbaar.
- Eén versie per image, zonder `latest`:
  - `postgres:16-alpine`
  - `node:24-alpine`
  - `caddy:2.8.4-alpine`
  - `binwiederhier/ntfy:v2.11.0`
- De eerste beheerder maak je aan met `docker compose run --rm worker npx tsx src/scripts/maak-beheerder.ts "<naam>" <gebruikersnaam>`. Het wachtwoord wordt interactief gevraagd.
- Bestaande ontwikkeling blijft werken:
  - `docker-compose.dev.yml` en `npm run dev`;
  - alle tests;
  - `.env` lokaal: niets aan veranderen.
- Alle teksten (README, logregels) zijn Nederlands. Elke commit-boodschap eindigt met `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Werkomgeving: Windows en Git Bash. Voor Docker zet je eerst `export PATH="/c/Users/Max/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"`. Installeer geen pakketten op de host.
  - Laat de dev-container `maxtasksv1-db-1` met rust.
  - De rooktest gebruikt een eigen projectnaam, `takenbord-rooktest`, en de poorten 8080/8443, en ruimt zichzelf op.

---

## Bestandsstructuur

```
src/worker/taken/backup.ts          backupNaam(), teVerwijderen(), maakBackup()
src/worker/index.ts                 (wijzigen) back-up om 03:00 als BACKUP_MAP gezet is
src/scripts/backup.ts               handmatige back-up (in de worker-container)
Dockerfile                          doelen app en worker
.dockerignore
docker-compose.yml                  productie-stack
docker/caddy/Caddyfile              HTTPS voor DOMEIN en ntfy.DOMEIN
.env.productie.example              voorbeeld-.env voor de server
scripts/rooktest-productie.sh       bouwt en test de stack lokaal
README.md                           (wijzigen) installatie-instructie
docs/superpowers/specs/2026-10-22-garage-takenbord-design.md  (wijzigen) uitrolkeuzes
```

---

### Task 1: Nachtelijke back-up in de worker

**Files:**
- Create: `src/worker/taken/backup.ts`
- Create: `src/scripts/backup.ts`
- Modify: `src/worker/index.ts`
- Modify: `.gitignore` (regel `backups/`)
- Test: `tests/unit/backup.test.ts` (nieuw)

**Interfaces:**
- Consumes: `type Datum`, `plusDagen`, `vandaagInAmsterdam` (`src/lib/domein/datums.ts`).
- Produces:
  - `BEWAAR_DAGEN = 14`
  - `backupNaam(d: Datum): string`
  - `teVerwijderen(bestanden: string[], vandaag: Datum, bewaarDagen?: number): string[]`
  - `type Uitvoerder = (opdracht: string, args: string[]) => Promise<void>`
  - `maakBackup(o: { map: string; databaseUrl: string; vandaag: Datum; voerUit?: Uitvoerder }): Promise<{ bestand: string; verwijderd: string[] }>`

- [ ] **Step 1: Schrijf de falende test**

`tests/unit/backup.test.ts`:
```ts
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupNaam, maakBackup, teVerwijderen, type Uitvoerder } from '../../src/worker/taken/backup';

let map: string;

beforeEach(async () => { map = await mkdtemp(path.join(tmpdir(), 'takenbord-backup-')); });
afterEach(async () => { await rm(map, { recursive: true, force: true }); });

/** Nep-pg_dump: schrijft een bestand naar het --file=-argument. */
const nepDump: Uitvoerder = async (_opdracht, args) => {
  const doel = args.find((a) => a.startsWith('--file='))!.slice('--file='.length);
  await writeFile(doel, 'dump');
};

describe('back-up', () => {
  it('noemt het bestand naar de datum', () => {
    expect(backupNaam('2026-10-24')).toBe('takenbord-2026-10-24.dump');
  });

  it('verwijdert alleen eigen back-ups ouder dan 14 dagen', () => {
    const bestanden = [
      'takenbord-2026-10-24.dump', 'takenbord-2026-10-11.dump', 'takenbord-2026-10-10.dump', 'takenbord-2026-09-01.dump',
      'notities.txt', 'takenbord-kapot.dump',
    ];
    expect(teVerwijderen(bestanden, '2026-10-24')).toEqual(['takenbord-2026-10-10.dump', 'takenbord-2026-09-01.dump']);
    expect(teVerwijderen(bestanden, '2026-10-24', 1)).toEqual([
      'takenbord-2026-10-11.dump', 'takenbord-2026-10-10.dump', 'takenbord-2026-09-01.dump',
    ]);
  });

  it('maakt een dump met pg_dump en ruimt oude back-ups op', async () => {
    await writeFile(path.join(map, 'takenbord-2026-10-01.dump'), 'oud');
    await writeFile(path.join(map, 'takenbord-2026-10-20.dump'), 'recent');
    const aanroepen: [string, string[]][] = [];
    const r = await maakBackup({
      map, databaseUrl: 'postgres://u:p@db:5432/takenbord', vandaag: '2026-10-24',
      voerUit: async (opdracht, args) => { aanroepen.push([opdracht, args]); await nepDump(opdracht, args); },
    });
    expect(r).toEqual({ bestand: path.join(map, 'takenbord-2026-10-24.dump'), verwijderd: ['takenbord-2026-10-01.dump'] });
    expect(aanroepen[0][0]).toBe('pg_dump');
    expect(aanroepen[0][1]).toContain('--format=custom');
    expect(aanroepen[0][1]).toContain('--dbname=postgres://u:p@db:5432/takenbord');
    expect((await readdir(map)).sort()).toEqual(['takenbord-2026-10-20.dump', 'takenbord-2026-10-24.dump']);
  });

  it('een mislukte dump laat geen half bestand achter en ruimt niets op', async () => {
    await writeFile(path.join(map, 'takenbord-2026-10-01.dump'), 'oud');
    const kapot: Uitvoerder = async (opdracht, args) => {
      await nepDump(opdracht, args);
      throw new Error('pg_dump stopte met code 1');
    };
    await expect(maakBackup({ map, databaseUrl: 'postgres://x', vandaag: '2026-10-24', voerUit: kapot })).rejects.toThrow('code 1');
    expect(await readdir(map)).toEqual(['takenbord-2026-10-01.dump']);
  });
});
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npx vitest run --project unit tests/unit/backup.test.ts`
Expected: FAIL (`src/worker/taken/backup.ts` bestaat niet)

- [ ] **Step 3: Back-upmodule**

`src/worker/taken/backup.ts`:
```ts
import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { type Datum, plusDagen } from '../../lib/domein/datums';

export const BEWAAR_DAGEN = 14;
const PATROON = /^takenbord-(\d{4}-\d{2}-\d{2})\.dump$/;

export const backupNaam = (d: Datum) => `takenbord-${d}.dump`;

/** Eigen back-ups ouder dan `bewaarDagen` (vandaag telt mee); andere bestanden blijven staan. */
export function teVerwijderen(bestanden: string[], vandaag: Datum, bewaarDagen = BEWAAR_DAGEN): string[] {
  const oudsteDieBlijft = plusDagen(vandaag, -(bewaarDagen - 1));
  return bestanden.filter((b) => {
    const m = PATROON.exec(b);
    return m !== null && m[1] < oudsteDieBlijft;
  });
}

export type Uitvoerder = (opdracht: string, args: string[]) => Promise<void>;

const voerUitMetSpawn: Uitvoerder = (opdracht, args) =>
  new Promise((klaar, faal) => {
    const p = spawn(opdracht, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('error', faal);
    p.on('exit', (code) => (code === 0 ? klaar() : faal(new Error(`${opdracht} stopte met code ${code}`))));
  });

/** Schrijft eerst naar een .deel-bestand en hernoemt pas als pg_dump slaagt. */
export async function maakBackup(o: {
  map: string;
  databaseUrl: string;
  vandaag: Datum;
  voerUit?: Uitvoerder;
}): Promise<{ bestand: string; verwijderd: string[] }> {
  await mkdir(o.map, { recursive: true });
  const bestand = path.join(o.map, backupNaam(o.vandaag));
  const deel = `${bestand}.deel`;
  try {
    await (o.voerUit ?? voerUitMetSpawn)('pg_dump', ['--format=custom', `--dbname=${o.databaseUrl}`, `--file=${deel}`]);
  } catch (e) {
    await rm(deel, { force: true });
    throw e;
  }
  await rename(deel, bestand);
  const verwijderd = teVerwijderen(await readdir(o.map), o.vandaag);
  await Promise.all(verwijderd.map((b) => rm(path.join(o.map, b))));
  return { bestand, verwijderd };
}
```

Let op: in de test zoekt de nep-uitvoerder het `--file=`-argument op, dus het `.deel`-pad. Daardoor klopt de verwachting dat na de rename alleen `takenbord-2026-10-24.dump` overblijft.

- [ ] **Step 4: Worker en handmatig script**

Vervang `src/worker/index.ts` volledig door:
```ts
import cron from 'node-cron';
import { vandaagInAmsterdam } from '../lib/domein/datums';
import { maakBackup } from './taken/backup';
import { doorschuiven } from './taken/doorschuiven';
import { genereerAlleHerhalingen } from './taken/herhalingen';

async function nachtrun(): Promise<void> {
  const vandaag = vandaagInAmsterdam();
  let nieuw = 0;
  let verplaatst = 0;
  let gemist = 0;
  try {
    nieuw = await genereerAlleHerhalingen(undefined, vandaag);
  } catch (e) {
    console.error('[worker] herhalingen genereren mislukt', e);
  }
  try {
    ({ verplaatst, gemist } = await doorschuiven(undefined, vandaag));
  } catch (e) {
    console.error('[worker] doorschuiven mislukt', e);
  }
  console.log(`[worker] ${vandaag}: ${nieuw} herhaalde taken aangemaakt, ${verplaatst} doorgeschoven, ${gemist} gemist`);
}

async function backupRun(map: string): Promise<void> {
  try {
    const r = await maakBackup({ map, databaseUrl: process.env.DATABASE_URL ?? '', vandaag: vandaagInAmsterdam() });
    console.log(`[worker] back-up gemaakt: ${r.bestand}${r.verwijderd.length ? `, ${r.verwijderd.length} oude verwijderd` : ''}`);
  } catch (e) {
    console.error('[worker] back-up mislukt', e);
  }
}

async function main(): Promise<void> {
  console.log('[worker] gestart; inhalen…');
  await nachtrun();
  cron.schedule('5 0 * * *', () => void nachtrun(), { timezone: 'Europe/Amsterdam', noOverlap: true });
  const backupMap = process.env.BACKUP_MAP;
  if (backupMap) {
    cron.schedule('0 3 * * *', () => void backupRun(backupMap), { timezone: 'Europe/Amsterdam', noOverlap: true });
    console.log(`[worker] back-ups om 03:00 naar ${backupMap}`);
  }
}

void main();
```

`src/scripts/backup.ts`:
```ts
import { vandaagInAmsterdam } from '../lib/domein/datums';
import { maakBackup } from '../worker/taken/backup';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL ontbreekt');
  const r = await maakBackup({ map: process.env.BACKUP_MAP ?? 'backups', databaseUrl, vandaag: vandaagInAmsterdam() });
  console.log(`Back-up gemaakt: ${r.bestand}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

Voeg aan `.gitignore` de regel `backups/` toe.

- [ ] **Step 5: Draai de tests en zie ze slagen**

Run: `npx vitest run --project unit tests/unit/backup.test.ts`
Expected: PASS (4/4)

Run: `npm test` en `npm run typecheck`
Expected: alles groen.

- [ ] **Step 6: Commit**

```bash
git add src/worker/taken/backup.ts src/worker/index.ts src/scripts/backup.ts .gitignore tests/unit/backup.test.ts
git commit -m "feat: nachtelijke database-back-up in de worker" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Docker-images voor app en worker

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: `next.config.ts` (heeft al `output: 'standalone'` en `serverExternalPackages: ['@node-rs/argon2']`), en de scripts `src/scripts/migreer.ts`, `maak-beheerder.ts` en `backup.ts`, plus `src/worker/index.ts`. Er is geen `public/`-map.
- Produces:
  - **image-doel `app`:** draait `node server.js` op poort 3000 als niet-root.
  - **image-doel `worker`:** draait als niet-root `node` met werkmap `/app`. Het bevat `src/`, `migrations/`, `tsconfig.json`, de productie-`node_modules` (met `tsx`), `pg_dump` 16 en `tzdata`. De map `/backups` is van `node`. Standaardcommando: `npx tsx src/worker/index.ts`.

- [ ] **Step 1: Controleer dat er nog geen Dockerfile is**

Run: `ls Dockerfile .dockerignore`
Expected: "No such file or directory" voor beide.

- [ ] **Step 2: Schrijf de bestanden**

`.dockerignore`:
```
node_modules
.next
.git
.env
.env.*
!.env.example
!.env.productie.example
.superpowers
.impeccable
.claude
test-results
playwright-report
backups
*.tsbuildinfo
```

`Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1

FROM node:24-alpine AS basis
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM basis AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS bouw
COPY . .
RUN npm run build

# Next.js-server (standalone uitvoer)
FROM basis AS app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=bouw --chown=node:node /app/.next/standalone ./
COPY --from=bouw --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# Worker, migraties en beheercommando's (tsx + pg_dump)
FROM basis AS worker
ENV NODE_ENV=production TZ=Europe/Amsterdam BACKUP_MAP=/backups
RUN apk add --no-cache postgresql16-client tzdata && mkdir /backups && chown node:node /backups
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
USER node
CMD ["npx", "tsx", "src/worker/index.ts"]
```

- [ ] **Step 3: Bouw beide images**

Run (met de Docker-PATH):
```bash
docker build --target app -t takenbord-app:test .
docker build --target worker -t takenbord-worker:test .
```
Expected: beide builds slagen. Als `npm run build` in het image faalt omdat er geen `DATABASE_URL` is, controleer dan welke pagina tijdens de build data ophaalt. Rapporteer dat als BLOCKED in plaats van een echte database-URL in te bakken.

- [ ] **Step 4: Controleer de inhoud**

Run:
```bash
docker run --rm takenbord-worker:test sh -c "pg_dump --version && node --version && ls /app/migrations && npx tsx --version && ls -ld /backups"
docker run --rm takenbord-app:test sh -c "ls /app/server.js /app/.next/static && ls /app/node_modules/@node-rs"
```
Expected:
- **worker:** `pg_dump (PostgreSQL) 16.x` en Node `v24.x`, de migraties `001` t/m `004`, een tsx-versie, en `/backups` van `node`.
- **app:** `server.js` en `.next/static` aanwezig, en `argon2` (plus een musl-variant) onder `@node-rs`.

Ruim op: `docker image rm takenbord-app:test takenbord-worker:test`

- [ ] **Step 5: Controleer dat ontwikkeling ongemoeid is**

Run: `npm run typecheck` en `npm test`
Expected: groen.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: Docker-images voor app en worker" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Productie-stack met Caddy, ntfy en rooktest

**Files:**
- Create: `docker-compose.yml`
- Create: `docker/caddy/Caddyfile`
- Create: `.env.productie.example`
- Create: `scripts/rooktest-productie.sh`

**Interfaces:**
- Consumes: uit Task 2 de image-doelen `app` en `worker`; uit Task 1 `src/scripts/backup.ts`. De app leest `DATABASE_URL`, `APP_URL`, `GOOGLE_MAPS_API_KEY`, `NTFY_URL` en `NTFY_TOKEN`.
- Produces:
  - een stack met de diensten `db`, `migreer`, `app`, `worker`, `ntfy` en `caddy`, en de volumes `db-data`, `backups`, `ntfy-data`, `caddy-data` en `caddy-config`;
  - de rooktest `bash scripts/rooktest-productie.sh`.

- [ ] **Step 1: Schrijf de rooktest (faalt nog: er is geen docker-compose.yml)**

`scripts/rooktest-productie.sh`:
```bash
#!/usr/bin/env bash
# Bouwt de productie-stack lokaal (https://localhost:8443) en controleert app, migraties, ntfy en back-up.
set -euo pipefail

export DOMEIN=localhost POSTGRES_PASSWORD=rooktest-wachtwoord HTTP_POORT=8080 HTTPS_POORT=8443
dc() { docker compose -p takenbord-rooktest -f docker-compose.yml "$@"; }
trap 'dc down -v --remove-orphans >/dev/null 2>&1 || true' EXIT

dc up -d --build

echo "Wachten op de app…"
for _ in $(seq 1 90); do
  if curl -skf --resolve localhost:8443:127.0.0.1 https://localhost:8443/login >/dev/null; then break; fi
  sleep 2
done
curl -skf --resolve localhost:8443:127.0.0.1 https://localhost:8443/login | grep -q 'Inloggen'
echo "✓ app bereikbaar via Caddy (HTTPS)"

dc logs migreer | grep -Eq 'Uitgevoerd|bijgewerkt'
echo "✓ migraties uitgevoerd"

curl -skf --resolve ntfy.localhost:8443:127.0.0.1 https://ntfy.localhost:8443/v1/health | grep -q '"healthy":true'
echo "✓ ntfy bereikbaar via Caddy"

dc exec -T worker npx tsx src/scripts/backup.ts
dc exec -T worker sh -c 'ls /backups' | grep -q '^takenbord-.*\.dump$'
echo "✓ back-up gemaakt"

echo "Rooktest geslaagd."
```

Run (met de Docker-PATH): `bash scripts/rooktest-productie.sh`
Expected: FAIL, want `docker-compose.yml` ontbreekt.

- [ ] **Step 2: Compose, Caddy en voorbeeldconfiguratie**

`docker-compose.yml`:
```yaml
name: takenbord

x-database-url: &database-url postgres://takenbord:${POSTGRES_PASSWORD:?Zet POSTGRES_PASSWORD in .env}@db:5432/takenbord

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: takenbord
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Zet POSTGRES_PASSWORD in .env}
      POSTGRES_DB: takenbord
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U takenbord -d takenbord"]
      interval: 5s
      timeout: 5s
      retries: 30

  migreer:
    build: { context: ., target: worker }
    image: takenbord-worker
    command: ["npx", "tsx", "src/scripts/migreer.ts"]
    environment:
      DATABASE_URL: *database-url
    depends_on:
      db: { condition: service_healthy }
    restart: "no"

  app:
    build: { context: ., target: app }
    image: takenbord-app
    restart: unless-stopped
    environment:
      DATABASE_URL: *database-url
      APP_URL: https://${DOMEIN:?Zet DOMEIN in .env}
      GOOGLE_MAPS_API_KEY: ${GOOGLE_MAPS_API_KEY:-}
      NTFY_URL: http://ntfy
      NTFY_TOKEN: ${NTFY_TOKEN:-}
    depends_on:
      migreer: { condition: service_completed_successfully }

  worker:
    build: { context: ., target: worker }
    image: takenbord-worker
    restart: unless-stopped
    environment:
      DATABASE_URL: *database-url
      BACKUP_MAP: /backups
    volumes:
      - backups:/backups
    depends_on:
      migreer: { condition: service_completed_successfully }

  ntfy:
    image: binwiederhier/ntfy:v2.11.0
    command: serve
    restart: unless-stopped
    environment:
      NTFY_BASE_URL: https://ntfy.${DOMEIN:?Zet DOMEIN in .env}
      NTFY_BEHIND_PROXY: "true"
      NTFY_AUTH_FILE: /var/lib/ntfy/auth.db
      NTFY_AUTH_DEFAULT_ACCESS: deny-all
      NTFY_CACHE_FILE: /var/lib/ntfy/cache.db
      NTFY_UPSTREAM_BASE_URL: https://ntfy.sh
    volumes:
      - ntfy-data:/var/lib/ntfy

  caddy:
    image: caddy:2.8.4-alpine
    restart: unless-stopped
    ports:
      - "${HTTP_POORT:-80}:80"
      - "${HTTPS_POORT:-443}:443"
    environment:
      DOMEIN: ${DOMEIN:?Zet DOMEIN in .env}
    volumes:
      - ./docker/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on: [app, ntfy]

volumes:
  db-data:
  backups:
  ntfy-data:
  caddy-data:
  caddy-config:
```

`docker/caddy/Caddyfile`:
```
{$DOMEIN} {
	reverse_proxy app:3000
}

ntfy.{$DOMEIN} {
	reverse_proxy ntfy:80
}
```

`.env.productie.example`:
```
# Kopieer naar .env op de server en vul in.
# Hostnaam van de server. Zonder eigen domein: <ip-met-streepjes>.sslip.io, bijv. 203-0-113-5.sslip.io
DOMEIN=
# Lang willekeurig wachtwoord voor de database, bijv. uit: openssl rand -hex 24
POSTGRES_PASSWORD=
# Optioneel: Google-sleutel (Places API (New) + Routes API), beperkt tot het IP van de server
GOOGLE_MAPS_API_KEY=
# Optioneel: token van de ntfy-gebruiker (zie README, "Meldingen op de server")
NTFY_TOKEN=
```

- [ ] **Step 3: Draai de rooktest en zie hem slagen**

Run (met de Docker-PATH; de dev-container blijft draaien, deze stack heeft een eigen projectnaam en zijn poorten zijn intern): `bash scripts/rooktest-productie.sh`
Expected: vier vinkjes en `Rooktest geslaagd.`, waarna de stack is opgeruimd. Faalt hij, kijk dan met `docker compose -p takenbord-rooktest logs` (voordat het opruimen gebeurt, bijvoorbeeld door de `trap` tijdelijk uit te zetten). Herstel de oorzaak in Dockerfile, compose of Caddyfile, en rapporteer de aanpassing.

Run: `docker compose -p takenbord-rooktest ls -a` (of `docker ps -a | grep rooktest`)
Expected: niets meer van de rooktest over.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml docker/caddy/Caddyfile .env.productie.example scripts/rooktest-productie.sh
git commit -m "feat: productie-stack met Caddy, ntfy, back-ups en rooktest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Installatie-instructie en spec

**Files:**
- Modify: `README.md` (nieuwe sectie "Installeren op een server")
- Modify: `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md` (§3)

**Interfaces:**
- Consumes: de bestanden en commando's uit Task 1–3: `docker-compose.yml`, `.env.productie.example`, `scripts/rooktest-productie.sh`, `src/scripts/maak-beheerder.ts` en `src/scripts/backup.ts`, en het volume `backups`.
- Produces: documentatie.

- [ ] **Step 1: README**

Voeg in `README.md` vóór "## Testen" deze sectie toe:
````markdown
## Installeren op een server

Voor een Linux-server (bijv. een VPS met Ubuntu 24.04) met een eigen IP-adres. Alles draait in Docker; alleen poort 80 en 443 staan open.

### 1. Server voorbereiden
```bash
curl -fsSL https://get.docker.com | sh   # Docker Engine + Compose
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
git clone <url-van-deze-repository> takenbord && cd takenbord
```

### 2. Hostnaam
- **Eigen domein:** maak een A-record `takenbord.jouwdomein.nl` en een A-record `ntfy.takenbord.jouwdomein.nl` naar het IP van de server.
- **Nog geen domein:** gebruik `<ip-met-streepjes>.sslip.io`, bijv. `203-0-113-5.sslip.io` (ook `ntfy.203-0-113-5.sslip.io` werkt vanzelf). Later overstappen kan door `DOMEIN` aan te passen en opnieuw te starten.

### 3. Configureren en starten
```bash
cp .env.productie.example .env
nano .env            # DOMEIN en POSTGRES_PASSWORD invullen (wachtwoord: openssl rand -hex 24)
docker compose up -d --build
docker compose run --rm worker npx tsx src/scripts/maak-beheerder.ts "Max" max
```
Open daarna `https://<DOMEIN>` en log in. Caddy vraagt het HTTPS-certificaat automatisch aan.

### 4. Meldingen op de server (ntfy)
```bash
docker compose exec ntfy ntfy user add --role=admin max      # kies een wachtwoord
docker compose exec ntfy ntfy token add max                  # kopieer het token
```
Zet het token als `NTFY_TOKEN=` in `.env` en voer `docker compose up -d` uit. Voeg in de ntfy-app de server `https://ntfy.<DOMEIN>` toe, log in als `max` en abonneer je op het onderwerp dat je in **Beheer → Instellingen → Meldingen** invult. Klik daar op **Stuur testmelding**.

### 5. Google (optioneel)
Zet `GOOGLE_MAPS_API_KEY=` in `.env` (zie "Google (adressen zoeken en route plannen)"), beperk de sleutel tot het IP van de server en voer `docker compose up -d` uit.

### Back-ups
Elke nacht om 03:00 maakt de worker een back-up in het volume `backups`; de laatste 14 dagen blijven bewaard.
```bash
docker compose exec worker npx tsx src/scripts/backup.ts                 # nu een back-up maken
docker compose exec worker ls /backups                                   # overzicht
docker compose cp worker:/backups/takenbord-2026-10-24.dump .            # naar de server kopiëren
```
Kopieer de back-ups regelmatig naar een andere plek (bijv. met `scp` naar je eigen pc), zodat een kapotte server niet ook je back-ups kost.

**Terugzetten** (overschrijft de huidige gegevens):
```bash
docker compose stop app worker
docker compose exec -T db pg_restore -U takenbord -d takenbord --clean --if-exists < takenbord-2026-10-24.dump
docker compose start app worker
```

### Bijwerken
```bash
git pull
docker compose up -d --build     # migraties draaien vanzelf vóór de app start
```

### Lokaal controleren
`bash scripts/rooktest-productie.sh` bouwt de hele stack op je eigen pc (https://localhost:8443), controleert app, migraties, ntfy en back-up, en ruimt alles weer op.
````

- [ ] **Step 2: Spec**

In `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md`, §3, voeg onder de bullet "**Back-up:** …" deze bullets toe:
```markdown
- **Uitrol (fase 4):** `docker-compose.yml` start `db`, een eenmalige `migreer`-dienst (migraties vóór app en worker), `app` (Next.js standalone), `worker` (tsx, met `pg_dump`), `ntfy` en `caddy`. Alleen Caddy (80/443) is van buiten bereikbaar; de app praat intern met `http://ntfy`. Back-ups (custom format) staan in het volume `backups`; een mislukte back-up laat geen half bestand achter.
- **Hostnaam:** `DOMEIN` in `.env`. Zonder eigen domein werkt een sslip.io-naam (`<ip-met-streepjes>.sslip.io`); ntfy draait op `ntfy.<DOMEIN>` met `deny-all` en één gebruiker met token (bewuste keuze: één account voor de app en de telefoon).
- **Eerste beheerder:** `docker compose run --rm worker npx tsx src/scripts/maak-beheerder.ts "<naam>" <gebruikersnaam>`.
```
Laat de bestaande regel "**Eerste beheerder:** wordt aangemaakt met het CLI-commando `npm run maak-beheerder`, uitgevoerd in de `app`-container." vervangen door de nieuwe bullet. Verwijder de oude dus.

- [ ] **Step 3: Controleer**

Run: `npm test`, `npm run typecheck`
Expected: groen. Er is geen code gewijzigd.

Lees de README-sectie nog één keer na tegen `docker-compose.yml` en `.env.productie.example`: kloppen de dienstnamen, de variabelen en de paden?

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-10-22-garage-takenbord-design.md
git commit -m "docs: installatie op een server, back-ups en uitrolkeuzes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
