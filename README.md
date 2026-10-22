# Takenbord

Takenbord in Trello-stijl voor één garage. Medewerkers zetten taken per dag op het bord; de beheerder voert ze uit.
De beheerder kan meerdere borden aanmaken. De garagenaam, het adres en de werkdagen staan onder Beheer → Instellingen.
Ontwerp: `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md`.

## Vereisten

- Node.js 24 LTS
- Docker Desktop (op Windows vereist dit WSL)

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

## Google (adressen zoeken)

Adressen zoeken via Google is optioneel. Zonder sleutel kun je wel opgeslagen locaties gebruiken. Het garage-adres in Instellingen kan dan alleen uit opgeslagen locaties gekozen worden; nieuwe adressen vragen Google.

1. Maak in [Google Cloud](https://console.cloud.google.com/) een project aan en koppel een betaalmethode. Het gratis maandtegoed is ruim genoeg voor één garage.
2. Zet **Places API (New)** aan. Voor fase 3 komt daar **Routes API** bij.
3. Maak een API-sleutel aan, beperk die tot deze API's en (in productie) tot het IP-adres van je server, en stel een budgetwaarschuwing in.
4. Zet de sleutel in `.env`:
   ```
   GOOGLE_MAPS_API_KEY=jouw-sleutel
   ```
De sleutel wordt alleen op de server gebruikt en komt nooit in de browser.

## Testen

```bash
npm test                  # unit-tests
npm run test:integratie   # integratietests (start zelf een PostgreSQL-container)
npm run test:e2e          # end-to-end; stop eerst een lopende `npm run dev`
npm run typecheck
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
