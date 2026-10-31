#!/usr/bin/env bash
# Passive, read-only UDP SIP probe on the Hetzner WireGuard interface.
# Run on Hetzner. Does not change routing, firewall, Asterisk or Kamailio.
set -Eeuo pipefail
PORT="${1:-15060}"
if [[ ! "$PORT" =~ ^[0-9]+$ ]] || ((PORT<1024 || PORT>65535)); then
  echo "Invalid UDP test port" >&2; exit 2
fi
echo "Listening on wg-friedberg 192.168.2.2 UDP/$PORT for 90 seconds."
echo "On UniFi, route UDP/$PORT to 192.168.2.2 over the WireGuard site-to-site path."
echo "This is a synthetic SIP probe, NOT a Telekom incoming-call test."
python3 - "$PORT" <<'PY'
import socket,sys,time
port=int(sys.argv[1])
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
s.bind(("192.168.2.2",port))
s.settimeout(90)
try:
    payload,addr=s.recvfrom(4096)
    line=payload.decode(errors="replace").splitlines()[0] if payload else ""
    print(f"RECEIVED from {addr[0]}:{addr[1]}: {line}")
    if line.startswith("OPTIONS sip:inbound-test@"):
        via=next((x[4:].strip() for x in payload.decode(errors="replace").splitlines() if x.lower().startswith("via:")),None)
        callid=next((x[8:].strip() for x in payload.decode(errors="replace").splitlines() if x.lower().startswith("call-id:")),None)
        cseq=next((x[5:].strip() for x in payload.decode(errors="replace").splitlines() if x.lower().startswith("cseq:")),None)
        fr=next((x[5:].strip() for x in payload.decode(errors="replace").splitlines() if x.lower().startswith("from:")),None)
        to=next((x[3:].strip() for x in payload.decode(errors="replace").splitlines() if x.lower().startswith("to:")),None)
        if all((via,callid,cseq,fr,to)):
            response="SIP/2.0 200 OK\r\nVia: "+via+"\r\nFrom: "+fr+"\r\nTo: "+to+";tag=inboundtest\r\nCall-ID: "+callid+"\r\nCSeq: "+cseq+"\r\nContent-Length: 0\r\n\r\n"
            s.sendto(response.encode(),addr)
            print("SENT synthetic SIP 200 OK")
        else: print("Incomplete SIP headers; no response")
    else: print("Not the expected synthetic OPTIONS; no response")
except socket.timeout:
    print("TIMEOUT: No packet reached 192.168.2.2 on this port")
    sys.exit(3)
finally:s.close()
PY
