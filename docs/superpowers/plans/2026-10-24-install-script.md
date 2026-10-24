# install.sh implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eén script `install.sh` dat een kale Ubuntu/Debian-server helemaal klaarzet. Het installeert Docker, zet de firewall, haalt de code op, vraagt je gegevens, schrijft `.env`, start de stack, maakt de beheerder aan en stelt ntfy in. Draai je het later opnieuw, dan werkt het de installatie bij.

**Architecture:** één bash-script in de root van de repo met kleine functies. De hulpfuncties zonder bijwerkingen worden getest in een `ubuntu:24.04`-container, door het script te laden met `TAKENBORD_ALLEEN_FUNCTIES=1`. Het hoofdverloop kiest de modus (nieuw, hervatten of bijwerken) op basis van `<map>/.env`.

**Tech Stack:** bash 5, Docker Compose (bestaande `docker-compose.yml`), ufw, curl, git, shellcheck (via Docker).

**Spec:** `docs/superpowers/specs/2026-10-24-install-script-design.md`.

## Global Constraints

- **Repository en installatieregel:** de repository is `https://github.com/xclovisx/MaxTasksV1.git`. De installatieregel is `curl -fsSL https://raw.githubusercontent.com/xclovisx/MaxTasksV1/main/install.sh | bash`.
- **Map:** standaard `/opt/takenbord`. Met `TAKENBORD_MAP` overschrijf je die. Start je het script vanuit een checkout (met een `docker-compose.yml` ernaast), dan is de map die van het script.
- **Modi:**
  - geen `.env`: **nieuw**;
  - `.env` zonder `INSTALLATIE_KLAAR=1`: **hervatten**;
  - `.env` met `INSTALLATIE_KLAAR=1`: **bijwerken**, zonder vragen.
- **Vragen:** alle vragen lezen van `/dev/tty`. Het wachtwoord van de beheerder gaat via stdin naar `maak-beheerder.ts`, en het ntfy-wachtwoord via stdin in de ntfy-container. Ze komen nooit in argumenten of in `-e`.
- **`.env`:** rechten 600. `POSTGRES_PASSWORD` is 48 hex-tekens. Het ntfy-account heet `takenbord`, met een gegenereerd wachtwoord van 24 hex-tekens.
- **Firewall:** OpenSSH (en de poort van de huidige SSH-sessie uit `SSH_CONNECTION`), 80/tcp en 443/tcp. SSH wordt altijd vóór `ufw enable` toegestaan.
- **DNS:** een DNS-fout geeft een **waarschuwing** en het script gaat door. Hetzelfde geldt als er na 2 minuten nog geen geldig certificaat is.
- **Fouten:** `set -Eeuo pipefail` met een ERR-trap. Die toont "✗ Stap "<stap>" mislukt", de laatste 30 Docker-logregels (als de stack bestaat) en "draai het script opnieuw". Het script eindigt met `hoofd "$@"; exit $?`.
- Alle teksten zijn Nederlands. Elke commit-boodschap eindigt met `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- **Werkomgeving:** Windows en Git Bash.
  - Docker: zet eerst `export PATH="/c/Users/Max/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"`.
  - Container-mounts: gebruik `MSYS_NO_PATHCONV=1` en `"$(pwd -W)"`.
  - `.gitattributes` houdt `*.sh` op LF; controleer dat met `git ls-files --eol`.
  - Installeer niets op de host. Draai `install.sh` nooit echt op deze pc; alleen de tests in een container.

---

### Task 1: install.sh met geteste hulpfuncties

**Files:**
- Create: `install.sh`
- Create: `tests/install/test-install.sh`

**Interfaces:**
- **Consumes:**
  - `docker-compose.yml`, met de diensten `db`, `migreer`, `app`, `worker`, `ntfy` en `caddy`, en de projectnaam `takenbord`;
  - `src/scripts/maak-beheerder.ts` (`"<naam>" <gebruikersnaam>`; vraagt het wachtwoord via stdin als `BEHEERDER_WACHTWOORD` ontbreekt);
  - `src/scripts/backup.ts`;
  - de ntfy-CLI in de container: `ntfy user add --role=admin`, `ntfy user change-pass` en `ntfy token add`. Wachtwoorden gaan via `NTFY_PASSWORD`, en `token add` schrijft naar stderr.
- **Produces (testbare functies):**
  - `willekeurig N`
  - `is_geldig_domein`
  - `is_geldige_gebruikersnaam`
  - `lees_env_waarde BESTAND SLEUTEL`
  - `zet_env_waarde BESTAND SLEUTEL WAARDE`
  - `bepaal_modus MAP`
  - `standaard_map SCRIPTPAD`

- [ ] **Step 1: Schrijf de falende test**

`tests/install/test-install.sh`:
```bash
#!/usr/bin/env bash
# Test de hulpfuncties van install.sh. Draai in een Linux-container, bijv. vanuit de repo:
#   docker run --rm -v "$PWD":/repo -w /repo ubuntu:24.04 bash tests/install/test-install.sh
set -uo pipefail

TAKENBORD_ALLEEN_FUNCTIES=1
# shellcheck source=../../install.sh
source "$(dirname "$0")/../../install.sh"
set +e

fouten=0
controleer() { # $1 = omschrijving, rest = commando
  local omschrijving="$1"
  shift
  if "$@"; then
    echo "✓ $omschrijving"
  else
    echo "✗ $omschrijving"
    fouten=$((fouten + 1))
  fi
}
is_gelijk() {
  [[ "$1" == "$2" ]] && return 0
  echo "    verwacht: '$2'"
  echo "    gekregen: '$1'"
  return 1
}
verschilt() { [[ "$1" != "$2" ]]; }
heeft_patroon() { [[ "$1" =~ $2 ]]; }
weiger() { ! "$@"; }

controleer "geldig domein" is_geldig_domein takenbord.garagejansen.nl
controleer "geldig domein met streepje" is_geldig_domein mijn-garage.nl
controleer "geen hoofdletters" weiger is_geldig_domein Takenbord.nl
controleer "geen spatie" weiger is_geldig_domein "taken bord.nl"
controleer "geen domein zonder punt" weiger is_geldig_domein localhost
controleer "geen protocol" weiger is_geldig_domein https://takenbord.nl
controleer "geldige gebruikersnaam" is_geldige_gebruikersnaam max.slotje
controleer "te korte gebruikersnaam" weiger is_geldige_gebruikersnaam mx
controleer "gebruikersnaam zonder spaties" weiger is_geldige_gebruikersnaam "max s"

tmp="$(mktemp -d)"
env="$tmp/.env"
zet_env_waarde "$env" DOMEIN takenbord.nl
zet_env_waarde "$env" NTFY_TOKEN ""
zet_env_waarde "$env" DOMEIN nieuw.nl
zet_env_waarde "$env" GEHEIM 'a/b&c\d=e "f"'
controleer "waarde vervangen" is_gelijk "$(lees_env_waarde "$env" DOMEIN)" nieuw.nl
controleer "lege waarde" is_gelijk "$(lees_env_waarde "$env" NTFY_TOKEN)" ""
controleer "speciale tekens blijven heel" is_gelijk "$(lees_env_waarde "$env" GEHEIM)" 'a/b&c\d=e "f"'
controleer "één regel per sleutel" is_gelijk "$(grep -c '^DOMEIN=' "$env")" 1
controleer "alleen leesbaar voor de eigenaar" is_gelijk "$(stat -c %a "$env")" 600
controleer "onbekende sleutel is leeg" is_gelijk "$(lees_env_waarde "$env" ONBEKEND)" ""
controleer "ontbrekend bestand geeft leeg" is_gelijk "$(lees_env_waarde "$tmp/bestaat-niet" X)" ""

controleer "modus nieuw" is_gelijk "$(bepaal_modus "$tmp/leeg")" nieuw
controleer "modus hervatten" is_gelijk "$(bepaal_modus "$tmp")" hervatten
zet_env_waarde "$env" INSTALLATIE_KLAAR 1
controleer "modus bijwerken" is_gelijk "$(bepaal_modus "$tmp")" bijwerken

w="$(willekeurig 24)"
controleer "willekeurig geeft 48 hex-tekens" heeft_patroon "$w" '^[0-9a-f]{48}$'
controleer "willekeurig is telkens anders" verschilt "$(willekeurig 24)" "$w"

mkdir -p "$tmp/checkout"
touch "$tmp/checkout/docker-compose.yml"
controleer "map naast het script" is_gelijk "$(standaard_map "$tmp/checkout/install.sh")" "$tmp/checkout"
controleer "map bij curl | bash" is_gelijk "$(standaard_map "")" /opt/takenbord
controleer "map uit TAKENBORD_MAP" is_gelijk "$(TAKENBORD_MAP=/srv/bord standaard_map "")" /srv/bord

rm -rf "$tmp"
echo
if [[ $fouten -eq 0 ]]; then
  echo "Alle tests geslaagd."
else
  echo "$fouten test(s) mislukt."
  exit 1
fi
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run (met de Docker-PATH):
```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)":/repo -w /repo ubuntu:24.04 bash tests/install/test-install.sh
```
Expected: FAIL. `install.sh` bestaat nog niet, dus `source` faalt en de functies ontbreken.

- [ ] **Step 3: Schrijf install.sh**

`install.sh`:
```bash
#!/usr/bin/env bash
# Installeert het takenbord op een Linux-server (Ubuntu/Debian) of werkt een bestaande installatie bij.
#   curl -fsSL https://raw.githubusercontent.com/xclovisx/MaxTasksV1/main/install.sh | bash
#   of opnieuw vanuit de installatiemap:  bash /opt/takenbord/install.sh
set -Eeuo pipefail

REPO_URL="${TAKENBORD_REPO:-https://github.com/xclovisx/MaxTasksV1.git}"
NTFY_GEBRUIKER="takenbord"
HUIDIGE_STAP="voorbereiden"
MAP=""
SUDO=()
DOCKER=(docker)
DOMEIN=""
GOOGLE=""
NAAM=""
GEBRUIKERSNAAM=""
WACHTWOORD=""

# ---------- uitvoer ----------
stap() {
  HUIDIGE_STAP="$1"
  printf '\n\033[1m▶ %s\033[0m\n' "$1"
}
info() { printf '  %s\n' "$*"; }
waarschuw() { printf '  \033[33m! %s\033[0m\n' "$*"; }
gelukt() { printf '  \033[32m✓ %s\033[0m\n' "$*"; }
stop_met_fout() {
  printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2
  exit 1
}

# ---------- hulpfuncties (getest in tests/install/test-install.sh) ----------
willekeurig() { # $1 = aantal bytes; geeft 2×$1 hex-tekens
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
    echo
  fi
}

is_geldig_domein() { [[ "$1" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]]; }

is_geldige_gebruikersnaam() { [[ "$1" =~ ^[a-z0-9._-]{3,32}$ ]]; }

lees_env_waarde() { # $1 = bestand, $2 = sleutel
  [[ -f "$1" ]] || return 0
  awk -v s="$2" 'index($0, s "=") == 1 { print substr($0, length(s) + 2); exit }' "$1"
}

zet_env_waarde() { # $1 = bestand, $2 = sleutel, $3 = waarde (vervangt of voegt toe; rechten 600)
  local tmp
  tmp="$(mktemp "$1.XXXXXX")"
  if [[ -f "$1" ]]; then
    W="$3" awk -v s="$2" '
      BEGIN { w = ENVIRON["W"]; gezet = 0 }
      index($0, s "=") == 1 { print s "=" w; gezet = 1; next }
      { print }
      END { if (!gezet) print s "=" w }' "$1" >"$tmp"
  else
    printf '%s=%s\n' "$2" "$3" >"$tmp"
  fi
  chmod 600 "$tmp"
  mv "$tmp" "$1"
}

bepaal_modus() { # $1 = map
  local env="$1/.env"
  if [[ ! -f "$env" ]]; then
    echo nieuw
  elif [[ "$(lees_env_waarde "$env" INSTALLATIE_KLAAR)" == 1 ]]; then
    echo bijwerken
  else
    echo hervatten
  fi
}

standaard_map() { # $1 = pad van dit script (leeg bij curl | bash)
  if [[ -n "${TAKENBORD_MAP:-}" ]]; then
    echo "$TAKENBORD_MAP"
  elif [[ -n "$1" && -f "$(dirname "$1")/docker-compose.yml" ]]; then
    (cd "$(dirname "$1")" && pwd)
  else
    echo /opt/takenbord
  fi
}

# ---------- invoer en docker ----------
vraag() { # $1 = variabele, $2 = vraag
  local antwoord
  read -r -p "  $2: " antwoord </dev/tty
  printf -v "$1" '%s' "$antwoord"
}

vraag_wachtwoord() { # $1 = variabele
  local een twee
  while true; do
    read -r -s -p "  Wachtwoord (minimaal 8 tekens): " een </dev/tty
    echo
    read -r -s -p "  Herhaal het wachtwoord: " twee </dev/tty
    echo
    if [[ ${#een} -lt 8 ]]; then
      waarschuw "Te kort."
    elif [[ "$een" != "$twee" ]]; then
      waarschuw "De wachtwoorden zijn niet gelijk."
    else
      break
    fi
  done
  printf -v "$1" '%s' "$een"
}

kies_docker() {
  if [[ $EUID -eq 0 ]] || docker info >/dev/null 2>&1; then
    DOCKER=(docker)
  else
    DOCKER=(sudo docker)
  fi
}

dc() { "${DOCKER[@]}" compose --project-directory "$MAP" -f "$MAP/docker-compose.yml" "$@"; }

bij_fout() {
  local code=$?
  printf '\n\033[31m✗ Stap "%s" mislukt (regel %s, code %s).\033[0m\n' "$HUIDIGE_STAP" "$1" "$code" >&2
  if [[ -n "$MAP" && -f "$MAP/.env" ]] && command -v docker >/dev/null 2>&1; then
    info "Laatste logregels:" >&2
    dc logs --tail=30 2>&1 | sed 's/^/    /' >&2 || true
  fi
  info "Los het probleem op en draai het script opnieuw; het gaat verder waar het gebleven was." >&2
  exit "$code"
}

# ---------- stappen ----------
controleer_systeem() {
  stap "Systeem controleren"
  [[ "$(uname -s)" == Linux ]] || stop_met_fout "Dit script werkt alleen op Linux."
  command -v apt-get >/dev/null || stop_met_fout "Alleen Ubuntu en Debian (apt-get) worden ondersteund."
  [[ -r /dev/tty ]] || stop_met_fout "Geen terminal gevonden; start het script vanuit een SSH-sessie."
  if [[ $EUID -ne 0 ]]; then
    command -v sudo >/dev/null || stop_met_fout "sudo is nodig (of draai het script als root)."
    SUDO=(sudo)
    sudo -v </dev/tty
  fi
  gelukt "Linux met apt-get"
}

vraag_instellingen() {
  stap "Gegevens"
  while true; do
    vraag DOMEIN "Domeinnaam van het takenbord (bijv. takenbord.jouwdomein.nl)"
    DOMEIN="${DOMEIN,,}"
    is_geldig_domein "$DOMEIN" && break
    waarschuw "Dat is geen geldige domeinnaam."
  done
  vraag GOOGLE "Google Maps API-sleutel (optioneel, Enter om over te slaan)"
}

vraag_beheerder() {
  info "Je beheerdersaccount:"
  while [[ -z "$NAAM" ]]; do vraag NAAM "Je naam"; done
  while true; do
    vraag GEBRUIKERSNAAM "Gebruikersnaam (3 tot 32 tekens: a-z, 0-9, . _ -)"
    GEBRUIKERSNAAM="${GEBRUIKERSNAAM,,}"
    is_geldige_gebruikersnaam "$GEBRUIKERSNAAM" && break
    waarschuw "Ongeldige gebruikersnaam."
  done
  vraag_wachtwoord WACHTWOORD
}

installeer_pakketten() {
  stap "Benodigde pakketten installeren"
  "${SUDO[@]}" apt-get update -qq
  "${SUDO[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl openssl ca-certificates ufw >/dev/null
  gelukt "git, curl, openssl en ufw"
}

installeer_docker() {
  stap "Docker installeren"
  if command -v docker >/dev/null 2>&1 && "${SUDO[@]}" docker compose version >/dev/null 2>&1; then
    gelukt "Docker is al aanwezig"
  else
    curl -fsSL https://get.docker.com | "${SUDO[@]}" sh
    gelukt "Docker geïnstalleerd"
  fi
  if [[ $EUID -ne 0 ]] && ! grep -qw docker <<<"$(id -nG)"; then
    "${SUDO[@]}" usermod -aG docker "$(id -un)"
    info "Je bent toegevoegd aan de groep docker (actief na opnieuw inloggen)."
  fi
  kies_docker
}

zet_firewall() {
  stap "Firewall instellen"
  "${SUDO[@]}" ufw allow OpenSSH >/dev/null 2>&1 || "${SUDO[@]}" ufw allow 22/tcp >/dev/null
  if [[ -n "${SSH_CONNECTION:-}" ]]; then
    "${SUDO[@]}" ufw allow "$(awk '{ print $4 }' <<<"$SSH_CONNECTION")/tcp" >/dev/null
  fi
  "${SUDO[@]}" ufw allow 80/tcp >/dev/null
  "${SUDO[@]}" ufw allow 443/tcp >/dev/null
  "${SUDO[@]}" ufw --force enable >/dev/null
  gelukt "SSH, 80 en 443 open; de rest dicht"
}

haal_code() {
  stap "Code ophalen"
  if [[ -d "$MAP/.git" ]]; then
    gelukt "De code staat al in $MAP"
    return
  fi
  "${SUDO[@]}" mkdir -p "$MAP"
  "${SUDO[@]}" chown "$(id -u):$(id -g)" "$MAP"
  git clone --quiet "$REPO_URL" "$MAP"
  gelukt "De code staat in $MAP"
}

controleer_dns() {
  stap "DNS controleren"
  local ip naam
  ip="$(curl -fsS --max-time 5 https://api.ipify.org || true)"
  if [[ -z "$ip" ]]; then
    waarschuw "Kon het publieke IP-adres niet bepalen; DNS-controle overgeslagen."
    return
  fi
  for naam in "$DOMEIN" "ntfy.$DOMEIN"; do
    if grep -qx "$ip" <<<"$(getent ahostsv4 "$naam" | awk '{ print $1 }' || true)"; then
      gelukt "$naam wijst naar $ip"
    else
      waarschuw "$naam wijst (nog) niet naar $ip. Maak een A-record aan; HTTPS werkt zodra de DNS klopt."
    fi
  done
}

schrijf_env() {
  stap "Configuratie schrijven"
  local env="$MAP/.env"
  zet_env_waarde "$env" DOMEIN "$DOMEIN"
  zet_env_waarde "$env" POSTGRES_PASSWORD "$(willekeurig 24)"
  zet_env_waarde "$env" GOOGLE_MAPS_API_KEY "$GOOGLE"
  zet_env_waarde "$env" NTFY_TOKEN ""
  gelukt "$env (alleen leesbaar voor jou)"
}

start_stack() {
  stap "Takenbord bouwen en starten (dit duurt een paar minuten)"
  dc up -d --build
  gelukt "De containers draaien"
}

wacht_op_site() {
  stap "Wachten tot het takenbord antwoordt"
  local domein i
  domein="$(lees_env_waarde "$MAP/.env" DOMEIN)"
  for i in $(seq 1 100); do
    if curl -skf --max-time 5 --resolve "$domein:443:127.0.0.1" -o /dev/null "https://$domein/login"; then break; fi
    if [[ $i -eq 100 ]]; then
      stop_met_fout "Het takenbord antwoordt niet. Bekijk de logs met: docker compose -f $MAP/docker-compose.yml logs app caddy"
    fi
    sleep 3
  done
  gelukt "De app draait"
  for i in $(seq 1 24); do
    if curl -sf --max-time 5 --resolve "$domein:443:127.0.0.1" -o /dev/null "https://$domein/login"; then
      gelukt "Het HTTPS-certificaat is geldig"
      return
    fi
    sleep 5
  done
  waarschuw "Nog geen geldig HTTPS-certificaat. Controleer of de DNS naar deze server wijst en of poort 80 en 443 open staan; Caddy probeert het vanzelf opnieuw."
}

beheerder_bestaat() {
  local aantal
  aantal="$(dc exec -T db psql -U takenbord -d takenbord -tAc "select count(*) from gebruikers where rol = 'beheerder'")"
  [[ "${aantal//[[:space:]]/}" -gt 0 ]]
}

maak_beheerder() {
  stap "Beheerdersaccount aanmaken"
  if beheerder_bestaat; then
    gelukt "Er is al een beheerder"
    return
  fi
  [[ -n "$GEBRUIKERSNAAM" ]] || vraag_beheerder
  # Het wachtwoord gaat via stdin: niet in argumenten of omgevingsvariabelen.
  printf '%s\n' "$WACHTWOORD" | dc run --rm --no-deps -T worker npx tsx src/scripts/maak-beheerder.ts "$NAAM" "$GEBRUIKERSNAAM" >/dev/null
  gelukt "Beheerder $GEBRUIKERSNAAM aangemaakt"
}

stel_ntfy_in() {
  stap "Meldingen (ntfy) instellen"
  local env="$MAP/.env" wachtwoord uitvoer token
  if [[ -n "$(lees_env_waarde "$env" NTFY_TOKEN)" ]]; then
    gelukt "ntfy is al ingesteld"
    return
  fi
  wachtwoord="$(willekeurig 12)"
  uitvoer="$(dc exec -T ntfy ntfy user list 2>&1 || true)"
  # shellcheck disable=SC2016 # $0 en $(cat) worden in de container uitgevoerd
  if grep -q "user $NTFY_GEBRUIKER " <<<"$uitvoer"; then
    printf '%s' "$wachtwoord" | dc exec -T ntfy sh -c 'NTFY_PASSWORD="$(cat)" ntfy user change-pass "$0"' "$NTFY_GEBRUIKER" >/dev/null 2>&1
  else
    printf '%s' "$wachtwoord" | dc exec -T ntfy sh -c 'NTFY_PASSWORD="$(cat)" ntfy user add --role=admin "$0"' "$NTFY_GEBRUIKER" >/dev/null 2>&1
  fi
  uitvoer="$(dc exec -T ntfy ntfy token add "$NTFY_GEBRUIKER" 2>&1)"
  token="$(grep -oE 'tk_[A-Za-z0-9]+' <<<"$uitvoer" | head -n1 || true)"
  [[ -n "$token" ]] || stop_met_fout "Kon geen ntfy-token aanmaken: $uitvoer"
  zet_env_waarde "$env" NTFY_GEBRUIKER "$NTFY_GEBRUIKER"
  zet_env_waarde "$env" NTFY_WACHTWOORD "$wachtwoord"
  zet_env_waarde "$env" NTFY_TOKEN "$token"
  dc up -d app >/dev/null
  gelukt "ntfy-gebruiker en token aangemaakt"
}

werk_bij() {
  kies_docker
  stap "Controleren op lokale wijzigingen"
  if [[ -n "$(git -C "$MAP" status --porcelain)" ]]; then
    stop_met_fout "Er zijn lokale wijzigingen in $MAP. Zet ze opzij (git -C $MAP stash) en draai het script opnieuw."
  fi
  gelukt "Geen lokale wijzigingen"
  stap "Back-up maken"
  if dc exec -T worker npx tsx src/scripts/backup.ts; then
    gelukt "Back-up gemaakt"
  else
    waarschuw "Back-up mislukt (draait de worker?); bijwerken gaat door."
  fi
  stap "Nieuwste versie ophalen"
  git -C "$MAP" pull --ff-only --quiet
  gelukt "Bijgewerkt naar $(git -C "$MAP" log -1 --format='%h %s')"
  start_stack
  "${DOCKER[@]}" image prune -f >/dev/null
  wacht_op_site
}

samenvatting() {
  local env="$MAP/.env" domein
  domein="$(lees_env_waarde "$env" DOMEIN)"
  printf '\n\033[1mKlaar!\033[0m\n'
  info "Takenbord:    https://$domein"
  info "ntfy-server:  https://ntfy.$domein (gebruiker $(lees_env_waarde "$env" NTFY_GEBRUIKER), wachtwoord $(lees_env_waarde "$env" NTFY_WACHTWOORD))"
  info "              Voeg deze server toe in de ntfy-app en kies het onderwerp in Beheer → Instellingen → Meldingen."
  info "Back-ups:     elke nacht om 03:00 (bekijken: docker compose -f $MAP/docker-compose.yml exec worker ls /backups)"
  info "Bijwerken:    draai dit script opnieuw: bash $MAP/install.sh"
}

hoofd() {
  MAP="$(standaard_map "${BASH_SOURCE[0]:-}")"
  trap 'bij_fout $LINENO' ERR
  printf '\033[1mTakenbord installeren of bijwerken\033[0m (map: %s)\n' "$MAP"
  case "$(bepaal_modus "$MAP")" in
    bijwerken)
      werk_bij
      ;;
    nieuw)
      controleer_systeem
      vraag_instellingen
      vraag_beheerder
      installeer_pakketten
      installeer_docker
      zet_firewall
      haal_code
      controleer_dns
      schrijf_env
      start_stack
      wacht_op_site
      maak_beheerder
      stel_ntfy_in
      ;;
    hervatten)
      controleer_systeem
      installeer_docker
      start_stack
      wacht_op_site
      maak_beheerder
      stel_ntfy_in
      ;;
  esac
  zet_env_waarde "$MAP/.env" INSTALLATIE_KLAAR 1
  samenvatting
}

# Pas aan het eind aanroepen: een half gedownload script doet zo niets, en `git pull` breekt het lopende script niet.
if [[ "${TAKENBORD_ALLEEN_FUNCTIES:-}" != 1 ]]; then
  hoofd "$@"
  exit $?
fi
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

Run:
```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)":/repo -w /repo ubuntu:24.04 bash tests/install/test-install.sh
```
Expected: alle regels ✓ en `Alle tests geslaagd.` (zonder openssl in het image, dus de terugvalroute van `willekeurig` wordt getest).

Run (shellcheck):
```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)":/mnt -w /mnt koalaman/shellcheck:v0.10.0 -x install.sh tests/install/test-install.sh scripts/rooktest-productie.sh
```
Expected: geen meldingen. Los echte meldingen op. Een melding die bewust is, krijgt een `# shellcheck disable=SCxxxx # reden`-regel en komt in je rapport.

Run: `git add install.sh tests/install/test-install.sh` en daarna `git ls-files --eol install.sh tests/install/test-install.sh`
Expected: `i/lf w/lf attr/text eol=lf` voor beide.

Run: `npm test`
Expected: groen (ongewijzigd).

- [ ] **Step 5: Commit**

```bash
git add install.sh tests/install/test-install.sh
git commit -m "feat: install.sh die de server installeert en bijwerkt" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: README en spec bijwerken

**Files:**
- Modify: `README.md` (sectie "Installeren op een server", "Bijwerken", "Testen")
- Modify: `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md` (§3: bullet over het installatiescript)

**Interfaces:**
- Consumes: `install.sh` en `tests/install/test-install.sh` uit Task 1.
- Produces: documentatie.

- [ ] **Step 1: README**

In `README.md`, direct onder de kop `## Installeren op een server` en de eerste alinea, vóór `### 1. Server voorbereiden`, toevoegen:
````markdown
### Snel: met het installatiescript (aanbevolen)

1. Laat je domein én `ntfy.<domein>` met een A-record naar het IP-adres van de server wijzen.
2. Log via SSH in op de server (als gebruiker met sudo, of als root) en draai:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/xclovisx/MaxTasksV1/main/install.sh | bash
   ```
3. Beantwoord de vragen (domeinnaam, je naam, gebruikersnaam en wachtwoord, optioneel de Google-sleutel).

Het script installeert Docker, zet de firewall (alleen SSH, 80 en 443), haalt de code op in `/opt/takenbord`, schrijft `.env`, start alles, maakt je beheerdersaccount aan en regelt HTTPS, ntfy en de nachtelijke back-ups. Aan het eind zie je het adres van het takenbord en de ntfy-gegevens voor de app.

**Bijwerken:** draai dezelfde regel opnieuw (of `bash /opt/takenbord/install.sh`). Het script maakt eerst een back-up en haalt dan de nieuwste versie op. Wordt een installatie halverwege afgebroken, dan gaat het script bij de volgende keer verder waar het gebleven was.

### Handmatig (naslag)

De stappen hieronder doet het script voor je; ze staan hier voor als je iets zelf wilt doen of wilt begrijpen.
````
Pas onder "### Bijwerken" (de bestaande sectie) de eerste regel aan zodat die begint met: `Met het script: \`bash /opt/takenbord/install.sh\`. Handmatig:` gevolgd door de bestaande commando's.

Voeg in de sectie "## Testen" (in het codeblok, of als regel eronder) toe:
```bash
docker run --rm -v "$PWD":/repo -w /repo ubuntu:24.04 bash tests/install/test-install.sh   # hulpfuncties van install.sh
```

- [ ] **Step 2: Spec**

In `docs/superpowers/specs/2026-10-22-garage-takenbord-design.md` §3, onder de bullet "**Eerste beheerder:** …", toevoegen:
```markdown
- **Installatiescript:** `install.sh` (openbare repo `xclovisx/MaxTasksV1`) zet een kale Ubuntu/Debian-server klaar via `curl … | bash` en werkt een bestaande installatie bij als het opnieuw draait. Zie `docs/superpowers/specs/2026-10-24-install-script-design.md`.
```

- [ ] **Step 3: Controleer**

Lees de README-sectie na tegen `install.sh`: kloppen de map, de vragen, het commando om bij te werken en de installatieregel? Run `npm test`. Expected: groen.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-10-22-garage-takenbord-design.md
git commit -m "docs: installatiescript in README en spec" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
