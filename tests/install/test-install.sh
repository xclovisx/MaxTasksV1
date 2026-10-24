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

rm -rf "$tmp"
echo
if [[ $fouten -eq 0 ]]; then
  echo "Alle tests geslaagd."
else
  echo "$fouten test(s) mislukt."
  exit 1
fi
