import subprocess,json,re
C='tariq-telefonie-asterisk'
def cli(q):
 return subprocess.run(['docker','exec','-u','asterisk','-w','/',C,'asterisk','-rx',q],capture_output=True,text=True,timeout=15,check=True).stdout
for name in ('chan_websocket','res_http_websocket','res_ari','res_pjsip_transport_websocket','res_srtp','codec_opus'):
 out=cli('module show like '+name)
 rows=[line for line in out.splitlines() if re.match(r'^\S+\.so\s',line)]
 print('MODULE '+name+' '+json.dumps([{'name':line.split()[0],'running':'Not Running' not in line and 'Running' in line} for line in rows]))
http=cli('http show status')
print('HTTP '+json.dumps({'enabled':'Server Enabled' in http,'websocketMedia':'/media/' in http,'websocketSip':'/ws ' in http,'ari':'/ari' in http}))
for file in ('http.conf','ari.conf','rtp.conf'):
 r=subprocess.run(['docker','exec','-u','asterisk','-w','/',C,'cat','/etc/asterisk/'+file],capture_output=True,text=True,timeout=10)
 out=r.stdout
 print('CONFIG '+file+' '+json.dumps({'exists':r.returncode==0,'includes':bool(re.search(r'^[ \t]*#',out,re.M)),'enabled':bool(re.search(r'^[ \t]*enabled[ \t]*=[ \t]*yes\b',out,re.M))}))
