#!/usr/bin/env bash
# Temporary, isolated SIP REGISTER probe via wg-friedberg. NO Asterisk changes.
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
if ip -4 route show table all 2>/dev/null | grep -q '172.29.249.'; then echo "Subnetz moeglicherweise belegt"; exit 1; fi
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
echo "Starte isolierten SIP REGISTER-Test (keine Asterisk-Aenderung)..."
docker run --rm --network "$NET" --ip "$SRC" --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 96m --entrypoint python python:3.12-alpine -c '
import socket,uuid,sys,re,time
dst=("217.0.146.5",5060)
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
s.settimeout(9)
s.bind(("0.0.0.0",0))
port=s.getsockname()[1]
callid=uuid.uuid4().hex+"@sip-probe"
tag=uuid.uuid4().hex[:10]
branch="z9hG4bK"+uuid.uuid4().hex[:12]
uri="sip:tel.t-online.de"
aor="sip:+4960316868187@tel.t-online.de"
def send_register(expires,cseq):
 global branch
 branch="z9hG4bK"+uuid.uuid4().hex[:12]
 lines=[
 f"REGISTER {uri} SIP/2.0",
 f"Via: SIP/2.0/UDP 192.168.2.2:{port};branch={branch};rport",
 "Max-Forwards: 70",
 f"From: <{aor}>;tag={tag}",
 f"To: <{aor}>",
 f"Call-ID: {callid}",
 f"CSeq: {cseq} REGISTER",
 f"Contact: <sip:+4960316868187@192.168.2.2:{port}>;expires={expires}",
 f"Expires: {expires}",
 "User-Agent: TARIQ-Telefonie-Registration-Probe",
 "Content-Length: 0",
 "", ""]
 s.sendto("\r\n".join(lines).encode(),dst)
 data,addr=s.recvfrom(8192)
 txt=data.decode(errors="replace")
 print("Antwort von",addr)
 print(txt[:2400])
 m=re.match(r"SIP/2.0\s+(\d+)",txt)
 return int(m.group(1)) if m else None
try:
 status=send_register(1620,1)
 print("REGISTER-Status:",status)
 if status==200:
  print("Registrierung akzeptiert; melde sofort wieder ab.")
  try: send_register(0,2)
  except socket.timeout: print("WARNUNG: Abmeldung ohne Antwort; Registrierung kann bis zu 1620 Sekunden bestehen.")
 elif status in (401,403,407):
  print("Telekom verlangt Authentifizierung oder lehnt Anmeldung ab.")
 elif status==423:
  print("Telekom fordert erneut ein laengeres Intervall; keine automatische Wiederholung.")
 elif status is None:
  sys.exit(2)
except socket.timeout:
 print("Keine SIP-Antwort innerhalb von 9 Sekunden",file=sys.stderr)
 sys.exit(3)
'

echo "Test abgeschlossen; alle temporaeren Regeln werden entfernt."
