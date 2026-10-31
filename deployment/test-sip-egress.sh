#!/usr/bin/env bash
# Temporary, isolated SIP OPTIONS test via wg-friedberg. NO Asterisk changes.
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo "Bitte mit sudo ausfuehren."; exit 1; }
WG=wg-friedberg
NET=tariq-sip-probe
SUBNET=172.29.249.0/28
SRC=172.29.249.2
DST=217.0.146.5
TABLE=24681
PRIO=12469
WG_SRC=192.168.2.2
PEER=FupnwHWaiyiT1Yc5R4qQ0ggV8ER9tx8FikBbQBKgnFQ=
ADDED_NETWORK=0
ADDED_RULE=0
ADDED_ROUTE=0
ADDED_SNAT=0
ADDED_FW_DROP=0
ADDED_FW_ALLOW=0
ORIGINAL_ALLOWED=''
cleanup() {
  set +e
  [[ $ADDED_FW_ALLOW == 1 ]] && iptables -D DOCKER-USER -s "$SUBNET" -d "$DST/32" -o "$WG" -j RETURN
  [[ $ADDED_FW_DROP == 1 ]] && iptables -D DOCKER-USER -s "$SUBNET" -j DROP
  [[ $ADDED_SNAT == 1 ]] && iptables -t nat -D POSTROUTING -s "$SUBNET" -d "$DST/32" -o "$WG" -j SNAT --to-source "$WG_SRC"
  [[ $ADDED_RULE == 1 ]] && ip -4 rule del pref "$PRIO"
  [[ $ADDED_ROUTE == 1 ]] && ip -4 route flush table "$TABLE"
  [[ $ADDED_NETWORK == 1 ]] && docker network rm "$NET" >/dev/null
  [[ -n $ORIGINAL_ALLOWED ]] && wg set "$WG" peer "$PEER" allowed-ips "$ORIGINAL_ALLOWED"
}
trap cleanup EXIT
trap 'echo "Test fehlgeschlagen; Rueckbau wird ausgefuehrt." >&2' ERR
command -v docker >/dev/null
command -v wg >/dev/null
command -v iptables >/dev/null
ip link show "$WG" >/dev/null
iptables -S DOCKER-USER >/dev/null
[[ $(ip -4 -o addr show "$WG" | grep -c "$WG_SRC/32") -ge 1 ]] || { echo "WG-Quelladresse fehlt"; exit 1; }
[[ -z $(docker network ls --format '{{.Name}}' | grep -x "$NET" || :) ]] || { echo "Testnetz existiert bereits"; exit 1; }
[[ -z $(ip -4 route show table "$TABLE") ]] || { echo "Policy-Tabelle belegt"; exit 1; }
[[ -z $(ip -4 rule show | grep -E "^$PRIO:") ]] || { echo "Policy-Prioritaet belegt"; exit 1; }
if ip -4 route show table all | grep -q '172.29.249.'; then echo "Subnetz moeglicherweise belegt"; exit 1; fi
ORIGINAL_ALLOWED=$(wg show "$WG" allowed-ips | awk -v p="$PEER" '$1==p {for(i=2;i<=NF;i++) printf "%s%s",(i==2?"":","),$i}')
[[ -n $ORIGINAL_ALLOWED ]] || { echo "WG-Peer nicht gefunden"; exit 1; }
echo "Ziehe Testimage vor Netzwerkaenderung..."
docker image inspect python:3.12-alpine >/dev/null 2>&1 || docker pull python:3.12-alpine
echo "Setze Egress-Sperre vor dem Containerstart..."
iptables -I DOCKER-USER 1 -s "$SUBNET" -j DROP; ADDED_FW_DROP=1
iptables -I DOCKER-USER 1 -s "$SUBNET" -d "$DST/32" -o "$WG" -j RETURN; ADDED_FW_ALLOW=1
wg set "$WG" peer "$PEER" allowed-ips "$ORIGINAL_ALLOWED,$DST/32"
ip -4 route replace "$DST/32" dev "$WG" table "$TABLE"; ADDED_ROUTE=1
ip -4 rule add pref "$PRIO" from "$SUBNET" to "$DST/32" lookup "$TABLE"; ADDED_RULE=1
iptables -t nat -I POSTROUTING 1 -s "$SUBNET" -d "$DST/32" -o "$WG" -j SNAT --to-source "$WG_SRC"; ADDED_SNAT=1
docker network create --driver bridge --subnet "$SUBNET" "$NET" >/dev/null; ADDED_NETWORK=1
echo "Starte isolierten SIP OPTIONS-Test..."
docker run --rm --network "$NET" --ip "$SRC" --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 96m --entrypoint python python:3.12-alpine -c '
import socket,uuid,sys
dst=("217.0.146.5",5060)
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
s.settimeout(8)
s.bind(("0.0.0.0",0))
port=s.getsockname()[1]
branch="z9hG4bK"+uuid.uuid4().hex[:12]
msg=(f"OPTIONS sip:tel.t-online.de SIP/2.0\r\nVia: SIP/2.0/UDP 192.168.2.2:{port};branch={branch};rport\r\nMax-Forwards: 70\r\nFrom: <sip:probe@tel.t-online.de>;tag=probe123\r\nTo: <sip:probe@tel.t-online.de>\r\nCall-ID: {uuid.uuid4().hex}@probe\r\nCSeq: 1 OPTIONS\r\nContact: <sip:probe@192.168.2.2>\r\nContent-Length: 0\r\n\r\n")
s.sendto(msg.encode(),dst)
try:
 data,addr=s.recvfrom(8192)
 print("Antwort von",addr)
 print(data.decode(errors="replace")[:1800])
 if not data.startswith(b"SIP/2.0"): sys.exit(2)
except socket.timeout:
 print("Keine SIP-Antwort innerhalb von 8 Sekunden",file=sys.stderr);sys.exit(3)
'
echo "Test abgeschlossen; alle temporaeren Regeln werden entfernt."
