import importlib.util
import pathlib
import subprocess
import unittest

spec = importlib.util.spec_from_file_location('system_status', pathlib.Path(__file__).parents[1] / 'deployment/system_status.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SystemStatusTests(unittest.TestCase):
    def test_handshake_age_and_no_key_export(self):
        self.assertEqual(module.parse_handshakes('PUBLIC-KEY 990\n', 1000), {'status':'connected','handshakeAgeSeconds':10})
        self.assertEqual(module.parse_handshakes('PUBLIC-KEY 1\n', 1000)['status'], 'idle')
        self.assertEqual(module.parse_handshakes('PUBLIC-KEY 0\n', 1000)['status'], 'no-handshake')
        with self.assertRaises(ValueError):
            module.parse_handshakes('PUBLIC-KEY 2000', 1000)

    def test_exact_policy_mark_and_table(self):
        self.assertTrue(module.has_routing_rule('[{"fwmark":"0xc8","table":200}]'))
        self.assertFalse(module.has_routing_rule('[{"fwmark":"0xc8","table":254}]'))
        self.assertFalse(module.has_routing_rule('[{"fwmark":"0xc8","table":200,"fwmask":"0xff"}]'))
        self.assertFalse(module.has_routing_rule('[]'))

    def test_permission_failure_is_unknown_without_breaking_other_checks(self):
        def reader(args):
            if args[0] == 'sudo':
                raise subprocess.CalledProcessError(1, args, stderr='sudo: a password is required')
            if args[0] == 'systemctl':
                return 'inactive\n'
            return '[{"fwmark":"0xc8","table":200}]'
        result = module.collect_system_status(reader, 1000)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(result['reason'], 'permission-required')
        self.assertEqual(result['routingService'], 'inactive')
        self.assertTrue(result['policyRule'])

if __name__ == '__main__':
    unittest.main()
