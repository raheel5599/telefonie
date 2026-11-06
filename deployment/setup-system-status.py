#!/usr/bin/env python3
"""Explicit administrator setup: permit one fixed read-only WireGuard query."""
import os
import pathlib
import pwd
import shutil
import subprocess
import tempfile

RULE = 'fpadmin ALL=(root) NOPASSWD: /usr/bin/wg show wg-friedberg latest-handshakes\n'
TARGET = pathlib.Path('/etc/sudoers.d/tariq-telefonie-status')


def main():
    if os.geteuid() != 0:
        raise SystemExit('Bitte einmal mit sudo python3 deployment/setup-system-status.py ausführen.')
    pwd.getpwnam('fpadmin')
    visudo = shutil.which('visudo')
    if not visudo or not pathlib.Path('/usr/bin/wg').is_file():
        raise SystemExit('visudo oder WireGuard fehlt. Es wurde nichts geändert.')
    if TARGET.is_symlink():
        raise SystemExit('Zieldatei ist ein Symlink. Es wurde nichts geändert.')
    if TARGET.exists():
        if TARGET.read_text() != RULE or TARGET.stat().st_uid != 0 or TARGET.stat().st_mode & 0o022:
            raise SystemExit('Zieldatei enthält eine andere Konfiguration. Es wurde nichts überschrieben.')
        print('Das eng begrenzte WireGuard-Leserecht ist bereits eingerichtet.')
        return
    fd, filename = tempfile.mkstemp(prefix='.tariq-status-', dir=TARGET.parent)
    try:
        with os.fdopen(fd, 'w') as handle:
            handle.write(RULE)
        subprocess.run([visudo, '-cf', filename], check=True, capture_output=True, text=True, timeout=10)
        os.chmod(filename, 0o440)
        # Install without replacing an existing file, even if another admin created it meanwhile.
        os.link(filename, TARGET)
    finally:
        pathlib.Path(filename).unlink(missing_ok=True)
    print('WireGuard-Status freigegeben: ausschließlich Lesen des letzten Handshakes.')


if __name__ == '__main__':
    main()
