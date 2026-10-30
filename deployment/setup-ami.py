#!/usr/bin/env python3
"""Create local AMI credentials; do not store them in Git."""
from pathlib import Path
from secrets import token_urlsafe
import os

base = Path(__file__).resolve().parents[1]
folder = base / "private"
folder.mkdir(mode=0o700, exist_ok=True)
target = folder / "manager.conf"
if target.exists():
    print("AMI-Datei bereits vorhanden; nichts überschrieben.")
else:
    password = token_urlsafe(42)
    config = """[general]
enabled = yes
webenabled = no
port = 5038
bindaddr = 0.0.0.0
displayconnects = no

[telefonie-status]
secret = {password}
read = system,call,reporting
write =
eventfilter = !Event: VarSet
""".format(password=password)
    with target.open("x") as stream:
        os.fchmod(stream.fileno(), 0o600)
        stream.write(config)
    print("AMI-Konfiguration lokal erzeugt. Passwort nicht ausgegeben.")
