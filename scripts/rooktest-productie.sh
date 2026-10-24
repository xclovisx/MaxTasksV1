#!/usr/bin/env bash
# Bouwt de productie-stack lokaal (https://localhost:$HTTPS_POORT) en controleert app, migraties, ntfy en back-up.
set -euo pipefail
cd "$(dirname "$0")/.."

export DOMEIN=localhost POSTGRES_PASSWORD=rooktest-wachtwoord HTTP_POORT=8080 HTTPS_POORT=8443
dc() { docker compose -p takenbord-rooktest -f docker-compose.yml "$@"; }
opruimen() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    echo "Rooktest mislukt (exitcode $status). Laatste logregels:"
    dc logs --tail=100 || true
  fi
  dc down -v --remove-orphans >/dev/null 2>&1 || true
}
trap opruimen EXIT

dc up -d --build

echo "Wachten op de app…"
for _ in $(seq 1 90); do
  if curl -skf --resolve "localhost:$HTTPS_POORT:127.0.0.1" "https://localhost:$HTTPS_POORT/login" >/dev/null; then break; fi
  sleep 2
done
login=$(curl -skf --resolve "localhost:$HTTPS_POORT:127.0.0.1" "https://localhost:$HTTPS_POORT/login")
grep -q 'Inloggen' <<<"$login"
echo "✓ app bereikbaar via Caddy (HTTPS)"

migreerlog=$(dc logs migreer)
grep -Eq 'Uitgevoerd|bijgewerkt' <<<"$migreerlog"
echo "✓ migraties uitgevoerd"

dc exec -T app node -e "require('@node-rs/argon2')"
echo "✓ argon2 laadt in de app"

dc run --rm -e BEHEERDER_WACHTWOORD=rooktest-beheer worker npx tsx src/scripts/maak-beheerder.ts "Rooktest" rooktest
echo "✓ beheerder aangemaakt"

echo "Wachten op ntfy…"
ntfygezond=
for _ in $(seq 1 15); do
  if gezondheid=$(curl -skf --resolve "ntfy.localhost:$HTTPS_POORT:127.0.0.1" "https://ntfy.localhost:$HTTPS_POORT/v1/health") \
    && grep -q '"healthy":true' <<<"$gezondheid"; then
    ntfygezond=ja
    break
  fi
  sleep 2
done
[ -n "$ntfygezond" ]
echo "✓ ntfy bereikbaar via Caddy"

# Zelfde stappen als README, stap 4: gebruiker, token, en publiceren vanuit de app-container.
dc exec -T -e NTFY_PASSWORD=rooktest-ntfy ntfy ntfy user add --role=admin rooktest
tokenuitvoer=$(dc exec -T ntfy ntfy token add rooktest 2>&1) # ntfy meldt het token op stderr
TOKEN=$(grep -o 'tk_[A-Za-z0-9]*' <<<"$tokenuitvoer" | head -n1)
[ -n "$TOKEN" ]
publiceer='fetch("http://ntfy",{method:"POST",headers:Object.assign({"Content-Type":"application/json"},process.argv[1]?{Authorization:"Bearer "+process.argv[1]}:{}),body:JSON.stringify({topic:"rooktest",message:"hallo"})}).then(r=>process.exit(r.ok?0:1),()=>process.exit(2))'
dc exec -T app node -e "$publiceer" "$TOKEN"
if dc exec -T app node -e "$publiceer"; then
  echo "✗ ntfy accepteert ongeauthenticeerde berichten"
  exit 1
fi
echo "✓ ntfy-gebruiker, token en publiceren werken"

dc exec -T worker npx tsx src/scripts/backup.ts
bestanden=$(dc exec -T worker sh -c 'ls /backups')
grep -q '^takenbord-.*\.dump$' <<<"$bestanden"
echo "✓ back-up gemaakt"

echo "Rooktest geslaagd."
