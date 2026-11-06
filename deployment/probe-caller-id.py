"""Accept provider caller identity on the existing Telekom endpoint only."""
import datetime
import pathlib
import re
import subprocess

ROOT=pathlib.Path(__file__).resolve().parent.parent
CONTAINER='tariq-telefonie-asterisk'
HOST=ROOT/'asterisk/pjsip.conf'


def run(args):
    return subprocess.run(args,check=True,capture_output=True,text=True,timeout=20).stdout


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
    original=HOST.read_text()
    active=run(['docker','exec','-u','asterisk','-w','/',CONTAINER,'cat','/etc/asterisk/pjsip.conf'])
    if original!=active:
        raise ValueError('Host- und aktive SIP-Datei unterscheiden sich. Keine Änderung durchgeführt.')
    print('CONFIG_STRUCTURE '+str({'includes':bool(re.search(r'^\s*#(?:try)?include',original,re.M)),'telekomSections':[{'hasType':bool(re.search(r'^\s*type\s*=',b,re.M)),'isEndpoint':bool(re.search(r'^\s*type\s*=\s*endpoint\s*(?:;[^\n]*)?
    backup=ROOT/'private/caller-id-backups'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup.mkdir(parents=True,mode=0o700)
    target=backup/'pjsip.conf';target.write_text(original);target.chmod(0o600)
    try:
        # Preserve the inode of the existing file bind mount.
        HOST.write_text(updated)
        cli('module reload res_pjsip.so')
        if not enabled(cli('pjsip show endpoint telekom')):
            raise ValueError('Provider-Anruferkennung konnte nicht bestätigt werden.')
    except Exception:
        HOST.write_text(original)
        cli('module reload res_pjsip.so')
        raise
    print('Anruferkennung: Provider-ID für den Telekom-Endpunkt aktiviert und bestätigt.')



HOST=pathlib.Path('/home/fpadmin/apps/telefonie/asterisk/pjsip.conf')
try:
 original=HOST.read_text()
 active=run(['docker','exec','-u','asterisk','-w','/',CONTAINER,'cat','/etc/asterisk/pjsip.conf'])
 updated=update_config(original)
 print('CALLER_ID_PREFLIGHT hostMatchesActive='+str(original==active)+' writable='+str(__import__('os').access(HOST,__import__('os').W_OK))+' endpointPatchValid='+str('trust_id_inbound=yes' in updated))
except Exception as exc:
 print('CALLER_ID_PREFLIGHT error='+type(exc).__name__+(' '+str(exc) if isinstance(exc,ValueError) else ''))
 raise SystemExit(1)
,b,re.M)),'contextMatches':bool(re.search(r'^\s*context\s*=\s*from-telekom\s*(?:;[^\n]*)?
    backup=ROOT/'private/caller-id-backups'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup.mkdir(parents=True,mode=0o700)
    target=backup/'pjsip.conf';target.write_text(original);target.chmod(0o600)
    try:
        # Preserve the inode of the existing file bind mount.
        HOST.write_text(updated)
        cli('module reload res_pjsip.so')
        if not enabled(cli('pjsip show endpoint telekom')):
            raise ValueError('Provider-Anruferkennung konnte nicht bestätigt werden.')
    except Exception:
        HOST.write_text(original)
        cli('module reload res_pjsip.so')
        raise
    print('Anruferkennung: Provider-ID für den Telekom-Endpunkt aktiviert und bestätigt.')



HOST=pathlib.Path('/home/fpadmin/apps/telefonie/asterisk/pjsip.conf')
try:
 original=HOST.read_text()
 active=run(['docker','exec','-u','asterisk','-w','/',CONTAINER,'cat','/etc/asterisk/pjsip.conf'])
 updated=update_config(original)
 print('CALLER_ID_PREFLIGHT hostMatchesActive='+str(original==active)+' writable='+str(__import__('os').access(HOST,__import__('os').W_OK))+' endpointPatchValid='+str('trust_id_inbound=yes' in updated))
except Exception as exc:
 print('CALLER_ID_PREFLIGHT error='+type(exc).__name__)
 raise SystemExit(1)
,b,re.M)),'inherited':bool(re.match(r'\s*\[telekom\]\s*\(',b))} for b in re.split(r'(?=^\s*\[[^\]\r\n]+\])',original,flags=re.M) if re.match(r'\s*\[telekom\]',b)]}))
 updated=update_config(original)
    backup=ROOT/'private/caller-id-backups'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup.mkdir(parents=True,mode=0o700)
    target=backup/'pjsip.conf';target.write_text(original);target.chmod(0o600)
    try:
        # Preserve the inode of the existing file bind mount.
        HOST.write_text(updated)
        cli('module reload res_pjsip.so')
        if not enabled(cli('pjsip show endpoint telekom')):
            raise ValueError('Provider-Anruferkennung konnte nicht bestätigt werden.')
    except Exception:
        HOST.write_text(original)
        cli('module reload res_pjsip.so')
        raise
    print('Anruferkennung: Provider-ID für den Telekom-Endpunkt aktiviert und bestätigt.')



HOST=pathlib.Path('/home/fpadmin/apps/telefonie/asterisk/pjsip.conf')
try:
 original=HOST.read_text()
 active=run(['docker','exec','-u','asterisk','-w','/',CONTAINER,'cat','/etc/asterisk/pjsip.conf'])
 updated=update_config(original)
 print('CALLER_ID_PREFLIGHT hostMatchesActive='+str(original==active)+' writable='+str(__import__('os').access(HOST,__import__('os').W_OK))+' endpointPatchValid='+str('trust_id_inbound=yes' in updated))
except Exception as exc:
 print('CALLER_ID_PREFLIGHT error='+type(exc).__name__)
 raise SystemExit(1)
