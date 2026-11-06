import importlib.util
import pathlib
import unittest
import tempfile
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('setup_caller_id',pathlib.Path(__file__).parents[1]/'deployment/setup-caller-id.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CallerIdTests(unittest.TestCase):
    def test_only_telekom_endpoint_changes(self):
        text='[telekom-auth]\ntype=auth\npassword=fixture-secret\n\n[telekom]\ntype=endpoint\ncontext=from-telekom\ntrust_id_inbound=no\nsend_pai=no\n\n[telekom]\ntype=aor\ncontact=sip:tel.t-online.de\n\n[100]\ntype=endpoint\ntrust_id_inbound=no\n'
        result=module.update_config(text)
        self.assertEqual(result,text.replace('context=from-telekom\ntrust_id_inbound=no','context=from-telekom\ntrust_id_inbound=yes'))
        self.assertEqual(module.update_config(result),result)

    def test_missing_flag_is_added_only_to_provider(self):
        text='[telekom]\ntype=endpoint\ncontext=from-telekom\n\n[100]\ntype=endpoint\n'
        result=module.update_config(text)
        self.assertEqual(result.count('trust_id_inbound=yes'),1)
        self.assertLess(result.index('trust_id_inbound=yes'),result.index('[100]'))
        self.assertEqual(module.update_config(result),result)

    def test_ambiguous_or_changed_endpoint_is_rejected(self):
        for text in ('[telekom]\ntype=endpoint\ncontext=untrusted\n','[telekom]\ntype=aor\n','[telekom]\ntype=endpoint\ncontext=from-telekom\ntrust_id_inbound=no\ntrust_id_inbound=yes\n'):
            with self.assertRaises(ValueError):module.update_config(text)

    def exercise_sync(self, reject=False):
        active='[telekom]\ntype=endpoint\ncontext=from-telekom\ntrust_id_inbound=no\n[auth]\npassword=fixture-working-secret\n'
        stale='[default]\ntype=endpoint\n'
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);host=root/'asterisk/pjsip.conf';host.parent.mkdir();host.write_text(stale)
            state={'active':active}
            def run(args,**kwargs):
                if args[-2]=='cat':return state['active']
                if args[-2]=='tee':state['active']=kwargs['input'];return ''
                raise AssertionError('Unexpected command')
            def cli(command):
                if command=='module reload res_pjsip.so':return ''
                if command=='pjsip show endpoint telekom':
                    return 'trust_id_inbound : '+('true' if not reject and 'trust_id_inbound=yes' in state['active'] else 'false')
                raise AssertionError('Unexpected CLI')
            with patch.object(module,'ROOT',root),patch.object(module,'HOST',host),patch.object(module,'run',side_effect=run),patch.object(module,'cli',side_effect=cli):
                if reject:
                    with self.assertRaises(ValueError):module.setup()
                    self.assertEqual(host.read_text(),stale)
                    self.assertEqual(state['active'],active)
                else:
                    module.setup()
                    self.assertEqual(host.read_text(),state['active'])
                    self.assertIn('password=fixture-working-secret',host.read_text())
                    self.assertIn('trust_id_inbound=yes',host.read_text())
                backups=list((root/'private/caller-id-backups').glob('*/*'))
                self.assertEqual(len(backups),2)
                self.assertTrue(all(p.stat().st_mode & 0o777==0o600 for p in backups))

    def test_running_config_is_preserved_when_host_was_stale(self):
        self.exercise_sync()

    def test_failed_verification_restores_both_distinct_originals(self):
        self.exercise_sync(reject=True)

    def test_runtime_verification_checks_exact_option(self):
        self.assertTrue(module.enabled(' trust_id_inbound : true\n'))
        self.assertFalse(module.enabled(' trust_id_inbound : false\ntrust_id_outbound : true'))

if __name__=='__main__':unittest.main()
