import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('system_setup', pathlib.Path(__file__).parents[1] / 'deployment/setup-system-status.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SetupTests(unittest.TestCase):
    def test_existing_different_rule_is_not_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            target=pathlib.Path(directory)/'rule'
            target.write_text('existing administrator rule')
            with patch.object(module, 'TARGET', target), patch.object(module.os, 'geteuid', return_value=0), patch.object(module.pwd, 'getpwnam'), patch.object(module.shutil, 'which', return_value='/usr/sbin/visudo'), patch.object(pathlib.Path, 'is_file', return_value=True):
                with self.assertRaises(SystemExit):
                    module.main()
            self.assertEqual(target.read_text(), 'existing administrator rule')

    def test_rule_is_validated_before_install(self):
        with tempfile.TemporaryDirectory() as directory:
            target=pathlib.Path(directory)/'rule'
            def validate(args, **kwargs):
                self.assertFalse(target.exists())
                self.assertEqual(args[:2], ['/usr/sbin/visudo', '-cf'])
                self.assertEqual(pathlib.Path(args[2]).read_text(), module.RULE)
            with patch.object(module, 'TARGET', target), patch.object(module.os, 'geteuid', return_value=0), patch.object(module.pwd, 'getpwnam'), patch.object(module.shutil, 'which', return_value='/usr/sbin/visudo'), patch.object(pathlib.Path, 'is_file', return_value=True), patch.object(module.subprocess, 'run', side_effect=validate):
                module.main()
            self.assertEqual(target.read_text(), 'fpadmin ALL=(root) NOPASSWD: /usr/bin/wg show wg-friedberg latest-handshakes\n')
            self.assertEqual(target.stat().st_mode & 0o777, 0o440)

    def test_non_root_cannot_install(self):
        with patch.object(module.os, 'geteuid', return_value=1000):
            with self.assertRaises(SystemExit):
                module.main()

if __name__ == '__main__':
    unittest.main()
