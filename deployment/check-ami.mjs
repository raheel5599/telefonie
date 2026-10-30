import fs from 'node:fs';
import net from 'node:net';

const conf=fs.readFileSync(process.env.AMI_CONFIG||'/run/secrets/ami.conf','utf8');
const user=[...conf.matchAll(/^\[([^\]]+)\]/gm)].map(m=>m[1]).find(s=>s!=='general');
const secret=/^secret\s*=\s*(\S+)/m.exec(conf)?.[1];
if(!user||!secret){console.error('AMI secret unavailable');process.exit(1)}
const socket=net.createConnection({host:process.env.AMI_HOST||'tariq-telefonie-asterisk',port:5038});
let state='banner',data='',completed=false;
const finish=(ok,message)=>{if(completed)return;completed=true;console.log(ok?'AMI OK: '+message:'AMI ERROR: '+message);socket.destroy();process.exitCode=ok?0:1};
socket.setTimeout(6000,()=>finish(false,'timeout'));
socket.on('error',e=>finish(false,e.code||'connection failed'));
socket.on('data',chunk=>{
 data+=chunk.toString();
 if(data.length>32768)return finish(false,'oversized response');
 if(state==='banner'&&data.includes('Asterisk Call Manager/')){
  data='';state='login';socket.write('Action: Login\r\nUsername: '+user+'\r\nSecret: '+secret+'\r\nEvents: off\r\n\r\n');
 }else if(state==='login'&&data.includes('\r\n\r\n')){
  if(!data.includes('Response: Success'))return finish(false,'authentication rejected');
  data='';state='status';socket.write('Action: CoreStatus\r\n\r\n');
 }else if(state==='status'&&data.includes('\r\n\r\n')){
  if(!data.includes('Response: Success'))return finish(false,'CoreStatus rejected');
  finish(true,'CoreStatus granted; connection from web container works');
 }
});
