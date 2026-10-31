import socket
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
s.bind(("0.0.0.0",5070))
s.settimeout(30)
while True:
    data,addr=s.recvfrom(8192)
    text=data.decode(errors="replace")
    if not text.startswith("REGISTER "):
        continue
    headers=text.split("\r\n\r\n",1)[0].split("\r\n")[1:]
    wanted=("via:","from:","to:","call-id:","cseq:")
    kept=[h for h in headers if h.lower().startswith(wanted)]
    reply=("SIP/2.0 200 Mock Registrar OK\r\n"+"\r\n".join(kept)+"\r\nContent-Length: 0\r\n\r\n").encode()
    s.sendto(reply,addr)
    print("PASS: mock registrar received REGISTER and replied 200",flush=True)
