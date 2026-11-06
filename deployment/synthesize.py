"""Synthesize locally; no announcement text is sent to a network service."""
import os,pathlib,sys,wave
from piper import PiperVoice,SynthesisConfig
model=pathlib.Path(os.environ.get('PIPER_VOICE_DIR','/opt/tariq-voice'))/'de_DE-thorsten-high.onnx'
text=sys.stdin.read().strip().replace('TARIQ','Tariq')
if not text or len(text)>800:raise ValueError('Invalid announcement text')
voice=PiperVoice.load(str(model))
with wave.open(sys.argv[1],'wb') as audio:
    voice.synthesize_wav(text,audio,syn_config=SynthesisConfig(length_scale=1.08,noise_scale=0.6,noise_w_scale=0.7,normalize_audio=True))
