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
