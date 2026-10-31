import socket,time,uuid
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
s.bind(("0.0.0.0",5062))
s.settimeout(1.5)
call=uuid.uuid4().hex
msg=(f"REGISTER sip:registrar SIP/2.0\r\n"
     f"Via: SIP/2.0/UDP tester:5062;rport;branch=z9hG4bK{uuid.uuid4().hex}\r\n"
     "Max-Forwards: 10\r\n"
     f"From: <sip:lab@registrar>;tag={call}\r\n"
     "To: <sip:lab@registrar>\r\n"
     f"Call-ID: {call}@tester\r\n"
     "CSeq: 1 REGISTER\r\n"
     "Contact: <sip:lab@tester:5062>\r\n"
     "Expires: 60\r\nContent-Length: 0\r\n\r\n").encode()
try:
    for i in range(15):
        try:
            s.sendto(msg,("proxy",5060))
            data,_=s.recvfrom(8192)
            line=data.split(b"\r\n",1)[0].decode()
            if line.startswith("SIP/2.0 200 "):
                print("PASS: REGISTER forwarded through Kamailio and 200 returned",flush=True)
                break
            raise SystemExit("FAIL: unexpected SIP response "+line)
        except (socket.timeout,socket.gaierror):
            time.sleep(0.4)
    else:
        raise SystemExit("FAIL: no response from proxy")
finally:
    s.close()
