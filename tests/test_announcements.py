import io
import pathlib
import sys
import unittest
import wave

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'deployment'))
import pbx_routing as routes

def wav():
    out=io.BytesIO()
    with wave.open(out,'wb') as value:
        value.setnchannels(1)
        value.setsampwidth(2)
        value.setframerate(8000)
        value.writeframes(b'\0' * 16000)
    return out.getvalue()

class AnnouncementTests(unittest.TestCase):
    def test_audio_hash_and_format(self):
        self.assertEqual(len(routes.validate_audio(wav())),64)
        with self.assertRaises(ValueError):
            routes.validate_audio(b'invalid')

    def test_identifier_rejects_paths_and_commands(self):
        self.assertEqual(routes.validate_announcement_id('default'),'default')
        self.assertEqual(routes.validate_announcement_id('a'*32),'a'*32)
        for value in ('../../etc/passwd','a;reboot','a'*33,None):
            with self.assertRaises(ValueError):
                routes.validate_announcement_id(value)

    def test_revision_includes_active_announcement(self):
        mapping=dict(zip(routes.LINES,routes.EXTENSIONS))
        self.assertNotEqual(routes.revision(mapping,{},{}),routes.revision(mapping,{},{
            routes.LINES[0]:{'id':'a'*32,'sha256':'b'*64}}))

if __name__=='__main__':
    unittest.main()
