"""Read-only, token-redacted Asterisk playback diagnostics."""
import re,subprocess
PBX='tariq-telefonie-asterisk'
for module in ['res_http_media_cache','res_curl','format_wav']:
    r=subprocess.run(['docker','exec','-u','asterisk','-w','/',PBX,'asterisk','-rx','module show like '+module],capture_output=True,text=True)
    print(module+': '+re.sub(r'\s+',' ',r.stdout.strip())[:500])
r=subprocess.run(['docker','exec','-u','asterisk','-w','/',PBX,'tail','-60','/var/log/asterisk/messages.log'],capture_output=True,text=True)
for line in r.stdout.splitlines():
    if any(x in line.lower() for x in ['cache','playback','sound:','hold-audio','wav','storage']):
        line=re.sub(r'(?:sound:)?https?://[^\s\'\"]+','[private audio URL]',line)
        print(line[:600])
