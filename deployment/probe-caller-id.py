import subprocess,json,re,csv,io,pathlib
C='tariq-telefonie-asterisk'
OWN={'+4960316868187','+4960316843466','+4960316871811'}
def run(args):
 r=subprocess.run(['docker','exec','-u','asterisk','-w','/',C,*args],capture_output=True,text=True,timeout=15,check=True);return r.stdout
def norm(v):
 v=re.sub(r'[\s()/-]','',str(v or ''))
 if v.startswith('0049'):v='+'+v[2:]
 elif v.startswith('0'):v='+49'+v[1:]
 return v
def kind(v):
 n=norm(v)
 return 'own-line' if n in OWN else 'external-number' if re.fullmatch(r'\+?[0-9]{6,15}',n) else 'empty-or-non-numeric'
for name in ('telekom','telekom-2','telekom-3'):
 out=run(['asterisk','-rx','pjsip show endpoint '+name])
 if 'Unable to find' in out or 'not found' in out.lower():continue
 result={'endpoint':name}
 for key in ('trust_id_inbound','trust_id_outbound','send_pai','send_rpid','context'):
  m=re.search(r'^\s*'+key+r'\s*:\s*(.*)$',out,re.M);result[key]=m[1].strip() if m else None
 m=re.search(r'^\s*callerid\s*:\s*(.*)$',out,re.M)
 result['configuredCallerIdKind']=kind(m[1]) if m else None
 print('ENDPOINT '+json.dumps(result))
out=run(['tail','-c','1048576','/var/log/asterisk/cdr-custom/tariq-calls.json'])
rows=[]
for text in out.splitlines():
 try:raw=json.loads(text)
 except ValueError:continue
 rows.append({'srcKind':kind(raw.get('src')),'srcEqualsDst':raw.get('src')==raw.get('dst'),'dstOwn':norm(raw.get('dst')) in OWN,
 'hasClid':'clid' in raw,'clidHasExternal':bool(re.search(r'<\+?0?[1-9][0-9]{6,14}>',str(raw.get('clid') or ''))),
 'context':raw.get('dcontext') if raw.get('dcontext') in ('from-telekom','from-telekom-2','outbound-de','internal') else 'other',
 'channelKind':'trunk' if str(raw.get('channel','')).startswith('PJSIP/telekom-') else 'extension' if re.match(r'PJSIP/(100|101|102)-',str(raw.get('channel',''))) else 'other',
 'disposition':raw.get('disposition'),'lastapp':raw.get('lastapp')})
print('CDR_METADATA '+json.dumps(rows[-10:]))
try:
 out=run(['tail','-c','1048576','/var/log/asterisk/cdr-csv/Master.csv'])
 rows=[]
 for r in csv.reader(io.StringIO(out)):
  if len(r)>=16:
   nums=re.findall(r'<([^>]+)>',r[4])
   rows.append({'srcKind':kind(r[1]),'clidNumberKind':kind(nums[-1]) if nums else 'no-angle-number','clidEqualsSrc':norm(nums[-1])==norm(r[1]) if nums else None})
 print('CSV_METADATA '+json.dumps(rows[-10:]))
except Exception as exc:print('CSV_METADATA '+type(exc).__name__)
