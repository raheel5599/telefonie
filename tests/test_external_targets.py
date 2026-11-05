import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'deployment'))
import route_targets as targets
import business_hours as hours
import pbx_routing as routes
from test_pbx_routing import config, live, DEFAULT
from test_business_hours import execute, instant

PHONE = '+491705996911'

class ExternalTargetTests(unittest.TestCase):
    def test_formats_normalize_to_same_mobile(self):
        for value in ('01705996911', '0170 5996911', '+49 (170) 5996911', '0049-170-5996911'):
            self.assertEqual(targets.normalize_target(value), PHONE)

    def test_regular_landline_and_internal_targets(self):
        self.assertEqual(targets.normalize_target('030 12345678'), '+493012345678')
        self.assertEqual(targets.normalize_target('101'), '101')

    def test_reject_own_lines_loops_and_unsafe_numbers(self):
        for value in ('06031 6868187', '+4960316843466', '004960316871811',
                      '09001234567', '01371234567', '01801234567', '07001234567',
                      '+33123456789', '112', '0170;System(id)', 'PJSIP/100', 100):
            with self.assertRaises(ValueError, msg=str(value)):
                targets.normalize_target(value)

    def test_proven_telekom_outgoing_context_is_used(self):
        self.assertEqual(targets.dial_app(PHONE), 'Dial(Local/01705996911@outbound-de/n,30)')
        outgoing = {
            ('outbound-de', '_X.'): {
                2: 'Set(CALLERID(num)=+4960316868187)',
                3: 'Dial(PJSIP/' + chr(36) + '{EXTEN}@telekom,60)',
            }
        }
        targets.validate_outbound(outgoing)
        with self.assertRaises(ValueError):
            targets.validate_outbound({})

    def test_external_config_preserves_other_routes(self):
        desired = {**DEFAULT, routes.LINES[0]: PHONE}
        changed = routes.rewrite_config(config(), desired)
        self.assertIn('same => n,Dial(Local/01705996911@outbound-de/n,30)', changed)
        self.assertIn('exten => 100,1,Dial(PJSIP/100,30)', changed)
        self.assertIn('exten => _X.,1,Dial(PJSIP/100,60)', changed)
        self.assertEqual(routes.normalized(config()), routes.normalized(changed))

    def test_live_external_route_is_read_as_public_number(self):
        output = live(DEFAULT).replace('Dial(PJSIP/100,30)', 'Dial(Local/01705996911@outbound-de/n,30)')
        self.assertEqual(routes.parse_live(output)[routes.LINES[0]], PHONE)

    def test_external_routing_obeys_business_hours(self):
        p = hours.default_profile()
        p['enabled'] = True
        _, _, program = hours.compile_program(routes.LINES[0], PHONE, p, 1)
        self.assertIn('Dial(Local/01705996911@outbound-de/n,30)', program)
        self.assertEqual(execute(program, instant('2026-11-05', '10:00')), 'open')
        self.assertEqual(execute(program, instant('2026-11-05', '18:00')), 'closed')

    def test_failed_external_apply_rolls_back_internal_target(self):
        commands = []
        def fake(command):
            commands.append(command)
            return live(DEFAULT) if command == 'dialplan show' else 'Extension replaced'
        with patch.object(routes, 'cli', side_effect=fake):
            with self.assertRaises(ValueError):
                routes.set_runtime(DEFAULT, {**DEFAULT, routes.LINES[0]: PHONE})
        self.assertIn('dialplan add extension ' + routes.LINES[0] + ',2,Dial(PJSIP/100,30) into from-telekom replace', commands)

if __name__=='__main__':
    unittest.main()
