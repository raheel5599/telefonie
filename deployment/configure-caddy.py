#!/usr/bin/env python3
"""Add one Caddy site to existing mounted Caddyfile, then validate + restart."""
import datetime
import pathlib
import shutil
import subprocess
import sys

DOMAIN = "telefonie.tariq-itconsulting.de"
CONTAINER = "fahrschulpilot-caddy-1"
BLOCK = """
# TARIQ Telefonie – verwaltet von raheel5599/telefonie
telefonie.tariq-itconsulting.de {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    -Server
  }
  reverse_proxy tariq-telefonie-telefonie-web-1:3095
}
"""

def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True)

mount=run("docker","inspect","--format",
    '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}',
    CONTAINER).stdout.strip()
if not mount or not pathlib.Path(mount).is_file():
    sys.exit("Caddyfile-Mount nicht gefunden. Bestehende Caddy-Konfiguration bleibt unverändert.")
source=pathlib.Path(mount)
original=source.read_text()
if DOMAIN in original:
    print("Telefonie-Domain bereits im Caddyfile. Keine Änderung durchgeführt.")
    sys.exit(0)
backup=source.with_name(source.name+".backup-telefonie-"+datetime.datetime.now().strftime("%Y%m%d%H%M%S"))
shutil.copy2(source, backup)
try:
    source.write_text(original.rstrip()+"\n\n"+BLOCK)
    run("docker","exec",CONTAINER,"caddy","validate","--config","/etc/caddy/Caddyfile")
    run("docker","restart","--time","10",CONTAINER)
    run("docker","exec",CONTAINER,"caddy","validate","--config","/etc/caddy/Caddyfile")
except Exception as exc:
    source.write_text(original)
    try: run("docker","restart","--time","10",CONTAINER)
    except Exception: pass
    sys.exit("Caddy-Änderung zurückgerollt: "+str(exc))
print("Telefonie-Caddy-Site eingerichtet; Backup:",backup)
