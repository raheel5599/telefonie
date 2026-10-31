#!/usr/bin/env bash
# One-shot, unauthenticated REGISTER challenge-path test.
# Shares Asterisk network namespace, but does NOT touch Asterisk configuration.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
ROUTE=deployment/permanent-gateway-staging/route-controller.sh
cleanup() { sudo bash "$ROUTE" stop; }
trap cleanup EXIT
sudo bash "$ROUTE" start
docker run --rm -i --network container:tariq-telefonie-asterisk python:3.12-alpine python3 - <<'PY'
import socket,uuid
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
s.settimeout(12)
s.connect(("172.25.254.10",5060))
ip,port=s.getsockname()
ident=uuid.uuid4().hex
msg=(
 "REGISTER sip:tel.t-online.de SIP/2.0\r\n"
 f"Via: SIP/2.0/UDP {ip}:{port};branch=z9hG4bK{ident};rport\r\n"
 "Max-Forwards: 5\r\n"
 f"From: <sip:nonexistent-test-{ident}@tel.t-online.de>;tag={ident}\r\n"
 f"To: <sip:nonexistent-test-{ident}@tel.t-online.de>\r\n"
 f"Call-ID: {ident}@gateway-test\r\n"
 "CSeq: 1 REGISTER\r\n"
 f"Contact: <sip:nonexistent-test-{ident}@{ip}:{port}>\r\n"
 "Expires: 0\r\n"
 "Content-Length: 0\r\n\r\n"
)
print("Sending unauthenticated, Expires: 0 REGISTER from",ip,port,flush=True)
s.send(msg.encode())
try:
 data=s.recv(8192).decode(errors="replace")
 print(data[:3500])
 if data.startswith("SIP/2.0 401") or data.startswith("SIP/2.0 403"):
  print("SIP server challenge/denial received; no registration activated")
 elif data.startswith("SIP/2.0"):
  print("SIP response received; inspect status before proceeding")
 else:
  raise SystemExit("Unexpected non-SIP response")
except socket.timeout:
 raise SystemExit("TIMEOUT: check gateway transaction logs and WireGuard return path")
finally:
 s.close()
PY
