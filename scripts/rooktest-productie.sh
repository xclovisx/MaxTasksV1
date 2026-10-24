#!/usr/bin/env bash
# Bouwt de productie-stack lokaal (https://localhost:8443) en controleert app, migraties, ntfy en back-up.
set -euo pipefail

export DOMEIN=localhost POSTGRES_PASSWORD=rooktest-wachtwoord HTTP_POORT=8080 HTTPS_POORT=8443
dc() { docker compose -p takenbord-rooktest -f docker-compose.yml "$@"; }
trap 'dc down -v --remove-orphans >/dev/null 2>&1 || true' EXIT

dc up -d --build

echo "Wachten op de app…"
for _ in $(seq 1 90); do
  if curl -skf --resolve localhost:8443:127.0.0.1 https://localhost:8443/login >/dev/null; then break; fi
  sleep 2
done
curl -skf --resolve localhost:8443:127.0.0.1 https://localhost:8443/login | grep -q 'Inloggen'
echo "✓ app bereikbaar via Caddy (HTTPS)"

dc logs migreer | grep -Eq 'Uitgevoerd|bijgewerkt'
echo "✓ migraties uitgevoerd"

curl -skf --resolve ntfy.localhost:8443:127.0.0.1 https://ntfy.localhost:8443/v1/health | grep -q '"healthy":true'
echo "✓ ntfy bereikbaar via Caddy"

dc exec -T worker npx tsx src/scripts/backup.ts
dc exec -T worker sh -c 'ls /backups' | grep -q '^takenbord-.*\.dump$'
echo "✓ back-up gemaakt"

echo "Rooktest geslaagd."
