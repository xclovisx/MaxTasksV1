# install.sh: ontwerp

**Datum:** 2026-10-24. **Aanvraag van Max:** één script dat de server helemaal installeert, en dat hij later opnieuw kan draaien om bij te werken. De repository is openbaar: `https://github.com/xclovisx/MaxTasksV1`.

## 1. Gebruik

```
curl -fsSL https://raw.githubusercontent.com/xclovisx/MaxTasksV1/main/install.sh | bash
```
Dit kan als gewone gebruiker met sudo-rechten of als root, op Ubuntu of Debian. Opnieuw draaien (dezelfde regel, of `bash /opt/takenbord/install.sh`) werkt de installatie bij.

## 2. Modi

De modus wordt bepaald door `<map>/.env`:

| Situatie | Modus |
|---|---|
| geen `.env` | **nieuw** |
| `.env` zonder `INSTALLATIE_KLAAR=1` | **hervatten**: de ontbrekende stappen (beheerder, ntfy) alsnog doen |
| `.env` met `INSTALLATIE_KLAAR=1` | **bijwerken**: zonder vragen |

**De map:**
- Standaard is dat `/opt/takenbord`. Je kunt een andere kiezen met `TAKENBORD_MAP`.
- Wordt het script vanuit een bestaande checkout gestart (`bash /pad/install.sh`, met een `docker-compose.yml` ernaast), dan is de map die van het script.

## 3. Stappen bij een nieuwe installatie

1. **Controles:** Linux met `apt-get`, en sudo als je geen root bent.
2. **Pakketten:** `git`, `curl`, `openssl`, `ca-certificates` en `ufw`.
3. **Docker:**
   - installeren via get.docker.com, als het er nog niet is;
   - de gebruiker toevoegen aan de groep `docker`;
   - het script zelf gebruikt `sudo docker` zolang de groep nog niet actief is.
4. **Firewall:** ufw met OpenSSH, 80/tcp en 443/tcp toegestaan, daarna aanzetten. SSH gaat altijd eerst open.
5. **Code:** `git clone` naar de map, met de gebruiker als eigenaar.
6. **Vragen:** de vragen lezen van `/dev/tty`, zodat `curl | bash` werkt.
   - **domeinnaam:** verplicht, wordt gecontroleerd en in kleine letters gezet;
   - **naam** en **gebruikersnaam** van de beheerder (`[a-z0-9._-]{3,32}`, zelfde regel als de app);
   - **wachtwoord:** minimaal 8 tekens, twee keer intypen;
   - **Google-sleutel:** optioneel.
7. **DNS-controle:** wijzen `DOMEIN` en `ntfy.DOMEIN` al naar het publieke IP van deze server? Zo niet, dan volgt een **waarschuwing** en gaat het script door. Caddy haalt het certificaat vanzelf op zodra de DNS klopt.
8. **`.env`:** het script schrijft `.env` met rechten 600:
   - `DOMEIN`;
   - `POSTGRES_PASSWORD`: 48 hex-tekens, gegenereerd;
   - `GOOGLE_MAPS_API_KEY`;
   - `NTFY_TOKEN`: leeg.
9. **Starten:** `docker compose up -d --build`.
10. **Wachten op de site:**
    - eerst tot de app via Caddy antwoordt, ook met een nog niet geldig certificaat (max 5 min);
    - daarna maximaal 2 min op een geldig certificaat. Komt dat niet, dan volgt een waarschuwing met tips (poorten 80/443, DNS).
11. **Beheerder:** alleen als er nog geen beheerder in de database staat. Het wachtwoord gaat via stdin naar `maak-beheerder.ts`, dus nooit in argumenten of omgevingsvariabelen.
12. **ntfy:** alleen als `NTFY_TOKEN` leeg is.
    - Het script maakt de gebruiker `takenbord` met een gegenereerd wachtwoord aan, of wijzigt dat wachtwoord als de gebruiker al bestaat. Ook dit wachtwoord gaat via stdin.
    - Het maakt een token aan en zet `NTFY_TOKEN`, `NTFY_GEBRUIKER` en `NTFY_WACHTWOORD` in `.env`.
    - Daarna `docker compose up -d app`, zodat de app het token oppikt.
13. **Afronden:** het script zet `INSTALLATIE_KLAAR=1` en toont een samenvatting:
    - het adres van het takenbord;
    - de ntfy-server, gebruiker en wachtwoord voor in de app;
    - de map met back-ups;
    - "draai dit script opnieuw om bij te werken".

## 4. Bijwerken

1. Zijn er lokale wijzigingen in de code (`git status --porcelain`)? Dan stopt het script met een melding.
2. Een back-up via de worker (`src/scripts/backup.ts`). Draait de worker niet, dan volgt een waarschuwing en gaat het script door.
3. `git pull --ff-only`, daarna `docker compose up -d --build` en `docker image prune -f`.
4. Wachten op de site, gevolgd door een korte samenvatting.

## 5. Foutafhandeling

- `set -euo pipefail`. Bij een fout toont het script:
  - "✗ Stap '<stap>' mislukt";
  - een tip;
  - de laatste 30 logregels van Docker, als de stack al bestaat.
- Elke stap kan veilig nogmaals draaien. Een afgebroken installatie gaat bij de volgende keer verder in de modus "hervatten".
- Het hele script staat in functies en wordt pas aan het eind aangeroepen, met `hoofd "$@"; exit`. Zo draait een half gedownload script niet, en breekt `git pull` het lopende script niet.

## 6. Testen

- **Shellcheck:** `install.sh` gaat foutloos door shellcheck, via de Docker-image `koalaman/shellcheck:v0.10.0`.
- **Hulpfuncties:** `tests/install/test-install.sh` test ze in een `ubuntu:24.04`-container. Het script laadt `install.sh` met `TAKENBORD_ALLEEN_FUNCTIES=1`, zodat alleen de functies worden ingelezen. Getest worden:
  - domeinvalidatie;
  - `.env` lezen en bijwerken, ook met speciale tekens;
  - de modus kiezen;
  - een willekeurige hex-reeks maken;
  - de standaardmap bepalen.
- **Niet getest:** de volledige installatie op een kale server. Die is niet lokaal te testen. De stack zelf is gedekt door `scripts/rooktest-productie.sh`.

## 7. Buiten scope

- sslip.io-hostnamen. Max koppelt zelf een domein; de handmatige README-stappen noemen sslip.io nog als alternatief.
- Andere distributies dan Debian en Ubuntu.
