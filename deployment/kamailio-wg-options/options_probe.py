import socket, uuid, sys
proxy=("172.29.248.2",5060)
call_id=uuid.uuid4().hex
branch="z9hG4bK"+uuid.uuid4().hex
request=(
    "OPTIONS sip:tel.t-online.de SIP/2.0\r\n"
    f"Via: SIP/2.0/UDP 172.29.248.3:5062;rport;branch={branch}\r\n"
    "Max-Forwards: 10\r\n"
    f"From: <sip:probe@172.29.248.3>;tag={call_id}\r\n"
    "To: <sip:tel.t-online.de>\r\n"
    f"Call-ID: {call_id}@probe\r\n"
    "CSeq: 1 OPTIONS\r\n"
    "Content-Length: 0\r\n\r\n"
)
with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as sock:
    sock.bind(("0.0.0.0",5062))
    sock.settimeout(3)
    for attempt in range(3):
        sock.sendto(request.encode(),proxy)
        try:
            response,_=sock.recvfrom(8192)
            line=response.decode(errors="replace").splitlines()[0]
            print("SIP response:",line,flush=True)
            if line.startswith("SIP/2.0 408"):
                sys.exit("FAIL: proxy timed out waiting for Telekom")
            if not line.startswith("SIP/2.0 "):
                sys.exit("FAIL: malformed response")
            sys.exit(0)
        except socket.timeout:
            print("Waiting for response",attempt+1,flush=True)
    sys.exit("FAIL: no SIP response")
