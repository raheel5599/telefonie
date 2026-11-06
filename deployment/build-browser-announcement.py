import pathlib
import subprocess
import tempfile
import wave
ROOT=pathlib.Path(__file__).resolve().parent.parent
output=ROOT/'public/audio/tariq-browser-unavailable.wav';output.parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    raw=pathlib.Path(tmp)/'voice.wav'
    subprocess.run(['espeak-ng','-v','de','-s','150','-w',str(raw),'Das angerufene Telefon ist zurzeit nicht erreichbar. Bitte versuchen Sie es später erneut. Vielen Dank.'],check=True,capture_output=True)
    subprocess.run(['sox',str(raw),'-r','8000','-c','1','-b','16','-e','signed-integer',str(output)],check=True,capture_output=True)
with wave.open(str(output),'rb') as audio:
    assert (audio.getframerate(),audio.getnchannels(),audio.getsampwidth())==(8000,1,2)
print('Browser-Offlineansage erstellt.')
