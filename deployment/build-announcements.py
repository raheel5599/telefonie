"""Build three German telephone announcements on the CI runner."""
import os
import pathlib
import subprocess
import tempfile
import wave

ROOT = pathlib.Path(__file__).resolve().parent.parent
NAMES = ('Tariq Fahrdienst', 'Tariq', 'Tariq Zulassungsservice')

def build():
    target = ROOT / 'public/audio'
    target.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for index, name in enumerate(NAMES, 1):
            text = 'Willkommen bei ' + name + '. Sie rufen außerhalb unserer Öffnungszeiten an. Bitte versuchen Sie es zu unseren Geschäftszeiten erneut. Vielen Dank.'
            source = str(pathlib.Path(tmp) / 'voice.wav')
            dest = target / ('tariq-closed-' + str(index) + '.wav')
            subprocess.run([os.environ.get('PIPER_PYTHON','/opt/piper/bin/python'), str(ROOT/'deployment/synthesize.py'), source],
                           input=text, text=True, check=True, timeout=30)
            subprocess.run(['sox', source, '-r', '8000', '-c', '1', '-b', '16', '-e', 'signed-integer', str(dest)],
                           check=True, timeout=30)
            with wave.open(str(dest)) as audio:
                if (audio.getnchannels(), audio.getframerate(), audio.getsampwidth()) != (1, 8000, 2):
                    raise ValueError('Ungültiges Audioformat')
                if not 3 < audio.getnframes() / 8000 < 60:
                    raise ValueError('Ungültige Ansagelänge')
            print('Deutsche Standardansage ' + str(index) + ' erstellt und geprüft.')

if __name__ == '__main__':
    build()

