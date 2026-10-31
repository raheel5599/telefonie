#!/usr/bin/env bash
set -Eeuo pipefail
echo "=== VPN STATUS ==="
systemctl is-active wg-quick@wg-friedberg.service
systemctl is-enabled wg-quick@wg-friedberg.service
echo "=== EXISTING SIP ROUTES ==="
ip -4 rule show
ip -4 route show table 24683 2>/dev/null || true
echo "=== TARGET ADDRESS AVAILABILITY ==="
docker network inspect tariq-telefonie-pbx_pbx_private --format '{{json .Containers}}'
docker network ls --format '{{.Name}}'
ip -4 route show table all | grep -F '172.29.247.' || true
echo "=== CONFIG VALIDATION ==="
docker compose -f deployment/permanent-gateway-staging/compose.yml config --quiet
echo "=== GATEWAY IMAGE ==="
docker image inspect tariq-sip-forward-test-proxy:latest --format '{{.Id}}'
echo "=== CURRENT REGISTRATIONS ==="
docker exec -u asterisk -w /tmp tariq-telefonie-asterisk asterisk -rx 'pjsip show registrations'
echo "=== PREFLIGHT COMPLETE: NO CHANGES MADE ==="
