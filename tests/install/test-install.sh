#!/usr/bin/env bash
# Test de hulpfuncties van install.sh. Draai in een Linux-container, bijv. vanuit de repo:
#   docker run --rm -v "$PWD":/repo -w /repo ubuntu:24.04 bash tests/install/test-install.sh
set -uo pipefail

# shellcheck disable=SC2034 # install.sh leest deze variabele na het sourcen
TAKENBORD_ALLEEN_FUNCTIES=1
# shellcheck source-path=SCRIPTDIR source=../../install.sh
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

# schrijf_env: complete .env, atomair
mkdir -p "$tmp/map-ok" "$tmp/map-stuk"
(
  MAP="$tmp/map-ok" DOMEIN=takenbord.nl GOOGLE=sleutel123
  schrijf_env >/dev/null
)
controleer "schrijf_env: domein" is_gelijk "$(lees_env_waarde "$tmp/map-ok/.env" DOMEIN)" takenbord.nl
controleer "schrijf_env: google-sleutel" is_gelijk "$(lees_env_waarde "$tmp/map-ok/.env" GOOGLE_MAPS_API_KEY)" sleutel123
controleer "schrijf_env: lege ntfy-token" is_gelijk "$(grep -c '^NTFY_TOKEN=$' "$tmp/map-ok/.env")" 1
controleer "schrijf_env: wachtwoord van 48 hex-tekens" heeft_patroon "$(lees_env_waarde "$tmp/map-ok/.env" POSTGRES_PASSWORD)" '^[0-9a-f]{48}$'
controleer "schrijf_env: rechten 600" is_gelijk "$(stat -c %a "$tmp/map-ok/.env")" 600
controleer "schrijf_env: geen tijdelijke bestanden" is_gelijk "$(ls -A "$tmp/map-ok")" ".env"
(
  MAP="$tmp/map-stuk" DOMEIN=takenbord.nl GOOGLE=""
  willekeurig() { return 1; }
  set -e
  schrijf_env >/dev/null
) 2>/dev/null
controleer "schrijf_env: bij een fout geen half .env" is_gelijk "$(ls -A "$tmp/map-stuk")" ""

# wacht_op_site: de eerste lus mag geen certificaat nodig hebben
sleep() { :; }
curl() { return 1; }
dc() { return 0; }
mkdir -p "$tmp/map-wacht"
zet_env_waarde "$tmp/map-wacht/.env" DOMEIN takenbord.nl
wacht_zonder_certificaat() { MAP="$tmp/map-wacht" wacht_op_site 2>&1; }
uitvoer="$(wacht_zonder_certificaat)"
controleer "wacht_op_site: zonder certificaat gaat de installatie door" heeft_patroon "$uitvoer" 'De app draait'
controleer "wacht_op_site: waarschuwt over het certificaat" heeft_patroon "$uitvoer" 'Nog geen geldig HTTPS-certificaat'
dc() { return 1; }
uitvoer="$( (MAP="$tmp/map-wacht" wacht_op_site) 2>&1 )"
controleer "wacht_op_site: foutmelding als de app niet antwoordt" heeft_patroon "$uitvoer" 'antwoordt niet'
unset -f sleep curl dc

rm -rf "$tmp"
echo
if [[ $fouten -eq 0 ]]; then
  echo "Alle tests geslaagd."
else
  echo "$fouten test(s) mislukt."
  exit 1
fi
