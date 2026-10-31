#!/usr/bin/env bash
# Restricted Telekom SIP policy-route controller; staging, not installed by default.
set -Eeuo pipefail
WG=wg-friedberg
PEER='FupnwHWaiyiT1Yc5R4qQ0ggV8ER9tx8FikBbQBKgnFQ='
DEST=217.0.146.5
SRC=172.29.247.2
TABLE=24683
PRIO=12471
STATE=/run/tariq-telekom-route
IPTABLES=(iptables -w)
assert_safe() {
  [[ $(id -u) == 0 ]] || { echo 'Root required'; exit 1; }
  ip link show "$WG" >/dev/null
  ip -4 addr show "$WG" | grep -q '192.168.2.2/32'
  docker network inspect tariq-telekom-gateway-staging_sip_egress >/dev/null
  docker network inspect tariq-telekom-gateway-staging_sip_egress --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' | grep -qx '172.29.247.0/28'
}
add_rule() { "${IPTABLES[@]}" -C "$@" 2>/dev/null || "${IPTABLES[@]}" -I "$@"; }
remove_rule() { "${IPTABLES[@]}" -C "$@" 2>/dev/null && "${IPTABLES[@]}" -D "$@" || true; }
start() {
  assert_safe
  [[ ! -e $STATE ]] || { echo 'Already managed'; exit 0; }
  [[ -z $(ip -4 rule show | grep -E "^$PRIO:") ]] || { echo 'Priority occupied'; exit 1; }
  [[ -z $(ip -4 route show table "$TABLE") ]] || { echo 'Route table occupied'; exit 1; }
  local original
  original=$(wg show "$WG" allowed-ips | awk -v p="$PEER" '$1==p {for(i=2;i<=NF;i++) printf "%s%s",(i==2?"":","),$i}')
  [[ -n $original ]] || { echo 'Expected WireGuard peer missing'; exit 1; }
  [[ $original != *"$DEST/32"* ]] || { echo 'Destination already managed elsewhere'; exit 1; }
  install -d -m 0700 "$STATE"
  printf '%s\n' "$original" > "$STATE/allowed-ips"
  # Default deny gateway egress; narrowly allow SIP over WireGuard.
  add_rule DOCKER-USER -s "$SRC/32" -j DROP
  add_rule DOCKER-USER -s "$SRC/32" -d "$DEST/32" -o "$WG" -p udp --dport 5060 -j ACCEPT
  wg set "$WG" peer "$PEER" allowed-ips "$original,$DEST/32"
  ip -4 route add "$DEST/32" dev "$WG" table "$TABLE"
  ip -4 rule add pref "$PRIO" from "$SRC/32" to "$DEST/32" lookup "$TABLE"
  add_rule -t nat POSTROUTING -s "$SRC/32" -d "$DEST/32" -o "$WG" -p udp --dport 5060 -j SNAT --to-source 192.168.2.2
  echo 'Restricted SIP route configured; registration remains blocked by Kamailio.'
}
stop() {
  remove_rule -t nat POSTROUTING -s "$SRC/32" -d "$DEST/32" -o "$WG" -p udp --dport 5060 -j SNAT --to-source 192.168.2.2
  ip -4 rule del pref "$PRIO" from "$SRC/32" to "$DEST/32" lookup "$TABLE" 2>/dev/null || true
  ip -4 route del "$DEST/32" dev "$WG" table "$TABLE" 2>/dev/null || true
  remove_rule DOCKER-USER -s "$SRC/32" -d "$DEST/32" -o "$WG" -p udp --dport 5060 -j ACCEPT
  remove_rule DOCKER-USER -s "$SRC/32" -j DROP
  if [[ -f $STATE/allowed-ips ]]; then
    local current original
    current=$(wg show "$WG" allowed-ips | awk -v p="$PEER" '$1==p {for(i=2;i<=NF;i++) printf "%s%s",(i==2?"":","),$i}')
    original=$(cat "$STATE/allowed-ips")
    if [[ $current == "$original,$DEST/32" ]]; then
      wg set "$WG" peer "$PEER" allowed-ips "$original"
    else
      echo 'WireGuard peer changed externally: manual review required; not overwriting AllowedIPs' >&2
    fi
  fi
  rm -rf -- "$STATE"
}
case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *) echo "Usage: $0 start|stop" >&2; exit 2 ;;
esac
