"""Configure a private Asterisk browser-media service, retaining existing SIP routes."""
import datetime
import json
import pathlib
import re
import secrets
import subprocess
import time
ROOT=pathlib.Path(__file__).resolve().parent.parent
PBX='tariq-telefonie-asterisk'
WEB='tariq-telefonie-telefonie-web-1'
CADDY='fahrschulpilot-caddy-1'

def run(args,**kwargs):
    return subprocess.run(args,check=True,capture_output=True,text=True,timeout=45,**kwargs).stdout

def pbx(*args,**kwargs):
    return run(['docker','exec',*(['-i'] if 'input' in kwargs else []),'-u','asterisk','-w','/',PBX,*args],**kwargs)

def cli(command):return pbx('asterisk','-rx',command)

def set_section(text,name,values):
    lines=text.splitlines(keepends=True);result=[];inside=False;found=False;seen=set()
    def missing():return [k+'='+v+'\n' for k,v in values.items() if k not in seen]
    for line in lines:
        section=re.match(r'^[ \t]*\[([^\]]+)\]',line)
        if section:
            if inside:result.extend(missing())
            inside=section[1].lower()==name
            if inside:
                if found:raise ValueError('Mehrdeutige Konfigurationssektion.')
                found=True
        option=re.match(r'^[ \t]*([a-z_]+)[ \t]*=',line,re.I)
        if inside and option and option[1].lower() in values:
            key=option[1].lower()
            if key not in seen:result.append(key+'='+values[key]+'\n');seen.add(key)
        else:result.append(line)
    if inside:result.extend(missing())
    if not found:result.append('\n['+name+']\n'+''.join(k+'='+v+'\n' for k,v in values.items()))
    return ''.join(result)

def browser_dialplan():
    lines=['; TARIQ browser phone: private ARI application only.','[tariq-browser-incoming]']
    for device in range(800,820):
        lines.extend([f'exten => {device},1,Stasis(tariq-webphone,incoming,{device})',' same => n,Answer()',' same => n,Wait(1)',' same => n,Playback(custom/tariq-browser-unavailable)',' same => n,Hangup()',''])
    lines.extend(['[tariq-browser-echo]','exten => s,1,Answer()',' same => n,Echo()',' same => n,Hangup()','','[tariq-browser-outbound]','exten => _X.,1,NoOp(TARIQ Browser Outbound)',' same => n,Set(CALLERID(num)=${TARIQ_COMPANY})',' same => n,Dial(PJSIP/${EXTEN}@telekom,60)',' same => n,Hangup()',''])
    return '\n'.join(lines)

def with_include(text):
    directive='#include tariq-browser.conf'
    if directive in text:return text
    marker='; BEGIN TARIQ WEB HOURS V1'
    i=text.find(marker)
    if i>=0:return text[:i].rstrip()+'\n\n'+directive+'\n\n'+text[i:]
    return text.rstrip()+'\n\n'+directive+'\n'

def write_pbx(name,text):
    pbx('tee','/etc/asterisk/'+name+'.tariq-tmp',input=text)
    pbx('chmod','640','/etc/asterisk/'+name+'.tariq-tmp')
    pbx('mv','/etc/asterisk/'+name+'.tariq-tmp','/etc/asterisk/'+name)

def patch_caddy(text):
    matches=list(re.finditer(r'^telefonie\.tariq-itconsulting\.de[ \t]*\{',text,re.M))
    if len(matches)!=1:raise ValueError('Telefonie-Proxy nicht eindeutig gefunden.')
    start=matches[0].start();i=matches[0].end();depth=1
    while i<len(text) and depth:
        if text[i]=='{':depth+=1
        elif text[i]=='}':depth-=1
        i+=1
    if depth:raise ValueError('Telefonie-Proxy ist unvollständig.')
    block=text[start:i]
    block=re.sub(r'^[ \t]*(?:header[ \t]+)?Permissions-Policy[^\n]*\n','',block,flags=re.M)
    block=block[:-1].rstrip()+'\n  header Permissions-Policy "camera=(), microphone=(self), geolocation=()"\n}'
    return text[:start]+block+text[i:]

def setup_caddy(backup):
    mount=json.loads(run(['docker','inspect',CADDY,'--format','{{json .Mounts}}']))
    source=next(pathlib.Path(m['Source']) for m in mount if m['Destination']=='/etc/caddy/Caddyfile')
    if str(source)!='/opt/fahrschulpilot/deployment/hetzner/Caddyfile':raise ValueError('Unerwartete Proxy-Datei.')
    original=source.read_text();changed=patch_caddy(original)
    if changed==original:return
    active=run(['docker','exec',CADDY,'cat','/etc/caddy/Caddyfile'])
    if original!=active:raise ValueError('Proxy-Datei und aktive Einbindung unterscheiden sich. Keine Proxy-Änderung durchgeführt.')
    snapshot=backup/'Caddyfile';snapshot.write_text(original);snapshot.chmod(0o600)
    code="const fs=require('fs');let t='';process.stdin.on('data',c=>t+=c);process.stdin.on('end',()=>fs.writeFileSync('/target/Caddyfile',t));"
    def write(value):
        run(['docker','run','--rm','-i','--pull=never','--network','none','--read-only','--user','0','--cap-drop=ALL','--cap-add=DAC_OVERRIDE','--security-opt','no-new-privileges:true','--mount','type=bind,src='+str(source)+',dst=/target/Caddyfile','node:22-alpine','node','-e',code],input=value)
    try:
        write(changed)
        run(['docker','exec',CADDY,'caddy','validate','--config','/etc/caddy/Caddyfile'])
        run(['docker','restart','--timeout','30',CADDY])
    except Exception:
        write(original);run(['docker','restart','--timeout','30',CADDY]);raise
    print('Browser-Mikrofon: nur auf der Telefonie-Domain freigegeben.')

def setup():
    for module in ('chan_websocket','res_ari','res_http_websocket'):
        output=cli('module show like '+module)
        if module+'.so' not in output or 'Not Running' in output:raise ValueError('Browser-Audiomodul nicht bereit: '+module)
    mode=run(['docker','inspect',PBX,'--format','{{.HostConfig.NetworkMode}}']).strip()
    ports=json.loads(run(['docker','inspect',PBX,'--format','{{json .HostConfig.PortBindings}}'])) or {}
    if mode=='host' or ports.get('8088/tcp'):raise ValueError('Die Asterisk-Webschnittstelle muss im privaten Docker-Netz bleiben.')
    private=ROOT/'private';private.mkdir(exist_ok=True,mode=0o700)
    credential=private/'webphone-backend.json'
    if credential.exists():config=json.loads(credential.read_text())
    else:
        config={'user':'tariq-webphone','password':secrets.token_hex(32)}
        credential.write_text(json.dumps(config));credential.chmod(0o600)
    if config.get('user')!='tariq-webphone' or not re.fullmatch(r'[a-f0-9]{64}',config.get('password','')):raise ValueError('Ungültige lokale Browser-Zugangskonfiguration.')
    names=('http.conf','ari.conf','tariq-browser.conf')
    original={}
    for name in names:
        try:original[name]=pbx('cat','/etc/asterisk/'+name)
        except subprocess.CalledProcessError:original[name]=''
    http=set_section(original['http.conf'],'general',{'enabled':'yes','bindaddr':'0.0.0.0','bindport':'8088','prefix':''})
    ari=set_section(original['ari.conf'],'general',{'enabled':'yes'})
    begin,end='; BEGIN TARIQ WEBPHONE USER','; END TARIQ WEBPHONE USER'
    block=begin+'\n[tariq-webphone]\ntype=user\nread_only=no\npassword='+config['password']+'\n'+end+'\n'
    if begin in ari:
        if ari.count(begin)!=1 or ari.count(end)!=1:raise ValueError('Mehrdeutige Browser-ARI-Konfiguration.')
        before,rest=ari.split(begin);_,after=rest.split(end);ari=before.rstrip()+'\n\n'+block+after.lstrip('\r\n')
    else:
        if re.search(r'^\[tariq-webphone\]',ari,re.M):raise ValueError('ARI-Benutzername ist bereits belegt.')
        ari=ari.rstrip()+'\n\n'+block
    host=ROOT/'asterisk/extensions.conf';dialplan=host.read_text()
    active=pbx('cat','/etc/asterisk/extensions.conf')
    if dialplan!=active:raise ValueError('Wählplandateien unterscheiden sich. Keine Browser-Änderung durchgeführt.')
    updated={'http.conf':http,'ari.conf':ari,'tariq-browser.conf':browser_dialplan()}
    changed=[name for name in names if original[name]!=updated[name]]
    new_dialplan=with_include(dialplan)
    backup=private/'webphone-backups'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f');backup.mkdir(parents=True,mode=0o700)
    for name,text in {**original,'extensions.conf':dialplan}.items():
        target=backup/name;target.write_text(text);target.chmod(0o600)
    if changed or new_dialplan!=dialplan:
        if not re.search(r'^0 active channels?\b',cli('core show channels count'),re.M):raise ValueError('Gespräch läuft. Browser-Einrichtung bitte nach Gesprächsende wiederholen.')
        try:
            for name in changed:write_pbx(name,updated[name])
            host.write_text(new_dialplan)
            run(['docker','restart','--timeout','20',PBX])
            ready=False
            for attempt in range(30):
                try:
                    if 'Server Enabled' in cli('http show status') and len(re.findall(r'^\s*telekom-registration(?:-[23])?/\S+\s+\S+\s+Registered\b',cli('pjsip show registrations'),re.M))==3:ready=True;break
                except subprocess.SubprocessError:pass
                time.sleep(2)
            if not ready:raise ValueError('Browser-Schnittstelle oder Telekom-Registrierungen nicht bestätigt.')
        except Exception:
            for name in changed:write_pbx(name,original[name])
            host.write_text(dialplan);run(['docker','restart','--timeout','20',PBX]);raise
    audio=ROOT/'public/audio/tariq-browser-unavailable.wav'
    if not audio.is_file():raise ValueError('Browser-Offlineansage fehlt.')
    pbx('mkdir','-p','/var/lib/asterisk/sounds/custom')
    subprocess.run(['docker','exec','-i','-u','asterisk','-w','/',PBX,'tee','/var/lib/asterisk/sounds/custom/tariq-browser-unavailable.wav.tmp'],input=audio.read_bytes(),stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True,timeout=15)
    pbx('mv','/var/lib/asterisk/sounds/custom/tariq-browser-unavailable.wav.tmp','/var/lib/asterisk/sounds/custom/tariq-browser-unavailable.wav')
    setup_caddy(backup)
    print('Browser-Telefonie: private Audio-Schnittstelle bereit; bestehende SIP-Registrierungen erhalten.')

if __name__=='__main__':setup()
