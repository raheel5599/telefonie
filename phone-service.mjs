import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {PHONE_DEVICES,PHONE_LINES} from './phone-accounts.mjs';
const APP='tariq-webphone',BASE='http://tariq-telefonie-asterisk:8088';
export function normalizePhoneTarget(raw){
 if(typeof raw==='string'){raw=raw.trim();if(['echo','100','101','102',...PHONE_DEVICES].includes(raw))return raw;}
 if(typeof raw!=='string')throw Error('Ungültige Rufnummer.');
 let n=raw.trim().replace(/[\s()./\-]/g,'');if(n.startsWith('0049'))n='0'+n.slice(4);else if(n.startsWith('+49'))n='0'+n.slice(3);
 if(!(/^(01[567][0-9]{7,9}|0[2-9][0-9]{5,10})$/.test(n))||['0137','0180','0190','0700','0800','0900'].some(p=>n.startsWith(p)))throw Error('Bitte eine reguläre deutsche Handy- oder Festnetznummer eingeben.');
 if(PHONE_LINES.includes('+49'+n.slice(1)))throw Error('Die eigene Firmennummer bitte über ein anderes Telefon testen.');
 return n;
}
export function createPhoneService({root,accounts,isAlive,fetcher=fetch,Socket=globalThis.WebSocket}){
 const leases=new Map(),calls=new Map(),channelCalls=new Map();let eventSocket=null,ready=false,stopped=false,retry=null,config=null;
 const key=device=>String(device),encode=encodeURIComponent;
 function backendConfig(){if(config)return config;try{const c=JSON.parse(fs.readFileSync(path.join(root,'private/webphone-backend.json'),'utf8'));if(c.user!=='tariq-webphone'||! /^[a-f0-9]{64}$/.test(c.password))return null;return config=c}catch{return null}}
 async function ari(method,resource,params={},body){
  const c=backendConfig();if(!c)throw Error('Browser-Telefonie wird vorbereitet.');
  const url=new URL('/ari/'+resource,BASE);for(const [k,v]of Object.entries(params))if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));
  const response=await fetcher(url,{method,headers:{Authorization:'Basic '+Buffer.from(c.user+':'+c.password).toString('base64'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Telefonanlage hat die Aktion nicht bestätigt.');
  return response.status===204?null:response.json();
 }
 const ownCall=identity=>[...calls.values()].find(c=>c.device===identity.device);
 function safeCall(c){return c?{id:c.id,from:c.from,to:c.to,company:c.company,status:c.status,incoming:c.incoming,startedAt:c.startedAt,test:c.test}:null}
 function state(identity){return {ready,online:!!leases.get(key(identity.device))?.response,device:identity.device,name:identity.name,company:identity.company,currentCall:safeCall(ownCall(identity))}}
 function send(lease){if(lease?.response&&!lease.response.destroyed)lease.response.write('event: state\ndata: '+JSON.stringify(state(lease.identity))+'\n\n')}
 function notify(device){send(leases.get(key(device)))}
 async function end(call){
  if(!call||call.ending)return;call.ending=true;clearTimeout(call.timer);calls.delete(call.id);
  call.socket?.destroy();
  const resources=[...new Set([call.media,call.peer,call.pendingPeer].filter(Boolean))];
  for(const id of resources)channelCalls.delete(id);
  await Promise.allSettled(resources.map(id=>ari('DELETE','channels/'+encode(id))));
  if(call.bridge)await ari('DELETE','bridges/'+encode(call.bridge)).catch(()=>{});
  notify(call.device);
 }
 function closeLease(device){const lease=leases.get(key(device));leases.delete(key(device));lease?.response?.end();for(const c of calls.values())if(c.device===device)void end(c)}
 function closeSession(sid){for(const [device,l] of leases)if(l.sid===sid)closeLease(device)}
 function revoke(accountId){for(const [device,l] of leases)if(l.identity.accountId===accountId)closeLease(device)}
 async function makeMedia(call){
  call.media='tw-media-'+call.id;channelCalls.set(call.media,call.id);
  await ari('POST','channels/externalMedia',{app:APP,external_host:'INCOMING',transport:'websocket',encapsulation:'none',connection_type:'server',format:'slin16',channelId:call.media});
  const value=await ari('GET','channels/'+encode(call.media)+'/variable',{variable:'MEDIA_WEBSOCKET_CONNECTION_ID'});
  if(!/^[a-f0-9-]{36}$/i.test(value?.value||''))throw Error('Audioverbindung konnte nicht vorbereitet werden.');
  call.mediaConnection=value.value;
 }
 async function bridge(call){
  if(call.bridge||call.bridging||call.ending||!call.mediaStarted||!call.peerStarted)return;
  call.bridging=true;
  const id='tw-bridge-'+call.id;await ari('POST','bridges',{type:'mixing,proxy_media',bridgeId:id});call.bridge=id;
  await ari('POST','bridges/'+id+'/addChannel',{channel:call.peer+','+call.media});
  call.status='active';call.startedAt=new Date().toISOString();clearTimeout(call.timer);call.timer=setTimeout(()=>void end(call),2*3600000);notify(call.device);
 }
 async function incoming(event){
  const device=event.args?.[1];if(!PHONE_DEVICES.includes(device)){await ari('DELETE','channels/'+encode(event.channel.id));return}
  const lease=leases.get(device);
  if(!lease?.response||!isAlive(lease.sid,lease.identity)||ownCall({device})){
   await ari('POST','channels/'+encode(event.channel.id)+'/continue',{context:'tariq-browser-incoming',extension:device,priority:2});return;
  }
  const account=lease.identity;let company=account.company;
  try{const dn=await ari('GET','channels/'+encode(event.channel.id)+'/variable',{variable:'MASTER_CHANNEL(CDR(dst))'});if(PHONE_LINES.includes(dn?.value))company=dn.value}catch{}
  const raw=event.channel.caller?.number||'';const from=/^\+?[0-9]{3,15}$/.test(raw)&&raw!==company?raw:null;
  const call={id:randomBytes(16).toString('hex'),device,owner:account.accountId||'admin',sid:lease.sid,peer:event.channel.id,incoming:true,from,to:company,company,status:'ringing'};
  calls.set(call.id,call);channelCalls.set(call.peer,call.id);call.timer=setTimeout(()=>void end(call),35000);notify(device);
 }
 async function handleEvent(event){
  if(event.type==='StasisStart'){
   if(event.args?.[0]==='incoming'){await incoming(event);return}
   const call=calls.get(channelCalls.get(event.channel?.id));
   if(call&&event.channel.id===call.media){call.mediaStarted=true;await bridge(call)}
   else if(call&&event.channel.id===call.pendingPeer){call.peer=event.channel.id;call.peerStarted=true;await bridge(call)}
  }
  if(event.type==='StasisEnd'||event.type==='ChannelDestroyed'){
   const call=calls.get(channelCalls.get(event.channel?.id));if(call)void end(call);
  }
 }
 function connectBackend(){
  if(stopped||eventSocket)return;const c=backendConfig();if(!c){retry=setTimeout(connectBackend,5000);retry.unref?.();return}
  const url=new URL('/ari/events',BASE.replace('http:','ws:'));url.searchParams.set('app',APP);url.searchParams.set('api_key',c.user+':'+c.password);
  const ws=new Socket(url,'ari');eventSocket=ws;
  ws.addEventListener('open',()=>{ready=true;for(const l of leases.values())send(l)});
  ws.addEventListener('message',e=>{try{const event=JSON.parse(String(e.data));void handleEvent(event).catch(()=>{})}catch{}});
  const lost=()=>{if(eventSocket!==ws)return;eventSocket=null;ready=false;for(const c of calls.values())void end(c);for(const l of leases.values())send(l);if(!stopped){retry=setTimeout(connectBackend,3000);retry.unref?.()}};
  ws.addEventListener('close',lost);ws.addEventListener('error',()=>{ws.close()});
 }
 const sweep=setInterval(()=>{for(const [device,l] of leases)if(!isAlive(l.sid,l.identity))closeLease(device);else send(l)},15000);sweep.unref?.();
 connectBackend();
 function connect(identity,sid){if(!ready)throw Error('Browser-Telefonie ist noch nicht bereit.');const old=leases.get(identity.device);if(old&&old.sid!==sid&&ownCall(identity))throw Error('Dieses Telefon wird gerade in einem anderen Fenster verwendet.');closeLease(identity.device);const lease={sid,identity,token:randomBytes(24).toString('hex'),response:null};leases.set(identity.device,lease);return {token:lease.token,...state(identity)}}
 function events(identity,sid,token,res){const lease=leases.get(identity.device);if(!lease||lease.sid!==sid||lease.token!==token)throw Error('Telefonverbindung abgelaufen. Bitte erneut online gehen.');lease.response?.end();lease.response=res;res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no','Connection':'keep-alive'});res.write(': phone\n\n');send(lease);res.on('close',()=>{if(leases.get(identity.device)===lease&&lease.response===res)closeLease(identity.device)})}
 function requireLease(identity,sid){const lease=leases.get(identity.device);if(!lease?.response||lease.sid!==sid||!ready)throw Error('Bitte zuerst online gehen.');return lease}
 async function call(identity,sid,input){
  requireLease(identity,sid);if(ownCall(identity))throw Error('Es läuft bereits ein Anruf.');
  const target=normalizePhoneTarget(input.target),company=identity.role==='admin'?input.company||identity.company:identity.company;
  if(!PHONE_LINES.includes(company))throw Error('Ungültige Absenderrufnummer.');
  if(PHONE_DEVICES.includes(target)){
   if(target===identity.device)throw Error('Du kannst dein eigenes Telefon nicht anrufen.');
   const destination=devices().find(d=>d.id===target);
   if(!destination)throw Error('Diese Browser-Nebenstelle ist nicht freigegeben.');
   if(!destination.online)throw Error('Telefon '+target+' ist offline. Bitte dort zuerst online gehen.');
   if(ownCall({device:target}))throw Error('Telefon '+target+' führt gerade ein Gespräch.');
  }

  const value={id:randomBytes(16).toString('hex'),device:identity.device,sid,owner:identity.accountId||'admin',incoming:false,from:['100','101','102',...PHONE_DEVICES].includes(target)?identity.device:company,to:target,company,status:'calling',test:target==='echo'};
  calls.set(value.id,value);value.timer=setTimeout(()=>void end(value),70000);
  try{
   await makeMedia(value);value.pendingPeer='tw-peer-'+value.id;channelCalls.set(value.pendingPeer,value.id);
   const internal=['100','101','102',...PHONE_DEVICES].includes(target);
   const endpoint=target==='echo'?'Local/s@tariq-browser-echo/n':PHONE_DEVICES.includes(target)?'Local/'+target+'@tariq-browser-incoming/n':['100','101','102'].includes(target)?'PJSIP/'+target:'Local/'+target+'@tariq-browser-outbound/n';
   await ari('POST','channels',{endpoint,app:APP,appArgs:'outgoing,'+value.id,channelId:value.pendingPeer,callerId:internal?identity.device:company,timeout:60},{variables:{__TARIQ_COMPANY:company}});
   notify(value.device);return safeCall(value);
  }catch(e){await end(value);throw e}
 }
 async function answer(identity,sid,id){requireLease(identity,sid);const c=ownCall(identity);if(!c||c.id!==id||!c.incoming||c.status!=='ringing')throw Error('Anruf nicht mehr verfügbar.');try{c.status='connecting';await makeMedia(c);await ari('POST','channels/'+encode(c.peer)+'/answer');c.peerStarted=true;await bridge(c);return safeCall(c)}catch(e){await end(c);throw e}}
 async function hangup(identity,id){const c=ownCall(identity);if(c&&(!id||c.id===id))await end(c)}
 async function dtmf(identity,id,digit){const c=ownCall(identity);if(!c||c.id!==id||c.status!=='active'||! /^[0-9*#]$/.test(digit))throw Error('Keine aktive Verbindung.');await ari('POST','channels/'+encode(c.peer)+'/dtmf',{dtmf:digit,duration:160})}
 function devices(){return [{device:'800',name:'Administrator · Browser',enabled:true},...accounts.list().filter(u=>u.enabled)].map(u=>({id:u.device,configured:true,registered:!!leases.get(u.device)?.response&&ready,online:!!leases.get(u.device)?.response&&ready,browser:true,name:u.name}))}
 async function upgrade(req,socket,head,identity,sid,callId){
  const c=ownCall(identity);if(!c||c.id!==callId||c.sid!==sid||!c.mediaConnection||c.socket){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return}
  c.socket=socket;
  const upstream=http.request({hostname:'tariq-telefonie-asterisk',port:8088,path:'/media/'+c.mediaConnection,method:'GET',headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Key':req.headers['sec-websocket-key'],'Sec-WebSocket-Version':'13','Sec-WebSocket-Protocol':'media'}});
  upstream.setTimeout(10000,()=>upstream.destroy());
  upstream.on('upgrade',(response,other,otherHead)=>{socket.write('HTTP/1.1 101 Switching Protocols\r\n'+response.rawHeaders.reduce((s,v,i,a)=>i%2?s:s+v+': '+a[i+1]+'\r\n','')+'\r\n');if(head.length)other.write(head);if(otherHead.length)socket.write(otherHead);socket.pipe(other).pipe(socket);other.on('error',()=>socket.destroy());socket.on('close',()=>{other.destroy();void end(c)})});
  upstream.on('response',()=>{socket.destroy();void end(c)});upstream.on('error',()=>{socket.destroy();void end(c)});upstream.end();
 }
 return {state,connect,events,call,answer,hangup,dtmf,upgrade,devices,closeSession,revoke,ari,ready:()=>ready,stop:()=>{stopped=true;clearTimeout(retry);clearInterval(sweep);eventSocket?.close();for(const d of leases.keys())closeLease(d)}};
}
