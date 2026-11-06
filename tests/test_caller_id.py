import importlib.util
import pathlib
import unittest

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

    def test_runtime_verification_checks_exact_option(self):
        self.assertTrue(module.enabled(' trust_id_inbound : true\n'))
        self.assertFalse(module.enabled(' trust_id_inbound : false\ntrust_id_outbound : true'))

if __name__=='__main__':unittest.main()
