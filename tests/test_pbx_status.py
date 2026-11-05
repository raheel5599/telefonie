import importlib.util
import pathlib
import subprocess
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1] / 'deployment/collect-pbx-status.py'
spec = importlib.util.spec_from_file_location('collector', path)
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class StatusTests(unittest.TestCase):
    def test_registrations_mixed_states(self):
        result = collector.parse_registrations('''
telekom-registration/sip:tel.t-online.de auth Registered (exp. 123s)
telekom-registration-2/sip:tel.t-online.de:5060 auth2 Rejected
telekom-registration-3/sip:tel.t-online.de auth3 Unregistered
Objects found: 3
''')
        self.assertEqual([r['status'] for r in result], ['Registered', 'Rejected', 'Unregistered'])

    def test_endpoint_availability_is_not_inferred_from_contact_presence(self):
        result = collector.parse_endpoints('''
 Endpoint: 100/100 Not in use 0 of inf
 Contact: 100/sip:100@192.0.2.1 abc Avail 12
 Endpoint: 101/101 Unavailable 0 of inf
 Contact: 101/sip:101@192.0.2.2 def Unavail nan
 Endpoint: 102/102 Not in use 0 of inf
 Contact: 102/sip:102@192.0.2.3 ghi NonQual nan
Objects found: 3
''')
        self.assertEqual([e['online'] for e in result], [True, False, None])
        self.assertTrue(all(e['registered'] for e in result))

    def test_empty_endpoint_list(self):
        result = collector.parse_endpoints('No objects found.')
        self.assertTrue(all(not e['configured'] for e in result))

    def test_zero_and_two_legs_one_call(self):
        self.assertEqual(collector.parse_channels('0 active channels\n0 active calls\n'),
                         {'activeChannels': 0, 'activeCalls': 0})
        self.assertEqual(collector.parse_channels('2 active channels\n1 active call\n'),
                         {'activeChannels': 2, 'activeCalls': 1})

    def test_invalid_output_is_never_zero(self):
        for parser in (collector.parse_channels, collector.parse_endpoints, collector.parse_registrations):
            with self.assertRaises(ValueError):
                parser('Unable to connect to remote asterisk')

    def test_cron_preserves_existing_jobs_and_is_idempotent(self):
        old = '15 2 * * * /home/fpadmin/backup\n* * * * * old ' + collector.MARKER + '\n'
        with patch.object(collector.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, old, '')):
            with patch.object(collector, 'run') as write:
                collector.install_cron()
                content = write.call_args.kwargs['input']
                self.assertIn('15 2 * * * /home/fpadmin/backup', content)
                self.assertEqual(content.count(collector.MARKER), 1)

if __name__ == '__main__':
    unittest.main()
