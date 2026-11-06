import subprocess,json
code="""import fs from 'node:fs';
 const c=JSON.parse(fs.readFileSync('/app/private/webphone-backend.json','utf8'));
 const a=await fetch('http://tariq-telefonie-asterisk:8088/ari/applications/tariq-webphone',{headers:{Authorization:'Basic '+Buffer.from(c.user+':'+c.password).toString('base64')},signal:AbortSignal.timeout(8000)});
 const h=await fetch('https://telefonie.tariq-itconsulting.de/',{method:'HEAD',signal:AbortSignal.timeout(10000)});
 const asset=await fetch('https://telefonie.tariq-itconsulting.de/phone.js',{method:'HEAD',signal:AbortSignal.timeout(10000)});
 console.log(JSON.stringify({phoneApplicationRegistered:a.status===200,microphoneAllowed:(h.headers.get('permissions-policy')||'').includes('microphone=(self)'),httpsStatus:h.status,phoneScriptStatus:asset.status}));
"""
r=subprocess.run(['docker','exec','-w','/app','tariq-telefonie-telefonie-web-1','node','--input-type=module','-e',code],capture_output=True,text=True,timeout=40,check=True)
data=json.loads(r.stdout.strip())
print('PUBLIC_PHONE_CHECK '+json.dumps(data))
if not all((data['phoneApplicationRegistered'],data['microphoneAllowed'],data['httpsStatus']==200,data['phoneScriptStatus']==200)):raise SystemExit(1)
