import importlib.util
import pathlib
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1] / 'deployment/pbx_routing.py'
spec = importlib.util.spec_from_file_location('routes', path)
routes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(routes)
DEFAULT = dict(zip(routes.LINES, routes.EXTENSIONS))

def config():
    text = '[internal]\nexten => 100,1,Dial(PJSIP/100,30)\n[outbound-de]\nexten => _X.,1,Dial(PJSIP/100,60)\n'
    for line, contexts in routes.CONTEXTS.items():
        for context in contexts:
            text += '[' + context + ']\nexten => ' + line + ',1,NoOp(Test)\n same => n,Dial(PJSIP/' + DEFAULT[line] + ',30)\n same => n,Hangup()\n'
    return text

def live(mapping):
    text = ''
    for line, contexts in routes.CONTEXTS.items():
        for context in contexts:
            text += "[ Context '" + context + "' created by 'pbx_config' ]\n  '" + line + "' => 1. NoOp(Test)\n  2. Dial(PJSIP/" + mapping[line] + ",30)\n  3. Hangup()\n"
    return text

class RoutingTests(unittest.TestCase):
    def test_only_incoming_dial_targets_change(self):
        desired = {line: '102' for line in routes.LINES}
        changed = routes.rewrite_config(config(), desired)
        self.assertIn('exten => 100,1,Dial(PJSIP/100,30)', changed)
        self.assertIn('exten => _X.,1,Dial(PJSIP/100,60)', changed)
        self.assertEqual(changed.count('same => n,Dial(PJSIP/102,30)'), 4)
        self.assertEqual(routes.normalized(config()), routes.normalized(changed))

    def test_unknown_or_missing_route_aborts(self):
        with self.assertRaises(ValueError):
            routes.rewrite_config('[default]\nexten => _X.,1,Hangup(21)\n', DEFAULT)

    def test_duplicate_route_aborts(self):
        text = config().replace(' same => n,Dial(PJSIP/100,30)', ' same => n,Dial(PJSIP/100,30)\n same => n,Dial(PJSIP/100,30)', 1)
        with self.assertRaises(ValueError):
            routes.rewrite_config(text, DEFAULT)

    def test_reject_external_number_and_command_injection(self):
        for value in ('01701234567', '100;dialplan reload', '100,30)\\nSystem(id)', 100):
            with self.assertRaises(ValueError):
                routes.validate_mappings({**DEFAULT, routes.LINES[0]: value})

    def test_read_live_and_duplicate_context(self):
        self.assertEqual(routes.parse_live(live(DEFAULT)), DEFAULT)
        broken = live(DEFAULT).replace('Dial(PJSIP/101,30)', 'Dial(PJSIP/102,30)', 1)
        with self.assertRaises(ValueError):
            routes.parse_live(broken)

    def test_revision_changes_with_target(self):
        self.assertNotEqual(routes.revision(DEFAULT), routes.revision({**DEFAULT, routes.LINES[0]: '102'}))

    def test_failed_apply_restores_previous_targets(self):
        commands = []
        desired = {**DEFAULT, routes.LINES[0]: '102'}
        def fake(command):
            commands.append(command)
            if command == 'dialplan show':
                return live(DEFAULT)  # Force verification failure, then confirm rollback.
            return 'Extension replaced'
        with patch.object(routes, 'cli', side_effect=fake):
            with self.assertRaises(ValueError):
                routes.set_runtime(DEFAULT, desired)
        self.assertIn('dialplan add extension ' + routes.LINES[0] + ',2,Dial(PJSIP/100,30) into from-telekom replace', commands)

    def test_no_change_does_not_mutate_runtime(self):
        with patch.object(routes, 'cli', return_value=live(DEFAULT)) as cli:
            routes.set_runtime(DEFAULT, DEFAULT)
            self.assertEqual([x.args[0] for x in cli.call_args_list], ['dialplan show'])

if __name__ == '__main__':
    unittest.main()
