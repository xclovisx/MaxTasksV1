# Garage Takenbord: ontwerp

**Datum:** 2026-10-22
**Status:** goedgekeurd in brainstorm, ter review

## 0. Wijziging (22-10-2026): één bedrijf

Max heeft besloten dat er maar **één bedrijf** is. Waar dit document meerdere bedrijven, `bedrijf_id`, Row Level Security per bedrijf of een bedrijfskiezer noemt, vervalt dat. Daarvoor in de plaats:
- Garagenaam, garage-adres en werkdagen zijn algemene **instellingen** (één rij).
- De beheerder kan nog wel meerdere **borden** aanmaken.
- Rechten (beheerder tegenover medewerker) worden in de applicatielaag afgedwongen. Medewerkers zien alle borden.

De uitwerking staat in `docs/superpowers/plans/2026-10-22-addendum-een-bedrijf.md`.

## 1. Doel

Een webapp in de stijl van Trello waarop medewerkers van een autogarage kleine taken (ophalen, wegbrengen, regelen) per weekdag op een bord zetten. Eén uitvoerder (de beheerder, Max) werkt die taken af. Taken kunnen een tijd, prioriteit, herhaling en één of meer locaties hebben. Bij meerdere locaties berekent de app de snelste volgorde met actueel verkeer en opent Google Maps.

De beheerder kan meerdere bedrijven (garages) bedienen, elk met hun eigen gebruikers, locaties en borden, strikt van elkaar gescheiden.

**Succescriteria**
- Een medewerker zet binnen 30 seconden een taak met een locatie op het bord.
- De beheerder ziet nieuwe taken live verschijnen en krijgt een pushmelding bij "Zo snel mogelijk" en "Nu".
- Bij een taak met meerdere stops staat Google Maps met twee tikken klaar in de optimale volgorde.
- Gebruikers van garage A kunnen technisch geen gegevens van garage B lezen.
- De opmaak is strak, rustig en duidelijk, op de pc en op de telefoon.

## 2. Buiten scope (nu)

- Native app of PWA (kan later)
- Wachtwoord vergeten via e-mail (de beheerder maakt een nieuwe link)
- Eén route over meerdere taken heen (een route hoort altijd bij één taak)
- Einddatum of maximaal aantal keer bij herhalingen
- Foto's of bijlagen bij taken
- Licht thema, en logo of merkkleur per bedrijf
- E-mailmeldingen

## 3. Architectuur

Alles draait met Docker Compose op een eigen server (VPS).

| Container | Rol |
|---|---|
| `app` | Next.js (App Router, TypeScript): pagina's, API-routes, Server-Sent Events |
| `worker` | Dezelfde codebase, een Node-proces met geplande taken (doorschuiven, herhalingen, back-up) |
| `postgres` | PostgreSQL 16 met Row Level Security |
| `ntfy` | Zelf gehoste pushmeldingen |
| `caddy` | Reverse proxy met automatische HTTPS |

**Belangrijkste keuzes**
- **Database-toegang:** postgres.js met handgeschreven SQL en een eigen kleine migratierunner (`migrations/*.sql`). Dat geeft volledige controle over rollen, Row Level Security en views.
- **Styling:** Tailwind CSS, donker thema (zie §9).
- **Tijdzone:** alle datumlogica in `Europe/Amsterdam`. Taakdatums worden opgeslagen als `date` en tijden als `time`, dus zonder tijdzone.
- **Externe diensten:** Google Places API (New) voor het aanvullen van adressen en Google Routes API (fase 3) voor de optimale volgorde. Beide worden alleen vanaf de server aangeroepen, met één sleutel (`GOOGLE_MAPS_API_KEY`, beperkt tot de server-IP en deze API's), zodat er geen sleutel in de browser staat. In Google Cloud wordt een budgetwaarschuwing ingesteld.
- **Back-up:** de `worker` draait elke nacht om 03:00 `pg_dump` naar een volume en bewaart 14 dagen.
- **Configuratie:** via `.env`: database-wachtwoorden, Google-sleutel, ntfy-server en -token (`NTFY_URL`, `NTFY_TOKEN`) en de publieke URL.
- **Eerste beheerder:** wordt aangemaakt met het CLI-commando `npm run maak-beheerder`, uitgevoerd in de `app`-container.

## 4. Rollen en rechten

| Actie | Beheerder | Medewerker |
|---|---|---|
| Bedrijven, borden en medewerkers beheren | ✅ alle bedrijven | ❌ |
| Borden bekijken | ✅ alle bedrijven | ✅ alleen eigen bedrijf |
| Taken aanmaken, wijzigen, verplaatsen, verwijderen | ✅ | ✅ alle taken van eigen bedrijf |
| Status wijzigen (open, bezig, klaar) | ✅ | ❌ |
| Route plannen of navigeren | ✅ | ✅ (staat er, maar is vooral voor de beheerder bedoeld) |
| Opgeslagen locaties beheren | ✅ | ✅ eigen bedrijf |

Elke kaart toont "aangemaakt door" en "laatst gewijzigd door … om …". Elke wijziging wordt vastgelegd in `taak_historie`.

## 5. Accounts en inloggen

- Inloggen gaat met **gebruikersnaam en wachtwoord**. Een e-mailadres is niet nodig.
- Wachtwoorden worden gehasht met **Argon2id**. Het minimum is 8 tekens.
- Sessies staan in een database-tabel, met een `httpOnly`, `Secure`, `SameSite=Lax` cookie die 30 dagen geldig is. Uitloggen verwijdert de sessie.
- Na **5 mislukte pogingen** wordt het account 15 minuten geblokkeerd.

**Activeren en resetten** (één en hetzelfde proces):
1. De beheerder maakt een medewerker aan (naam, gebruikersnaam, bedrijf) of klikt bij een bestaande medewerker op **"Nieuwe link"**.
2. De app maakt een eenmalige **activatielink** (willekeurig token van 32 bytes) en een **6-cijferige code**. Beide zijn 48 uur geldig, en in de database staan alleen hashes. Het adminpaneel toont link en code met een kopieerknop.
3. Bij "Nieuwe link" wordt het huidige wachtwoord ongeldig en worden alle sessies van die gebruiker beëindigd.
4. De medewerker opent de link, of kiest op de inlogpagina "Ik heb een activatiecode" en vult gebruikersnaam en code in (met dezelfde blokkade na 5 pogingen). Daarna kiest de medewerker een wachtwoord.
5. Een verlopen of gebruikte link geeft: "Deze link is niet meer geldig. Vraag een nieuwe aan bij de beheerder."

Een account kan worden **gedeactiveerd**: inloggen kan dan niet meer, en de taken en historie blijven bewaard.

## 6. Datamodel

```
bedrijven       id, naam, garage_naam, garage_adres, garage_lat, garage_lng,
                werkdagen (int[] 1=ma..7=zo, standaard {1,2,3,4,5}), ntfy_onderwerp, aangemaakt_op
gebruikers      id, bedrijf_id (NULL = beheerder), naam, gebruikersnaam (uniek), wachtwoord_hash (NULL tot activatie),
                rol (beheerder|medewerker), actief, mislukte_pogingen, geblokkeerd_tot,
                activatie_token_hash, activatie_code_hash, activatie_verloopt_op
sessies         id (hash van token), gebruiker_id, verloopt_op, aangemaakt_op
borden          id, bedrijf_id, naam, gearchiveerd
locaties        id, bedrijf_id, naam, adres, lat, lng, google_place_id, gebruik_teller
taken           id, bedrijf_id, bord_id, titel, omschrijving, datum, tijd (NULL), prioriteit (laag|middel|hoog|zsm|nu),
                status (open|bezig|klaar), oorspronkelijke_datum (aanmaak-/reeksdatum, vast), uitgesteld_van (NULL), gemist (bool),
                herhaling_id (NULL), afwijkend (bool: los gewijzigd t.o.v. de herhaling),
                versie (int, voor gelijktijdige bewerkingen), aangemaakt_door, aangemaakt_op,
                gewijzigd_door, gewijzigd_op, klaar_op
taak_stops      id, taak_id, volgorde, naam, adres, lat, lng, locatie_id (NULL)    -- maximaal 9 per taak
herhalingen     id, bedrijf_id, bord_id, titel, omschrijving, tijd, prioriteit, stops (jsonb),
                type (dagelijks|wekelijks|maandelijks|weekdagen|elke_x_weken),
                weekdagen (int[]), interval_weken (int), startdatum, gegenereerd_tot (NULL), actief, aangemaakt_door
taak_historie   id, taak_id, gebruiker_id, tijdstip, wijzigingen (jsonb: veld → {oud, nieuw})
```

**Scheiding per bedrijf (Row Level Security)**
- De app maakt verbinding als een databaserol zonder `BYPASSRLS`.
- Elk verzoek draait in een transactie die eerst `SET LOCAL app.gebruiker_id`, `app.bedrijf_id` en `app.rol` zet.
- Er zijn policies op `borden`, `locaties`, `taken`, `taak_stops`, `herhalingen`, `taak_historie` en `gebruikers`. Een rij is zichtbaar als die (direct of via het bord) bij `app.bedrijf_id` hoort, of als `app.rol = 'beheerder'`.
- De `worker` gebruikt een aparte rol met de nodige rechten voor zijn taken over alle bedrijven heen.

## 7. Taaklogica

### 7.1 Prioriteit en volgorde
| Prioriteit | Weergave |
|---|---|
| Laag | grijs bolletje |
| Middel | blauw bolletje |
| Hoog | oranje bolletje |
| Zo snel mogelijk | rood bolletje, gesorteerd boven de rest |
| Nu | rood label "NU" en een rode kaartrand, helemaal bovenaan |

Volgorde binnen een dag: prioriteit (Nu → Laag), dan tijd (taken met tijd eerst, oplopend), dan aanmaakmoment. Taken met status "klaar" staan onderaan en zijn gedimd.

### 7.2 Status
`open → bezig → klaar`. Alleen de beheerder wijzigt de status, en terugzetten mag ook. Bij "klaar" wordt `klaar_op` gezet.

### 7.3 Doorschuiven
De `worker` draait elke dag om 00:05 (Europe/Amsterdam), en ook bij het opstarten om gemiste runs in te halen:
- Alle taken met status `open` of `bezig` en `datum < vandaag` krijgen als nieuwe `datum` de eerstvolgende werkdag van het bedrijf die op of na vandaag valt. `uitgesteld_van` krijgt de eerste oude datum (als die nog leeg is), en de kaart toont "uitgesteld van <dag>". Handmatig verplaatsen maakt `uitgesteld_van` weer leeg.
- **Uitzondering:** hoort de taak bij een herhaling en staat er op die doeldatum al een exemplaar van dezelfde herhaling, dan blijft de taak op zijn oude datum staan en wordt `gemist = true` ("gemist").
- Een doorgeschoven taak met prioriteit "zsm" of "nu" krijgt de extra markering "achterstallig".

### 7.4 Herhalingen
- Typen: **dagelijks** (elke werkdag van het bedrijf), **wekelijks** (zelfde weekdag als de startdatum), **maandelijks** (zelfde dag van de maand; bestaat die dag niet, dan de laatste dag van de maand), **weekdagen** (gekozen dagen, bijvoorbeeld ma en do), **elke X weken** (op de weekdag van de startdatum, X ≥ 2).
- Valt een berekende datum op een niet-werkdag (wekelijks, maandelijks, elke X weken), dan wordt het de eerstvolgende werkdag.
- De `worker` maakt elke nacht de taken aan voor **de komende 14 dagen**. Dat gebeurt idempotent: per herhaling maximaal één taak per `oorspronkelijke_datum` (unieke index), en `gegenereerd_tot` onthoudt tot waar al is aangemaakt, zodat een los verwijderd exemplaar niet terugkomt.
- **Eén exemplaar bewerken of verslepen** zet `afwijkend = true` en verandert alleen die taak.
- **De herhaling bewerken** werkt alle toekomstige exemplaren bij die niet afwijkend en niet klaar zijn, en maakt ontbrekende exemplaren opnieuw aan.
- **De herhaling stoppen** verwijdert alle toekomstige exemplaren die niet afwijkend en nog open zijn.

### 7.5 Gelijktijdig bewerken
Elke wijziging stuurt de `versie` mee. Komt die niet overeen, dan volgt HTTP 409 en de melding "Deze taak is zojuist gewijzigd door <naam>. Herladen?". Er wordt niets stil overschreven.

### 7.6 Meldingen
Maakt een **medewerker** een taak met prioriteit **zsm** of **nu**, of verhoogt hij de prioriteit daarnaar (ook zsm → nu), dan stuurt de `app` na het opslaan een ntfy-bericht naar het ingestelde onderwerp (Beheer → Instellingen → Meldingen). Het bericht bevat de prioriteit, de titel, het bord, de dag en een link naar "Vandaag" op die dag. Bewuste keuzes: acties van de beheerder zelf geven geen melding, en het wijzigen van een hele reeks ook niet. Mislukt de melding, dan wordt dat alleen gelogd en blijft de taak gewoon opgeslagen. In Instellingen staat een knop "Stuur testmelding".

### 7.7 Live bijwerken
Het bord abonneert zich via Server-Sent Events op wijzigingen van het getoonde bord (of op alle bedrijven, in het beheerdersoverzicht "Vandaag"). Bij een wijziging haalt de client de betreffende dag opnieuw op. Bij verbroken verbinding wordt automatisch opnieuw verbonden, en daarna wordt de hele week opnieuw opgehaald.

## 8. Locaties, navigatie en route

### 8.1 Invoeren
- Een taak heeft **0 tot 9 stops**. Nul stops betekent een taak in de garage, zonder navigatie.
- Een stop toevoegen kan via een zoekveld dat in **opgeslagen locaties** (op naam en adres) en via **Google Places Autocomplete** zoekt, of via de snelkeuze "Vaak gebruikt" (de 5 locaties met de hoogste `gebruik_teller`).
- Bij een nieuw Google-adres staat het vinkje "Bewaar als vaste locatie" (met een naam) standaard aan.
- Stops worden op de taak gekopieerd (naam, adres, coördinaten), zodat een later gewijzigde opgeslagen locatie bestaande taken niet verandert.

### 8.2 Weergave bij de taak
- **0 stops:** geen navigatieblok.
- **1 stop:** een knop **"Navigeer"** die `https://www.google.com/maps/dir/?api=1&destination=<lat,lng>&travelmode=driving` opent.
- **2 of meer stops:** een knop **"Plan route"**. De berekening gebeurt pas na de tik, niet bij het openen.

### 8.3 Route plannen
1. De browser vraagt de huidige locatie op (Geolocation API, timeout van 8 seconden). Wordt die geweigerd of is die niet beschikbaar, dan is het startpunt de garage, met een melding.
2. De server action `planRouteActie` krijgt het startpunt (bewuste keuze: een server action zoals de rest van de app, in plaats van een API-route). De server roept de **Google Routes API** `computeRoutes` aan met `travelMode=DRIVE`, `routingPreference=TRAFFIC_AWARE`, `optimizeWaypointOrder=true`, origin = startpunt, destination = garage en intermediates = de stops.
3. Het antwoord bevat de volgorde, de reistijd per deel, de totale tijd en de afstand. De berekende volgorde wordt niet opgeslagen; hij geldt alleen voor dit moment.
4. De knop **"Start route in Google Maps"** opent `https://www.google.com/maps/dir/?api=1&origin=<start>&destination=<garage>&waypoints=<stop1>|<stop2>|…&travelmode=driving` met de stops in de berekende volgorde. Tikken op één stop navigeert alleen naar die stop.
5. **Faalt de Google-aanroep** (fout, tegoed op, timeout van 10 seconden), dan volgt de melding "Volgorde kon niet berekend worden" en opent de knop Maps met de stops in de ingevoerde volgorde.
6. **Geen garage-adres ingesteld:** de volgorde wordt niet berekend. De melding "Er is nog geen garage-adres ingesteld (Beheer → Instellingen). De volgorde is niet berekend." verschijnt, en Maps opent met de stops in de ingevoerde volgorde, eindigend bij de laatste stop.

## 9. Gebruikersinterface

**Algemeen:** donker thema (diepe blauwzwarte achtergrond, licht afgezette kolommen en kaarten, heldere kleuren alleen voor prioriteit, status en primaire acties). Het lettertype is goed leesbaar en wordt bij de bouw vastgelegd. De opmaak is responsive: ontworpen voor de pc en goed bruikbaar op de telefoon.

**Weekbord (kolommen, Trello-stijl)**
- Bovenbalk: bedrijfsnaam (bij de beheerder een bedrijfs- en bordkiezer), weeknummer, ‹ Vorige · Deze week · Volgende ›, en "+ Taak".
- Eén kolom per werkdag van het bedrijf, met dag en datum. Vandaag is gemarkeerd.
- Een kaart toont titel, prioriteit, tijd, 📍 (naam van de stop of "3 stops"; bewuste afwijking: niet het adres), 🔁 bij een herhaling, een statuslabel (Bezig of Klaar) en de labels "uitgesteld van …", "gemist" of "achterstallig".
- Kaarten zijn te **slepen naar een andere dag**. Dat verandert `datum` en, bij een herhaling, ook `afwijkend`.
- "+ Taak" in een kolom vult die dag al in.
- **Telefoon:** één dag tegelijk, swipen tussen dagen, met een dagkiezer bovenaan.

**Taakvenster (aanmaken en bewerken):** titel, omschrijving, dag, tijd (optioneel), prioriteit (5 knoppen), herhalen (keuzelijst met de bijbehorende velden), stops (lijst met verwijderknop, zoekveld en "Vaak gebruikt"). Onderaan staan "Verwijderen" (met bevestiging), "Annuleren" en "Opslaan". Voor de beheerder komen daar de statusknoppen bij (§8.2), plus een uitklapbare historie. Het navigatieblok ("Navigeer" per stop) is bewust voor alle gebruikers zichtbaar, niet alleen voor de beheerder.

**Beheerdersoverzicht "Vandaag":** het startscherm van de beheerder, met alle taken van vandaag van alle bedrijven, gesorteerd op prioriteit en daarna tijd, en per taak de bedrijfsnaam.

**Adminpaneel**
- **Bedrijven:** toevoegen of bewerken: naam, garage-adres (zoeken via Google), werkdagen, ntfy-onderwerp.
- **Borden:** per bedrijf aanmaken, hernoemen, archiveren.
- **Medewerkers:** toevoegen, deactiveren, "Nieuwe link" (link en code met kopieerknop).
- **Locaties:** opgeslagen locaties per bedrijf bekijken, bewerken en verwijderen.
- **Instellingen:** eigen wachtwoord wijzigen, ntfy-onderwerp instellen en een testmelding versturen.

## 10. Foutafhandeling

| Situatie | Gedrag |
|---|---|
| Google Routes faalt | Melding, route in de ingevoerde volgorde (§8.3.5) |
| Google Places faalt | Zoeken in opgeslagen locaties werkt nog. Melding "Adres zoeken tijdelijk niet beschikbaar" |
| GPS geweigerd | Start bij de garage, met melding |
| Meer dan 9 stops | Geblokkeerd bij invoer, en ook op de server gecontroleerd |
| Gelijktijdige bewerking | 409 met herlaadmelding (§7.5) |
| ntfy faalt | Wordt gelogd, de actie gaat door |
| Activatielink ongeldig | Duidelijke melding (§5) |
| Worker heeft een run gemist | Inhalen bij het opstarten (§7.3) |
| Geen toegang (RLS of rol) | 404 bij andermans gegevens (geen informatie lekken), 403 bij een niet toegestane actie |
| Onverwachte serverfout | Algemene melding in de UI, de fout wordt gelogd met een verzoek-id |

Alle invoer wordt op de server gevalideerd met Zod-schema's die gedeeld worden met de formulieren.

## 11. Testen

- **Unit (Vitest):** herhalingsregels (elke X weken, gekozen weekdagen, maandgrenzen zoals de 31e, niet-werkdagen), de berekening van de eerstvolgende werkdag, de doorschuifregels inclusief "gemist", het opbouwen van Google Maps-URL's, de sortering binnen een dag, en het genereren en controleren van activatietokens.
- **Integratie (Vitest + echte PostgreSQL in Docker):** RLS-isolatie (een medewerker van A ziet niets van B, ook niet via directe ID's), de worker-jobs (idempotent, inhalen), versieconflicten, en het blokkeren na mislukte pogingen.
- **End-to-end (Playwright):** activeren → inloggen → taak met 3 stops aanmaken → de beheerder ziet hem live → zet hem op "Bezig" → plant de route (Google-antwoorden nagebootst) → de juiste Maps-URL. Daarnaast: een kaart naar een andere dag slepen, en een herhaling aanmaken en een exemplaar los wijzigen.

## 12. Bouwvolgorde

1. **Kern:** projectopzet, Docker Compose, database en RLS, accounts en activatie, bedrijven, borden, weekbord, taken (CRUD, prioriteit, status, slepen), doorschuiven, herhalingen, live bijwerken, adminpaneel.
2. **Locaties:** stops, Google Places, opgeslagen locaties, de knop "Navigeer".
3. **Route en meldingen:** Google Routes-optimalisatie, Maps-link met meerdere stops, ntfy-meldingen.
4. **Uitrol:** Caddy en HTTPS, back-ups, het commando `maak-beheerder`, en een installatie-instructie in de README.
