#!/usr/bin/env bash
set -euo pipefail
printf '=== WireGuard ===\n'
sudo wg show wg-friedberg allowed-ips
printf '=== Asterisk network ===\n'
docker inspect tariq-telefonie-asterisk --format '{{json .NetworkSettings.Networks}}'
printf '=== Docker internal ===\n'
docker network inspect tariq-telefonie-pbx_pbx_private --format 'internal={{.Internal}}'
printf '=== Current registrations ===\n'
docker exec -u asterisk -w / tariq-telefonie-asterisk asterisk -rx 'pjsip show registrations'
printf '=== Default route ===\n'
ip -4 route show default
printf '=== Existing policy rules ===\n'
ip -4 rule show
printf '=== Completed (read-only) ===\n'