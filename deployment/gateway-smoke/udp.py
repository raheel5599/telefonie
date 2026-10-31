import socket, sys, time
MODE = sys.argv[1]
PORT = 15060
PAYLOAD = b"SIP-LAB-PING-2026"
if MODE == "server":
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", PORT))
    sock.settimeout(20)
    try:
        data, address = sock.recvfrom(512)
        if data != PAYLOAD:
            raise SystemExit("Unexpected payload")
        sock.sendto(b"SIP-LAB-PONG-2026", address)
        print("PASS: isolated UDP server responded", flush=True)
    finally:
        sock.close()
elif MODE == "client":
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(1.5)
    try:
        for attempt in range(12):
            try:
                sock.sendto(PAYLOAD, ("responder", PORT))
                reply, _ = sock.recvfrom(512)
                if reply == b"SIP-LAB-PONG-2026":
                    print("PASS: isolated bidirectional UDP transport", flush=True)
                    break
            except (socket.timeout, socket.gaierror):
                time.sleep(0.5)
        else:
            raise SystemExit("FAIL: UDP test timed out")
    finally:
        sock.close()
else:
    raise SystemExit("Unknown mode")
