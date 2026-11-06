import datetime
import importlib.util
import json
import pathlib
import sys
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'deployment'))
import call_history as history
spec=importlib.util.spec_from_file_location('setup_cdr',pathlib.Path(__file__).resolve().parents[1]/'deployment/setup-cdr.py')
setup=importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

NOW=datetime.datetime.now(datetime.timezone.utc).timestamp()-100

def raw(**changes):
    data={'src':'01701234567','dst':history.LINES[0],'dcontext':'from-telekom',
          'channel':'PJSIP/telekom-000001','dstchannel':'PJSIP/100-000002',
          'lastapp':'Dial','lastdata':'PJSIP/100,30','start':NOW,'answer':NOW+5,
          'end':NOW+25,'duration':25,'billsec':20,'disposition':'ANSWERED',
          'uniqueid':'real-fixture-1','linkedid':'group-1','sequence':1}
    data.update(changes)
    return data

class HistoryTests(unittest.TestCase):
    def test_incoming_answered_phone_and_company(self):
        row=history.conversations([history.normalized_record(raw())])[0]
        self.assertEqual(row['direction'],'incoming')
        self.assertEqual(row['from'],'+491701234567')
        self.assertEqual(row['company'],history.LINES[0])
        self.assertEqual(row['billsec'],20)
        self.assertFalse(row['missed'])

    def test_wrong_self_number_is_not_displayed_as_caller(self):
        row=history.conversations([history.normalized_record(raw(src=history.LINES[0]))])[0]
        self.assertIsNone(row['from'])
        self.assertEqual(row['callerIdStatus'],'unconfirmed')
        self.assertEqual(row['to'],history.LINES[0])

    def test_failed_dial_without_created_target_is_unavailable(self):
        row=history.conversations([history.normalized_record(raw(disposition='FAILED',dstchannel='',billsec=0))])[0]
        self.assertEqual(row['failureReason'],'target-unavailable')
        row=history.conversations([history.normalized_record(raw(disposition='BUSY',billsec=0))])[0]
        self.assertIsNone(row['failureReason'])

    def test_missed_and_busy_are_not_answered(self):
        for disposition in ('NO ANSWER','BUSY','FAILED'):
            row=history.conversations([history.normalized_record(raw(disposition=disposition,billsec=0))])[0]
            self.assertTrue(row['missed'])
            self.assertNotEqual(row['status'],'answered')

    def test_forwarded_legs_merge_by_linked_id(self):
        first=history.normalized_record(raw(lastdata='Local/01709999999@outbound-de/n,30'))
        second=history.normalized_record(raw(src=history.LINES[0],dst='01709999999',
            dcontext='outbound-de',channel='Local/01709999999@outbound-de-0001;2',
            dstchannel='PJSIP/telekom-000003',lastdata='PJSIP/01709999999@telekom,60',
            uniqueid='forward-leg',sequence=2,start=NOW+1,end=NOW+25))
        rows=history.conversations([first,second])
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['direction'],'incoming')
        self.assertEqual(rows[0]['from'],'+491701234567')
        self.assertEqual(rows[0]['forwardedTo'],'+491709999999')
        self.assertEqual(rows[0]['billsec'],20)

    def test_outgoing_extension_uses_correct_company(self):
        item=raw(src=history.LINES[0],dst='03012345678',dcontext='outbound-de',
            channel='PJSIP/101-000004',dstchannel='PJSIP/telekom-000005',
            lastdata='PJSIP/03012345678@telekom,60')
        row=history.conversations([history.normalized_record(item)])[0]
        self.assertEqual(row['direction'],'outgoing')
        self.assertEqual(row['company'],history.LINES[1])
        self.assertEqual(row['to'],'+493012345678')

    def test_internal_call_is_separate(self):
        row=history.conversations([history.normalized_record(raw(src='100',dst='101',
            dcontext='internal',channel='PJSIP/100-1',dstchannel='PJSIP/101-2',
            lastdata='PJSIP/101,30'))])[0]
        self.assertEqual(row['direction'],'internal')

    def test_anonymous_caller_stays_anonymous(self):
        row=history.conversations([history.normalized_record(raw(src='anonymous'))])[0]
        self.assertIsNone(row['from'])

    def test_international_incoming_number_is_preserved(self):
        self.assertEqual(history.phone('+33 1 23 45 67 89'),'+33123456789')

    def test_partial_or_invalid_json_is_skipped(self):
        records,skipped=history.parse_records('broken\n'+json.dumps(raw())+'\n{"partial":')
        self.assertEqual(len(records),1)
        self.assertGreaterEqual(skipped,1)

    def test_invalid_dates_are_not_invented(self):
        with self.assertRaises(ValueError):
            history.normalized_record(raw(start=0,end=0))

    def test_setup_changes_only_logging_options(self):
        text='[general]\nunanswered=no\nbatch=no\n[csv]\nusegmtime=yes\nloguniqueid=yes\n'
        changed=setup.update_general(text)
        self.assertIn('unanswered=yes',changed)
        self.assertIn('batch=no',changed)
        self.assertIn('[csv]\nusegmtime=yes\nloguniqueid=yes',changed)
        self.assertEqual(setup.update_general(changed),changed)

    def test_custom_mapping_is_idempotent_and_preserves_other_sections(self):
        original='[another-file.json]\nformat=json\nfields=src,dst\n'
        changed=setup.custom_config(original)
        self.assertIn(original.strip(),changed)
        self.assertIn('start(double)',changed)
        self.assertIn('linkedid',changed)
        self.assertEqual(setup.custom_config(changed),changed)

if __name__=='__main__':
    unittest.main()
