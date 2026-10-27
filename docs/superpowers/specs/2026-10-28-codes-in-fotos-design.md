# Codes in foto's: ontwerp

**Datum:** 2026-10-28. **Aanvraag van Max:** als iemand een foto met een QR-code uploadt (bijvoorbeeld om een pakketje op te halen), moet het takenbord de code scherp namaken in plaats van alleen de foto te tonen.

## 1. Doel en keuzes

- **Herkennen:** bij het uploaden van een foto herkent de server één code: een QR-code of een gangbare streepjescode (keuze B).
- **Tonen:** bij openen in de fotoweergave zie je eerst de nagemaakte code, scherp op wit, met de inhoud eronder. Een knop wisselt naar de originele foto. Het origineel blijft bewaard (keuze A).
- **Waar:** herkennen en tekenen gebeuren op de server met ZXing (keuze 1). Er komt niets extra in de browser.
- **Bestaande bijlagen:** krijgen geen code. Alleen uploads vanaf deze versie worden gescand.
- **Buiten scope:**
  - PDF's scannen;
  - meerdere codes per foto bewaren;
  - een code handmatig invoeren of corrigeren.

## 2. Herkennen

- **Wanneer:** in `voegBijlageToe`, alleen voor `image/jpeg`, `image/png` en `image/webp`. Dat gebeurt na de typecontrole en vóór het wegschrijven, buiten de transactie.
- **Formaten:**
  - QR Code;
  - Code 128, Code 39 en Code 93;
  - EAN-13, EAN-8, UPC-A en UPC-E;
  - ITF;
  - Codabar.
- **Meerdere codes:** worden er meerdere gevonden, dan telt de code met het grootste oppervlak (de omsluitende vierhoek van de positie).
- **Wat bewaard wordt:**
  - **Soort code** (`code_formaat`): een vaste waarde uit de lijst hierboven, als tekst, bijvoorbeeld `QRCode` of `Code128`. Het gaat om ZXing's namen.
  - **Inhoud** (`code_tekst`): de gelezen tekst.
- **Niet bewaard,** waarna het een gewone foto blijft, als:
  - de inhoud geen geldige tekst is (binaire inhoud);
  - de inhoud langer is dan 2000 tekens;
  - de inhoud leeg is.
- **Fouten:**
  - Gooit de herkenning, dan wordt dat gelogd en is het gewoon een foto. **Een upload faalt nooit door het herkennen.**
  - De herkenning laadt de WASM-module één keer per proces, lui bij de eerste foto.

## 3. Gegevens

Migratie `006_bijlage_codes.sql`:

```sql
alter table bijlagen
  add column code_formaat text,
  add column code_tekst text check (char_length(code_tekst) between 1 and 2000),
  add constraint bijlagen_code_compleet check ((code_formaat is null) = (code_tekst is null));
```

`taken_weergave.bijlagen` neemt per bijlage ook `code` op. Dat is `{ formaat, tekst }` of `null`, met dezelfde volgorde als nu. Het type `Bijlage` krijgt `code: { formaat: CodeFormaat; tekst: string } | null`.

## 4. Nagemaakte code

- **Route:** `GET /api/bijlagen/[id]/code`.
  - Vereist een sessie.
  - 404 als de bijlage niet bestaat of geen code heeft.
- **Antwoord:**
  - Een SVG die de server met ZXing's writer maakt uit `code_formaat` en `code_tekst`, zwart op wit.
  - Met een witte rand (quiet zone).
  - Zonder leesbare tekst in de SVG zelf; de inhoud staat los in de weergave.
- **Headers:**
  - `Content-Type: image/svg+xml`
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`
  - `Cache-Control: private, max-age=3600`
- **Gebruik:** de SVG wordt alleen via `<img>` getoond, zodat er nooit script in kan draaien.
- **Fouten:** lukt tekenen niet, dan krijg je 500 en logt de server de fout. De weergave valt dan terug op de foto.

## 5. Weergave

- **Tegel in het taakvenster:** heeft een foto een code, dan staat er linksonder een klein label: "QR" bij een QR-code, anders "Streepjescode".
- **Fotoweergave (`FotoWeergave`), voor een foto met code:**
  - Standaard toont hij de code: een wit vlak met de SVG, zo groot als past.
    - Een QR-code is vierkant.
    - Een streepjescode is breed: volle breedte, en de hoogte volgt de verhouding.
  - Daaronder staat de inhoud in een vast-breed lettertype, selecteerbaar.
  - Een wisselknop: "Originele foto" ↔ "Code".
  - De wisselknop blijft bij het bladeren per foto op "Code" beginnen.
  - "Downloaden" slaat altijd de originele foto op.
  - Lukt het laden van de SVG niet, dan toont hij de foto en verbergt hij de wisselknop.
- **Foto zonder code:** de weergave blijft zoals nu.

## 6. Techniek

- **Pakket:** `zxing-wasm` (ZXing-C++ als WebAssembly, met ES-module en types), alleen gebruikt op de server.
  - Kies een versie die minstens twee weken oud is en zet die vast in `package.json` (zonder `^`).
  - De module laadt zijn `.wasm` uit `node_modules`. Controleer dat de standalone Next-build en het worker-image dat bestand meenemen. Is daar een instelling voor nodig, dan zet het plan die in `next.config.ts` (`serverExternalPackages` en/of `outputFileTracingIncludes`).
- **Eigen module** `src/lib/codes.ts` met:
  - `herkenCode(bytes: Uint8Array): Promise<{ formaat: CodeFormaat; tekst: string } | null>`;
  - `tekenCode(formaat: CodeFormaat, tekst: string): Promise<string>` (SVG).
- **Pure regels** in `src/lib/domein/bijlagen.ts`:
  - de lijst `CODE_FORMATEN` en het type `CodeFormaat`;
  - `isQr(formaat)`;
  - de keuze van de grootste code;
  - de lengte- en tekstcontrole.

## 7. Testen

- **Unit:**
  - de keuze van de grootste code;
  - de tekstcontrole (leeg, te lang, geldig);
  - `isQr`.
- **Integratie:**
  - Tekenen en herkennen werken als paar. De test maakt met de writer een QR-code en een Code 128 als PNG (de testcode zet de SVG niet om; gebruik de beeldoptie van de writer als die er is, anders een vooraf gemaakte PNG-fixture in `tests/fixtures/`).
  - Na `voegBijlageToe` heeft de bijlage de juiste `code`.
  - Een foto zonder code geeft `code: null`.
  - Een herkenning die gooit, blokkeert de upload niet. Dat wordt getest met een geïnjecteerde herkenner.
  - Route `/code`:
    - 401 zonder sessie;
    - 404 zonder code;
    - SVG met de juiste headers.
- **E2E:**
  - Upload van een QR-PNG toont een tegel met het label "QR".
  - Openen toont de code en de inhoud als tekst.
  - "Originele foto" wisselt naar de foto, en "Code" terug.
  - Een foto zonder code toont geen wisselknop.
