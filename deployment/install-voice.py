"""Download a pinned local German Piper voice; verify both artifacts."""
import hashlib,os,pathlib,time,urllib.request
ROOT=pathlib.Path(os.environ.get('PIPER_VOICE_DIR','/opt/tariq-voice'))
BASE='https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/high/'
FILES={'de_DE-thorsten-high.onnx':'9df1c43c61149ef9b39e618e2b861fbe41e1fcea9390b2dac62e8761573ea4f1','de_DE-thorsten-high.onnx.json':'6de734444e4c3f9e33b7ebe2746dbc19b71e85f613e79c65acf623200b99a76a'}
ROOT.mkdir(parents=True,exist_ok=True)
for name,digest in FILES.items():
    target=ROOT/name
    if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest()==digest:continue
    temp=target.with_suffix(target.suffix+'.download')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(BASE+name,timeout=60) as response,temp.open('wb') as out:
                while chunk:=response.read(1024*1024):out.write(chunk)
            if hashlib.sha256(temp.read_bytes()).hexdigest()!=digest:raise ValueError('Voice checksum mismatch')
            temp.replace(target);break
        except Exception:
            temp.unlink(missing_ok=True)
            if attempt==2:raise
            time.sleep(2)
print('Deutsche neuronale Stimme installiert und SHA-256 geprüft.')
