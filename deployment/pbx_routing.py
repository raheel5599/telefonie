"""Controlled incoming-route changes; no SIP reload, restart or network changes."""
import datetime
import base64
import io
import wave
import hashlib
import json
import pathlib
import os
import re
import subprocess
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from business_hours import all_profiles, compile_program, is_open, TZ
from route_targets import normalize_target, dial_app, target_from_dial, validate_outbound

LINES = ('+4960316868187', '+4960316843466', '+4960316871811')
EXTENSIONS = ('100', '101', '102') + tuple(str(i) for i in range(800,820))
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
    return {line: normalize_target(value) for line, value in mappings.items()}

def revision(mappings, profiles=None, announcements=None):
    value = mappings if profiles is None else {'mappings': mappings, 'hours': profiles}
    if announcements is not None:
        value = {'settings': value, 'announcements': announcements}
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()

def parse_programs(output):
    result = {}
    context = line = None
    for text in output.splitlines():
        m = re.match(r"\[ Context '([^']+)'", text)
        if m:
            context, line = m[1], None
        m = re.match(r"\s*'([^']+)'\s*=>", text)
        if m:
            line = m[1]
        m = re.search(r'\b(\d+)\.\s+([A-Za-z][A-Za-z0-9]*)\((.*)\)', text)
        if m and context and line:
            result.setdefault((context, line), {})[int(m[1])] = m[2] + '(' + m[3] + ')'
    return result

def incoming_apps(output):
    programs = parse_programs(output)
    result = {}
    for number, contexts in CONTEXTS.items():
        apps = [programs.get((context, number), {}).get(2) for context in contexts]
        if not all(apps) or len(set(apps)) != 1:
            raise ValueError('Bestehende Rufverteilung ist nicht eindeutig lesbar.')
        app = apps[0]
        if target_from_dial(app) is None and not re.fullmatch(
                r'Gosub\(tariq-hours-[a-f0-9]{12},' + re.escape(number) + r',1\)', app):
            raise ValueError('Unerwartete Eingangsregel.')
        result[number] = app
    return result

def parse_live(output):
    programs = parse_programs(output)
    result = {}
    for number, app in incoming_apps(output).items():
        target = target_from_dial(app)
        if target:
            result[number] = target
        else:
            context = app.split('(', 1)[1].split(',', 1)[0]
            targets = [target_from_dial(a) for a in programs.get((context, number), {}).values()]
            targets = [target for target in targets if target]
            if len(targets) != 1:
                raise ValueError('Zeitregel enthält kein eindeutiges Rufziel.')
            result[number] = targets[0]
    return result

def strip_managed(text):
    begin, end = '; BEGIN TARIQ WEB HOURS V1', '; END TARIQ WEB HOURS V1'
    if begin not in text and end not in text:
        return text
    if text.count(begin) != 1 or text.count(end) != 1:
        raise ValueError('Ungültiger verwalteter Zeitregel-Block.')
    prefix, rest = text.split(begin)
    _, suffix = rest.split(end)
    if suffix.strip():
        raise ValueError('Unbekannter Inhalt hinter dem Zeitregel-Block.')
    return prefix.rstrip() + '\n'

def rewrite_apps(text, apps, managed=''):
    text = strip_managed(text)
    result, counts = [], {(n, c): 0 for n, contexts in CONTEXTS.items() for c in contexts}
    context = line = None
    for value in text.splitlines(keepends=True):
        m = re.match(r'\s*\[([^\]]+)\]', value)
        if m:
            context, line = m[1], None
        m = re.match(r'\s*exten\s*=>\s*([^,]+),', value)
        if m:
            line = m[1].strip()
        key = (line, context)
        if key in counts and re.match(r'\s*same\s*=>\s*n,(?:Dial\(PJSIP/(?:100|101|102),30\)|Dial\(Local/0[0-9]{6,11}@outbound-de/n,30\)|Dial\(Local/8[01][0-9]@tariq-browser-incoming/n,30\)|Gosub\(tariq-hours-[a-f0-9]{12},' + re.escape(line) + r',1\))\s*(;.*)?$', value.rstrip('\r\n')):
            value = re.sub(r'(?<=n,)(?:Dial|Gosub)\([^)]*\)', lambda m: apps[line], value, count=1)
            counts[key] += 1
        result.append(value)
    if any(n != 1 for n in counts.values()):
        raise ValueError('Unerwarteter Wählplan: Änderung abgebrochen.')
    text = ''.join(result)
    return text.rstrip() + '\n' + managed if managed else text

def rewrite_config(text, mappings):
    mappings = validate_mappings(mappings)
    return rewrite_apps(text, {n: dial_app(mappings[n]) for n in LINES})

def normalized(text):
    return rewrite_config(text, dict(zip(LINES, EXTENSIONS))).strip()

def compile_all(mappings, profiles):
    apps, programs = {}, {}
    for index, line in enumerate(LINES, 1):
        app, context, program = compile_program(line, mappings[line], profiles[line], index)
        apps[line] = app
        if context:
            programs[(context, line)] = program
    managed = ''
    if programs:
        managed = '\n; BEGIN TARIQ WEB HOURS V1\n'
        for (context, line), program in programs.items():
            managed += '[' + context + ']\n'
            for priority, app in enumerate(program, 1):
                managed += ('exten => ' + line + ',1,' if priority == 1 else ' same => n,') + app + '\n'
        managed += '; END TARIQ WEB HOURS V1\n'
    return apps, programs, managed

def prepare_programs(programs, output):
    loaded = parse_programs(output)
    active_contexts = {app.split('(', 1)[1].split(',', 1)[0]
                       for app in incoming_apps(output).values() if app.startswith('Gosub(')}
    for (context, line), apps in programs.items():
        expected = dict(enumerate(apps, 1))
        existing = loaded.get((context, line))
        if existing == expected:
            continue
        if context in active_contexts:
            raise ValueError('Aktive Zeitregel wurde außerhalb der Verwaltung verändert.')
        for priority, app in expected.items():
            cli('dialplan add extension ' + line + ',' + str(priority) + ',' + app +
                ' into ' + context + ' replace')
        if parse_programs(cli('dialplan show')).get((context, line)) != expected:
            raise ValueError('Zeitregelprüfung fehlgeschlagen.')

def sounds_ready():
    try:
        run(['docker', 'exec', '-u', 'asterisk', '-w', '/', CONTAINER,
             'test', '-r', '/usr/share/zoneinfo/Europe/Berlin'])
    except subprocess.SubprocessError:
        return False
    for i in (1, 2, 3):
        try:
            run(['docker', 'exec', '-u', 'asterisk', '-w', '/', CONTAINER,
                 'test', '-r', '/var/lib/asterisk/sounds/custom/tariq-closed-' + str(i) + '.wav'])
        except subprocess.SubprocessError:
            return False
    return True

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
    # Keep the public helper compatible with the original target-only tests.
    def as_apps(values):
        return {n: (v if v.startswith(('Dial(', 'Gosub(')) else dial_app(v)) for n, v in values.items()}
    current, desired = as_apps(current), as_apps(desired)
    changed = []
    try:
        for number in LINES:
            if current[number] == desired[number]:
                continue
            for context in CONTEXTS[number]:
                changed.append((number, context, current[number]))
                cli('dialplan add extension ' + number + ',2,' + desired[number] +
                    ' into ' + context + ' replace')
        if incoming_apps(cli('dialplan show')) != desired:
            raise ValueError('Rufzielprüfung fehlgeschlagen.')
    except Exception:
        rollback_failed = False
        for number, context, previous in reversed(changed):
            try:
                cli('dialplan add extension ' + number + ',2,' + previous +
                    ' into ' + context + ' replace')
            except Exception:
                rollback_failed = True
        if rollback_failed or incoming_apps(cli('dialplan show')) != current:
            raise RuntimeError('Rücksetzung nicht bestätigt; bitte Anlage prüfen.')
        raise

def save_state(value):
    STATE.parent.mkdir(exist_ok=True, mode=0o700)
    tmp = STATE.with_suffix('.tmp')
    tmp.write_text(json.dumps(value))
    tmp.chmod(0o600)
    tmp.replace(STATE)


def validate_announcement_id(value):
    if value != 'default' and (not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{32}', value)):
        raise ValueError('Ungültige Ansage.')
    return value

def validate_audio(data):
    if len(data) > 1500000:
        raise ValueError('Ansage ist zu groß.')
    try:
        with wave.open(io.BytesIO(data)) as audio:
            if (audio.getnchannels(), audio.getframerate(), audio.getsampwidth()) != (1, 8000, 2):
                raise ValueError('Ungültiges Ansagenformat.')
            duration = audio.getnframes() / 8000
            if not 0.1 <= duration <= 90:
                raise ValueError('Ungültige Ansagelänge.')
    except (wave.Error, EOFError):
        raise ValueError('Ungültige Audiodatei.')
    return hashlib.sha256(data).hexdigest()

def read_announcement(line, identifier):
    if line not in LINES:
        raise ValueError('Ungültige Rufnummer.')
    validate_announcement_id(identifier)
    script = """const fs=require('fs');let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{
 const x=JSON.parse(s),lines=['+4960316868187','+4960316843466','+4960316871811'],i=lines.indexOf(x.line);
 if(i<0||!(x.id==='default'||/^[a-f0-9]{32}$/.test(x.id)))process.exit(1);
 const p=x.id==='default'?'/app/public/audio/tariq-closed-'+(i+1)+'.wav':'/data/announcements/'+x.id+'.wav';
 if(fs.statSync(p).size>1500000)process.exit(1);
 const meta=x.id==='default'?{id:'default',line:x.line}:JSON.parse(fs.readFileSync('/data/announcements/'+x.id+'.json','utf8'));
 if(meta.id!==x.id||meta.line!==x.line)process.exit(1);
 process.stdout.write(JSON.stringify({meta,audio:fs.readFileSync(p).toString('base64')}));
});"""
    value = json.loads(run(['docker', 'exec', '-i', WEB, 'node', '-e', script],
                           input=json.dumps({'line': line, 'id': identifier})).stdout)
    data = base64.b64decode(value['audio'], validate=True)
    digest = validate_audio(data)
    meta = value['meta']
    if identifier != 'default' and (not isinstance(meta.get('text'), str) or not 1 <= len(meta['text']) <= 800):
        raise ValueError('Ungültiger Ansagetext.')
    return data, {'id': identifier, 'line': line, 'text': meta.get('text', ''),
                  'sha256': digest, 'duration': len(data) / 16000}

def installed_audio(line):
    target = '/var/lib/asterisk/sounds/custom/tariq-closed-' + str(LINES.index(line) + 1) + '.wav'
    return subprocess.run(['docker', 'exec', '-u', 'asterisk', '-w', '/', CONTAINER, 'cat', target],
                          check=True, capture_output=True, timeout=15).stdout

def install_announcement(line, data):
    digest = validate_audio(data)
    target = '/var/lib/asterisk/sounds/custom/tariq-closed-' + str(LINES.index(line) + 1) + '.wav'
    subprocess.run(['docker', 'exec', '-i', '-u', 'asterisk', '-w', '/', CONTAINER,
                    'tee', target + '.custom-tmp'], input=data, stdout=subprocess.DEVNULL,
                   stderr=subprocess.PIPE, check=True, timeout=15)
    run(['docker', 'exec', '-u', 'asterisk', '-w', '/', CONTAINER,
         'mv', target + '.custom-tmp', target])
    if hashlib.sha256(installed_audio(line)).hexdigest() != digest:
        raise ValueError('Ansageprüfung in Asterisk fehlgeschlagen.')


def routing_tick():
    request = None
    try:
        output = cli('dialplan show')
        current = parse_live(output)
        old_apps = incoming_apps(output)
        host = HOST.read_text()
        if not os.access(HOST, os.W_OK) or not os.access(HOST.parent, os.W_OK):
            raise ValueError('Host-Wählplan ist nicht beschreibbar.')
        container = run(['docker', 'exec', '-u', 'asterisk', '-w', '/', CONTAINER,
                         'cat', '/etc/asterisk/extensions.conf']).stdout
        if normalized(host) != normalized(container):
            raise ValueError('Host- und Container-Wählplan weichen außerhalb der verwalteten Regeln ab.')
        saved = json.loads(STATE.read_text()) if STATE.exists() else {}
        profiles = all_profiles(saved.get('hours', {}), LINES)
        announcements = dict(saved.get('announcements', {}))
        for line, active in announcements.items():
            if line not in LINES:
                raise ValueError('Ungültige gespeicherte Ansage.')
            if hashlib.sha256(installed_audio(line)).hexdigest() != active.get('sha256'):
                data, meta = read_announcement(line, active['id'])
                if meta['sha256'] != active.get('sha256'):
                    raise ValueError('Gespeicherte Ansage wurde außerhalb der Verwaltung verändert.')
                install_announcement(line, data)
        requested_audio = None
        old_audio = None
        desired = validate_mappings(saved.get('mappings', current))
        desired_profiles = profiles
        last = saved.get('lastRequest')
        configured_hours = [line for line in saved.get('configuredHours', []) if line in LINES]
        ready = sounds_ready()
        request = web_read()
        if request is not None:
            if not isinstance(request, dict) or not re.fullmatch(r'[a-f0-9]{32}', str(request.get('id', ''))):
                raise ValueError('Ungültiger Änderungsauftrag.')
            created = datetime.datetime.fromisoformat(request.get('createdAt', '').replace('Z', '+00:00'))
            age = (datetime.datetime.now(datetime.timezone.utc) - created).total_seconds()
            if age < -10 or age > 300:
                raise ValueError('Änderungsauftrag ist abgelaufen. Bitte erneut übernehmen.')
            if request.get('revision') != revision(current, profiles, announcements):
                raise ValueError('Einstellungen wurden inzwischen verändert. Bitte neu laden.')
            if request.get('kind') == 'announcement':
                if not ready or request.get('line') not in LINES:
                    raise ValueError('Ansage-Service nicht bereit.')
                data, metadata = read_announcement(request['line'], request.get('announcementId'))
                requested_audio = (request['line'], data, metadata)
            desired = validate_mappings(request.get('mappings'))
            desired_profiles = all_profiles(request.get('hours', profiles), LINES)
            if desired_profiles != profiles and not ready:
                raise ValueError('Die Geschlossen-Ansagen sind noch nicht bereit.')
        if any(target not in EXTENSIONS for target in desired.values()):
            validate_outbound(parse_programs(output))
        apps, programs, managed = compile_all(desired, desired_profiles)
        if programs and not ready:
            raise ValueError('Geschlossen-Ansage fehlt. Bestehende Regeln bleiben erhalten.')
        new_config = rewrite_apps(host, apps, managed)
        if request and request.get('kind') != 'announcement':
            backup = HOST.with_name('extensions.conf.backup-web-' +
                         datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
            backup.write_text(host)
            backup.chmod(0o600)
        prepare_programs(programs, output)
        try:
            set_runtime(old_apps, apps)
            if request:
                if requested_audio:
                    audio_line, data, metadata = requested_audio
                    old_audio = installed_audio(audio_line)
                    install_announcement(audio_line, data)
                    if metadata['id'] == 'default':
                        announcements.pop(audio_line, None)
                    else:
                        announcements[audio_line] = metadata
                if request.get('kind') != 'announcement':
                    HOST.write_text(new_config)
                if request.get('kind') != 'announcement' and HOST.read_text() != new_config:
                    raise ValueError('Dateiprüfung fehlgeschlagen.')
                last = {'id': request['id'], 'state': 'applied', 'at': now(),
                        'message': 'Ansage aktiviert und in Asterisk bestätigt.' if request.get('kind') == 'announcement' else 'Öffnungszeiten und Ansage in Asterisk aktiviert.' if request.get('kind') == 'hours' else 'Rufziele übernommen und in Asterisk bestätigt.'}
                if request.get('kind') == 'hours' and request.get('line') in LINES and request['line'] not in configured_hours:
                    configured_hours.append(request['line'])
                save_state({'mappings': desired, 'hours': desired_profiles, 'configuredHours': configured_hours, 'announcements': announcements, 'lastRequest': last})
        except Exception:
            try:
                if request and request.get('kind') != 'announcement':
                    HOST.write_text(host)
                if old_audio is not None:
                    install_announcement(request['line'], old_audio)
            finally:
                set_runtime(incoming_apps(cli('dialplan show')), old_apps)
            raise
        current = parse_live(cli('dialplan show'))
        local_now = datetime.datetime.now(datetime.timezone.utc).astimezone(TZ)
        status = {'checkedAt': now(), 'available': True, 'mappings': current,
                  'hours': desired_profiles, 'hoursReady': ready, 'hoursConfigured': configured_hours, 'announcements': announcements,
                  'today': local_now.date().isoformat(), 'timezone': 'Europe/Berlin',
                  'open': {n: is_open(desired_profiles[n], local_now) for n in LINES},
                  'revision': revision(current, desired_profiles, announcements), 'lastRequest': last}
        publish(status, request.get('id') if request else None)
        return status
    except Exception as exc:
        message = str(exc) if isinstance(exc, (ValueError, RuntimeError)) else 'Rufziel-Service derzeit nicht verfügbar.'
        status = {'checkedAt': now(), 'available': False, 'mappings': {}, 'hoursReady': False,
                  'lastRequest': {'id': request.get('id'), 'state': 'failed',
                                  'at': now(), 'message': message} if isinstance(request, dict) else None,
                  'note': message}
        publish(status, request.get('id') if isinstance(request, dict) else None)
        return status
