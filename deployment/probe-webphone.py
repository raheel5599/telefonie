import subprocess,re,json
C='tariq-telefonie-asterisk'
def run(args):return subprocess.run(['docker','exec','-u','asterisk','-w','/',C,*args],capture_output=True,text=True,timeout=15,check=True).stdout
http=run(['asterisk','-rx','http show status'])
print('HTTP_STATUS '+json.dumps(http.splitlines()[:8]))
reg=run(['asterisk','-rx','pjsip show registrations'])
print('REGISTERED '+str(len(re.findall(r'^\s*telekom-registration(?:-[23])?/\S+\s+\S+\s+Registered\b',reg,re.M))))
for name in ('http.conf','ari.conf'):
 text=run(['cat','/etc/asterisk/'+name])
 options=[line.strip() for line in text.splitlines() if re.match(r'^\s*(?:\[general\]|enabled\s*=|bindaddr\s*=|bindport\s*=|prefix\s*=)',line)]
 print('CONFIG_OPTIONS '+name+' '+json.dumps(options))
text=run(['tail','-n','2500','/var/log/asterisk/messages.log'])
for line in text.splitlines():
 if any(word in line for word in ('http.c:','res_ari/config.c:','res_ari.c:')) and not re.search(r'password|secret|authorization|api_key',line,re.I):
  print('HTTP_LOG '+re.sub(r'\+?[0-9]{7,}','[redacted]',line)[:400])
