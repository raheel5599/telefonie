import socket, time, uuid
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
s.bind(("0.0.0.0", 5062))
s.settimeout(1.5)
def send(method,user,expected):
    msg=(f"{method} sip:{user}@proxy SIP/2.0\r\n"
         f"Via: SIP/2.0/UDP tester:5062;rport;branch=z9hG4bK{uuid.uuid4().hex}\r\n"
         "Max-Forwards: 10\r\n"
         f"From: <sip:lab@test>;tag={uuid.uuid4().hex}\r\n"
         f"To: <sip:{user}@proxy>\r\n"
         f"Call-ID: {uuid.uuid4().hex}@test\r\n"
         f"CSeq: 1 {method}\r\nContent-Length: 0\r\n\r\n").encode()
    for _ in range(12):
        try:
            s.sendto(msg,("proxy",5060))
            data,_=s.recvfrom(4096)
            line=data.split(b"\r\n",1)[0].decode()
            if not line.startswith(f"SIP/2.0 {expected} "):
                raise SystemExit(f"FAIL: expected {expected}, got {line}")
            print(f"PASS: {method} {user} -> {line}",flush=True)
            return
        except (socket.timeout,socket.gaierror):
            time.sleep(0.5)
    raise SystemExit("FAIL: no SIP response")
try:
    send("OPTIONS","gateway-health",200)
    send("INVITE","004912345",403)
finally:
    s.close()
