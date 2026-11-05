#!/usr/bin/env python3
"""Read fixed Asterisk CLI queries; publish only status counters to the web volume."""
import datetime
import fcntl
import json
import pathlib
import re
import shlex
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MARKER = '# tariq-telefonie-status'

def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=15, **kwargs)

def query(command):
    output = run(['docker', 'exec', '-u', 'asterisk', '-w', '/',
                  'tariq-telefonie-asterisk', 'asterisk', '-rx', command]).stdout
    if 'Unable to connect' in output or 'No such command' in output:
        raise ValueError('Asterisk query unavailable')
    return output

def parse_registrations(output):
    if not re.search(r'(objects? found|No objects found)', output, re.I):
        raise ValueError('Unrecognized registrations output')
    result = []
    for line in output.splitlines():
        match = re.match(r'\s*(telekom-registration(?:-\d+)?)/\S+\s+\S+\s+(Registered|Unregistered|Rejected|Failed|Stopped)\b', line)
        if match:
            result.append({'id': match[1], 'status': match[2]})
    return result

def parse_endpoints(output):
    if not re.search(r'(objects? found|No objects found)', output, re.I):
        raise ValueError('Unrecognized endpoints output')
    sections = {}
    current = None
    for line in output.splitlines():
        match = re.match(r'\s*Endpoint:\s+([^\s/]+)(?:/\S+)?\s+', line)
        if match:
            current = match[1]
            sections[current] = []
        elif current and re.match(r'\s*Contact:', line) and '<' not in line:
            sections[current].append(line)
    result = []
    for ext in ('100', '101', '102'):
        contacts = sections.get(ext, [])
        online = (True if any(re.search(r'\bAvail\b', c) for c in contacts)
                  else None if any(re.search(r'\bNonQual\b', c) for c in contacts)
                  else False)
        result.append({'id': ext, 'configured': ext in sections,
                       'online': online, 'registered': bool(contacts)})
    return result

def parse_channels(output):
    channels = re.search(r'^(\d+) active channels?\b', output, re.M)
    calls = re.search(r'^(\d+) active calls?\b', output, re.M)
    if not channels or not calls:
        raise ValueError('Unrecognized channel counters')
    return {'activeChannels': int(channels[1]), 'activeCalls': int(calls[1])}

def collect():
    status = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'registrations': [], 'extensions': [], 'activeChannels': None,
              'activeCalls': None, 'errors': []}
    for name, command, parser in (
        ('registrations', 'pjsip show registrations', parse_registrations),
        ('extensions', 'pjsip show endpoints', parse_endpoints),
        ('channels', 'core show channels count', parse_channels),
    ):
        try:
            value = parser(query(command))
            if name == 'channels':
                status.update(value)
            else:
                status[name] = value
        except (subprocess.SubprocessError, ValueError, OSError):
            status['errors'].append(name)
    from pbx_routing import routing_tick
    try:
        route_status = routing_tick()
        print('Rufziel-Service: ' + ('bereit' if route_status['available'] else route_status.get('note', 'nicht bereit')))
    except (subprocess.SubprocessError, ValueError, OSError):
        print('Rufziel-Service derzeit nicht verfügbar.')
    status['monitoring'] = 'connected' if not status['errors'] else 'partial'
    # No caller numbers, credentials, CLI output or Docker socket enter the web app.
    writer = "const fs=require('fs');let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{JSON.parse(s);fs.writeFileSync('/data/pbx-status.json.tmp',s,{mode:0o600});fs.renameSync('/data/pbx-status.json.tmp','/data/pbx-status.json')});"
    run(['docker', 'exec', '-i', 'tariq-telefonie-telefonie-web-1', 'node', '-e', writer],
        input=json.dumps(status))
    print('Status gespeichert: ' + status['monitoring'])
    if status['errors']:
        print('Nicht verfügbar: ' + ', '.join(status['errors']))

def install_cron():
    previous = subprocess.run(['crontab', '-l'], capture_output=True, text=True, timeout=10)
    if previous.returncode and 'no crontab' not in previous.stderr.lower():
        raise RuntimeError('Bestehende crontab konnte nicht gelesen werden')
    lines = [line for line in previous.stdout.splitlines() if not line.endswith(MARKER)]
    script = shlex.quote(str(pathlib.Path(__file__).resolve()))
    lines.append('* * * * * /usr/bin/python3 ' + script + ' >/dev/null 2>&1 ' + MARKER)
    run(['crontab', '-'], input='\n'.join(lines) + '\n')
    print('Nur lesender Statusabruf jede Minute eingerichtet.')

if __name__ == '__main__':
    if '--install-cron' in sys.argv:
        install_cron()
    ROOT.joinpath('private').mkdir(exist_ok=True, mode=0o700)
    with ROOT.joinpath('private/pbx-status.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit(0)
        collect()
