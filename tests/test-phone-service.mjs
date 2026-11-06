import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';
import {createPhoneService,normalizePhoneTarget} from '../phone-service.mjs';
for(const target of ['09001234567','01801234567','+33123456789','100@evil','../channels','0170;Hangup()'])assert.throws(()=>normalizePhoneTarget(target));
assert.equal(normalizePhoneTarget('+49 170 1234567'),'01701234567');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tariq-service-'));fs.mkdirSync(path.join(root,'private'));fs.writeFileSync(path.join(root,'private/webphone-backend.json'),JSON.stringify({user:'tariq-webphone',password:'a'.repeat(64)}));
class Socket extends EventTarget{constructor(){super();Socket.current=this;queueMicrotask(()=>this.dispatchEvent(new Event('open')))}close(){}}
const requests=[];
const fetcher=async(url,options)=>{requests.push({url:new URL(url),options});return {ok:true,status:options.method==='DELETE'?204:200,json:async()=>String(url).includes('/variable')?{value:'12345678-1234-1234-1234-123456789012'}:{id:'fixture'}}};
const service=createPhoneService({root,accounts:{list:()=>[]},isAlive:()=>true,fetcher,Socket});
const one={role:'phone',accountId:'one',device:'801',company:'+4960316843466',name:'One'},two={role:'phone',accountId:'two',device:'802',company:'+4960316871811',name:'Two'};
const response=()=>Object.assign(new EventEmitter(),{destroyed:false,writeHead(){},write(){},end(){this.destroyed=true;this.emit('close')}});
try{
 await new Promise(r=>setImmediate(r));assert(service.ready());
 for(const [identity,sid]of [[one,'sid-one'],[two,'sid-two']]){const result=service.connect(identity,sid);service.events(identity,sid,result.token,response())}
 const c=await service.call(one,'sid-one',{target:'01701234567',company:two.company});
 const outgoing=requests.find(r=>r.url.pathname==='/ari/channels'&&r.options.method==='POST');assert.equal(outgoing.url.searchParams.get('callerId'),one.company);
 await assert.rejects(service.answer(two,'sid-two',c.id));await assert.rejects(service.dtmf(two,c.id,'1'));
 let rejected='';await service.upgrade({headers:{}},{end:s=>rejected=s},{length:0},two,'sid-two',c.id);assert(rejected.includes('403'));
 await service.hangup(two,c.id);assert.equal(service.state(one).currentCall.id,c.id);
 await service.hangup(one,c.id);assert.equal(service.state(one).currentCall,null);
 assert.throws(()=>service.events(two,'sid-two','bad-token',response()));
 console.log('Call ownership, protected media, assigned outbound caller ID and strict dial targets passed.');
}finally{service.stop();fs.rmSync(root,{recursive:true,force:true})}
