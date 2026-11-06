import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
export function createPhoneHistory(directory){
 const file=path.join(directory,'browser-call-history.json');
 const read=()=>{try{const rows=JSON.parse(fs.readFileSync(file,'utf8'));return Array.isArray(rows)?rows:[]}catch(e){if(e.code==='ENOENT')return [];throw e}};
 const retained=rows=>rows.filter(x=>Date.parse(x.startedAt)>=Date.now()-90*86400000).sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,5000);
 function record(call){
  if(call.test)return;
  const endedAt=new Date().toISOString(),internal=/^(100|101|102|8[01][0-9])$/.test(String(call.incoming?call.from:call.to));
  const row={id:'browser-'+call.id,conversationId:call.linkedId?createHash('sha256').update(call.linkedId).digest('hex').slice(0,24):null,accountId:call.owner,device:call.device,company:call.company,from:call.from,to:internal&&call.incoming?call.device:call.to,incoming:call.incoming,direction:internal?'internal':call.incoming?'incoming':'outgoing',startedAt:call.createdAt,endedAt,billsec:call.startedAt?Math.max(0,Math.floor((Date.now()-Date.parse(call.startedAt))/1000)):0,status:call.startedAt?'answered':call.incoming?'missed':'failed',missed:!!call.incoming&&!call.startedAt,duration:Math.max(0,Math.floor((Date.now()-Date.parse(call.createdAt))/1000))};
  const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(retained([row,...read().filter(x=>x.id!==row.id)])),{mode:0o600});fs.renameSync(tmp,file);
 }
 function query(identity,filter='all'){
  if(!['all','incoming','outgoing','missed','internal'].includes(filter))throw Error('Ungültiger Anruffilter.');
  let rows=retained(read());if(identity.role!=='admin')rows=rows.filter(x=>x.accountId===identity.accountId);
  if(filter==='missed')rows=rows.filter(x=>x.missed);else if(filter!=='all')rows=rows.filter(x=>filter==='internal'?x.direction==='internal':x.incoming===(filter==='incoming'));
  return {calls:rows.slice(0,200).map(({accountId,conversationId,...row})=>row),total:rows.length,retentionDays:90};
 }
 return {record,query,all:()=>retained(read())};
}
