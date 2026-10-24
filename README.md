# Takenbord

Takenbord in Trello-stijl voor één garage. Medewerkers zetten taken per dag op het bord; de beheerder voert ze uit.
De beheerder kan meerdere borden aanmaken. De garagenaam, het adres en de werkdagen staan onder Beheer → Instellingen.
Ontwerp: `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md`.

## Vereisten

- Node.js 24 LTS
- Docker Desktop (op Windows vereist dit WSL)
- Tip: zet in Docker Desktop "Start Docker Desktop when you sign in" aan. De database start dan vanzelf mee (`restart: unless-stopped`).

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

## Beschikbaarheid

Onder **Beschikbaarheid** (alleen voor de beheerder) leg je vast wanneer je niet beschikbaar bent. Dat kan een hele dag zijn, een periode of een tijdvak, eenmalig of terugkerend. Collega's zien een balk op het bord, en het taakvenster waarschuwt als ze in zo'n blok plannen. Opslaan blijft mogelijk.

## Google (adressen zoeken en route plannen)

Adressen zoeken via Google is optioneel. Zonder sleutel kun je wel opgeslagen locaties gebruiken. Het garage-adres in Instellingen kan dan alleen uit opgeslagen locaties gekozen worden; nieuwe adressen vragen Google.

1. Maak in [Google Cloud](https://console.cloud.google.com/) een project aan en koppel een betaalmethode. Het gratis maandtegoed is ruim genoeg voor één garage.
2. Zet **Places API (New)** en **Routes API** aan. Places zoekt adressen, Routes berekent bij "Plan route" de snelste volgorde.
3. Maak een API-sleutel aan, beperk die tot deze API's en (in productie) tot het IP-adres van je server, en stel een budgetwaarschuwing in.
4. Zet de sleutel in `.env`:
   ```
   GOOGLE_MAPS_API_KEY=jouw-sleutel
   ```
De sleutel wordt alleen op de server gebruikt en komt nooit in de browser.

Open de routelink bij voorkeur in de Google Maps-app. In een mobiele browser toont Google Maps mogelijk niet alle tussenstops.

## Meldingen (ntfy)

Dit gedeelte gaat over lokaal ontwikkelen met het openbare `ntfy.sh`. Voor de server zie "Meldingen op de server (ntfy)" hieronder: daar zet Compose `NTFY_URL` zelf en komt alleen `NTFY_TOKEN` in `.env`.

Bij een taak met "Zo snel mogelijk" of "Nu" van een medewerker krijgt de beheerder een pushmelding via [ntfy](https://ntfy.sh). Taken die de beheerder zelf aanmaakt, geven geen melding.

1. Installeer de ntfy-app op je telefoon.
2. Zet in je lokale `.env` de server en, als je server toegangsbeheer heeft, een token:
   ```
   NTFY_URL=https://ntfy.sh
   NTFY_TOKEN=
   ```
3. Vul in **Beheer → Instellingen → Meldingen** een onderwerp in, abonneer je in de app op hetzelfde onderwerp en klik op **Stuur testmelding**.

Let op: op het openbare `ntfy.sh` kan iedereen die het onderwerp kent meelezen. Kies dus een lang, niet te raden onderwerp. Op de eigen server heeft ntfy toegangsbeheer en een token (zie "Meldingen op de server (ntfy)").

## Installeren op een server

Voor een Linux-server (bijv. een VPS met Ubuntu 24.04) met een eigen IP-adres. Alles draait in Docker; alleen poort 80 en 443 staan open.

### Snel: met het installatiescript (aanbevolen)

1. Laat je domein én `ntfy.<domein>` met een A-record naar het IP-adres van de server wijzen.
2. Log via SSH in op de server (als gebruiker met sudo, of als root) en draai:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/xclovisx/MaxTasksV1/main/install.sh | bash
   ```
3. Beantwoord de vragen (domeinnaam, je naam, gebruikersnaam en wachtwoord, optioneel de Google-sleutel).

Het script installeert Docker, zet de firewall (alleen SSH, 80 en 443), haalt de code op in `/opt/takenbord`, schrijft `.env`, start alles, maakt je beheerdersaccount aan en regelt HTTPS, ntfy en de nachtelijke back-ups. Aan het eind zie je het adres van het takenbord en de ntfy-gegevens voor de app. De firewall zet het script alleen aan als het de SSH-poort kan bepalen; lukt dat niet, dan staat dat in de samenvatting. Draai het script ook altijd als dezelfde gebruiker: het weigert als `/opt/takenbord` van een andere gebruiker is.

**Bijwerken:** draai dezelfde regel opnieuw (of `bash /opt/takenbord/install.sh`). Het script maakt eerst een back-up en haalt dan de nieuwste versie op. Wordt een installatie halverwege afgebroken, dan gaat het script bij de volgende keer verder waar het gebleven was.

### Handmatig (naslag)

De stappen hieronder doet het script voor je; ze staan hier voor als je iets zelf wilt doen of wilt begrijpen.

### 1. Server voorbereiden
```bash
curl -fsSL https://get.docker.com | sh   # Docker Engine + Compose
sudo usermod -aG docker $USER            # log daarna uit en weer in (of: newgrp docker), anders is elke docker-opdracht "permission denied"
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
git clone <url-van-deze-repository> takenbord && cd takenbord
```
Is de repository privé, dan heeft `git clone` een deploy key of een token nodig.

### 2. Hostnaam
- **Eigen domein:** maak een A-record `takenbord.jouwdomein.nl` en een A-record `ntfy.takenbord.jouwdomein.nl` naar het IP van de server.
- **Nog geen domein:** gebruik `<ip-met-streepjes>.sslip.io`, bijv. `203-0-113-5.sslip.io` (ook `ntfy.203-0-113-5.sslip.io` werkt vanzelf).

**Later overstappen naar een andere naam:** pas `DOMEIN` aan in `.env`, maak A-records voor de nieuwe naam en voor `ntfy.<nieuwe naam>`, en voer `docker compose up -d` uit (niet `restart`: die leest `.env` niet opnieuw). Voeg daarna de nieuwe ntfy-server toe in de ntfy-app. Iedereen moet opnieuw inloggen.

### 3. Configureren en starten
```bash
cp .env.productie.example .env
nano .env            # DOMEIN en POSTGRES_PASSWORD invullen (wachtwoord: openssl rand -hex 24)
                     # POSTGRES_PASSWORD mag alleen letters en cijfers bevatten: het wordt in een databaseadres gebruikt.
docker compose up -d --build
docker compose run --rm worker npx tsx src/scripts/maak-beheerder.ts "Max" max
```
De eerste `docker compose up -d --build` heeft internettoegang nodig: de build haalt npm-pakketten en Google Fonts op.

`POSTGRES_PASSWORD` werkt alleen bij de eerste start: daarna onthoudt de database het wachtwoord zelf. Verander je het later in `.env`, dan kan de app niet meer verbinden.

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

**Terugzetten** (overschrijft de huidige gegevens). Maak eerst een verse back-up, zodat je kunt terug als het misgaat:
```bash
docker compose exec worker npx tsx src/scripts/backup.ts
docker compose stop app worker
docker compose exec -T db pg_restore -U takenbord -d takenbord --clean --if-exists --single-transaction < takenbord-2026-10-24.dump
docker compose start app worker
```

**Nieuwe server:** volg stap 1 t/m 3 (`docker compose up -d` draait de migraties en maakt de lege database), kopieer de dump naar de nieuwe server (bijv. met `scp`) en zet hem terug met bovenstaande opdrachten. Doe daarna stap 4 opnieuw: de ntfy-gebruikers en het token staan in het volume `ntfy-data` en zitten dus niet in de back-up.

### Bijwerken
Met het script: `bash /opt/takenbord/install.sh`. Handmatig: maak eerst een back-up (`docker compose exec worker npx tsx src/scripts/backup.ts`).
```bash
git pull
docker compose up -d --build     # migraties draaien vanzelf vóór de app start
```

### Lokaal controleren
`bash scripts/rooktest-productie.sh` bouwt de hele stack op je eigen pc (https://localhost:8443), controleert app, migraties, ntfy en back-up, en ruimt alles weer op.

## Testen

```bash
npm test                  # unit-tests
npm run test:integratie   # integratietests (start zelf een PostgreSQL-container)
npm run test:e2e          # end-to-end; stop eerst een lopende `npm run dev`
npm run typecheck
docker run --rm -v "$PWD":/repo -w /repo ubuntu:24.04 bash tests/install/test-install.sh   # hulpfuncties van install.sh
```

De e2e-tests gebruiken de database `takenbord_e2e` en een eigen dev-server op poort 3100. Bestaat de dev-database al
zonder die database, maak hem dan eenmalig aan:
`docker compose -f docker-compose.dev.yml exec db psql -U takenbord -c "create database takenbord_e2e"`.

## Structuur

- `migrations/`: SQL-migraties (tabellen en view)
- `src/lib/domein/`: pure logica (datums, herhalingen, doorschuiven, sortering, validatie)
- `src/lib/db/`: databaseverbinding, migraties, transacties, live-meldingen
- `src/lib/auth/`: wachtwoorden, sessies, inloggen, activatie
- `src/lib/diensten/`: instellingen, borden, medewerkers, taken, reeksen
- `src/worker/`: nachtelijke taken
- `src/app/`: Next.js-routes; `src/components/`: UI
