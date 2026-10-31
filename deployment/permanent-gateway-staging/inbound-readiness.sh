#!/usr/bin/env bash
# Read-only host checks. No service changes, no secrets, no registrations.
set -Eeuo pipefail
echo '=== Containers ==='
docker inspect tariq-telefonie-asterisk tariq-telekom-gateway-staging-kamailio-1 --format '{{.Name}} {{.State.Status}}'
echo '=== SIP listeners ==='
docker exec -u asterisk -w /tmp tariq-telefonie-asterisk asterisk -rx 'pjsip show transports'
echo '=== WireGuard peer routes ==='
sudo wg show wg-friedberg allowed-ips
echo '=== Existing SIP/RTP ingress firewall rules (review only) ==='
sudo iptables -S DOCKER-USER
echo '=== Host UDP listeners (review only) ==='
sudo ss -lun
echo '=== Registrations (should remain empty) ==='
docker exec -u asterisk -w /tmp tariq-telefonie-asterisk asterisk -rx 'pjsip show registrations'
echo '=== Note ==='
echo 'This does not prove Telekom can initiate a call through the public Friedberg NAT.'
