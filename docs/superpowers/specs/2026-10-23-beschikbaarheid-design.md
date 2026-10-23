# Beschikbaarheid: ontwerp

**Datum:** 2026-10-23. **Aanvraag van Max:** tijden of dagen kunnen aangeven waarop hij niet beschikbaar is, zodat collega's daar rekening mee houden.

## 1. Doel en keuzes

- De beheerder (Max, de enige uitvoerder) legt **afwezigheidsblokken** vast.
- **Wat een blok doet:** het is zichtbaar op het weekbord en op Vandaag. Het taakvenster **waarschuwt** wanneer iemand een taak in een blok plant. Opslaan blijft altijd mogelijk, zodat een noodklus kan (keuze B van Max).
- **Soorten blokken:**
  - een hele dag, of meerdere dagen aaneen;
  - een tijdvak op een dag;
  - een terugkerend blok, met dezelfde herhaalkeuzes als bij taken (keuze C).
- **Waar het te zien is:** op het weekbord, op Vandaag en op een eigen pagina "Beschikbaarheid" om de blokken te beheren (keuze C).
- **Gebruikers en rechten:**
  - Alleen de beheerder maakt, wijzigt en verwijdert blokken.
  - Iedereen ziet de blokken en de waarschuwing.
  - De reden is optioneel en voor iedereen zichtbaar. Max bepaalt zelf wat hij deelt.

## 2. Een blok

| Veld | Betekenis |
|---|---|
| begindatum | eerste dag |
| einddatum (optioneel) | **Zonder herhaling:** de laatste dag van een aaneengesloten periode; leeg betekent alleen de begindatum. **Met herhaling:** de laatste dag waarop de reeks geldt; leeg betekent onbeperkt. |
| hele dag / van–tot | hele dag, of een tijdvak (van < tot) |
| reden (optioneel) | max 100 tekens, bijvoorbeeld "tandarts" |
| herhaling (optioneel) | dagelijks, wekelijks, maandelijks, op gekozen weekdagen of elke X weken |

**Welke dagen een blok raakt:**
- **Zonder herhaling:** elke dag van begin- tot einddatum.
- **Met herhaling:** dezelfde rekenregels als bij herhalende taken (`datumsVoorHerhaling`), maar met **alle 7 dagen als werkdag**.
  - Een blok schuift dus nooit door naar een werkdag, zoals een taak dat wel doet.
  - "Dagelijks" betekent hier "elke dag".
  - De einddatum begrenst de reeks.

## 3. Weergave

- **Weekbord:** bovenaan de dagkolom staat per blok een grijze balk:
  - bij een tijdvak: "Max niet beschikbaar · 13:00–15:00 · tandarts";
  - bij een hele dag: "Max niet beschikbaar (hele dag) · tandarts", en de kolom wordt gedimd.
  - "Max" is de naam van de beheerder.
- **Vandaag:** dezelfde balken boven de lijst, voor de gekozen dag.
- **Taakvenster:** zodra dag of tijd verandert (met 300 ms vertraging), vraagt het venster de waarschuwing op en toont die als info-melding:
  - valt de taak op een hele vrije dag, of ligt de tijd binnen een tijdvak (van ≤ tijd < tot): "Max is dan niet beschikbaar (tandarts)."
  - geen tijd, maar die dag wel een tijdvak: "Let op: Max is die dag van 13:00 tot 15:00 niet beschikbaar." Bij meerdere tijdvakken: "… van 09:00 tot 10:00 en van 13:00 tot 15:00 …".
- **Pagina "Beschikbaarheid"** (`/beschikbaarheid`): alleen voor de beheerder, via een link in de bovenbalk. Bovenaan staat een formulier om een blok toe te voegen. Daaronder een lijst van alle blokken met per blok de periode, het tijdvak, de herhaling en de reden, en de knoppen "Wijzigen" (het formulier opent in de regel) en "Verwijderen" (met bevestiging).
- **Live:** na een wijziging seint de server via het bestaande `bord_wijziging`-kanaal met het id `afwezigheid`. De SSE-route stuurt dat naar alle open borden en naar Vandaag, zodat iedereen de balk direct ziet.

## 4. Architectuur

- **Migratie** `004_afwezigheden.sql`: tabel `afwezigheden` (id, begindatum, einddatum, hele_dag, van, tot, reden, herhaling_type, weekdagen, interval_weken, aangemaakt_door, aangemaakt_op), met checks op einddatum ≥ begindatum, het tijdvak en de herhaalwaarden.
- **Domein** `src/lib/domein/afwezigheid.ts` (puur, getest): `afwezigheidsDagen`, `tijdvakLabel`, `afwezigheidWaarschuwing`, `HERHALING_LABELS_AFWEZIG`.
- **Validatie:** `afwezigheidSchema` in `validatie.ts` (hergebruikt `herhalingSchema`).
- **Dienst** `src/lib/diensten/afwezigheden.ts`:
  - `lijstAfwezigheden`
  - `afwezighedenInPeriode(van, tot)` → `{ naam, perDag }`
  - `afwezigheidWaarschuwing(datum, tijd)`
  - `maakAfwezigheid` / `wijzigAfwezigheid` / `verwijderAfwezigheid` (alleen de beheerder; seinen na de wijziging)
- **Acties:**
  - `src/app/(app)/beschikbaarheid/acties.ts` (beheerder)
  - `afwezigheidWaarschuwingActie` in `src/app/(app)/bord/acties.ts` (iedere ingelogde gebruiker)
- **UI:**
  - `AfwezigheidBalken` (balken voor één dag)
  - `DagKolom` en `WeekBord` krijgen de blokken mee
  - Vandaag-pagina
  - waarschuwing in `TaakDialoog`
  - pagina en `AfwezigheidFormulier`
  - link in `TopBalk`

## 5. Foutafhandeling

- Ongeldige invoer (einddatum vóór begindatum, geen of omgekeerd tijdvak, herhaling zonder weekdagen) geeft een Nederlandse foutmelding in het formulier, via Zod en `voerUit`.
- Een medewerker die toch een beheeractie aanroept, krijgt `GeenToegang`.
- Een onbekend of verwijderd blok geeft `NietGevonden` ("Blok niet gevonden").
- Mislukt het ophalen van de waarschuwing in het taakvenster, dan verschijnt er geen waarschuwing. Plannen gaat altijd door.

## 6. Testen

- **Unit:** dagberekening (eenmalig, periode, wekelijks op zaterdag zonder verschuiving, gekozen weekdagen met einddatum, dagelijks, elke X weken), labels, alle gevallen van de waarschuwing, schema-validatie.
- **Integratie:** aanmaken, wijzigen en verwijderen met rechten, `afwezighedenInPeriode` (per dag en naam), de waarschuwing, en het seintje via `bord_wijziging`.
- **E2e:**
  - De beheerder maakt een blok voor vandaag van 13:00 tot 15:00 met de reden "tandarts".
  - Een medewerker ziet de balk op het bord, en krijgt in het taakvenster bij 14:00 de waarschuwing.
  - Daarna verwijdert de beheerder het blok.

## 7. Kleine extra

- `docker-compose.dev.yml`: `restart: unless-stopped` bij de database, zodat die meestart met Docker Desktop. In de README staat de tip om Docker Desktop bij het inloggen te laten starten.

## 8. Buiten scope

- Afwezigheid van medewerkers (er is één uitvoerder).
- Losse uitzonderingen op een herhalend blok (een blok één keer overslaan). Dat kan nu door het blok te wijzigen of tijdelijk te verwijderen.
- Blokken die over middernacht lopen.
