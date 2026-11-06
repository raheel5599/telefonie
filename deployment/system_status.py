"""Read WireGuard and policy-routing health without publishing keys or addresses."""
import json
import subprocess
import time


def read_command(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=4).stdout


def parse_handshakes(output, now):
    stamps = []
    for line in output.splitlines():
        fields = line.split()
        if len(fields) != 2 or not fields[1].isdigit():
            raise ValueError('Unrecognized handshake output')
        stamp = int(fields[1])
        if stamp > now + 10:
            raise ValueError('Future handshake')
        if stamp:
            stamps.append(stamp)
    if not stamps:
        return {'status': 'no-handshake', 'handshakeAgeSeconds': None}
    age = max(0, int(now - max(stamps)))
    return {'status': 'connected' if age <= 180 else 'idle', 'handshakeAgeSeconds': age}


def has_routing_rule(output):
    rules = json.loads(output)
    if not isinstance(rules, list):
        raise ValueError('Unrecognized routing rules')
    def number(value):
        try:
            return int(str(value), 0)
        except ValueError:
            return None
    return any(number(r.get('fwmark')) == 200 and number(r.get('table')) == 200
               and (r.get('fwmask') is None or number(r['fwmask']) == 4294967295)
               for r in rules if isinstance(r, dict))


def collect_system_status(reader=read_command, now=None):
    now = time.time() if now is None else now
    result = {'interface': 'wg-friedberg', 'status': 'unknown',
              'handshakeAgeSeconds': None, 'routingService': 'unknown', 'policyRule': None, 'reason': None}
    try:
        # Query only handshakes. Never use `wg show ... dump` (contains private keys).
        output = reader(['sudo', '-n', '/usr/bin/wg', 'show', 'wg-friedberg', 'latest-handshakes'])
        result.update(parse_handshakes(output, now))
    except subprocess.CalledProcessError as exc:
        error = (exc.stderr or '').lower()
        if any(word in error for word in ('password', 'permission', 'not permitted', 'not allowed', 'sudoers')):
            result['reason'] = 'permission-required'
    except (subprocess.SubprocessError, OSError, ValueError):
        pass
    try:
        state = reader(['systemctl', 'show', 'tariq-telefonie-routing.service', '--property=ActiveState', '--value']).strip()
        if state in ('active', 'inactive', 'failed', 'activating', 'deactivating'):
            result['routingService'] = state
    except (subprocess.SubprocessError, OSError):
        pass
    try:
        result['policyRule'] = has_routing_rule(reader(['ip', '-j', '-4', 'rule', 'show']))
    except (subprocess.SubprocessError, OSError, ValueError, TypeError):
        pass
    return result
