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
FIREWALL_UIT=0
OPSLAG_MARKER=".takenbord-opslag"

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
  tmp="$(mktemp "$1.XXXXXX")" || return 1
  if [[ -f "$1" ]]; then
    W="$3" awk -v s="$2" '
      BEGIN { w = ENVIRON["W"]; gezet = 0 }
      index($0, s "=") == 1 { print s "=" w; gezet = 1; next }
      { print }
      END { if (!gezet) print s "=" w }' "$1" >"$tmp" || {
      rm -f "$tmp"
      return 1
    }
  else
    printf '%s=%s\n' "$2" "$3" >"$tmp" || {
      rm -f "$tmp"
      return 1
    }
  fi
  if ! chmod 600 "$tmp" || ! mv "$tmp" "$1"; then
    rm -f "$tmp"
    return 1
  fi
}

env_heeft_sleutel() { # $1 = bestand, $2 = sleutel; ook waar bij een lege waarde
  [[ -f "$1" ]] && grep -q "^$2=" "$1"
}

opslag_pad_probleem() { # $1 = pad; leeg als het bruikbaar is
  if [[ "$1" != /* || "$1" == / ]]; then
    echo "Gebruik een volledig pad dat met / begint, bijv. /mnt/opslag/takenbord."
  elif [[ ! "$1" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
    echo "Gebruik alleen letters, cijfers en . _ - / in het pad."
  elif [[ ! -d "$(dirname "$1")" ]]; then
    echo "De map $(dirname "$1") bestaat niet. Is de schijf aangekoppeld?"
  fi
}

op_systeemschijf() { # $1 = bestaande map; waar als die op hetzelfde bestandssysteem staat als /
  [[ "$(df --output=source "$1" | tail -1)" == "$(df --output=source / | tail -1)" ]]
}

te_controleren_map() { # $1 = pad; de map zelf als die al bestaat, anders de bovenliggende map
  if [[ -d "$1" ]]; then echo "$1"; else dirname "$1"; fi
}

bepaal_modus() { # $1 = map; geeft nieuw, hervatten, bijwerken of onleesbaar
  local env="$1/.env"
  if [[ -e "$env" || -L "$env" ]] && { [[ ! -f "$env" ]] || [[ ! -r "$env" ]]; }; then
    echo onleesbaar
  elif [[ ! -f "$env" ]]; then
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
  elif [[ -n "$1" && -f "$1" && -f "$(dirname "$1")/docker-compose.yml" ]]; then
    (cd "$(dirname "$1")" && pwd)
  else
    echo /opt/takenbord
  fi
}

eigenaar_klopt() { # $1 = map, $2 = uid van de huidige gebruiker; goed als de map nog niet bestaat of van die uid is (ook voor root)
  [[ ! -d "$1" || "$(stat -c %u "$1")" -eq "$2" ]]
}

ssh_poorten() { # $1 = uitvoer van sshd -T, $2 = SSH_CONNECTION, $3 = uitvoer van ss -tlnpH; geeft de unieke poorten van alle bronnen samen
  {
    awk '$1 == "port" { print $2 }' <<<"$1"
    awk '$1 == "listenaddress" { n = split($2, d, ":"); print d[n] }' <<<"$1"
    awk 'index($0, "\"sshd\"") { n = split($4, d, ":"); print d[n] }' <<<"$3"
    if [[ -n "$2" ]]; then
      awk '{ print $4 }' <<<"$2"
    fi
  } | grep -E '^[0-9]+$' | sort -nu || true
}

heeft_oude_data() { "${DOCKER[@]}" volume inspect takenbord_db-data >/dev/null 2>&1; }

systeem_probleem() { # $1 = ID, $2 = VERSION_ID (uit /etc/os-release), $3 = uname -m; leeg als Docker hier draait
  local versie
  case "$3" in
    x86_64 | aarch64) ;;
    *)
      echo "Een 64-bit systeem (x86_64 of aarch64) is nodig; dit is $3."
      return
      ;;
  esac
  case "$1" in
    ubuntu)
      versie=$((10#${2%%.*} * 100 + 10#${2#*.}))
      if ((versie < 2204)); then
        echo "Ubuntu $2 is te oud: Docker ondersteunt alleen Ubuntu 22.04 of nieuwer. Werk de server bij (sudo do-release-upgrade) of installeer Ubuntu 24.04 LTS en draai dit script opnieuw."
      fi
      ;;
    debian)
      if [[ ! "$2" =~ ^[0-9]+$ ]]; then
        echo "Een onbekende Debian-versie (testing/sid?); gebruik Debian 12 of nieuwer."
      elif ((10#$2 < 12)); then
        echo "Debian $2 is te oud: Docker ondersteunt alleen Debian 12 of nieuwer. Werk de server bij en draai dit script opnieuw."
      fi
      ;;
    *)
      echo "Alleen Ubuntu (22.04 of nieuwer) en Debian (12 of nieuwer) worden ondersteund; dit is '$1'."
      ;;
  esac
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
    IFS= read -r -s -p "  Wachtwoord (minimaal 8 tekens): " een </dev/tty
    echo
    IFS= read -r -s -p "  Herhaal het wachtwoord: " twee </dev/tty
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
  # In een subshell (bijv. $(...)) verschijnt de fout ook in de hoofdshell; daar alleen de code doorgeven.
  if [[ $BASH_SUBSHELL -gt 0 ]]; then exit "$code"; fi
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
  local id="" versie="" probleem
  if [[ -r /etc/os-release ]]; then
    id="$(awk -F= '$1 == "ID" { gsub(/"/, "", $2); print $2 }' /etc/os-release)"
    versie="$(awk -F= '$1 == "VERSION_ID" { gsub(/"/, "", $2); print $2 }' /etc/os-release)"
  fi
  probleem="$(systeem_probleem "$id" "$versie" "$(uname -m)")"
  [[ -z "$probleem" ]] || stop_met_fout "$probleem"
  { : </dev/tty; } 2>/dev/null || stop_met_fout "Geen terminal gevonden; start het script vanuit een SSH-sessie."
  if [[ $EUID -ne 0 ]]; then
    command -v sudo >/dev/null || stop_met_fout "sudo is nodig (of draai het script als root)."
    SUDO=(sudo)
    # shellcheck disable=SC2024 # bewust: sudo moet het wachtwoord van de terminal lezen, ook bij curl | bash
    sudo -v </dev/tty
  fi
  gelukt "$id $versie ($(uname -m))"
}

vraag_instellingen() {
  stap "Gegevens"
  while true; do
    vraag DOMEIN "Domeinnaam van het takenbord (bijv. takenbord.jouwdomein.nl; nog geen domein? gebruik <ip-met-streepjes>.sslip.io)"
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
  # SSH eerst openzetten, voordat de firewall aangaat. SSH_CONNECTION ontbreekt na sudo of su -,
  # dus ook de poorten van sshd zelf meenemen.
  local uit_sshd uit_ss poorten poort
  uit_sshd="$("${SUDO[@]}" sshd -T 2>/dev/null || true)"
  uit_ss="$("${SUDO[@]}" ss -tlnpH 2>/dev/null || true)"
  poorten="$(ssh_poorten "$uit_sshd" "${SSH_CONNECTION:-}" "$uit_ss")"
  local zeker=1
  if [[ -z "$poorten" ]]; then
    zeker=0
    poorten=22
  fi
  for poort in $poorten; do
    "${SUDO[@]}" ufw allow "$poort/tcp" >/dev/null
    info "SSH-poort $poort opengezet"
  done
  "${SUDO[@]}" ufw allow 80/tcp >/dev/null
  "${SUDO[@]}" ufw allow 443/tcp >/dev/null
  if [[ $zeker -eq 0 ]]; then
    # Zonder bekende SSH-poort de firewall niet aanzetten: dan sluit je jezelf mogelijk buiten.
    FIREWALL_UIT=1
    waarschuw "Kon de SSH-poort niet bepalen. Ik heb 22, 80 en 443 opengezet maar de firewall NIET aangezet. Controleer op welke poort SSH draait (bijv. met: sudo ss -tlnp | grep sshd) en voer dan uit: sudo ufw allow <poort>/tcp && sudo ufw enable"
    return
  fi
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
  local env="$MAP/.env" nieuw wachtwoord
  # Eerst een volledig bestand naast .env bouwen en dan in één keer op zijn plek zetten,
  # zodat een onderbreking nooit een half .env achterlaat (dan zou "hervatten" falen).
  wachtwoord="$(willekeurig 24)"
  nieuw="$(mktemp "$env.XXXXXX")"
  if ! { zet_env_waarde "$nieuw" DOMEIN "$DOMEIN" &&
    zet_env_waarde "$nieuw" POSTGRES_PASSWORD "$wachtwoord" &&
    zet_env_waarde "$nieuw" GOOGLE_MAPS_API_KEY "$GOOGLE" &&
    zet_env_waarde "$nieuw" NTFY_TOKEN "" &&
    chmod 600 "$nieuw" &&
    mv "$nieuw" "$env"; }; then
    rm -f "$nieuw"
    return 1
  fi
  gelukt "$env (alleen leesbaar voor jou)"
}

verhuis_backups() { # $1 = nieuwe back-upmap; kopieert eenmalig uit het oude volume, overschrijft niets
  "${DOCKER[@]}" volume inspect takenbord_backups >/dev/null 2>&1 || return 0
  info "Bestaande back-ups overzetten…"
  # shellcheck disable=SC2016 # $f wordt in de container uitgewerkt
  "${DOCKER[@]}" run --rm --pull never --user 1000:1000 --entrypoint sh -v takenbord_backups:/oud:ro -v "$1":/nieuw takenbord-worker \
    -c 'for f in /oud/*.dump; do [ -e "$f" ] || continue; [ -e "/nieuw/${f##*/}" ] || cp "$f" /nieuw/ || exit 1; done' ||
    stop_met_fout "De back-ups konden niet worden gekopieerd naar $1. Er is niets verloren: het oude volume takenbord_backups is niet aangeraakt. Controleer de schijf en draai het script opnieuw."
  gelukt "Back-ups overgezet (het oude volume takenbord_backups blijft bestaan; zie README)"
}

controleer_opslag() {
  local env="$MAP/.env" map
  [[ "$(lees_env_waarde "$env" OPSLAG_CONTROLE)" == 1 ]] || return 0
  for map in "$(lees_env_waarde "$env" BIJLAGEN_OPSLAG)" "$(lees_env_waarde "$env" BACKUP_OPSLAG)"; do
    [[ -f "$map/$OPSLAG_MARKER" ]] ||
      stop_met_fout "Het controlebestand $map/$OPSLAG_MARKER ontbreekt. Is de opslagschijf aangekoppeld? Controleer met: df -h $map"
  done
}

stel_opslag_in() {
  local env="$MAP/.env" pad="" probleem antwoord
  if env_heeft_sleutel "$env" OPSLAG_MAP; then
    controleer_opslag
    return
  fi
  stap "Opslag voor bijlagen en back-ups"
  info "Heeft de server een tweede schijf? Bewaar bijlagen en back-ups daar, dan ben je niet alles kwijt als één schijf kapotgaat."
  while true; do
    vraag pad "Map voor bijlagen en back-ups (bijv. /mnt/opslag/takenbord; Enter = systeemschijf)"
    pad="${pad%/}"
    [[ -z "$pad" ]] && break
    probleem="$(opslag_pad_probleem "$pad")"
    if [[ -n "$probleem" ]]; then
      waarschuw "$probleem"
      continue
    fi
    if op_systeemschijf "$(te_controleren_map "$pad")"; then
      vraag antwoord "Die map staat op de systeemschijf. Toch gebruiken? (j/n)"
      [[ "${antwoord,,}" == j* ]] || continue
    fi
    break
  done
  if [[ -z "$pad" ]]; then
    zet_env_waarde "$env" OPSLAG_MAP ""
    gelukt "Bijlagen en back-ups blijven op de systeemschijf"
    return
  fi
  # bij bijwerken is controleer_systeem niet gedraaid; zonder root is sudo nodig op de tweede schijf
  if [[ $EUID -ne 0 && ${#SUDO[@]} -eq 0 ]]; then SUDO=(sudo); fi
  "${SUDO[@]}" mkdir -p "$pad/bijlagen" "$pad/backups"
  "${SUDO[@]}" touch "$pad/bijlagen/$OPSLAG_MARKER" "$pad/backups/$OPSLAG_MARKER"
  "${SUDO[@]}" chown -R 1000:1000 "$pad/bijlagen" "$pad/backups"
  verhuis_backups "$pad/backups"
  zet_env_waarde "$env" BIJLAGEN_OPSLAG "$pad/bijlagen"
  zet_env_waarde "$env" BACKUP_OPSLAG "$pad/backups"
  zet_env_waarde "$env" OPSLAG_CONTROLE 1
  zet_env_waarde "$env" OPSLAG_MAP "$pad" # als laatste: pas dan is deze stap af
  gelukt "Bijlagen en back-ups komen in $pad"
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
  # De app zelf bevragen, binnen de container: dit heeft geen HTTPS-certificaat nodig,
  # dus een DNS-probleem levert straks een waarschuwing op in plaats van een afgebroken installatie.
  for i in $(seq 1 100); do
    if dc exec -T app node -e "fetch('http://127.0.0.1:3000/login',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" >/dev/null 2>&1; then break; fi
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
  if [[ "${TAKENBORD_NA_PULL:-}" != 1 ]]; then
    stap "Controleren op lokale wijzigingen"
    local wijzigingen voor
    wijzigingen="$(git -C "$MAP" status --porcelain)" ||
      stop_met_fout "Kon niet bepalen of er lokale wijzigingen zijn in $MAP (git status mislukte). Controleer of je de eigenaar van de map bent en of het een git-map is."
    if [[ -n "$wijzigingen" ]]; then
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
    voor="$(git -C "$MAP" rev-parse HEAD:install.sh)"
    git -C "$MAP" pull --ff-only --quiet
    gelukt "Bijgewerkt naar $(git -C "$MAP" log -1 --format='%h %s')"
    if [[ "$(git -C "$MAP" rev-parse HEAD:install.sh)" != "$voor" ]]; then
      info "Het installatiescript zelf is ook bijgewerkt; de nieuwe versie gaat verder."
      exec env TAKENBORD_NA_PULL=1 bash "$MAP/install.sh"
    fi
  fi
  stel_opslag_in
  start_stack
  "${DOCKER[@]}" image prune -f >/dev/null
  wacht_op_site
}

controleer_oude_data() {
  stap "Controleren op een bestaande database"
  if heeft_oude_data; then
    stop_met_fout "Er is al een database van een eerdere installatie (docker-volume takenbord_db-data). Die bewaart het oude wachtwoord, dat niet bij de nieuwe .env past. Kies: herstel je oude .env in $MAP, of stop eerst de oude containers met 'sudo docker compose -p takenbord down' en verwijder dan de oude database met 'sudo docker volume rm takenbord_db-data' (alle gegevens daarin gaan verloren) en draai het script opnieuw."
  fi
  gelukt "Geen oude database"
}

samenvatting() { # $1 = modus; bij bijwerken een korte samenvatting zonder wachtwoorden
  local env="$MAP/.env" domein opslag
  domein="$(lees_env_waarde "$env" DOMEIN)"
  printf '\n\033[1mKlaar!\033[0m\n'
  info "Takenbord:    https://$domein"
  if [[ "${1:-}" != bijwerken ]]; then
    info "ntfy-server:  https://ntfy.$domein (gebruiker $(lees_env_waarde "$env" NTFY_GEBRUIKER), wachtwoord $(lees_env_waarde "$env" NTFY_WACHTWOORD))"
    info "              Voeg deze server toe in de ntfy-app en kies het onderwerp in Beheer → Instellingen → Meldingen."
  fi
  opslag="$(lees_env_waarde "$env" OPSLAG_MAP)"
  if [[ -n "$opslag" ]]; then
    info "Back-ups:     elke nacht om 03:00 in $opslag/backups; bijlagen in $opslag/bijlagen"
  else
    info "Back-ups:     elke nacht om 03:00 (bekijken: docker compose -f $MAP/docker-compose.yml exec worker ls /backups)"
  fi
  info "Bijwerken:    draai dit script opnieuw: bash $MAP/install.sh"
  if [[ $FIREWALL_UIT -eq 1 ]]; then
    printf '\n'
    waarschuw "LET OP: de firewall is niet door dit script aangezet, omdat de SSH-poort onbekend was. Als ufw nog niet actief was, staat de server dus open. Controleer je SSH-poort en voer uit: sudo ufw allow <poort>/tcp && sudo ufw enable"
  fi
}

hoofd() {
  MAP="$(standaard_map "${BASH_SOURCE[0]:-}")"
  trap 'bij_fout $LINENO' ERR
  printf '\033[1mTakenbord installeren of bijwerken\033[0m (map: %s)\n' "$MAP"
  if ! eigenaar_klopt "$MAP" "$EUID"; then
    local eigenaar
    eigenaar="$(stat -c %U "$MAP")"
    if [[ -f "$MAP/install.sh" ]]; then
      stop_met_fout "De map $MAP is van gebruiker $eigenaar. Draai dit script als die gebruiker: sudo -u $eigenaar bash $MAP/install.sh"
    fi
    stop_met_fout "De map $MAP is van gebruiker $eigenaar. Maak jezelf eigenaar met: sudo chown $(id -un) $MAP en start daarna de installatie opnieuw met de curl-regel (curl -fsSL https://raw.githubusercontent.com/xclovisx/MaxTasksV1/main/install.sh | bash)."
  fi
  local modus
  modus="$(bepaal_modus "$MAP")"
  case "$modus" in
    onleesbaar)
      stop_met_fout "Kan $MAP/.env niet lezen (geen gewoon bestand of geen leesrechten). Draai het script als de eigenaar van het bestand (zie: ls -l $MAP/.env) of herstel de rechten; ik ga niet opnieuw installeren."
      ;;
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
      controleer_oude_data
      controleer_dns
      schrijf_env
      stel_opslag_in
      start_stack
      wacht_op_site
      maak_beheerder
      stel_ntfy_in
      ;;
    hervatten)
      controleer_systeem
      installeer_docker
      stel_opslag_in
      start_stack
      wacht_op_site
      maak_beheerder
      stel_ntfy_in
      ;;
  esac
  if [[ "$(lees_env_waarde "$MAP/.env" INSTALLATIE_KLAAR)" != 1 ]]; then
    zet_env_waarde "$MAP/.env" INSTALLATIE_KLAAR 1
  fi
  samenvatting "$modus"
}

# Pas aan het eind aanroepen: een half gedownload script doet zo niets, en `git pull` breekt het lopende script niet.
if [[ "${TAKENBORD_ALLEEN_FUNCTIES:-}" != 1 ]]; then
  hoofd "$@"
  exit $?
fi
