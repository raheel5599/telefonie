import importlib.util
import pathlib
import unittest
spec=importlib.util.spec_from_file_location('webphone_setup',pathlib.Path(__file__).parents[1]/'deployment/setup-webphone.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class WebPhoneSetupTests(unittest.TestCase):
    def test_section_preserves_other_users_and_options(self):
        original='[general]\nenabled=no\npretty=yes\n[other-user]\npassword=unchanged-fixture\n'
        result=m.set_section(original,'general',{'enabled':'yes','bindport':'8088'})
        self.assertIn('pretty=yes',result);self.assertIn('password=unchanged-fixture',result)
        self.assertEqual(m.set_section(result,'general',{'enabled':'yes','bindport':'8088'}),result)
    def test_microphone_is_allowed_only_on_phone_domain(self):
        original='(security_headers) {\n header Permissions-Policy "microphone=()"\n}\napp.example.de {\n import security_headers\n}\ntelefonie.tariq-itconsulting.de {\n import security_headers\n reverse_proxy web:3095\n}\n'
        result=m.patch_caddy(original)
        self.assertEqual(result.count('microphone=(self)'),1)
        self.assertIn('app.example.de {\n import security_headers\n}',result)
        self.assertEqual(m.patch_caddy(result),result)
    def test_browser_include_is_before_immutable_hours(self):
        original='[internal]\nexten => 100,1,Hangup()\n; BEGIN TARIQ WEB HOURS V1\n[immutable]\n; END TARIQ WEB HOURS V1\n'
        result=m.with_include(original)
        self.assertLess(result.index('#include'),result.index('; BEGIN TARIQ WEB HOURS'))
        self.assertEqual(m.with_include(result),result)
    def test_devices_and_private_echo_are_scoped(self):
        program=m.browser_dialplan()
        self.assertEqual(program.count('Stasis(tariq-webphone,incoming,'),20)
        self.assertIn('[tariq-browser-echo]',program)
        self.assertIn('exten => 819,1,Stasis',program)
        self.assertNotIn('exten => 820',program)
if __name__=='__main__':unittest.main()
