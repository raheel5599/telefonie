import os
import pathlib
import subprocess
import tempfile
import wave
ROOT=pathlib.Path(__file__).resolve().parent.parent
output=ROOT/'public/audio/tariq-browser-unavailable.wav';output.parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    raw=pathlib.Path(tmp)/'voice.wav'
    subprocess.run([os.environ.get('PIPER_PYTHON','/opt/piper/bin/python'),str(ROOT/'deployment/synthesize.py'),str(raw)],input='Das angerufene Telefon ist zurzeit nicht erreichbar. Bitte versuchen Sie es später erneut. Vielen Dank.',text=True,check=True,capture_output=True,timeout=90)
    subprocess.run(['sox',str(raw),'-r','8000','-c','1','-b','16','-e','signed-integer',str(output)],check=True,capture_output=True)
with wave.open(str(output),'rb') as audio:
    assert (audio.getframerate(),audio.getnchannels(),audio.getsampwidth())==(8000,1,2)
print('Browser-Offlineansage erstellt.')

