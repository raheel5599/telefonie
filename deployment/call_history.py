"""Import real completed CDRs and publish one entry per linked conversation."""
import datetime
import hashlib
import json
import pathlib
import re
import sqlite3
import subprocess
from collections import defaultdict

ROOT=pathlib.Path(__file__).resolve().parent.parent
CONTAINER='tariq-telefonie-asterisk'
WEB='tariq-telefonie-telefonie-web-1'
SOURCE='/var/log/asterisk/cdr-custom/tariq-calls.json'
LINES=('+4960316868187','+4960316843466','+4960316871811')
LABELS=dict(zip(LINES,('TARIQ Fahrdienst','TARIQ','TARIQ Zulassungsservice')))
EXTENSIONS=dict(zip(('100','101','102'),LINES))
RETENTION=90
LIMIT=5000

def run(command,**kwargs):
    return subprocess.run(command,check=True,capture_output=True,text=True,timeout=20,**kwargs)

def utc(value):
    return datetime.datetime.fromtimestamp(value,datetime.timezone.utc).isoformat()

def phone(raw):
    text=re.sub(r'[\s()./\-]','',str(raw or '').strip())
    if text in EXTENSIONS:
        return text
    if text.startswith('00'):
        text='+'+text[2:]
    elif text.startswith('0'):
        text='+49'+text[1:]
    elif re.fullmatch(r'49[0-9]{7,13}',text):
        text='+'+text
    return text if re.fullmatch(r'\+?[0-9]{3,15}',text) else None

def normalized_record(raw):
    if not isinstance(raw,dict):
        raise ValueError('not a CDR')
    start=float(raw.get('start') or 0)
    end=float(raw.get('end') or 0)
    if not 0<start<=end or end>datetime.datetime.now(datetime.timezone.utc).timestamp()+600:
        raise ValueError('invalid CDR time')
    src,dst=phone(raw.get('src')),phone(raw.get('dst'))
    context=str(raw.get('dcontext') or '')[:100]
    channel=str(raw.get('channel') or '')
    peer=str(raw.get('dstchannel') or '')
    lastdata=str(raw.get('lastdata') or '')
    extension=re.match(r'PJSIP/(100|101|102)-',channel)
    extension=extension[1] if extension else (src if src in EXTENSIONS else None)
    incoming=channel.startswith('PJSIP/telekom-') or context in ('from-telekom','from-telekom-2') or dst in LINES
    external=re.search(r'(?:Local/|PJSIP/)(0[0-9]{6,11})@(?:outbound-de|telekom)',lastdata)
    external=phone(external[1]) if external else None
    if incoming:
        direction='incoming'
        company=dst if dst in LINES else None
    elif src in EXTENSIONS and dst in EXTENSIONS and '@telekom' not in lastdata:
        direction='internal'
        company=EXTENSIONS.get(extension)
    elif context=='outbound-de' or external or extension or (src in LINES and dst not in EXTENSIONS):
        direction='outgoing'
        company=EXTENSIONS.get(extension) or (src if src in LINES else None)
    else:
        raise ValueError('unclassified CDR')
    unique=str(raw.get('uniqueid') or '')[:160]
    linked=str(raw.get('linkedid') or unique)[:160]
    sequence=str(raw.get('sequence') or '0')[:32]
    signature=json.dumps([unique,sequence,start,channel,dst],ensure_ascii=True)
    key=hashlib.sha256(signature.encode()).hexdigest()
    linked=linked or key
    disposition=str(raw.get('disposition') or 'FAILED').upper().replace('_',' ')
    if disposition not in ('ANSWERED','NO ANSWER','BUSY','FAILED','CONGESTION','CANCEL'):
        disposition='FAILED'
    duration=max(0,min(604800,int(float(raw.get('duration') or end-start))))
    billsec=max(0,min(duration,int(float(raw.get('billsec') or 0))))
    return {'key':key,'linked':linked,'start':start,'end':end,'src':src,'dst':dst,
            'direction':direction,'company':company,'extension':extension,'external':external,
            'duration':duration,'billsec':billsec,'disposition':disposition,
            'trunk':channel.startswith('PJSIP/telekom-'),
            'targetUnavailable':incoming and disposition in ('FAILED','CONGESTION') and not peer and bool(re.fullmatch(r'PJSIP/(100|101|102),30',lastdata)),
            'announcement':str(raw.get('lastapp') or '')=='Playback' and
                ('tariq-closed-' in lastdata or context.startswith('tariq-hours-'))}

def parse_records(text):
    result=[]
    skipped=0
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            result.append(normalized_record(json.loads(line)))
        except (ValueError,TypeError,OverflowError):
            skipped+=1
    return result,skipped

def conversations(records):
    grouped=defaultdict(list)
    for row in records:
        grouped[row['linked']].append(row)
    result=[]
    for linked,legs in grouped.items():
        incoming=[r for r in legs if r['direction']=='incoming']
        candidates=incoming or [r for r in legs if r['direction']!='internal'] or legs
        primary=min(candidates,key=lambda r:(not r['trunk'] if incoming else False,r['start'],r['key']))
        direction='incoming' if incoming else primary['direction']
        answered=any(r['disposition']=='ANSWERED' for r in legs)
        status='answered' if answered else 'busy' if any(r['disposition']=='BUSY' for r in legs) else 'failed' if all(r['disposition'] in ('FAILED','CONGESTION') for r in legs) else 'missed'
        external=next((r['external'] for r in legs if r['external']),None)
        if not external:
            external=next((r['dst'] for r in legs if r['direction']=='outgoing' and r['dst'] and r['dst'] not in EXTENSIONS and r['dst'] not in LINES),None)
        company=primary['company'] or next((r['company'] for r in legs if r['company']),None)
        start=min(r['start'] for r in legs)
        end=max(r['end'] for r in legs)
        caller=primary['src']
        caller_status='available' if caller else 'anonymous'
        if direction=='incoming' and caller==primary['dst'] and caller in LINES:
            caller=None
            caller_status='unconfirmed'
        result.append({
            'id':hashlib.sha256(linked.encode()).hexdigest()[:24],
            'direction':direction,'from':caller,'callerIdStatus':caller_status,
            'to':primary['dst'] if direction=='incoming' else external or primary['dst'],
            'company':company,'companyLabel':LABELS.get(company,'Nicht zugeordnet'),
            'extension':primary['extension'],
            'forwardedTo':external if direction=='incoming' else None,
            'startedAt':utc(start),'endedAt':utc(end),
            'duration':int(end-start),'billsec':max(r['billsec'] for r in legs),
            'status':status,'missed':direction=='incoming' and not answered,
            'failureReason':'target-unavailable' if not answered and any(r.get('targetUnavailable') for r in legs) else None,
            'announcement':any(r['announcement'] for r in legs),
        })
    return sorted(result,key=lambda row:(row['startedAt'],row['id']),reverse=True)

def publish(value):
    script="""const fs=require('fs');let t='';process.stdin.on('data',c=>t+=c);process.stdin.on('end',()=>{
 JSON.parse(t);fs.writeFileSync('/data/call-history.json.tmp',t,{mode:0o600});fs.renameSync('/data/call-history.json.tmp','/data/call-history.json')
});"""
    run(['docker','exec','-i',WEB,'node','-e',script],input=json.dumps(value,ensure_ascii=True))

def history_tick():
    private=ROOT/'private'
    private.mkdir(exist_ok=True,mode=0o700)
    database=private/'call-history.sqlite3'
    now=datetime.datetime.now(datetime.timezone.utc)
    minimum=now.timestamp()-RETENTION*86400
    connected=True
    skipped=0
    note=None
    try:
        status=run(['docker','exec','-u','asterisk','-w','/',CONTAINER,'asterisk','-rx','cdr show status']).stdout
        if not re.search(r'Logging:\s+Enabled',status) or not re.search(r'^\s+[^\n]*custom[^\n]*$',status,re.M|re.I):
            raise ValueError('CDR source unavailable')
        text=run(['docker','exec','-u','asterisk','-w','/',CONTAINER,'tail','-c','4194304',SOURCE]).stdout
        fresh,skipped=parse_records(text)
    except (subprocess.SubprocessError,ValueError,OSError):
        fresh=[]
        connected=False
        note='Anrufquelle derzeit nicht erreichbar. Bereits gespeicherte Anrufe bleiben sichtbar.'
    with sqlite3.connect(database) as db:
        db.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, start REAL NOT NULL, linked TEXT NOT NULL, data TEXT NOT NULL)')
        db.execute('CREATE INDEX IF NOT EXISTS record_start ON records(start)')
        db.executemany('INSERT OR REPLACE INTO records(id,start,linked,data) VALUES(?,?,?,?)',
                       [(r['key'],r['start'],r['linked'],json.dumps(r)) for r in fresh if r['start']>=minimum])
        db.execute('DELETE FROM records WHERE start < ?',(minimum,))
        records=[json.loads(row[0]) for row in db.execute('SELECT data FROM records ORDER BY start DESC LIMIT 50000')]
    database.chmod(0o600)
    calls=conversations(records)
    manifest=private/'calls-source.json'
    try:
        since=json.loads(manifest.read_text()).get('enabledAt')
    except (OSError,ValueError):
        since=None
    value={'checkedAt':now.isoformat(),'source':{'available':connected,'note':note,
           'recordingSince':since,'retentionDays':RETENTION,'limit':LIMIT,'limited':len(calls)>LIMIT},
           'calls':calls[:LIMIT]}
    publish(value)
    print('Anrufliste: '+('verbunden' if connected else 'Quelle nicht erreichbar')+
          '; '+str(len(value['calls']))+' gespeicherte Anrufe'+
          ('; unvollständige Datensätze übersprungen' if skipped else ''))
    return value

if __name__=='__main__':
    history_tick()
