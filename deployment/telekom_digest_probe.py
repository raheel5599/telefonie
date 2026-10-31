import hashlib
import re
import secrets
import socket
import sys
import uuid

DEST = ("217.0.146.5", 5060)
URI = "sip:tel.t-online.de"
AOR = "sip:+4960316868187@tel.t-online.de"
USER = "anonymous@t-online.de"
PASSWORD = "anonymous@t-online.de"
CALL_ID = uuid.uuid4().hex + "@sip-probe"
TAG = secrets.token_hex(6)

def md5(s):
    return hashlib.md5(s.encode()).hexdigest()

def challenge_fields(response):
    line = next((x for x in response.splitlines() if x.lower().startswith("www-authenticate:")), None)
    if not line or "digest" not in line.lower():
        raise ValueError("Keine Digest-Challenge")
    pairs = dict((k.lower(), v1 if v1 is not None else v2) for k, v1, v2 in re.findall(r'(\w+)=(?:"([^"]*)"|([^,\s]+))', line))
    if pairs.get("algorithm", "MD5").upper() != "MD5" or "auth" not in pairs.get("qop", "auth").split(","):
        raise ValueError("Digest-Variante nicht unterstuetzt")
    if not pairs.get("realm") or not pairs.get("nonce"):
        raise ValueError("Realm/Nonce fehlen")
    return pairs

def authorization(challenge):
    realm, nonce = challenge["realm"], challenge["nonce"]
    cnonce = secrets.token_hex(8)
    ha1 = md5(f"{USER}:{realm}:{PASSWORD}")
    ha2 = md5(f"REGISTER:{URI}")
    response = md5(f"{ha1}:{nonce}:00000001:{cnonce}:auth:{ha2}")
    fields = [("username", USER), ("realm", realm), ("nonce", nonce), ("uri", URI), ("response", response), ("cnonce", cnonce)]
    result = ", ".join(f'{key}="{value}"' for key, value in fields)
    result += ", algorithm=MD5, qop=auth, nc=00000001"
    return "Authorization: Digest " + result

def register(sock, port, expires, cseq, auth=None):
    branch = "z9hG4bK" + secrets.token_hex(8)
    headers = [
        f"REGISTER {URI} SIP/2.0",
        f"Via: SIP/2.0/UDP 192.168.2.2:{port};branch={branch};rport",
        "Max-Forwards: 70",
        f"From: <{AOR}>;tag={TAG}",
        f"To: <{AOR}>",
        f"Call-ID: {CALL_ID}",
        f"CSeq: {cseq} REGISTER",
        f"Contact: <sip:+4960316868187@192.168.2.2:{port}>;expires={expires}",
        f"Expires: {expires}",
        "User-Agent: TARIQ-Telefonie-Probe",
        "Content-Length: 0",
    ]
    if auth:
        headers.append(auth)
    sock.sendto(("\r\n".join(headers) + "\r\n\r\n").encode(), DEST)
    while True:
        data, addr = sock.recvfrom(8192)
        reply = data.decode(errors="replace")
        if f"Call-ID: {CALL_ID}" not in reply or f"CSeq: {cseq} REGISTER" not in reply:
            continue
        m = re.match(r"SIP/2.0\s+(\d+)", reply)
        if not m:
            continue
        status = int(m.group(1))
        if status < 200:
            continue
        print(f"CSeq {cseq}: SIP {status} von {addr[0]}")
        return status, reply

def main():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(10)
        sock.bind(("0.0.0.0", 0))
        port = sock.getsockname()[1]
        status, reply = register(sock, port, 1620, 1)
        auth = None
        if status == 401:
            auth = authorization(challenge_fields(reply))
            status, reply = register(sock, port, 1620, 2, auth)
        if status != 200:
            print("Keine Registrierung; Endstatus:", status)
            return 0
        print("Registrierung akzeptiert. Sofortige Abmeldung...")
        try:
            status, reply = register(sock, port, 0, 3, auth)
            if status == 401:
                status, reply = register(sock, port, 0, 4, authorization(challenge_fields(reply)))
            if status == 200:
                print("Abmeldung bestaetigt.")
            else:
                print("WARNUNG: Abmeldung nicht bestaetigt; moegliche Restlaufzeit 1620 Sekunden.")
                return 5
        except (socket.timeout, ValueError) as exc:
            print("WARNUNG: Abmeldung fehlgeschlagen:", exc)
            return 5
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (socket.timeout, ValueError) as exc:
        print("Test fehlgeschlagen:", exc)
        sys.exit(3)
