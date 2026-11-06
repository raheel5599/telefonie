"""Accept provider caller identity on the existing Telekom endpoint only."""
import datetime
import json
import os
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


def recover_rtp_directory(rtp,backup,text):
    if os.access(rtp.parent,os.W_OK):
        rtp.rename(backup/'rtp.host-directory')
        rtp.write_text(text);rtp.chmod(0o644)
        return
    # The old directory was created by Docker as root. Repair only this mount source.
    candidate=backup/'rtp.recovered.conf'
    candidate.write_text(text);candidate.chmod(0o644)
    code="""const fs=require('fs');
 const source='/repair/rtp.conf',old='/backup/rtp.host-directory',next='/backup/rtp.recovered.conf';
 if(!fs.lstatSync(source).isDirectory()||fs.readdirSync(source).length||!fs.lstatSync(next).isFile())throw Error('Unexpected RTP source');
 fs.renameSync(source,old);
 try{fs.renameSync(next,source)}catch(error){fs.renameSync(old,source);throw error}
 """
    run(['docker','run','--rm','--pull=never','--network','none','--read-only',
         '--user','0','--cap-drop=ALL','--cap-add=DAC_OVERRIDE',
         '--security-opt','no-new-privileges:true','--memory','64m','--pids-limit','32',
         '--mount','type=bind,src='+str(rtp.parent)+',dst=/repair',
         '--mount','type=bind,src='+str(backup)+',dst=/backup',
         'node:22-alpine','node','-e',code])
    if not rtp.is_file() or rtp.read_text()!=text:
        raise ValueError('RTP-Dateiquelle konnte nicht wiederhergestellt werden.')


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
    backup=ROOT/'private/caller-id-backups'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup.mkdir(parents=True,mode=0o700)
    snapshots=[('pjsip.host.conf',original_host),('pjsip.active.conf',active),('rtp.active.conf',active_rtp)]
    if rtp.is_file():snapshots.append(('rtp.host.conf',rtp.read_text()))
    for name,text in snapshots:
        target=backup/name;target.write_text(text);target.chmod(0o600)
    restarted=False
    try:
        # Repair a stale, empty file-mount source using the running PBX configuration.
        if rtp.is_dir():recover_rtp_directory(rtp,backup,active_rtp)
        if not rtp.exists() or rtp.read_text()!=active_rtp:
            rtp.write_text(active_rtp);rtp.chmod(0o644)
        HOST.write_text(updated)
        # A restart rebinds read-only file mounts to the now-synchronized host files.
        restarted=True
        subprocess.run(['docker','restart','--timeout','20',CONTAINER],check=True,capture_output=True,text=True,timeout=45)
        ready=False
        for attempt in range(30):
            try:
                if enabled(cli('pjsip show endpoint telekom')) and registered(cli('pjsip show registrations')):
                    ready=True;break
            except (subprocess.SubprocessError,OSError):
                pass
            time.sleep(2)
        if not ready:
            raise ValueError('Anruferkennung oder Telekom-Registrierungen konnten nicht bestätigt werden.')
    except Exception:
        # Restore the working active configuration, not the stale host copy.
        HOST.write_text(active)
        if restarted:
            subprocess.run(['docker','restart','--timeout','20',CONTAINER],check=True,capture_output=True,text=True,timeout=45)
        raise
    print('Anruferkennung: Provider-ID aktiviert; alle drei Telekom-Registrierungen bestätigt.')


if __name__=='__main__':
    setup()
