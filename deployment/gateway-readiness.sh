#!/usr/bin/env bash
# Read-only readiness check for TARIQ Telefonie gateway staging.
set -Eeuo pipefail
C=tariq-telefonie-asterisk
NET=tariq-telefonie-pbx_pbx_private
WG=wg-friedberg
echo '=== Docker and Asterisk ==='
docker inspect "$C" --format 'State={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
docker network inspect "$NET" --format 'Internal={{.Internal}} Subnet={{range .IPAM.Config}}{{.Subnet}}{{end}}'
docker exec -u asterisk -w /tmp "$C" asterisk -rx 'pjsip show transports'
docker exec -u asterisk -w /tmp "$C" asterisk -rx 'pjsip show registrations'
echo '=== WireGuard (no private keys) ==='
ip -4 route get 192.168.2.1
wg show "$WG" allowed-ips
echo '=== Host firewall (read-only) ==='
iptables -S DOCKER-USER
iptables -S FORWARD
echo '=== Container mounts and entrypoint ==='
docker inspect "$C" --format 'Mounts={{range .Mounts}}{{.Destination}}:{{.RW}} {{end}}'
docker inspect "$C" --format 'Entrypoint={{json .Config.Entrypoint}} Command={{json .Config.Cmd}}'
echo '=== Listening ports (host) ==='
ss -lun | grep -E ':(5060|5061|10000|20000)[[:space:]]' || true
echo 'Readiness check completed; no configuration changed.'
