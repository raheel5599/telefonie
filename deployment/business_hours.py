"""Validated business hours and deterministic, per-call Asterisk programs."""
import datetime
import hashlib
import json
import re
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Berlin')
DAY_NAMES = ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')

def default_profile():
    return {'enabled': False, 'closedDate': None,
            'week': [{'enabled': i < 5, 'start': '09:00', 'end': '17:00'} for i in range(7)]}

def validate_profile(raw):
    if not isinstance(raw, dict) or type(raw.get('enabled')) is not bool:
        raise ValueError('Ungültiger Öffnungszeiten-Plan.')
    week = raw.get('week')
    if not isinstance(week, list) or len(week) != 7:
        raise ValueError('Der Wochenplan muss sieben Tage enthalten.')
    clean = []
    for entry in week:
        if not isinstance(entry, dict) or type(entry.get('enabled')) is not bool:
            raise ValueError('Ungültiger Wochentag.')
        start, end = entry.get('start'), entry.get('end')
        if not all(isinstance(v, str) and re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', v) for v in (start, end)):
            raise ValueError('Bitte gültige Uhrzeiten eingeben.')
        if start >= end:
            raise ValueError('Die Endzeit muss nach der Startzeit liegen. Nachtzeiten bitte auf zwei Tage aufteilen.')
        clean.append({'enabled': entry['enabled'], 'start': start, 'end': end})
    closed = raw.get('closedDate')
    if closed is not None:
        if not isinstance(closed, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', closed):
            raise ValueError('Ungültiges Schließdatum.')
        datetime.date.fromisoformat(closed)
    return {'enabled': raw['enabled'], 'closedDate': closed, 'week': clean}

def all_profiles(raw, lines):
    if not isinstance(raw, dict) or any(k not in lines for k in raw):
        raise ValueError('Ungültige Firmenprofile.')
    return {line: validate_profile(raw.get(line, default_profile())) for line in lines}

def is_open(profile, instant=None):
    local = (instant or datetime.datetime.now(datetime.timezone.utc)).astimezone(TZ)
    if profile['closedDate'] == local.date().isoformat():
        return False
    if not profile['enabled']:
        return True
    day = profile['week'][local.weekday()]
    time = local.strftime('%H:%M')
    return day['enabled'] and day['start'] <= time < day['end']

def preceding_minute(end):
    hour, minute = map(int, end.split(':'))
    value = hour * 60 + minute - 1
    return f'{value // 60:02d}:{value % 60:02d}'

def compile_program(line, extension, profile, sound_index):
    profile = validate_profile(profile)
    if not re.fullmatch(r'\+49\d{7,13}', line) or extension not in ('100', '101', '102') or sound_index not in (1, 2, 3):
        raise ValueError('Ungültiges Rufziel.')
    if not profile['enabled'] and not profile['closedDate']:
        return f'Dial(PJSIP/{extension},30)', None, []
    digest = hashlib.sha256(json.dumps([line, extension, profile], sort_keys=True).encode()).hexdigest()[:12]
    context = 'tariq-hours-' + digest
    program = ['NoOp(TARIQ-Web-Hours)']
    if profile['closedDate']:
        dollar = chr(36)
        program.append('GotoIf(' + dollar + '[' + dollar + '{STRFTIME(' + dollar + '{EPOCH},Europe/Berlin,%Y%m%d)}=' + profile['closedDate'].replace('-', '') + ']?CLOSED)')
    if profile['enabled']:
        for index, day in enumerate(profile['week']):
            if day['enabled']:
                program.append('GotoIfTime(' + day['start'] + '-' + preceding_minute(day['end']) +
                               ',' + DAY_NAMES[index] + ',*,*,Europe/Berlin?OPEN)')
    else:
        program.append('Goto(OPEN)')
    closed_priority = len(program) + 1
    program.extend(['Answer()', 'Wait(1)', f'Playback(custom/tariq-closed-{sound_index})', 'Hangup()'])
    open_priority = len(program) + 1
    program.extend([f'Dial(PJSIP/{extension},30)', 'Return()'])
    program = [value.replace('?CLOSED)', '?' + str(closed_priority) + ')')
                    .replace('?OPEN)', '?' + str(open_priority) + ')')
                    .replace('Goto(OPEN)', 'Goto(' + str(open_priority) + ')') for value in program]
    return f'Gosub({context},{line},1)', context, program
