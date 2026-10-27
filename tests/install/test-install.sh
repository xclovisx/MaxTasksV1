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
controleer "ssh_poorten: ss vult sshd -T aan" is_gelijk "$(ssh_poorten "port 22" "" "$ss_uitvoer")" $'22\n2200'
controleer "ssh_poorten: listenaddress met poort" is_gelijk "$(ssh_poorten $'port 22\nlistenaddress 0.0.0.0:2222' "" "")" $'22\n2222'
controleer "ssh_poorten: listenaddress IPv6" is_gelijk "$(ssh_poorten "listenaddress [::]:2223" "" "")" 2223
controleer "ssh_poorten: alles samen, uniek en gesorteerd" is_gelijk "$(ssh_poorten $'port 22\nlistenaddress [::]:2222' "1.1.1.1 5000 2.2.2.2 22" "$ss_uitvoer")" $'22\n2200\n2222'
controleer "ssh_poorten: niets bekend geeft niets" is_gelijk "$(ssh_poorten "" "" "")" ""

mkdir -p "$tmp/map-env-dir/.env"
controleer "modus onleesbaar als .env geen bestand is" is_gelijk "$(bepaal_modus "$tmp/map-env-dir")" onleesbaar
mkdir -p "$tmp/map-eigen"
eigen_uid="$(stat -c %u "$tmp/map-eigen")"
controleer "eigenaar klopt" eigenaar_klopt "$tmp/map-eigen" "$eigen_uid"
controleer "eigenaar klopt niet" weiger eigenaar_klopt "$tmp/map-eigen" "$((eigen_uid + 1000))"
controleer "eigenaar: root op een map van root" eigenaar_klopt "$tmp/map-eigen" 0
mkdir -p "$tmp/map-van-gebruiker"
chown 1000 "$tmp/map-van-gebruiker"
controleer "eigenaar: root in andermans map wordt geweigerd" weiger eigenaar_klopt "$tmp/map-van-gebruiker" 0
controleer "eigenaar: de gebruiker zelf in zijn map" eigenaar_klopt "$tmp/map-van-gebruiker" 1000
controleer "eigenaar: root, map bestaat nog niet" eigenaar_klopt "$tmp/bestaat-niet" 0
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

controleer "systeem: Ubuntu 24.04 op x86_64" is_gelijk "$(systeem_probleem ubuntu 24.04 x86_64)" ""
controleer "systeem: Ubuntu 22.04 op aarch64" is_gelijk "$(systeem_probleem ubuntu 22.04 aarch64)" ""
controleer "systeem: Ubuntu 25.10" is_gelijk "$(systeem_probleem ubuntu 25.10 x86_64)" ""
controleer "systeem: Debian 12" is_gelijk "$(systeem_probleem debian 12 x86_64)" ""
controleer "systeem: Ubuntu 20.04 te oud" heeft_patroon "$(systeem_probleem ubuntu 20.04 x86_64)" 'Ubuntu 20\.04 is te oud.*22\.04'
controleer "systeem: Ubuntu 21.10 te oud" heeft_patroon "$(systeem_probleem ubuntu 21.10 x86_64)" 'te oud'
controleer "systeem: Debian 11 te oud" heeft_patroon "$(systeem_probleem debian 11 x86_64)" 'Debian 11 is te oud.*12'
controleer "systeem: Debian zonder versie (testing)" heeft_patroon "$(systeem_probleem debian "" x86_64)" 'onbekende Debian-versie'
controleer "systeem: andere distributie" heeft_patroon "$(systeem_probleem linuxmint 21.3 x86_64)" "Alleen Ubuntu .* en Debian .*'linuxmint'"
controleer "systeem: 32-bit ARM" heeft_patroon "$(systeem_probleem ubuntu 24.04 armv7l)" '64-bit'

printf 'OPSLAG_MAP=\n' >"$tmp/env-opslag"
controleer "env_heeft_sleutel: aanwezig met lege waarde" env_heeft_sleutel "$tmp/env-opslag" OPSLAG_MAP
controleer "env_heeft_sleutel: afwezig" weiger env_heeft_sleutel "$tmp/env-opslag" BIJLAGEN_OPSLAG
controleer "env_heeft_sleutel: geen bestand" weiger env_heeft_sleutel "$tmp/bestaat-niet" OPSLAG_MAP

controleer "opslagpad: geldig" is_gelijk "$(opslag_pad_probleem "$tmp/opslag")" ""
controleer "opslagpad: relatief" heeft_patroon "$(opslag_pad_probleem mnt/opslag)" 'volledig pad'
controleer "opslagpad: rare tekens" heeft_patroon "$(opslag_pad_probleem '/mnt/mijn opslag')" 'alleen letters'
controleer "opslagpad: bovenliggende map ontbreekt" heeft_patroon "$(opslag_pad_probleem /bestaat/niet/takenbord)" 'bestaat niet.*aangekoppeld'
controleer "opslagpad: / zelf" heeft_patroon "$(opslag_pad_probleem /)" 'volledig pad'

mkdir -p "$tmp/bestaande-map"
controleer "te_controleren_map: bestaande map zelf" is_gelijk "$(te_controleren_map "$tmp/bestaande-map")" "$tmp/bestaande-map"
controleer "te_controleren_map: nieuwe map -> bovenliggende map" is_gelijk "$(te_controleren_map "$tmp/bestaande-map/nieuw")" "$tmp/bestaande-map"

controleer "systeemschijf: / staat op de systeemschijf" op_systeemschijf /
controleer "systeemschijf: de repo-map is aangekoppeld" test -d /repo
controleer "systeemschijf: de gekoppelde repo-map niet" weiger op_systeemschijf /repo

# stel_opslag_in van begin tot eind, met vaste antwoorden en zonder Docker
MAP="$tmp/map-opslag"
mkdir -p "$MAP"
printf 'DOMEIN=x.nl\n' >"$MAP/.env"
antwoorden=("$tmp/schijf/takenbord" "j")
vraag() { printf -v "$1" '%s' "${antwoorden[0]}"; antwoorden=("${antwoorden[@]:1}"); }
mkdir -p "$tmp/schijf"
DOCKER=(false)
SUDO=()
stel_opslag_in >/dev/null 2>&1
controleer "opslag: .env bijgewerkt" is_gelijk "$(lees_env_waarde "$MAP/.env" BIJLAGEN_OPSLAG):$(lees_env_waarde "$MAP/.env" BACKUP_OPSLAG):$(lees_env_waarde "$MAP/.env" OPSLAG_CONTROLE):$(lees_env_waarde "$MAP/.env" OPSLAG_MAP)" "$tmp/schijf/takenbord/bijlagen:$tmp/schijf/takenbord/backups:1:$tmp/schijf/takenbord"
controleer "opslag: controlebestanden" test -f "$tmp/schijf/takenbord/bijlagen/.takenbord-opslag" -a -f "$tmp/schijf/takenbord/backups/.takenbord-opslag"
controleer "opslag: eigenaar uid 1000" is_gelijk "$(stat -c %u "$tmp/schijf/takenbord/bijlagen")" 1000
controleer "opslag: controle slaagt" controleer_opslag
rm "$tmp/schijf/takenbord/bijlagen/.takenbord-opslag"
uitvoer="$( (controleer_opslag) 2>&1 )"
controleer "opslag: ontbrekend controlebestand stopt met uitleg" heeft_patroon "$uitvoer" 'aangekoppeld'
antwoorden=("")
printf 'DOMEIN=x.nl\n' >"$MAP/.env"
stel_opslag_in >/dev/null 2>&1
controleer "opslag: leeg antwoord = systeemschijf" bash -c "grep -qx 'OPSLAG_MAP=' '$MAP/.env' && ! grep -q OPSLAG_CONTROLE '$MAP/.env'"
vraag_gesteld=0
vraag() { vraag_gesteld=1; }
stel_opslag_in >/dev/null 2>&1
controleer "opslag: vraag komt niet terug na een leeg antwoord" is_gelijk "$vraag_gesteld" 0
unset -f vraag

rm -rf "$tmp"
echo
if [[ $fouten -eq 0 ]]; then
  echo "Alle tests geslaagd."
else
  echo "$fouten test(s) mislukt."
  exit 1
fi
