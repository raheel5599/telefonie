"""Accept provider caller identity on the existing Telekom endpoint only."""
import datetime
import json
import time
import pathlib
import re
import subprocess

ROOT=pathlib.Path(__file__).resolve().parent.parent
CONTAINER='tariq-telefonie-asterisk'
HOST=ROOT/'asterisk/pjsip.conf'


def run(args, **kwargs):
    return subprocess.run(args,check=True,capture_output=True,text=True,timeout=20, **kwargs).stdout


def cli(command):
    return run(['docker','exec','-u','asterisk','-w','/',CONTAINER,'asterisk','-rx',command])


def enabled(output):
    return bool(re.search(r'^\s*trust_id_inbound\s*:\s*(?:true|yes)\s*$',output,re.M|re.I))


def update_config(text):
    sections=re.split(r'(?=^\s*\[[^\]\r\n]+\])',text,flags=re.M)
    changed=0
    for i,section in enumerate(sections):
        header=re.match(r'\s*\[([^\]]+)\]',section)
        if not header or header[1]!='telekom':
            continue
        if not re.search(r'^\s*type\s*=\s*endpoint\s*(?:;[^\n]*)?$',section,re.M):
            continue
        if not re.search(r'^\s*context\s*=\s*from-telekom\s*(?:;[^\n]*)?$',section,re.M):
            raise ValueError('Unerwarteter Telekom-Eingangskontext.')
        changed+=1
        matches=list(re.finditer(r'^\s*trust_id_inbound\s*=.*$',section,re.M))
        if len(matches)>1:
            raise ValueError('Mehrdeutige Anruferkennung im Telekom-Endpunkt.')
        if matches:
            section=re.sub(r'^([ \t]*)trust_id_inbound\s*=.*$',r'\1trust_id_inbound=yes',section,flags=re.M)
        else:
            section=section.rstrip('\n')+'\ntrust_id_inbound=yes\n\n'
        sections[i]=section
    if changed!=1:
        raise ValueError('Der Telekom-Endpunkt ist nicht eindeutig eingerichtet.')
    return ''.join(sections)


def setup():
    if enabled(cli('pjsip show endpoint telekom')):
        print('Anruferkennung: Provider-ID bereits aktiviert.')
        return
    # Do not interrupt an existing conversation.
    counts=cli('core show channels count')
    if not re.search(r'^0 active channels?\b',counts,re.M):
        raise ValueError('Gespräch läuft oder Gesprächsstatus unklar. Keine SIP-Änderung durchgeführt.')
    original_host=HOST.read_text()
    active=run(['docker','exec','-u','asterisk','-w','/',CONTAINER,'cat','/etc/asterisk/pjsip.conf'])
    updated=update_config(active)
    mounts=json.loads(run(['docker','inspect',CONTAINER,'--format','{{json .Mounts}}']))
    binds={m['Destination']:pathlib.Path(m['Source']) for m in mounts if m.get('Type')=='bind'}
    if binds.get('/etc/asterisk/pjsip.conf')!=HOST:
        raise ValueError('Unerwartete SIP-Dateieinbindung. Keine Änderung durchgeführt.')
    rtp=ROOT/'asterisk/rtp.conf'
    if binds.get('/etc/asterisk/rtp.conf')!=rtp:
        raise ValueError('Unerwartete RTP-Dateieinbindung. Keine Änderung durchgeführt.')
    for destination,source in binds.items():
        if destination not in ('/etc/asterisk/pjsip.conf','/etc/asterisk/rtp.conf') and (not source.exists() or destination.startswith('/etc/asterisk/') and not source.is_file()):
            raise ValueError('Eine bestehende Dateieinbindung fehlt. Keine Änderung durchgeführt.')
    if rtp.is_dir() and any(rtp.iterdir()):
        raise ValueError('RTP-Quelldatei ist ein belegtes Verzeichnis. Keine Änderung durchgeführt.')
    active_rtp=run(['docker','exec','-u','asterisk','-w','/',CONTAINER,'cat','/etc/asterisk/rtp.conf'])
    if not re.search(r'^\s*\[general\]',active_rtp,re.M):
        raise ValueError('Aktive RTP-Konfiguration unklar. Keine Änderung durchgeführt.')
    registrations=cli('pjsip show registrations')
    ids=('telekom-registration','telekom-registration-2','telekom-registration-3')
    def registered(output):
        return all(re.search(r'^\s*'+re.escape(name)+r'/\S+\s+\S+\s+Registered\b',output,re.M) for name in ids)
    if not registered(registrations):
        raise ValueError('Telekom-Registrierungen vor der Änderung nicht vollständig aktiv.')

    print('RESTART_PREFLIGHT noActiveCalls=True threeRegistrations=True mountSourcesRecoverable=True')

ROOT=pathlib.Path('/home/fpadmin/apps/telefonie')
HOST=ROOT/'asterisk/pjsip.conf'
setup()
