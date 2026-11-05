"""Controlled incoming-route changes; no SIP reload, restart or network changes."""
import datetime
import hashlib
import json
import pathlib
import os
import re
import subprocess

LINES = ('+4960316868187', '+4960316843466', '+4960316871811')
EXTENSIONS = ('100', '101', '102')
CONTEXTS = {
    LINES[0]: ('from-telekom',),
    LINES[1]: ('from-telekom', 'from-telekom-2'),
    LINES[2]: ('from-telekom',),
}
ROOT = pathlib.Path(__file__).resolve().parent.parent
HOST = ROOT / 'asterisk/extensions.conf'
STATE = ROOT / 'private/web-routing.json'
CONTAINER = 'tariq-telefonie-asterisk'
WEB = 'tariq-telefonie-telefonie-web-1'

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def run(args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, check=True, timeout=15, **kwargs)

def cli(command):
    text = run(['docker', 'exec', '-u', 'asterisk', '-w', '/', CONTAINER,
                'asterisk', '-rx', command]).stdout
    if any(x in text for x in ('Unable to connect', 'No such command', 'Usage:')):
        raise ValueError('Asterisk-Befehl nicht verfügbar')
    return text

def validate_mappings(mappings):
    if not isinstance(mappings, dict) or set(mappings) != set(LINES):
        raise ValueError('Alle drei Rufnummern müssen enthalten sein.')
    if any(not isinstance(v, str) or v not in EXTENSIONS for v in mappings.values()):
        raise ValueError('Nur Nebenstellen 100, 101 und 102 sind erlaubt.')
    return dict(mappings)

def revision(mappings):
    return hashlib.sha256(json.dumps(mappings, sort_keys=True).encode()).hexdigest()

def parse_live(output):
    routes = {}
    context = None
    line = None
    for text in output.splitlines():
        m = re.match(r"\[ Context '([^']+)'", text)
        if m:
            context, line = m[1], None
        m = re.match(r"\s*'([^']+)'\s*=>", text)
        if m:
            line = m[1]
        m = re.search(r'\b2\.\s+Dial\(PJSIP/(100|101|102),30\)', text)
        if m and line in CONTEXTS and context in CONTEXTS[line]:
            routes[(line, context)] = m[1]
    for number, contexts in CONTEXTS.items():
        if any((number, c) not in routes for c in contexts):
            raise ValueError('Bestehende Rufverteilung ist nicht eindeutig lesbar.')
        if len({routes[(number, c)] for c in contexts}) != 1:
            raise ValueError('Abweichende Ziele in den Eingangskontexten.')
    return {number: routes[(number, contexts[0])] for number, contexts in CONTEXTS.items()}

def rewrite_config(text, mappings):
    validate_mappings(mappings)
    result = []
    counts = {(line, context): 0 for line, contexts in CONTEXTS.items() for context in contexts}
    context, line = None, None
    for value in text.splitlines(keepends=True):
        m = re.match(r'\s*\[([^\]]+)\]', value)
        if m:
            context, line = m[1], None
        m = re.match(r'\s*exten\s*=>\s*([^,]+),', value)
        if m:
            line = m[1].strip()
        key = (line, context)
        if key in counts and re.match(r'\s*same\s*=>\s*n,Dial\(PJSIP/(100|101|102),30\)\s*(;.*)?$', value.rstrip('\r\n')):
            value = re.sub(r'Dial\(PJSIP/(100|101|102),30\)', 'Dial(PJSIP/' + mappings[line] + ',30)', value)
            counts[key] += 1
        result.append(value)
    if any(n != 1 for n in counts.values()):
        raise ValueError('Unerwarteter Wählplan: Änderung abgebrochen.')
    return ''.join(result)

def normalized(text):
    return rewrite_config(text, dict(zip(LINES, EXTENSIONS)))

def web_read():
    script = "const fs=require('fs');const p='/data/pbx-routing-request.json';process.stdout.write(fs.existsSync(p)?fs.readFileSync(p,'utf8'):'null')"
    return json.loads(run(['docker', 'exec', WEB, 'node', '-e', script]).stdout)

def publish(status, request_id=None):
    script = """const fs=require('fs');let t='';process.stdin.on('data',c=>t+=c);process.stdin.on('end',()=>{
 const x=JSON.parse(t);fs.writeFileSync('/data/pbx-routing.json.tmp',JSON.stringify(x.status),{mode:0o600});fs.renameSync('/data/pbx-routing.json.tmp','/data/pbx-routing.json');
 const p='/data/pbx-routing-request.json';if(x.requestId&&fs.existsSync(p)){const r=JSON.parse(fs.readFileSync(p,'utf8'));if(r.id===x.requestId)fs.unlinkSync(p)}
});"""
    run(['docker', 'exec', '-i', WEB, 'node', '-e', script],
        input=json.dumps({'status': status, 'requestId': request_id}))

def set_runtime(current, desired):
    changed = []
    try:
        for number in LINES:
            if current[number] == desired[number]:
                continue
            for context in CONTEXTS[number]:
                changed.append((number, context, current[number]))
                cli('dialplan add extension ' + number + ',2,Dial(PJSIP/' +
                    desired[number] + ',30) into ' + context + ' replace')
        if parse_live(cli('dialplan show')) != desired:
            raise ValueError('Rufzielprüfung fehlgeschlagen.')
    except Exception:
        rollback_failed = False
        for number, context, previous in reversed(changed):
            try:
                cli('dialplan add extension ' + number + ',2,Dial(PJSIP/' +
                    previous + ',30) into ' + context + ' replace')
            except Exception:
                rollback_failed = True
        if rollback_failed or parse_live(cli('dialplan show')) != current:
            raise RuntimeError('Rücksetzung nicht bestätigt; bitte Anlage prüfen.')
        raise

def save_state(value):
    STATE.parent.mkdir(exist_ok=True, mode=0o700)
    tmp = STATE.with_suffix('.tmp')
    tmp.write_text(json.dumps(value))
    tmp.chmod(0o600)
    tmp.replace(STATE)

def routing_tick():
    request = None
    try:
        current = parse_live(cli('dialplan show'))
        host = HOST.read_text()
        if not os.access(HOST, os.W_OK) or not os.access(HOST.parent, os.W_OK):
            raise ValueError('Host-Wählplan ist nicht beschreibbar. Rufziele bleiben unverändert.')
        container = run(['docker', 'exec', '-u', 'asterisk', '-w', '/', CONTAINER,
                         'cat', '/etc/asterisk/extensions.conf']).stdout
        if normalized(host) != normalized(container):
            raise ValueError('Host- und Container-Wählplan weichen außerhalb der Rufziele ab.')
        # Validate the complete config shape before exposing controls.
        rewrite_config(host, current)
        saved = json.loads(STATE.read_text()) if STATE.exists() else {}
        last = saved.get('lastRequest')
        request = web_read()
        if request is not None:
            if not isinstance(request, dict) or not re.fullmatch(r'[a-f0-9]{32}', str(request.get('id', ''))):
                raise ValueError('Ungültiger Änderungsauftrag.')
            desired = validate_mappings(request.get('mappings'))
            created = datetime.datetime.fromisoformat(request.get('createdAt', '').replace('Z', '+00:00'))
            age = (datetime.datetime.now(datetime.timezone.utc) - created).total_seconds()
            if age < -10 or age > 300:
                raise ValueError('Änderungsauftrag ist abgelaufen. Bitte erneut übernehmen.')
            if request.get('revision') != revision(current):
                raise ValueError('Zuordnung wurde inzwischen verändert. Bitte neu laden.')
            new_config = rewrite_config(host, desired)
            backup = HOST.with_name('extensions.conf.backup-web-' +
                         datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
            backup.write_text(host)
            backup.chmod(0o600)
            # Save requested routing separately first. A crash may be retried idempotently.
            try:
                set_runtime(current, desired)
                HOST.write_text(new_config)  # Keep the existing mount inode when shared.
                if HOST.read_text() != new_config:
                    raise ValueError('Dateiprüfung fehlgeschlagen.')
                last = {'id': request['id'], 'state': 'applied', 'at': now(),
                        'message': 'Rufziele übernommen und in Asterisk bestätigt.'}
                save_state({'mappings': desired, 'lastRequest': last})
                current = desired
            except Exception:
                try:
                    HOST.write_text(host)
                finally:
                    set_runtime(parse_live(cli('dialplan show')), current)
                raise
        elif saved.get('mappings'):
            # Reconcile only explicitly accepted website settings after a PBX reload.
            desired = validate_mappings(saved['mappings'])
            set_runtime(current, desired)
            current = desired
        status = {'checkedAt': now(), 'available': True, 'mappings': current,
                  'revision': revision(current), 'lastRequest': last}
        publish(status, request.get('id') if request else None)
        return status
    except Exception as exc:
        message = str(exc) if isinstance(exc, (ValueError, RuntimeError)) else 'Rufziel-Service derzeit nicht verfügbar.'
        status = {'checkedAt': now(), 'available': False, 'mappings': {},
                  'lastRequest': {'id': request.get('id'), 'state': 'failed',
                                  'at': now(), 'message': message} if isinstance(request, dict) else None,
                  'note': message}
        publish(status, request.get('id') if isinstance(request, dict) else None)
        return status
