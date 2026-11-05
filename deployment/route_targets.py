"""Validated internal or ordinary German public telephone destinations."""
import re

EXTENSIONS = ('100', '101', '102')
OWN_LINES = ('+4960316868187', '+4960316843466', '+4960316871811')

def normalize_target(raw):
    if not isinstance(raw, str):
        raise ValueError('Ungültiges Rufziel.')
    if raw in EXTENSIONS:
        return raw
    value = re.sub(r'[\s()./\-]', '', raw.strip())
    if value.startswith('00'):
        value = '+' + value[2:]
    elif value.startswith('0'):
        value = '+49' + value[1:]
    if not re.fullmatch(r'\+49[1-9][0-9]{6,12}', value):
        raise ValueError('Bitte eine deutsche Handy- oder Festnetznummer eingeben.')
    national = '0' + value[3:]
    mobile = re.fullmatch(r'01[567][0-9]{7,9}', national)
    fixed = re.fullmatch(r'0[2-9][0-9]{5,10}', national)
    if not (mobile or fixed) or national.startswith(('0137', '0180', '0190', '0700', '0800', '0900')):
        raise ValueError('Bitte eine reguläre deutsche Handy- oder Festnetznummer eingeben.')
    if value in OWN_LINES:
        raise ValueError('Eine eigene Firmennummer kann nicht als externes Rufziel verwendet werden.')
    return value

def dial_app(raw):
    target = normalize_target(raw)
    if target in EXTENSIONS:
        return 'Dial(PJSIP/' + target + ',30)'
    national = '0' + target[3:]
    return 'Dial(Local/' + national + '@outbound-de/n,30)'

def target_from_dial(app):
    match = re.fullmatch(r'Dial\(PJSIP/(100|101|102),30\)', app)
    if match:
        return match[1]
    match = re.fullmatch(r'Dial\(Local/(0[0-9]{6,11})@outbound-de/n,30\)', app)
    if match:
        return normalize_target(match[1])
    return None

def validate_outbound(programs):
    outgoing = programs.get(('outbound-de', '_X.'), {})
    expected = 'Dial(PJSIP/' + chr(36) + '{EXTEN}@telekom,60)'
    if outgoing.get(3) != expected or outgoing.get(2) != 'Set(CALLERID(num)=+4960316868187)':
        raise ValueError('Der bestätigte Telekom-Ausgang ist derzeit nicht verfügbar. Rufziele bleiben unverändert.')
