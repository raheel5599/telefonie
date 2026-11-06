"""Prepare only Asterisk's private media cache for URI playback."""
import re,subprocess
PBX='tariq-telefonie-asterisk'
def run(user,*args):return subprocess.run(['docker','exec','-u',user,'-w','/',PBX,*args],check=True,capture_output=True,text=True,timeout=15).stdout
settings=run('asterisk','asterisk','-rx','core show settings')
match=re.search(r'Cache directory:[ \t]*(/[^\s]+)',settings,re.I)
if match:cache=match[1]
else:
    config=run('asterisk','cat','/etc/asterisk/asterisk.conf')
    match=re.search(r'^\s*astcachedir\s*(?:=>|=)\s*(/[^\s;]+)',config,re.M)
    cache=match[1] if match else '/var/cache/asterisk'
if cache not in ('/var/cache/asterisk','/var/lib/asterisk/cache'):raise ValueError('Unbekannter Audio-Cache; keine Rechteänderung durchgeführt.')
run('0','mkdir','-p',cache)
run('0','chown','asterisk:asterisk',cache)
run('0','chmod','750',cache)
run('asterisk','sh','-c','test -w "$1"','sh',cache)
print('Asterisk: privater Audio-Cache schreibbar vorbereitet.')
