"""Read-only CDR capability probe. Never prints actual call records."""
import csv
import json
import re
import subprocess

def read(*args):
    p = subprocess.run(['docker','exec','-u','asterisk','-w','/',
                        'tariq-telefonie-asterisk',*args],
                       capture_output=True,text=True,timeout=15)
    return p.returncode,p.stdout,p.stderr

for command in ('cdr show status','module show like cdr'):
    code,out,_ = read('asterisk','-rx',command)
    print(command + ':')
    print(out.strip() if code==0 else 'not available')
code,out,_ = read('date','+%Y-%m-%d %H:%M:%S %Z %z')
print('Container clock:',out.strip())
for name in ('cdr.conf','cdr_csv.conf','cdr_custom.conf'):
    code,out,_ = read('cat','/etc/asterisk/'+name)
    values={}
    for line in out.splitlines():
        m=re.match(r'\s*(enable|unanswered|congestion|usegmtime|loguniqueid|loguserfield|accountlogs)\s*=\s*(yes|no|true|false|[0-9]+)\s*(?:;.*)?$',line,re.I)
        if m:values[m[1]]=m[2]
    mappings=re.findall(r'^\s*([A-Za-z0-9_.-]+\.csv)\s*=>',out,re.M)
    print(name,json.dumps({'readable':code==0,'options':values,'mappingNames':mappings}))
for name in ('cdr-csv/Master.csv','cdr-custom/Master.csv','cdr-custom/tariq-calls.csv','master.db'):
    full='/var/log/asterisk/'+name
    code,out,_=read('stat','-c','%s',full)
    value={'exists':code==0,'bytes':out.strip() if code==0 else None}
    if code==0 and name.endswith('.csv'):
        code,tail,_=read('tail','-n','1',full)
        try:value['lastRowFieldCount']=len(next(csv.reader([tail.strip()])))
        except (ValueError,StopIteration,csv.Error):value['lastRowFieldCount']=None
    print(name,json.dumps(value))
code,out,_=read('sh','-c','test -w /etc/asterisk && printf writable')
print('CDR config directory:',out.strip() or 'not writable as asterisk')
