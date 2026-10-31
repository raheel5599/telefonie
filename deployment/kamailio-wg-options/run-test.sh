#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo "Run with sudo"; exit 1; }
DIR=$(cd "$(dirname "$0")" && pwd)
WG=wg-friedberg
NET=tariq-kamailio-wg-probe
SUBNET=172.29.248.0/28
PROXY=172.29.248.2
CLIENT=172.29.248.3
DEST=217.0.146.5
PEER=FupnwHWaiyiT1Yc5R4qQ0ggV8ER9tx8FikBbQBKgnFQ=
TABLE=24682
PRIO=12470
IMAGE=tariq-sip-forward-test-proxy:latest
CREATED=0
STARTED=0
ORIGINAL=''
RESTORE_WG=0
RULE=0
ROUTE=0
DROP=0
ALLOW=0
NAT=0
cleanup() {
  set +e
  [[ $STARTED == 1 ]] && docker rm -f tariq-kamailio-wg-proxy >/dev/null 2>&1
  [[ $ALLOW == 1 ]] && iptables -D DOCKER-USER -s "$PROXY/32" -d "$DEST/32" -o "$WG" -p udp --dport 5060 -j ACCEPT
  [[ $DROP == 1 ]] && iptables -D DOCKER-USER -s "$SUBNET" -j DROP
  [[ $NAT == 1 ]] && iptables -t nat -D POSTROUTING -s "$PROXY/32" -d "$DEST/32" -o "$WG" -p udp --dport 5060 -j SNAT --to-source 192.168.2.2
  [[ $RULE == 1 ]] && ip -4 rule del pref "$PRIO"
  [[ $ROUTE == 1 ]] && ip -4 route flush table "$TABLE"
  [[ $CREATED == 1 ]] && docker network rm "$NET" >/dev/null 2>&1
  [[ $RESTORE_WG == 1 ]] && wg set "$WG" peer "$PEER" allowed-ips "$ORIGINAL"
}
trap cleanup EXIT
for tool in docker ip wg iptables; do command -v "$tool" >/dev/null; done
ip link show "$WG" >/dev/null
docker image inspect "$IMAGE" >/dev/null
docker image inspect python:3.12-alpine >/dev/null
[[ -z $(docker network ls --format '{{.Name}}' | grep -Fx "$NET" || true) ]] || { echo "Network already exists"; exit 1; }
[[ -z $(ip -4 route show table "$TABLE" 2>/dev/null || true) ]] || { echo "Table occupied"; exit 1; }
[[ -z $(ip -4 rule show | grep -E "^$PRIO:" || true) ]] || { echo "Priority occupied"; exit 1; }
[[ -z $(docker ps -aq --filter name='^/tariq-kamailio-wg-proxy$') ]] || { echo "Container name occupied"; exit 1; }
[[ -n $(ip -4 addr show dev "$WG" | grep '192.168.2.2') ]] || { echo "WireGuard address missing"; exit 1; }
ORIGINAL=$(wg show "$WG" allowed-ips | awk -v p="$PEER" '$1==p {for(i=2;i<=NF;i++) printf "%s%s",(i==2?"":","),$i}')
[[ -n "$ORIGINAL" ]] || { echo "WireGuard peer not found"; exit 1; }
[[ "$ORIGINAL" != *"$DEST"* ]] || { echo "Destination already allowed; stop"; exit 1; }
iptables -I DOCKER-USER 1 -s "$SUBNET" -j DROP; DROP=1
iptables -I DOCKER-USER 1 -s "$PROXY/32" -d "$DEST/32" -o "$WG" -p udp --dport 5060 -j ACCEPT; ALLOW=1
wg set "$WG" peer "$PEER" allowed-ips "$ORIGINAL,$DEST/32"; RESTORE_WG=1
ip -4 route add "$DEST/32" dev "$WG" table "$TABLE"; ROUTE=1
ip -4 rule add pref "$PRIO" from "$PROXY/32" to "$DEST/32" lookup "$TABLE"; RULE=1
iptables -t nat -I POSTROUTING 1 -s "$PROXY/32" -d "$DEST/32" -o "$WG" -p udp --dport 5060 -j SNAT --to-source 192.168.2.2; NAT=1
docker network create --driver bridge --subnet "$SUBNET" "$NET" >/dev/null; CREATED=1
docker run -d --name tariq-kamailio-wg-proxy --network "$NET" --ip "$PROXY" --cap-drop ALL --security-opt no-new-privileges --mount "type=bind,src=$DIR/kamailio.cfg,dst=/etc/kamailio/kamailio.cfg,readonly" --entrypoint /usr/sbin/kamailio "$IMAGE" -f /etc/kamailio/kamailio.cfg -DD -E >/dev/null
STARTED=1
sleep 2
[[ $(docker inspect tariq-kamailio-wg-proxy --format '{{.State.Running}}') == true ]] || { docker logs tariq-kamailio-wg-proxy; exit 1; }
docker run --rm --network "$NET" --ip "$CLIENT" --cap-drop ALL --security-opt no-new-privileges --mount "type=bind,src=$DIR/options_probe.py,dst=/probe.py,readonly" --entrypoint python python:3.12-alpine /probe.py
