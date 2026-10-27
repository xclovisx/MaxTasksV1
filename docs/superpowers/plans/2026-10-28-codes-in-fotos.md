# Codes in foto's Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bij het uploaden van een foto een QR- of streepjescode herkennen, inhoud en soort bewaren, en in de fotoweergave de code scherp namaken (SVG), met een wisselknop naar de originele foto.

**Architecture:**
- **Pakket:** herkennen en tekenen gebeuren op de server met `zxing-wasm` (ZXing-C++ als WebAssembly). Het wasm-bestand lezen we zelf uit `node_modules`, want standaard haalt de bibliotheek het van een CDN.
- **Opslag:** `voegBijlageToe` slaat het resultaat op in twee nieuwe kolommen.
- **Route:** een nieuwe route tekent de SVG.
- **Weergave:** `FotoWeergave` toont de SVG via `<img>`.

**Tech Stack:** Next.js 16 (route handlers, standalone output), React 19, postgres.js, `zxing-wasm` 3.1.5, Vitest en Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-codes-in-fotos-design.md`

## Global Constraints

- **Formaten** (ZXing-namen, exact):
  - `QRCode`
  - `Code128`, `Code39`, `Code93`
  - `EAN13`, `EAN8`, `UPCA`, `UPCE`
  - `ITF`
  - `Codabar`

  Een UPC-A wordt door ZXing als `EAN13` gelezen, met een voorloop-0. Dat is goed: we bewaren wat gelezen is.
- **Wat bewaard wordt:**
  - Alleen resultaten met `isValid === true`, niet-lege `text` van maximaal 2000 tekens, en `contentType` `Text` of `GS1`.
  - Bij meerdere codes telt de code met het grootste oppervlak van `position`.
- **Upload:** een upload faalt **nooit** door het herkennen. Fouten worden gelogd en leveren `code: null`.
- **Alleen foto's:** herkennen gebeurt alleen voor `image/jpeg`, `image/png` en `image/webp`, niet voor PDF.
- **SVG-route** `GET /api/bijlagen/[id]/code`:
  - 401 zonder sessie, 404 zonder bijlage of code.
  - Headers: `Content-Type: image/svg+xml`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `Cache-Control: private, max-age=3600`.
  - De SVG krijgt een `viewBox`, want ZXing levert alleen `width`/`height`. Zonder `viewBox` schaalt hij niet in `<img>`.
- **Weergave:**
  - Het label op de tegel is "QR" bij `QRCode`, anders "Streepjescode".
  - De wisselknop toont de teksten "Originele foto" en "Code".
  - "Downloaden" geeft altijd het origineel.
- **Pakketversie:** `zxing-wasm` vast op `3.1.5`, zonder `^`. Die versie is van 2026-10-06; 3.1.6 is te nieuw.
- **Code-stijl:** Nederlandse namen, LF-regeleinden, commentaar alleen waar het iets niet-zichtbaars uitlegt.
- **Testen:**
  - Unit: `npx vitest run --project unit`
  - Integratie: `npx vitest run --project integratie` (Docker draait)
  - E2E: `npx playwright test` (Postgres-container `maxtasksv1-db-1` moet draaien; raak de dev-server op poort 3000 niet aan)
  - Typecheck: `npx tsc --noEmit`

## Bevindingen uit een proef met zxing-wasm 3.1.5 (Node 24)

```ts
import { prepareZXingModule, readBarcodes, writeBarcode } from 'zxing-wasm/full';
prepareZXingModule({ overrides: { wasmBinary: <ArrayBuffer van node_modules/zxing-wasm/dist/full/zxing_full.wasm> }, fireImmediately: true });
await readBarcodes(uint8ArrayVanPngOfJpeg, { formats: [...], tryHarder: true });
// → ReadResult[] met { format, text, isValid, contentType, position: { topLeft:{x,y}, topRight, bottomRight, bottomLeft }, error }
await writeBarcode(tekst, { format: 'QRCode', scale: 8 });
// → { svg: string, image: Blob (PNG) | null, error: string }
```

- **Kapotte invoer:** geeft een resultaat met `isValid: false` en `error: 'Failed to load image from memory'`. Er wordt dan geen exceptie gegooid, dus altijd filteren op `isValid`.
- **Schrijven:** een ongeldige invoer voor een formaat (bijvoorbeeld letters in `EAN13`) geeft een niet-lege `error`.
- **SVG-uitvoer:** begint met `<?xml …?><!DOCTYPE …><svg width="29" height="29" version="1.1" xmlns=…>`. Er zit geen `viewBox` in, geen `<text>` en geen `<script>`. De stille marge zit er al in.
- **Snelheid:** een herkenning duurt circa 90 ms.

## Bestanden

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/lib/domein/bijlagen.ts` | `CODE_FORMATEN`, `CodeFormaat`, `Code`, `isQr`, `geldigeCode`, `grootsteCode`; `Bijlage.code` |
| `src/lib/codes.ts` (nieuw) | wasm laden, `herkenCode`, `tekenCode` |
| `tests/codes-helper.ts` (nieuw) | `codePng(formaat, tekst)` voor tests |
| `migrations/006_bijlage_codes.sql` (nieuw) | kolommen en view |
| `src/lib/diensten/bijlagen.ts` | herkennen bij toevoegen; `haalCode` |
| `src/lib/web/bijlagen-http.ts`, `src/app/api/bijlagen/[id]/code/route.ts` (nieuw) | SVG-route |
| `src/lib/web/bijlage-upload.ts` | `alsBijlage` accepteert `code` |
| `src/components/bord/bijlagen-blok.tsx`, `src/components/bord/foto-weergave.tsx` | label en wisselweergave |
| `next.config.ts`, `package.json` | pakket en tracing van het wasm-bestand |

---

### Task 1: zxing-wasm, domeinregels en de module `codes`

**Files:**
- Modify: `package.json` (+ `package-lock.json`)
- Modify: `next.config.ts`
- Modify: `src/lib/domein/bijlagen.ts`
- Create: `src/lib/codes.ts`
- Create: `tests/codes-helper.ts`
- Test: `tests/unit/bijlagen.test.ts`
- Test: `tests/integration/codes.test.ts`

**Interfaces:**
- Produces, in `src/lib/domein/bijlagen.ts`:
  - `CODE_FORMATEN` en `type CodeFormaat`
  - `type Code = { formaat: CodeFormaat; tekst: string }`
  - `isQr(f: CodeFormaat): boolean`
  - `geldigeCode(r: { format: string; text: string; isValid: boolean; contentType: string }): Code | null`
  - `grootsteCode<T extends { position: Positie }>(r: T[]): T | null`
  - `type Positie`
- Produces, in `src/lib/codes.ts`:
  - `herkenCode(bytes: Uint8Array): Promise<Code | null>`, die nooit gooit
  - `tekenCode(code: Code): Promise<string>`, een SVG met `viewBox`, die gooit bij een writer-fout
- Produces, in `tests/codes-helper.ts`: `codePng(formaat: CodeFormaat, tekst: string, scale?: number): Promise<Uint8Array>`

- [ ] **Step 1: Install the package**

Run: `npm install --save-exact zxing-wasm@3.1.5`
Expected: `"zxing-wasm": "3.1.5"` staat in `dependencies` (niet `devDependencies`), zonder `^`.

- [ ] **Step 2: Write failing unit tests** — voeg toe aan `tests/unit/bijlagen.test.ts`. Breid de import uit met `geldigeCode, grootsteCode, isQr`.

```ts
describe('codes', () => {
  const r = (over: Partial<{ format: string; text: string; isValid: boolean; contentType: string }> = {}) =>
    ({ format: 'QRCode', text: 'ABC', isValid: true, contentType: 'Text', ...over });

  it('geldigeCode accepteert alleen geldige tekst in een bekend formaat', () => {
    expect(geldigeCode(r())).toEqual({ formaat: 'QRCode', tekst: 'ABC' });
    expect(geldigeCode(r({ format: 'Code128', contentType: 'GS1' }))).toEqual({ formaat: 'Code128', tekst: 'ABC' });
    expect(geldigeCode(r({ isValid: false }))).toBeNull();
    expect(geldigeCode(r({ text: '' }))).toBeNull();
    expect(geldigeCode(r({ text: 'x'.repeat(2001) }))).toBeNull();
    expect(geldigeCode(r({ text: 'x'.repeat(2000) }))?.tekst).toHaveLength(2000);
    expect(geldigeCode(r({ contentType: 'Binary' }))).toBeNull();
    expect(geldigeCode(r({ format: 'DataMatrix' }))).toBeNull();
  });

  it('grootsteCode kiest het grootste oppervlak', () => {
    const vak = (b: number, h: number) => ({
      position: { topLeft: { x: 0, y: 0 }, topRight: { x: b, y: 0 }, bottomRight: { x: b, y: h }, bottomLeft: { x: 0, y: h } },
    });
    const klein = { naam: 'klein', ...vak(10, 10) };
    const groot = { naam: 'groot', ...vak(30, 20) };
    expect(grootsteCode([klein, groot])?.naam).toBe('groot');
    expect(grootsteCode([])).toBeNull();
  });

  it('isQr', () => {
    expect(isQr('QRCode')).toBe(true);
    expect(isQr('Code128')).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run --project unit tests/unit/bijlagen.test.ts`
Expected: FAIL. `geldigeCode` is not exported.

- [ ] **Step 4: Implement domain rules** — voeg toe aan `src/lib/domein/bijlagen.ts`, vóór de functies. Wijzig ook het type `Bijlage`.

```ts
export const CODE_FORMATEN = ['QRCode', 'Code128', 'Code39', 'Code93', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'ITF', 'Codabar'] as const;
export type CodeFormaat = (typeof CODE_FORMATEN)[number];
export type Code = { formaat: CodeFormaat; tekst: string };
export const MAX_CODE_TEKST = 2000;

export type Bijlage = { id: string; naam: string; type: BijlageType; grootte: number; code: Code | null };

export const isQr = (f: CodeFormaat): boolean => f === 'QRCode';

/** Alleen een geldig gelezen code met gewone tekst; binaire inhoud tonen we niet als tekst. */
export function geldigeCode(r: { format: string; text: string; isValid: boolean; contentType: string }): Code | null {
  if (!r.isValid || !(CODE_FORMATEN as readonly string[]).includes(r.format)) return null;
  if (r.contentType !== 'Text' && r.contentType !== 'GS1') return null;
  if (r.text.length === 0 || r.text.length > MAX_CODE_TEKST) return null;
  return { formaat: r.format as CodeFormaat, tekst: r.text };
}

type Punt = { x: number; y: number };
export type Positie = { topLeft: Punt; topRight: Punt; bottomRight: Punt; bottomLeft: Punt };

function oppervlak(p: Positie): number {
  const h = [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft];
  let som = 0;
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    som += a.x * b.y - b.x * a.y;
  }
  return Math.abs(som) / 2;
}

export function grootsteCode<T extends { position: Positie }>(resultaten: T[]): T | null {
  return resultaten.reduce<T | null>((beste, r) => (!beste || oppervlak(r.position) > oppervlak(beste.position) ? r : beste), null);
}
```

Verwijder de oude regel `export type Bijlage = …`. Het type krijgt nu `code` erbij.

Typefouten op plekken die een `Bijlage` opbouwen, zoals `voegBijlageToe` en tests, worden in Task 2 opgelost. Zet `return { id, naam, type, grootte: invoer.inhoud.length, code: null };` in `voegBijlageToe` zodat `tsc` nu al slaagt.

- [ ] **Step 5: Run unit tests**

Run: `npx vitest run --project unit tests/unit/bijlagen.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the test helper** — `tests/codes-helper.ts`

```ts
import { writeBarcode } from 'zxing-wasm/full';
import type { CodeFormaat } from '../src/lib/domein/bijlagen';
import { laadZxing } from '../src/lib/codes';

/** Maakt een PNG met een echte code, om herkennen te testen. */
export async function codePng(formaat: CodeFormaat, tekst: string, scale = 6): Promise<Uint8Array> {
  await laadZxing();
  const w = await writeBarcode(tekst, { format: formaat, scale });
  if (w.error || !w.image) throw new Error(`codePng: ${w.error || 'geen afbeelding'}`);
  return new Uint8Array(await w.image.arrayBuffer());
}
```

- [ ] **Step 7: Write the failing integration test** — `tests/integration/codes.test.ts`

Zet deze test bij integratie, want hij laadt de echte wasm. Een database is niet nodig, maar dat is geen probleem.

```ts
import { describe, expect, it } from 'vitest';
import { herkenCode, tekenCode } from '../../src/lib/codes';
import { codePng } from '../codes-helper';

describe('codes', () => {
  it('herkent een QR-code en een streepjescode uit een PNG', async () => {
    expect(await herkenCode(await codePng('QRCode', 'https://postnl.nl/ophalen?c=3SABC123'))).toEqual({
      formaat: 'QRCode', tekst: 'https://postnl.nl/ophalen?c=3SABC123',
    });
    expect(await herkenCode(await codePng('Code128', '3SPNL1234567'))).toEqual({ formaat: 'Code128', tekst: '3SPNL1234567' });
  });

  it('geeft null voor een plaatje zonder code of kapotte invoer, en gooit nooit', async () => {
    expect(await herkenCode(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))).toBeNull();
    expect(await herkenCode(new Uint8Array())).toBeNull();
  });

  it('kiest de grootste code als er meerdere zijn', async () => {
    // Twee losse PNG's kunnen we niet samenvoegen zonder canvas; de keuze zelf is unit-getest (grootsteCode).
    expect(await herkenCode(await codePng('QRCode', 'groot', 10))).toEqual({ formaat: 'QRCode', tekst: 'groot' });
  });

  it('tekent een schaalbare SVG zonder script of tekst', async () => {
    const svg = await tekenCode({ formaat: 'QRCode', tekst: 'é ü <script>' });
    expect(svg).toMatch(/<svg[^>]* viewBox="0 0 \d+ \d+"/);
    expect(svg).not.toMatch(/<script|<text/i);
    const streep = await tekenCode({ formaat: 'EAN13', tekst: '8712345678906' });
    expect(streep).toMatch(/viewBox/);
    await expect(tekenCode({ formaat: 'EAN13', tekst: 'abc' })).rejects.toThrow();
  });
});
```

- [ ] **Step 8: Run to verify failure**

Run: `npx vitest run --project integratie tests/integration/codes.test.ts`
Expected: FAIL. `src/lib/codes` does not exist.

- [ ] **Step 9: Implement** — `src/lib/codes.ts`

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prepareZXingModule, readBarcodes, writeBarcode } from 'zxing-wasm/full';
import { CODE_FORMATEN, type Code, geldigeCode, grootsteCode } from './domein/bijlagen';

// Het wasm-bestand zelf inlezen: standaard haalt zxing-wasm het van een CDN, en dat willen we op de server niet.
const WASM = path.join(process.cwd(), 'node_modules', 'zxing-wasm', 'dist', 'full', 'zxing_full.wasm');
let laden: Promise<unknown> | null = null;

export function laadZxing(): Promise<unknown> {
  laden ??= readFile(WASM).then((b) =>
    prepareZXingModule({
      overrides: { wasmBinary: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) },
      fireImmediately: true,
    }),
  ).catch((e) => {
    laden = null; // bij een volgende poging opnieuw proberen
    throw e;
  });
  return laden;
}

/** Zoekt de grootste QR- of streepjescode in een foto. Gooit nooit: zonder (geldige) code komt er null terug. */
export async function herkenCode(bytes: Uint8Array): Promise<Code | null> {
  try {
    await laadZxing();
    const resultaten = (await readBarcodes(bytes, { formats: [...CODE_FORMATEN], tryHarder: true }))
      .map((r) => ({ r, code: geldigeCode(r) }))
      .filter((x): x is { r: (typeof x)['r']; code: Code } => x.code !== null);
    return grootsteCode(resultaten.map((x) => ({ ...x, position: x.r.position })))?.code ?? null;
  } catch (e) {
    console.error('[codes] herkennen mislukt', e);
    return null;
  }
}

/** Tekent de code als SVG; met viewBox, zodat hij in een <img> meeschaalt. */
export async function tekenCode(code: Code): Promise<string> {
  await laadZxing();
  const w = await writeBarcode(code.tekst, { format: code.formaat });
  if (w.error) throw new Error(`Code tekenen mislukt: ${w.error}`);
  return w.svg.replace(/<svg width="(\d+)" height="(\d+)"/, '<svg width="$1" height="$2" viewBox="0 0 $1 $2"');
}
```

Komen `readBarcodes`, `writeBarcode` of de optietypes iets anders binnen dan verwacht (bijvoorbeeld als het formaat-array een specifiek type moet hebben), pas dan alleen de types aan. Het gedrag blijft hetzelfde. Controleer de `.d.ts` in `node_modules/zxing-wasm/dist/es/`.

- [ ] **Step 10: Next config** — `next.config.ts`

```ts
const config: NextConfig = {
  serverExternalPackages: ['@node-rs/argon2', 'zxing-wasm'],
  output: 'standalone',
  // zxing-wasm laadt zijn .wasm via een pad dat Next niet kan volgen; daarom expliciet meenemen.
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/zxing-wasm/dist/full/zxing_full.wasm'],
  },
};
```

- [ ] **Step 11: Run tests + typecheck**

Run: `npx vitest run --project integratie tests/integration/codes.test.ts`, daarna `npx vitest run` en `npx tsc --noEmit`.
Expected: PASS en geen typefouten.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json next.config.ts src/lib/domein/bijlagen.ts src/lib/codes.ts src/lib/diensten/bijlagen.ts tests/codes-helper.ts tests/unit/bijlagen.test.ts tests/integration/codes.test.ts
git commit -m "feat: QR- en streepjescodes herkennen en tekenen met zxing-wasm"
```

---

### Task 2: Opslaan bij uploaden, plus de SVG-route

**Files:**
- Create: `migrations/006_bijlage_codes.sql`
- Modify: `src/lib/diensten/bijlagen.ts`
- Modify: `src/lib/web/bijlagen-http.ts`
- Create: `src/app/api/bijlagen/[id]/code/route.ts`
- Modify: `src/lib/web/bijlage-upload.ts` (`alsBijlage`)
- Test: `tests/integration/bijlagen.test.ts`
- Test: `tests/integration/bijlagen-http.test.ts`
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes (Task 1): `herkenCode`, `tekenCode`, `Code`, `codePng`.
- Produces:
  - `voegBijlageToe(ctx, taakId, invoer, herken?: (b: Uint8Array) => Promise<Code | null>)`; de standaard is `herkenCode`, en het resultaat bevat `code`.
  - `haalCode(id: string): Promise<Code>`, die `NietGevonden` gooit zonder bijlage of code.
  - `verwerkCode(gebruiker: SessieGebruiker | null, id: string): Promise<Response>`
  - `taken_weergave.bijlagen[].code`: `{ formaat, tekst } | null`

- [ ] **Step 1: Failing tests**

Voeg in `tests/integration/bijlagen.test.ts` toe: de import `import { codePng } from '../codes-helper';` en deze tests.

```ts
  it('herkent een code in een foto en bewaart die bij de bijlage', async () => {
    const b = await voegBijlageToe(piet, taakId, { naam: 'qr.png', inhoud: await codePng('QRCode', 'OPHAAL-42') });
    expect(b.code).toEqual({ formaat: 'QRCode', tekst: 'OPHAAL-42' });
    expect((await haalTaak(taakId)).bijlagen[0].code).toEqual({ formaat: 'QRCode', tekst: 'OPHAAL-42' });
  });

  it('een foto zonder code en een PDF hebben code null; herkennen wordt bij een PDF niet geprobeerd', async () => {
    let aangeroepen = 0;
    const herken = async () => { aangeroepen++; return null; };
    expect((await voegBijlageToe(piet, taakId, { naam: 'qr.png', inhoud: PNG }, herken)).code).toBeNull();
    expect((await voegBijlageToe(piet, taakId, { naam: 'x.pdf', inhoud: PDF }, herken)).code).toBeNull();
    expect(aangeroepen).toBe(1);
  });

  it('een herkenning die gooit, blokkeert de upload niet', async () => {
    const b = await voegBijlageToe(piet, taakId, { naam: 'qr.png', inhoud: PNG }, async () => { throw new Error('kapot'); });
    expect(b.code).toBeNull();
    expect(await bestanden()).toEqual([b.id]);
  });
```

Pas de bestaande verwachting `expect(b).toEqual({ id: expect.any(String), naam: 'qr.png', type: 'image/png', grootte: PNG.length })` aan door `code: null` toe te voegen.

Voeg in `tests/integration/bijlagen-http.test.ts` toe: de imports `verwerkCode` en `import { codePng } from '../codes-helper';`, plus:

```ts
describe('code', () => {
  it('geeft de nagemaakte code als SVG met veilige headers', async () => {
    const up = await (await verwerkUpload(uploadVerzoek(new File([await codePng('QRCode', 'OPHAAL-42')], 'qr.png')), piet, taakId, APP)).json();
    expect(up.code).toEqual({ formaat: 'QRCode', tekst: 'OPHAAL-42' });
    const res = await verwerkCode(piet, up.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(await res.text()).toMatch(/<svg[^>]*viewBox/);
  });

  it('401 zonder sessie, 404 zonder code of bij een onbekende bijlage', async () => {
    const up = await (await verwerkUpload(uploadVerzoek(new File([PNG], 'gewoon.png')), piet, taakId, APP)).json();
    expect((await verwerkCode(null, up.id)).status).toBe(401);
    expect((await verwerkCode(piet, up.id)).status).toBe(404);
    expect((await verwerkCode(piet, 'onzin')).status).toBe(404);
  });
});
```

Voeg in `tests/integration/schema.test.ts`, in het `describe('bijlagen in taken_weergave')`, een test toe. Gebruik dezelfde opzet als de bestaande test daar:

```ts
  it('neemt de code mee en eist dat formaat en tekst samen gaan', async () => {
    const { taakId } = await maakBordMetTaak(); // gebruik de helper die de bestaande test in dit describe gebruikt
    await db()`insert into bijlagen (taak_id, naam, type, grootte, code_formaat, code_tekst)
      values (${taakId}, 'qr.jpg', 'image/jpeg', 10, 'QRCode', 'ABC'), (${taakId}, 'b.jpg', 'image/jpeg', 10, null, null)`;
    const [r] = await db()<{ bijlagen: { naam: string; code: unknown }[] }[]>`select bijlagen from taken_weergave where id = ${taakId}`;
    expect(r.bijlagen.find((b) => b.naam === 'qr.jpg')?.code).toEqual({ formaat: 'QRCode', tekst: 'ABC' });
    expect(r.bijlagen.find((b) => b.naam === 'b.jpg')?.code).toBeNull();
    await expect(db()`insert into bijlagen (taak_id, naam, type, grootte, code_formaat) values (${taakId}, 'x.jpg', 'image/jpeg', 1, 'QRCode')`)
      .rejects.toThrow(/bijlagen_code_compleet/);
  });
```

Pas de helperaanroep aan naar wat het bestand werkelijk gebruikt (`maakBordMetTaak` of iets vergelijkbaars).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --project integratie tests/integration/bijlagen.test.ts tests/integration/bijlagen-http.test.ts tests/integration/schema.test.ts`
Expected: FAIL. `code` ontbreekt, en `verwerkCode` en de kolommen bestaan nog niet.

- [ ] **Step 3: Migration** — `migrations/006_bijlage_codes.sql`

De view kopieert `005_bijlagen.sql` letterlijk. Alleen het `json_build_object` van de bijlagen krijgt `'code'` erbij.

```sql
alter table bijlagen
  add column code_formaat text,
  add column code_tekst text check (char_length(code_tekst) between 1 and 2000),
  add constraint bijlagen_code_compleet check ((code_formaat is null) = (code_tekst is null));

create or replace view taken_weergave as
-- (kopieer de volledige select uit migrations/005_bijlagen.sql en vervang alleen het bijlagen-subselect door:)
--   coalesce((
--     select json_agg(json_build_object(
--       'id', b.id, 'naam', b.naam, 'type', b.type, 'grootte', b.grootte,
--       'code', case when b.code_formaat is null then null
--                    else json_build_object('formaat', b.code_formaat, 'tekst', b.code_tekst) end)
--       order by b.aangemaakt_op, b.id)
--     from bijlagen b where b.taak_id = t.id
--   ), '[]'::json) as bijlagen
```

Schrijf in het echte bestand de volledige view uit, dus zonder commentaarregels als vervanging. De kolomvolgorde blijft gelijk aan 005.

- [ ] **Step 4: Service** — `src/lib/diensten/bijlagen.ts`

1. Voeg de imports toe: `import { herkenCode } from '../codes';` en `type Code` uit `../domein/bijlagen`.
2. Wijzig de signatuur in `export async function voegBijlageToe(ctx: Context, taakId: string, invoer: { naam: string; inhoud: Uint8Array }, herken: (b: Uint8Array) => Promise<Code | null> = herkenCode): Promise<Bijlage>`.
3. Zet na `const naam = schoonNaam(invoer.naam);`:

```ts
  let code: Code | null = null;
  if (type !== 'application/pdf') {
    try {
      code = await herken(invoer.inhoud);
    } catch (e) {
      console.error('[bijlagen] code herkennen mislukt', e); // de upload gaat gewoon door
    }
  }
```

4. Breid de insert uit met `code_formaat, code_tekst`, met de waarden `${code?.formaat ?? null}, ${code?.tekst ?? null}`.
5. Maak de return `{ id, naam, type, grootte: invoer.inhoud.length, code }`.
6. Voeg onderaan toe:

```ts
export async function haalCode(id: string): Promise<Code> {
  if (!isUuid(id)) throw new NietGevonden(BIJLAGE_NIET_GEVONDEN);
  const [b] = await db()<{ codeFormaat: Code['formaat'] | null; codeTekst: string | null }[]>`
    select code_formaat, code_tekst from bijlagen where id = ${id}`;
  if (!b?.codeFormaat || !b.codeTekst) throw new NietGevonden('Geen code bij deze bijlage');
  return { formaat: b.codeFormaat, tekst: b.codeTekst };
}
```

- [ ] **Step 5: HTTP** — voeg toe aan `src/lib/web/bijlagen-http.ts`

Importeer `haalCode` en `tekenCode` uit `../codes`.

```ts
export async function verwerkCode(gebruiker: SessieGebruiker | null, id: string): Promise<Response> {
  if (!gebruiker) return fout(401, 'Niet ingelogd');
  let code: Awaited<ReturnType<typeof haalCode>>;
  try {
    code = await haalCode(id);
  } catch (e) {
    if (e instanceof NietGevonden) return fout(404, e.message);
    throw e;
  }
  const svg = await tekenCode(code);
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
```

Maak de route `src/app/api/bijlagen/[id]/code/route.ts`:

```ts
import { verwerkCode } from '@/lib/web/bijlagen-http';
import { huidigeGebruiker } from '@/lib/web/huidige-gebruiker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_verzoek: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return verwerkCode(await huidigeGebruiker(), id);
}
```

- [ ] **Step 6: Client validation** — vervang in `src/lib/web/bijlage-upload.ts` de functie `alsBijlage` door:

```ts
function alsCode(c: unknown): Bijlage['code'] | undefined {
  if (c === null) return null;
  if (typeof c !== 'object') return undefined;
  const d = c as Record<string, unknown>;
  return typeof d.formaat === 'string' && typeof d.tekst === 'string' ? (c as Bijlage['code']) : undefined;
}

function alsBijlage(data: unknown): Bijlage | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.id !== 'string' || typeof d.naam !== 'string' || typeof d.type !== 'string' || typeof d.grootte !== 'number') return null;
  const code = alsCode(d.code ?? null);
  if (code === undefined) return null;
  return { id: d.id, naam: d.naam, type: d.type as Bijlage['type'], grootte: d.grootte, code };
}
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run`, daarna `npx tsc --noEmit`.
Expected: PASS. Los typefouten op plekken die `Bijlage` opbouwen (tests of e2e) op met `code: null`.

- [ ] **Step 8: Commit**

```bash
git add migrations/006_bijlage_codes.sql src/lib/diensten/bijlagen.ts src/lib/web/bijlagen-http.ts "src/app/api/bijlagen/[id]/code/route.ts" src/lib/web/bijlage-upload.ts tests/integration
git commit -m "feat: herkende code bewaren bij de bijlage en als SVG tonen"
```

---

### Task 3: Label op de tegel en wisselen in de fotoweergave

**Files:**
- Modify: `src/components/bord/bijlagen-blok.tsx`
- Modify: `src/components/bord/foto-weergave.tsx`
- Modify: `tests/e2e/helpers.ts`
- Test: `tests/e2e/bijlagen.spec.ts`

**Interfaces:**
- Consumes: `Bijlage.code`, `isQr`, en de route `/api/bijlagen/<id>/code`.

- [ ] **Step 1: e2e helper** — voeg toe aan `tests/e2e/helpers.ts`

```ts
import { codePng } from '../codes-helper';

export async function qrPng(name: string, tekst: string) {
  return { name, mimeType: 'image/png', buffer: Buffer.from(await codePng('QRCode', tekst, 8)) };
}
```

Als het bestand imports bovenaan groepeert, zet de import daar.

- [ ] **Step 2: Failing e2e test** — voeg toe aan `tests/e2e/bijlagen.spec.ts`. Importeer `qrPng` uit `./helpers`.

```ts
test('een QR-code in een foto wordt herkend en scherp getoond, met de foto als alternatief', async ({ page }) => {
  const mw = await maakMedewerker();
  await inloggen(page, mw.gebruikersnaam, mw.wachtwoord);
  await page.waitForURL(/\/bord\//);
  await page.getByRole('button', { name: 'Nieuwe taak' }).click();
  const nieuw = page.getByRole('dialog', { name: 'Nieuwe taak' });
  await nieuw.getByLabel('Titel').fill('e2e-qr-herkennen');
  await nieuw.getByLabel('Foto of bestand toevoegen').setInputFiles([await qrPng('ophalen.png', 'OPHAAL-E2E-42'), png('gewoon.png')]);
  await expect(nieuw.getByText('gewoon.jpg')).toBeVisible();
  await nieuw.getByRole('button', { name: 'Opslaan' }).click();
  await expect(nieuw).toBeHidden();

  await page.locator('[data-taak]', { hasText: 'e2e-qr-herkennen' }).click();
  const dialoog = page.getByRole('dialog', { name: 'Taak bewerken' });
  const tegel = dialoog.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'ophalen.jpg' }) });
  await expect(tegel.getByText('QR', { exact: true })).toBeVisible();

  await dialoog.getByRole('link', { name: 'ophalen.jpg' }).click();
  const weergave = page.getByRole('dialog', { name: 'Foto bekijken' });
  await expect(weergave.getByRole('img', { name: 'QR-code' })).toBeVisible();
  await expect(weergave.getByText('OPHAAL-E2E-42')).toBeVisible();
  await weergave.getByRole('button', { name: 'Originele foto' }).click();
  await expect(weergave.getByRole('img', { name: 'ophalen.jpg' })).toBeVisible();
  await weergave.getByRole('button', { name: 'Code' }).click();
  await expect(weergave.getByRole('img', { name: 'QR-code' })).toBeVisible();

  await weergave.getByRole('button', { name: 'Volgende foto' }).click();
  await expect(weergave.getByRole('img', { name: 'gewoon.jpg' })).toBeVisible();
  await expect(weergave.getByRole('button', { name: 'Originele foto' })).toHaveCount(0);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx playwright test tests/e2e/bijlagen.spec.ts -g "QR-code in een foto"`
Expected: FAIL. Het label "QR" ontbreekt.

- [ ] **Step 4: Label on the tile** — `src/components/bord/bijlagen-blok.tsx`

Importeer `isQr` uit `@/lib/domein/bijlagen`. Zet in de `<a>` van een opgeslagen bijlage, direct na de `<img …/>` (alleen in de foto-tak):

```tsx
                  {i.bijlage.code && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-px text-[10px] font-semibold text-white">
                      {isQr(i.bijlage.code.formaat) ? 'QR' : 'Streepjescode'}
                    </span>
                  )}
```

De `<a>` moet `relative` zijn, of het label moet relatief zijn aan de `<li>`, die al `relative` is. Controleer dat het label niet onder de ×-knop valt; die staat rechtsboven.

- [ ] **Step 5: Toggle in the viewer** — `src/components/bord/foto-weergave.tsx`

1. Importeer `isQr`.
2. Voeg state toe: `const [toonFoto, setToonFoto] = useState(false);` en `const [codeKapot, setCodeKapot] = useState(false);`.
3. Reset bij bladeren: laat de functie `blader` ook `setToonFoto(false); setCodeKapot(false);` doen.
4. Bepaal `const metCode = foto.code !== null && !codeKapot;` en `const toonCode = metCode && !toonFoto;`.
5. Vervang de `<img src={url} …/>` in het middengebied door:

```tsx
        {toonCode && foto.code ? (
          <div className="flex max-h-full max-w-full flex-col items-center gap-3 rounded-xl bg-white p-4">
            <img
              src={`${url}/code`}
              alt={isQr(foto.code.formaat) ? 'QR-code' : 'Streepjescode'}
              onError={() => setCodeKapot(true)}
              className={isQr(foto.code.formaat) ? 'aspect-square w-[min(80vw,60dvh)]' : 'w-[min(90vw,48rem)]'}
            />
            <p className="max-w-[min(90vw,48rem)] font-mono text-sm break-all text-black select-text">{foto.code.tekst}</p>
          </div>
        ) : (
          <img src={url} alt={foto.naam} className="max-h-full max-w-full object-contain" />
        )}
```

6. Zet in de bovenbalk, vóór "Downloaden", als `metCode` waar is:

```tsx
          {metCode && (
            <button type="button" onClick={() => setToonFoto((t) => !t)} className="rounded-full bg-black/60 px-3 py-2 hover:bg-black/80">
              {toonFoto ? 'Code' : 'Originele foto'}
            </button>
          )}
```

De knopteksten zijn exact "Originele foto" en "Code".

- [ ] **Step 6: Run e2e + full suites**

Run: `npx tsc --noEmit`, daarna `npx playwright test tests/e2e/bijlagen.spec.ts`, en dan volledig `npx playwright test` en `npx vitest run`.
Expected: alles PASS. De e2e-test met de echte QR-foto gaat door de browser, die hem verkleint tot JPEG 0,85. Wordt de QR dan niet herkend, verhoog dan in de helper de `scale` (bijvoorbeeld naar 12). Pas de herkenning niet aan.

- [ ] **Step 7: Commit**

```bash
git add src/components/bord/bijlagen-blok.tsx src/components/bord/foto-weergave.tsx tests/e2e/helpers.ts tests/e2e/bijlagen.spec.ts
git commit -m "feat: herkende code scherp tonen met wisselknop naar de originele foto"
```

---

### Task 4: Productiebuild controleren (wasm in standalone en Docker)

**Files:**
- Modify (alleen als nodig): `next.config.ts`, `Dockerfile`

- [ ] **Step 1: Build and check the trace**

Run: `npm run build`, daarna `ls .next/standalone/node_modules/zxing-wasm/dist/full/zxing_full.wasm .next/standalone/node_modules/zxing-wasm/dist/es/full/index.js`.
Expected: beide bestanden bestaan.

Ontbreekt de wasm, pas dan de sleutel van `outputFileTracingIncludes` aan:
1. Probeer eerst `'/**'`.
2. Werkt dat ook niet, zet dan in `Dockerfile` (app-target), na de standalone-copy, de regel `COPY --from=bouw --chown=node:node /app/node_modules/zxing-wasm ./node_modules/zxing-wasm`.

Leg in het rapport vast welke weg nodig was.

- [ ] **Step 2: Smoke test in production mode**

Lees eerst `scripts/rooktest-productie.sh`. Draai het, en voer na de start, terwijl de stack draait, deze controle uit:

```bash
docker compose -p takenbord-rooktest exec -T app node -e "
const fs=require('fs');const p='/app/node_modules/zxing-wasm/dist/full/zxing_full.wasm';console.log(fs.existsSync(p)?'wasm ok':'WASM ONTBREEKT');"
```

Pas de projectnaam aan naar wat het script gebruikt. Kan het script de stack niet laten draaien tijdens de controle, voer de controle dan uit met `docker run --rm --entrypoint node takenbord-app -e "…"` op het gebouwde image.
Expected: `wasm ok`. Raak de containers van de gebruiker (`maxtasksv1-db-1` en dergelijke) niet aan.

- [ ] **Step 3: Commit (alleen als er iets veranderd is)**

```bash
git add next.config.ts Dockerfile
git commit -m "fix: zxing-wasm mee in de productiebuild"
```

---

## Zelfcontrole tegen de spec

- **§2 Herkennen:** formaten, grootste code, alleen geldige tekst ≤ 2000, nooit falen, en niet voor PDF. Gedekt door Task 1 (de module en de regels) en Task 2 (de aanroep en de PDF-overslag).
- **§3 Gegevens:** de kolommen, de constraint `bijlagen_code_compleet` en de view. Gedekt door Task 2.
- **§4 Route:** SVG, headers, 401/404 en de `viewBox`. Gedekt door Task 1 (`viewBox`) en Task 2 (route).
- **§5 Weergave:**
  - label, standaard de code, de inhoud als tekst, de wisselknop, per foto weer beginnen op "Code", en downloaden van het origineel: Task 3;
  - terugval bij `onError`: Task 3, stap 5.
- **§6 Techniek:** pakket vast op 3.1.5, wasm uit `node_modules`, en tracing. Gedekt door Task 1 en Task 4.
- **§7 Testen:** unit, integratie en e2e. Gedekt door Task 1–3.
