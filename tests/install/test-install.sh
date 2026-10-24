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
touch "$tmp/checkout/docker-compose.yml" "$tmp/checkout/install.sh"
controleer "map naast het script" is_gelijk "$(standaard_map "$tmp/checkout/install.sh")" "$tmp/checkout"
controleer "map bij curl | bash" is_gelijk "$(standaard_map "")" /opt/takenbord
# Bij curl | bash is BASH_SOURCE[0] "main"; de werkmap (/repo) heeft hier wel een docker-compose.yml.
controleer "map bij curl | bash met BASH_SOURCE=main" is_gelijk "$(standaard_map main)" /opt/takenbord
controleer "map bij een scriptpad dat niet bestaat" is_gelijk "$(standaard_map "$tmp/checkout/bestaat-niet.sh")" /opt/takenbord
controleer "map uit TAKENBORD_MAP" is_gelijk "$(TAKENBORD_MAP=/srv/bord standaard_map "")" /srv/bord

controleer "ssh_poorten: poorten uit sshd -T" is_gelijk "$(ssh_poorten $'port 22\nport 2222\nlistenaddress 0.0.0.0' "" "")" $'22\n2222'
controleer "ssh_poorten: poort uit SSH_CONNECTION" is_gelijk "$(ssh_poorten "" "1.2.3.4 5555 5.6.7.8 2200" "")" 2200
controleer "ssh_poorten: dubbele poorten één keer" is_gelijk "$(ssh_poorten "port 22" "1.2.3.4 5555 5.6.7.8 22" "")" 22
ss_uitvoer=$'LISTEN 0 128 0.0.0.0:2200 0.0.0.0:* users:(("sshd",pid=1,fd=3))\nLISTEN 0 4096 127.0.0.1:5432 0.0.0.0:* users:(("postgres",pid=2,fd=4))\nLISTEN 0 128 [::]:2200 [::]:* users:(("sshd",pid=1,fd=4))'
controleer "ssh_poorten: terugval op ss voor sshd" is_gelijk "$(ssh_poorten "" "" "$ss_uitvoer")" 2200
controleer "ssh_poorten: ss wordt genegeerd als sshd -T poorten geeft" is_gelijk "$(ssh_poorten "port 22" "" "$ss_uitvoer")" 22
controleer "ssh_poorten: niets bekend geeft niets" is_gelijk "$(ssh_poorten "" "" "")" ""

mkdir -p "$tmp/map-env-dir/.env"
controleer "modus onleesbaar als .env geen bestand is" is_gelijk "$(bepaal_modus "$tmp/map-env-dir")" onleesbaar
mkdir -p "$tmp/map-eigen"
eigen_uid="$(stat -c %u "$tmp/map-eigen")"
controleer "eigenaar klopt" eigenaar_klopt "$tmp/map-eigen" "$eigen_uid"
controleer "eigenaar klopt niet" weiger eigenaar_klopt "$tmp/map-eigen" "$((eigen_uid + 1000))"
controleer "eigenaar: root mag altijd" eigenaar_klopt "$tmp/map-eigen" 0
controleer "eigenaar: map bestaat nog niet" eigenaar_klopt "$tmp/bestaat-niet" 12345

fake_docker() { [[ "$1 $2 $3" == "volume inspect takenbord_db-data" && "${FAKE_VOLUME:-}" == 1 ]]; }
DOCKER=(fake_docker)
FAKE_VOLUME=1
controleer "oude database gevonden" heeft_oude_data
FAKE_VOLUME=0
controleer "geen oude database" weiger heeft_oude_data
DOCKER=(docker)

mkdir -p "$tmp/map-awk"
zet_env_waarde "$tmp/map-awk/.env" A 1
(
  awk() { return 1; }
  zet_env_waarde "$tmp/map-awk/.env" B 2
) 2>/dev/null
controleer "zet_env_waarde: tijdelijk bestand weg bij een fout" is_gelijk "$(ls -A "$tmp/map-awk")" ".env"
controleer "zet_env_waarde: origineel blijft heel bij een fout" is_gelijk "$(cat "$tmp/map-awk/.env")" "A=1"

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
mkdir -p "$tmp/map-awk2"
(
  MAP="$tmp/map-awk2" DOMEIN=takenbord.nl GOOGLE=""
  awk() { return 1; }
  schrijf_env >/dev/null
) 2>/dev/null
controleer "schrijf_env: geen tijdelijke bestanden na een fout" is_gelijk "$(ls -A "$tmp/map-awk2")" ""

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
