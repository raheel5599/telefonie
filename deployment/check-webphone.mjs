import fs from 'node:fs';import {randomBytes} from 'node:crypto';
const secret=JSON.parse(fs.readFileSync('/app/private/webphone-backend.json','utf8'));
const base='http://tariq-telefonie-asterisk:8088',app='tariq-webphone-probe',tag=randomBytes(10).toString('hex'),mediaId='probe-media-'+tag,peerId='probe-peer-'+tag,bridgeId='probe-bridge-'+tag;
const resources=[];let media,events,peerStarted=false;
async function ari(method,path,params={}){const url=new URL('/ari/'+path,base);for(const[k,v]of Object.entries(params))url.searchParams.set(k,v);const res=await fetch(url,{method,headers:{Authorization:'Basic '+Buffer.from(secret.user+':'+secret.password).toString('base64')},signal:AbortSignal.timeout(8000)});if(!res.ok)throw Error('Private Telefonprüfung nicht bestätigt: '+res.status);return res.status===204?null:res.json()}
const wait=async(predicate,message)=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,40))}throw Error(message)};
try{
 const url=new URL('/ari/events',base.replace('http:','ws:'));url.searchParams.set('app',app);url.searchParams.set('api_key',secret.user+':'+secret.password);
 events=new WebSocket(url,'ari');let open=false;events.onopen=()=>open=true;events.onmessage=e=>{try{const v=JSON.parse(String(e.data));if(v.type==='StasisStart'&&v.channel?.id===peerId)peerStarted=true}catch{}};events.onerror=()=>{};
 await wait(()=>open,'Steuerungsverbindung nicht bereit.');
 await ari('POST','channels/externalMedia',{app,external_host:'INCOMING',transport:'websocket',encapsulation:'none',connection_type:'server',format:'slin16',channelId:mediaId});resources.push(['channels',mediaId]);
 const connection=await ari('GET','channels/'+mediaId+'/variable',{variable:'MEDIA_WEBSOCKET_CONNECTION_ID'});
 if(!/^[a-f0-9-]{36}$/i.test(connection.value))throw Error('Audio-Kanal ohne Verbindungskennung.');
 let mediaReady=false,signal=0;
 media=new WebSocket(base.replace('http:','ws:')+'/media/'+connection.value,'media');media.binaryType='arraybuffer';
 media.onmessage=e=>{if(typeof e.data==='string'){if(e.data.includes('MEDIA_START'))mediaReady=true}else{const v=new DataView(e.data);for(let i=0;i+1<v.byteLength;i+=2)if(Math.abs(v.getInt16(i,true))>400)signal++}};
 media.onerror=()=>{};await wait(()=>mediaReady,'Audio-WebSocket nicht bereit.');
 await ari('POST','channels',{endpoint:'Local/s@tariq-browser-echo/n',app,appArgs:'probe',channelId:peerId,callerId:'800',timeout:'5'});resources.push(['channels',peerId]);
 await wait(()=>peerStarted,'Asterisk-Echo nicht bereit.');
 await ari('POST','bridges',{type:'mixing,proxy_media',bridgeId});resources.push(['bridges',bridgeId]);await ari('POST','bridges/'+bridgeId+'/addChannel',{channel:mediaId+','+peerId});
 for(let f=0;f<40;f++){const frame=new ArrayBuffer(640),v=new DataView(frame);for(let i=0;i<320;i++)v.setInt16(i*2,Math.round(Math.sin((f*320+i)*2*Math.PI*440/16000)*4000),true);media.send(frame);await new Promise(r=>setTimeout(r,20))}
 await wait(()=>signal>500,'Audio-Rückweg konnte nicht bestätigt werden.');
 console.log('Browser-Telefonie: private Steuerung, Audio-WebSocket und Asterisk-Echo bestätigt.');
 const publicPage=await fetch('https://telefonie.tariq-itconsulting.de/',{method:'HEAD',signal:AbortSignal.timeout(10000)});
 const policy=publicPage.headers.get('permissions-policy')||'';
 if(publicPage.status!==200||!policy.includes('microphone=(self)')||policy.includes('microphone=()'))throw Error('Öffentliche Mikrofonfreigabe wurde nicht bestätigt: '+policy);
 console.log('Telefonie-Mikrofonregel: auf der öffentlichen HTTPS-Seite bestätigt.');
}finally{
 media?.close();for(const[type,id]of resources)await ari('DELETE',type+'/'+id).catch(()=>{});events?.close();
}
