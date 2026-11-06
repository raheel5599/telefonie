import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import net from 'node:net';
import {createPhoneAccounts,PHONE_LINES} from '../phone-accounts.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tariq-phone-auth-'));
const accounts=createPhoneAccounts(dir),created=await accounts.create({username:'desk',name:'Desk',company:PHONE_LINES[1]});
const getPort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
const port=await getPort(),base='http://127.0.0.1:'+port,server=spawn(process.execPath,['server.mjs'],{env:{...process.env,DATA_DIR:dir,PORT:String(port),APP_ORIGIN:base},stdio:'ignore'});
try{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/api/session')).ok)break}catch{}await new Promise(r=>setTimeout(r,50))}
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'desk',password:created.password,role:'admin',device:'800'})});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const headers={Cookie:cookie,Origin:base,'Content-Type':'application/json'};
 fs.writeFileSync(path.join(dir,'browser-call-history.json'),JSON.stringify([{id:'own',accountId:created.user.id,startedAt:new Date().toISOString(),incoming:true,missed:true},{id:'private-other',accountId:'someone-else',startedAt:new Date().toISOString()}]));
 const history=await (await fetch(base+'/api/phone/history?accountId=someone-else&device=800',{headers})).json();assert.deepEqual(history.calls.map(x=>x.id),['own']);
 const session=await (await fetch(base+'/api/session',{headers})).json();assert.equal(session.role,'phone');assert.equal(session.device,'801');assert.equal(session.company,PHONE_LINES[1]);
 for(const resource of ['/api/numbers','/api/settings','/api/settings/export','/api/calls','/api/pbx/status','/api/pbx/live','/api/pbx/hours','/api/phone/users'])assert.equal((await fetch(base+resource,{headers})).status,401,resource);
 assert.equal((await fetch(base+'/api/phone/status',{headers})).status,200);
 assert.equal((await fetch(base+'/api/phone/connect',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
 const nativeLogin=await fetch(base+'/api/native/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'desk',password:created.password})});
 assert.equal(nativeLogin.status,200);const native=await nativeLogin.json();assert.match(native.token,/^[a-f0-9]{64}$/);
 const nativeHeaders={Authorization:'Bearer '+native.token,Origin:base,'Content-Type':'application/json'};
 assert.equal((await (await fetch(base+'/api/session',{headers:nativeHeaders})).json()).device,'801');
 assert.equal((await fetch(base+'/api/settings',{headers:nativeHeaders})).status,401);
 assert.equal((await (await fetch(base+'/api/session',{headers:{Authorization:'Bearer '+cookie.split('=')[1]}})).json()).authenticated,false);
 assert.equal((await fetch(base+'/api/native/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 const changed=await fetch(base+'/api/phone/password',{method:'POST',headers,body:JSON.stringify({currentPassword:created.password,newPassword:'changed-phone-password',id:'someone-else'})});assert.equal(changed.status,200);
 assert.equal((await (await fetch(base+'/api/session',{headers})).json()).authenticated,false);
 assert.equal((await (await fetch(base+'/api/session',{headers:nativeHeaders})).json()).authenticated,false);
 assert.equal(await accounts.authenticate('desk',created.password),null);assert(await accounts.authenticate('desk','changed-phone-password'));
 await accounts.change({id:created.user.id,action:'disable'});
 assert.equal((await fetch(base+'/api/phone/status',{headers})).status,401);
 assert.equal((await (await fetch(base+'/api/session',{headers})).json()).authenticated,false);
 console.log('Phone-only login cannot reach any administrative API; forged roles, CSRF and revoked sessions rejected.');
}finally{if(server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true})}
