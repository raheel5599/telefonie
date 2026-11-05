"""Enable only completed-call metadata; preserve unrelated PBX configuration."""
import datetime
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = 'tariq-telefonie-asterisk'
SECTION = """; BEGIN TARIQ CALL HISTORY V1
[tariq-calls.json]
format=json
fields=src,dst,dcontext,channel,dstchannel,lastapp,lastdata,start(double),answer(double),end(double),duration,billsec,disposition,uniqueid,linkedid,sequence
; END TARIQ CALL HISTORY V1
"""

def run(*args, **kwargs):
    command=['docker','exec']
    if 'input' in kwargs:
        command.append('-i')
    command.extend(['-u','asterisk','-w','/',CONTAINER,*args])
    return subprocess.run(command,check=True,capture_output=True,text=True,timeout=15,**kwargs)

def cli(command):
    return run('asterisk','-rx',command).stdout

def update_general(text):
    text=text.rstrip('\n')+'\n'
    lines=text.splitlines(keepends=True)
    section=None
    result=[]
    seen=set()
    wanted={'enable':'yes','unanswered':'yes','congestion':'yes'}
    inserted=False
    for value in lines:
        m=re.match(r'\s*\[([^\]]+)\]',value)
        if m:
            if section=='general':
                result.extend(key+'='+v+'\n' for key,v in wanted.items() if key not in seen)
            section=m[1].lower()
            if section=='general':
                inserted=True
        match=re.match(r'\s*(enable|unanswered|congestion)\s*=.*',value,re.I)
        if section=='general' and match:
            key=match[1].lower()
            if key not in seen:
                result.append(key+'=yes\n')
                seen.add(key)
            continue
        result.append(value)
    if section=='general':
        result.extend(key+'='+v+'\n' for key,v in wanted.items() if key not in seen)
    if not inserted:
        result.append('\n[general]\nenable=yes\nunanswered=yes\ncongestion=yes\n')
    return ''.join(result)

def custom_config(text):
    begin,end='; BEGIN TARIQ CALL HISTORY V1','; END TARIQ CALL HISTORY V1'
    if begin in text:
        if text.count(begin)!=1 or text.count(end)!=1:
            raise ValueError('Unbekannter CDR-Konfigurationsblock.')
        prefix,rest=text.split(begin)
        _,suffix=rest.split(end)
        return prefix.rstrip()+'\n\n'+SECTION+suffix.lstrip('\r\n')
    if re.search(r'^\s*\[tariq-calls\.json\]',text,re.M):
        raise ValueError('Der Name tariq-calls.json ist bereits anderweitig belegt.')
    return text.rstrip()+'\n\n'+SECTION

def write_config(name,text):
    target='/etc/asterisk/'+name
    run('tee',target+'.tariq-tmp',input=text)
    run('chmod','640',target+'.tariq-tmp')
    run('mv',target+'.tariq-tmp',target)

def custom_backend(status):
    return bool(re.search(r'^\s+[^\n]*custom[^\n]*
    return bool(re.search(r'Logging:\s+Enabled',status) and
                re.search(r'Log unanswered calls:\s+Yes',status) and
                custom_backend(status))

def ensure_backend():
    status=cli('cdr show status')
    if not custom_backend(status):
        cli('module load cdr_custom.so')
    status=cli('cdr show status')
    if 'CDR File custom backend' not in status:
        cli('module reload cdr_custom.so')
    status=cli('cdr show status')
    if 'CDR File custom backend' not in status:
        module=cli('module show like cdr_custom')
        if 'Not Running' in module:
            cli('module unload cdr_custom.so')
            cli('module load cdr_custom.so')

def setup():
    names=('cdr.conf','cdr_custom.conf')
    original={name:run('cat','/etc/asterisk/'+name).stdout for name in names}
    updated={'cdr.conf':update_general(original['cdr.conf']),
             'cdr_custom.conf':custom_config(original['cdr_custom.conf'])}
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup=ROOT/'private/cdr-backups'/stamp
    backup.mkdir(parents=True,mode=0o700)
    for name,text in original.items():
        path=backup/name
        path.write_text(text)
        path.chmod(0o600)
    changed=[name for name in names if original[name]!=updated[name]]
    try:
        run('mkdir','-p','/var/log/asterisk/cdr-custom')
        run('chmod','700','/var/log/asterisk/cdr-custom')
        run('touch','/var/log/asterisk/cdr-custom/tariq-calls.json')
        run('chmod','600','/var/log/asterisk/cdr-custom/tariq-calls.json')
        for name in changed:
            write_config(name,updated[name])
        if 'cdr.conf' in changed or not ready(cli('cdr show status')):
            cli('module reload cdr')
        if 'cdr_custom.conf' in changed:
            cli('module reload cdr_custom.so')
        ensure_backend()
        if not ready(cli('cdr show status')):
            print(cli('cdr show status'))
            print(cli('module show like cdr_custom'))
            code=run('tail','-n','150','/var/log/asterisk/messages.log').stdout
            for line in code.splitlines():
                if any(tag in line for tag in ('res_cdrel_custom','cdr_custom.c','cdr.conf')):
                    print(re.sub(r'\+?[0-9]{7,}','[redacted]',line))
            raise ValueError('CDR-Quelle konnte nicht bestätigt werden.')
    except Exception:
        for name in changed:
            write_config(name,original[name])
        cli('module reload cdr')
        cli('module reload cdr_custom.so')
        raise
    manifest=ROOT/'private/calls-source.json'
    if not manifest.exists():
        manifest.write_text('{"enabledAt":"'+datetime.datetime.now(datetime.timezone.utc).isoformat()+'"}')
        manifest.chmod(0o600)
    print('Anrufdaten: CDR-Quelle und unbeantwortete Anrufe aktiviert.')

if __name__=='__main__':
    setup()
,status,re.M|re.I))

def ready(status):
    return bool(re.search(r'Logging:\s+Enabled',status) and
                re.search(r'Log unanswered calls:\s+Yes',status) and
                'CDR File custom backend' in status)

def ensure_backend():
    status=cli('cdr show status')
    if 'CDR File custom backend' not in status:
        cli('module load cdr_custom.so')
    status=cli('cdr show status')
    if 'CDR File custom backend' not in status:
        cli('module reload cdr_custom.so')
    status=cli('cdr show status')
    if 'CDR File custom backend' not in status:
        module=cli('module show like cdr_custom')
        if 'Not Running' in module:
            cli('module unload cdr_custom.so')
            cli('module load cdr_custom.so')

def setup():
    names=('cdr.conf','cdr_custom.conf')
    original={name:run('cat','/etc/asterisk/'+name).stdout for name in names}
    updated={'cdr.conf':update_general(original['cdr.conf']),
             'cdr_custom.conf':custom_config(original['cdr_custom.conf'])}
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup=ROOT/'private/cdr-backups'/stamp
    backup.mkdir(parents=True,mode=0o700)
    for name,text in original.items():
        path=backup/name
        path.write_text(text)
        path.chmod(0o600)
    changed=[name for name in names if original[name]!=updated[name]]
    try:
        run('mkdir','-p','/var/log/asterisk/cdr-custom')
        run('chmod','700','/var/log/asterisk/cdr-custom')
        run('touch','/var/log/asterisk/cdr-custom/tariq-calls.json')
        run('chmod','600','/var/log/asterisk/cdr-custom/tariq-calls.json')
        for name in changed:
            write_config(name,updated[name])
        if 'cdr.conf' in changed or not ready(cli('cdr show status')):
            cli('module reload cdr')
        if 'cdr_custom.conf' in changed:
            cli('module reload cdr_custom.so')
        ensure_backend()
        if not ready(cli('cdr show status')):
            raise ValueError('CDR-Quelle konnte nicht bestätigt werden.')
    except Exception:
        for name in changed:
            write_config(name,original[name])
        cli('module reload cdr')
        cli('module reload cdr_custom.so')
        raise
    manifest=ROOT/'private/calls-source.json'
    if not manifest.exists():
        manifest.write_text('{"enabledAt":"'+datetime.datetime.now(datetime.timezone.utc).isoformat()+'"}')
        manifest.chmod(0o600)
    print('Anrufdaten: CDR-Quelle und unbeantwortete Anrufe aktiviert.')

if __name__=='__main__':
    setup()
