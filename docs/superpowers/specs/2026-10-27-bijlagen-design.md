# Bijlagen bij taken: ontwerp

**Datum:** 2026-10-27. **Aanvraag van Max:** media aan een taak kunnen hangen, bijvoorbeeld de QR-code om een pakketje op te halen.

## 1. Doel en keuzes

- Aan een taak kunnen **foto's en PDF's** hangen (keuze B).
- **Iedereen** die is ingelogd mag bijlagen toevoegen en verwijderen (keuze A). Beide acties komen in de taakgeschiedenis.
- **Automatisch opruimen:** een taak die al **30 dagen op Klaar** staat, verliest zijn bijlagen. De taak zelf blijft staan.
- **Opslag:** bijlagen en back-ups komen op de **tweede schijf** van de server, niet meer op de systeemschijf (zie §6).
- **Buiten scope:** video's en andere bestandstypen. Bijlagen staan bovendien niet in de nachtelijke back-up; ze zijn tijdelijk van aard.

## 2. Gebruik

**Taakvenster.** Onder de omschrijving staat een blok **Bijlagen**:

- **Weergave:**
  - Foto's als voorbeeldplaatje.
  - PDF's als tegel met een PDF-icoon, de bestandsnaam en de grootte.
- **Toevoegen:**
  - Met de knop **Foto of bestand toevoegen**. Dat is een bestandskiezer met `accept="image/*,application/pdf"` en `multiple`. Op een telefoon biedt die zelf "Foto maken", "Fotobibliotheek" en "Bestanden".
  - Op de pc ook met **Ctrl+V** van een afbeelding, overal in het geopende venster. Plakken van tekst in een tekstveld werkt gewoon zoals nu; alleen een plakactie met een afbeeldingsbestand wordt onderschept.
  - Op de pc ook door een bestand in het venster te **slepen**.
- **Openen:** een klik of tik opent de bijlage groot in een nieuw tabblad.
- **Verwijderen:** met **×** op de bijlage, na `confirm("Bijlage verwijderen?")`.
- **Bij een nieuwe taak:**
  - Gekozen bijlagen blijven eerst in de browser.
  - Ze worden direct na het opslaan van de taak geüpload.
  - Het venster sluit pas als alle uploads klaar zijn.
  - Mislukt een upload, dan blijft het venster open met de taak in bewerkmodus en een melding bij die bijlage. De taak zelf is dan al opgeslagen.
- **Tijdens het uploaden** staat er per bijlage een voortgangsbalkje.
- **Foutmeldingen** verschijnen per bijlage:
  - "Te groot (max 10 MB)";
  - "Dit bestandstype kan niet (alleen foto's en PDF's)";
  - "Maximaal 10 bijlagen per taak";
  - "Opslagschijf niet gevonden, waarschuw de beheerder";
  - een netwerkfout.

**Kaart op het bord.** Een paperclip met het aantal bijlagen, bijvoorbeeld 📎 2. Zonder bijlagen is er geen icoon.

**Live.** Na het toevoegen of verwijderen van een bijlage krijgen andere geopende borden het bestaande `meldWijziging`-sein, zodat de kaarten en een geopend venster bijwerken.

**Geschiedenis.** De regels gebruiken het bestaande formaat `{ veld: { oud, nieuw } }`:
- bij toevoegen `{ bijlage: { oud: null, nieuw: "qr.jpg" } }`;
- bij verwijderen `{ bijlage: { oud: "qr.jpg", nieuw: null } }`.

`VELDNAAM.bijlage = 'Bijlage'`. Het automatisch opruimen (§5) schrijft geen historieregels.

## 3. Bestanden in de browser

- **Foto's** (elk `image/*`) worden vóór het uploaden verkleind:
  - De langste zijde wordt maximaal **2000 px**.
  - Het resultaat is altijd **JPEG** met kwaliteit 0,85, via `createImageBitmap` en een canvas.
  - EXIF-gegevens, zoals de GPS-locatie, gaan daarbij verloren. Dat is bewust.
  - Een iPhone-foto (HEIC) decodeert Safari zelf, dus die wordt ook JPEG.
  - **Lukt het decoderen niet** (bijvoorbeeld HEIC in Chrome op Windows):
    - Is het origineel JPEG, PNG of WebP, dan wordt het ongewijzigd geüpload.
    - Anders verschijnt de melding "Dit fototype kan niet".
- **PDF's** gaan ongewijzigd mee.
- **Bestandsnaam:**
  - De oorspronkelijke naam blijft behouden. Een verkleinde foto krijgt de extensie `.jpg`.
  - Een geplakte afbeelding zonder naam heet `Schermafbeelding <dd-mm> <uu:mm>.jpg`.

## 4. Server

### 4.1 Gegevens

Migratie `005_bijlagen.sql`:

```sql
create table bijlagen (
  id uuid primary key default gen_random_uuid(),
  taak_id uuid not null references taken(id) on delete cascade,
  naam text not null check (char_length(naam) between 1 and 200),
  type text not null check (type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  grootte integer not null check (grootte between 1 and 10485760),
  aangemaakt_door uuid references gebruikers(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);
create index bijlagen_taak on bijlagen (taak_id, aangemaakt_op);
```

`taken_weergave` krijgt een kolom `bijlagen`. Dat is een JSON-array van `{ id, naam, type, grootte }` op volgorde van `aangemaakt_op`, met dezelfde opbouw als `stops`. De kaart gebruikt daarvan de lengte; het venster de lijst.

### 4.2 Bestanden op schijf

- **Locatie:**
  - Map: `BIJLAGEN_MAP`, in de container `/bijlagen`.
  - Bestandsnaam: alleen het uuid van de bijlage. Er komt geen gebruikersinvoer in een pad.
- **Controlebestand:**
  - Is `OPSLAG_CONTROLE=1`, dan moet `<BIJLAGEN_MAP>/.takenbord-opslag` bestaan.
  - Zonder dat bestand weigert de server te schrijven met de fout `OpslagOntbreekt`, met als tekst "Opslagschijf niet gevonden, waarschuw de beheerder".
  - De map wordt dan ook niet aangemaakt.
  - Lezen van een ontbrekend bestand geeft 404.
- **Toevoegen** gebeurt in deze volgorde:
  1. Bestand schrijven als `<id>.deel`.
  2. Hernoemen naar `<id>`.
  3. In één transactie:
     - de taak vergrendelen (`for update`);
     - het aantal bijlagen controleren;
     - de rij invoegen, plus de historieregel en `meldWijziging`.
  4. Mislukt de transactie, dan wordt het bestand direct verwijderd.
- **Verwijderen** gebeurt in deze volgorde:
  1. In één transactie: de rij verwijderen, plus de historieregel en `meldWijziging`.
  2. Daarna het bestand verwijderen. Mislukt dat, dan ruimt de nachtrun (§5) het op.

### 4.3 Dienstlaag

In `src/lib/diensten/bijlagen.ts`:
- `voegBijlageToe(ctx, taakId, { naam, inhoud: Uint8Array })`
- `verwijderBijlage(ctx, bijlageId)`
- `haalBijlage(bijlageId)` → `{ naam, type, pad }`

**Controles:**
- Het type wordt bepaald uit de **eerste bytes**: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF....WEBP`, PDF `%PDF-`. De meegegeven bestandsnaam of het meegegeven type telt niet. Dit zit als pure functie `bepaalType(bytes)` in `src/lib/domein/bijlagen.ts`.
- Grootte van 1 byte tot en met 10 MB.
- Maximaal 10 bijlagen per taak.
- De taak moet bestaan; anders `NietGevonden`.
- De naam wordt opgeschoond:
  - padscheidingstekens en stuurtekens gaan eruit;
  - lege spaties aan het begin en eind gaan eruit;
  - de naam wordt ingekort tot 200 tekens;
  - een lege naam wordt `bijlage`.

**Rechten.** Een bijlage bekijken, toevoegen of verwijderen mag precies wie de taak mag bekijken, net als bij taken bewerken. Taken op een gearchiveerd bord volgen de bestaande regels voor taken.

### 4.4 Routes

**`POST /api/taken/[taakId]/bijlagen`** (multipart, veld `bestand`)
- Een route handler en geen server action, omdat server actions standaard maximaal 1 MB accepteren.
- Vereist een geldige sessie.
- Weigert een verzoek waarvan de `Origin`-header niet bij `APP_URL` hoort, als bescherming tegen CSRF.
- Antwoordt met `201` en `{ id, naam, type, grootte }`. Bij een fout volgt een JSON-fout met een Nederlandse melding:
  - 400: ongeldig bestand;
  - 401: niet ingelogd;
  - 404: taak bestaat niet;
  - 409: maximaal 10 bijlagen;
  - 413: te groot;
  - 503: opslagschijf ontbreekt.
- Een te groot verzoek wordt afgekapt bij 10 MB plus een kleine marge, zodat de server niet het hele verzoek in het geheugen leest. Tijdens het plannen wordt in `node_modules/next/dist/docs/` gecontroleerd hoe route handlers de body-grootte begrenzen.

**`GET /api/bijlagen/[id]`**
- Vereist een geldige sessie.
- Streamt het bestand met deze headers:
  - het opgeslagen `Content-Type`;
  - `Content-Disposition: inline; filename*=UTF-8''<naam>`;
  - `X-Content-Type-Options: nosniff`;
  - `Cache-Control: private, max-age=3600`.

**Verwijderen** gaat via een server action, `verwijderBijlageActie(id)`.

## 5. Nachtrun: opruimen

De worker krijgt een cron om **03:30** (Europe/Amsterdam), na de back-up van 03:00:

1. **Oude bijlagen:** verwijder de bijlagen van taken met `status = 'klaar'` en `klaar_op < now() - interval '30 days'`, en daarna hun bestanden. Per geraakt bord gaat er een `meldWijziging`.
2. **Losse bestanden:** verwijder bestanden in de map zonder bijbehorende rij die ouder zijn dan 1 uur, inclusief achtergebleven `.deel`-bestanden. Dat zijn onder meer bestanden van verwijderde taken. Het controlebestand blijft staan.
3. **Ontbrekende opslag:** ontbreekt het controlebestand, dan slaat de worker stap 2 over en gebeurt er niets met bestanden.

De cron draait alleen als `BIJLAGEN_MAP` is gezet.

## 6. Opslag op de tweede schijf

### 6.1 Docker

`docker-compose.yml`:
- **app:** volume `${BIJLAGEN_OPSLAG:-bijlagen}:/bijlagen` en de omgeving `BIJLAGEN_MAP=/bijlagen` en `OPSLAG_CONTROLE=${OPSLAG_CONTROLE:-0}`.
- **worker:** dezelfde bijlagen-mount en omgeving, en de back-ups via `${BACKUP_OPSLAG:-backups}:/backups`.
- **Standaard** zonder `.env`-waarden blijven het named volumes (`bijlagen`, `backups`). Een installatie met één schijf werkt dus zoals nu.
- **Rechten:** de containers draaien als gebruiker `node` (uid 1000), dus de mappen op de host zijn van `1000:1000`.

### 6.2 Back-up

`maakBackup`:
- maakt de map niet meer aan als `OPSLAG_CONTROLE=1`;
- weigert zonder `<BACKUP_MAP>/.takenbord-opslag`.

Mislukt een back-up, om welke reden dan ook, dan stuurt de worker een **ntfy-melding** naar het ingestelde onderwerp: "Back-up van het takenbord mislukt: <reden>". Is er geen onderwerp ingesteld, dan alleen een log.

### 6.3 install.sh

Nieuwe vraag, zowel bij een nieuwe installatie als bij bijwerken:

- **Wanneer:** alleen als `OPSLAG_MAP` nog niet in `.env` staat.
- **Vraag:** "Map voor bijlagen en back-ups (bijv. /mnt/opslag/takenbord; leeg = systeemschijf)".
- **Leeg antwoord:**
  - `OPSLAG_MAP=` gaat in `.env`, zodat de vraag niet terugkomt;
  - de bestaande volumes blijven in gebruik.
- **Een map:**
  - Het pad moet absoluut zijn.
  - De bovenliggende map moet bestaan.
  - Ligt de map op hetzelfde bestandssysteem als `/`, dan volgt een waarschuwing en de vraag of dat de bedoeling is. Dat wordt vergeleken met `df --output=source`.
  - Daarna maakt het script `bijlagen/` en `backups/` aan, met in beide het controlebestand, eigenaar `1000:1000`.
  - Het schrijft `OPSLAG_MAP`, `BIJLAGEN_OPSLAG=<map>/bijlagen`, `BACKUP_OPSLAG=<map>/backups` en `OPSLAG_CONTROLE=1` in `.env`.
- **Bestaande back-ups:**
  - Als het volume `takenbord_backups` bestaat, kopieert het script de back-ups eenmalig naar `<map>/backups`. Dat gebeurt met een tijdelijke container van het worker-image, zodat er geen extra image nodig is.
  - Bestanden met dezelfde naam worden niet overschreven.
  - Het oude volume blijft bestaan. De README legt uit hoe je het later verwijdert.
- **Controle bij elke run:** bij bijwerken controleert het script, als `OPSLAG_CONTROLE=1`, of de controlebestanden er zijn. Ontbreken ze, dan stopt het met een duidelijke melding ("Is de schijf aangekoppeld?") voordat containers herstarten.

**README.** Een korte paragraaf "Tweede schijf gebruiken": aankoppelen via `/etc/fstab` met `nofail`, dit script opnieuw draaien, en het oude volume opruimen.

## 7. Ontwikkelen en testen

- **Ontwikkelen:** lokaal geldt `BIJLAGEN_MAP=./.opslag/bijlagen`. Die map staat in `.gitignore`. `OPSLAG_CONTROLE` staat uit.
- **Unit:**
  - `bepaalType` (elk toegestaan type, onbekende bytes, te korte invoer);
  - het opschonen van namen;
  - de naam van een geplakte afbeelding;
  - de keuze om een foto wel of niet te verkleinen.
- **Integratie** (Testcontainers, tijdelijke map):
  - toevoegen en lezen;
  - verwijderen, met het bestand weg en een historieregel;
  - de limiet van 10;
  - te groot en verkeerd type;
  - een onbekende taak;
  - cascade bij het verwijderen van een taak, gevolgd door de nachtrun die het losse bestand opruimt;
  - opruimen na 30 dagen Klaar, terwijl een taak die op Klaar staat maar jonger is zijn bijlagen houdt;
  - controlebestand ontbreekt → `OpslagOntbreekt` en er is niets geschreven;
  - back-up zonder controlebestand → fout, plus ntfy-melding (via een nep-`fetch`);
  - de routes:
    - 401 zonder sessie;
    - een verkeerde `Origin` wordt geweigerd;
    - de headers van de GET.
- **E2E** (Playwright, met een tijdelijke `BIJLAGEN_MAP` in de webServer-omgeving):
  - een foto uploaden via de bestandskiezer;
  - een afbeelding plakken;
  - het aantal op de kaart;
  - openen in een nieuw tabblad;
  - verwijderen na bevestiging;
  - bijlagen bij een nieuwe taak vóór het opslaan.
- **install.sh-tests:**
  - de helper voor de opslagvraag (absoluut pad, bovenliggende map ontbreekt, zelfde bestandssysteem);
  - de `.env`-regels die erbij komen;
  - shellcheck.
