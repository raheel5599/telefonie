import http from 'node:http';
import {createSpeechService} from './speech.mjs';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const pub=path.join(root,'public');
const logo=path.join(root,'5C4A17FB-CF3C-455D-9338-1AA5C79A5342.png');
const supabase='https://pvmqyxfwypzsgadxcmbn.supabase.co';
const apiKey='sb_publishable_JtRBXINBfKQWKHhIaqtytA_fgUeYjNI';
const adminEmail='raheel1501@gmail.com';
const adminId='73d61f82-e190-41f9-b828-e726cca98708';
const sessions=new Map(), attempts=new Map();
const storeDir=process.env.DATA_DIR||path.join(root,'data');
fs.mkdirSync(storeDir,{recursive:true,mode:0o700});
const speech=createSpeechService(storeDir);
const numbersPath=path.join(storeDir,'numbers.json');
function readStoredNumbers(){try{const data=JSON.parse(fs.readFileSync(numbersPath,'utf8'));return Array.isArray(data)?data:[]}catch(e){if(e.code==='ENOENT')return [];throw e}}
const numberDefaults=[
 {e164:'+4960316868187',label:'TARIQ Fahrdienst',extension:'100'},
 {e164:'+4960316843466',label:'TARIQ',extension:'101'},
 {e164:'+4960316871811',label:'TARIQ Zulassungsservice',extension:'102'}
];
function validNumberLabel(value){
 if(typeof value!=='string'||/[\x00-\x1f\x7f]/.test(value))throw Error('Bitte eine gültige Bezeichnung eingeben.');
 const label=value.trim().replace(/\s+/g,' ');
 if(!label||label.length>60)throw Error('Die Bezeichnung muss 1 bis 60 Zeichen enthalten.');
 return label;
}
function readNumbers(){
 const saved=readStoredNumbers();
 return numberDefaults.map(base=>{const row=saved.find(n=>n?.e164===base.e164);let label=base.label;
  if(row)try{label=validNumberLabel(row.label)}catch{}
  return {...base,label};
 });
}
function saveNumberProfile(input){
 if(!input||!numberDefaults.some(n=>n.e164===input.line))throw Error('Diese Rufnummer ist nicht eingerichtet.');
 const label=validNumberLabel(input.label),numbers=readNumbers();
 const number=numbers.find(n=>n.e164===input.line);number.label=label;writeNumbers(numbers);return number;
}
function writeNumbers(numbers){const temp=numbersPath+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(numbers,null,2),{mode:0o600});fs.renameSync(temp,numbersPath)}

const plansPath=path.join(storeDir,'routing-plans.json');
const allowedLines=['+4960316868187','+4960316843466','+4960316871811'];
const allowedExtensions=['100','101','102'];
function readPlans(){try{const v=JSON.parse(fs.readFileSync(plansPath,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch(e){if(e.code==='ENOENT')return {};throw e}}
function validatePlan(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Ungültiger Plan');
 const line=String(raw.line||''),extension=String(raw.extension||'');
 if(!allowedLines.includes(line)||!allowedExtensions.includes(extension))throw Error('Ungültige Rufnummer oder Nebenstelle');
 const enabled=raw.enabled===true;
 const start=String(raw.start||''),end=String(raw.end||'');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end)throw Error('Ungültige Öffnungszeiten');
 if(!Array.isArray(raw.days)||raw.days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Ungültige Wochentage');
 const days=[...new Set(raw.days)].sort();
 return {line,extension,enabled,days,start,end,updatedAt:new Date().toISOString(),applied:false};
}


function previewDialplan(){
 const plans=readPlans(),entries=[];
 for(const line of allowedLines){
  const p=plans[line];
  if(!p)continue;
  const destination='PJSIP/'+p.extension;
  const weekdays=['mon','tue','wed','thu','fri','sat','sun'];
  const times=p.start.replace(':','')+'-'+p.end.replace(':','');
  const days=p.days.map(i=>weekdays[i]).join('&');
  entries.push({line,extension:p.extension,enabled:p.enabled,days:p.days,start:p.start,end:p.end,
   description:p.enabled?'Zeitfenster '+p.start+'–'+p.end+' ('+days+'), sonst unveränderte bestehende Route':'Nur Rufziel-Entwurf, Zeitregel deaktiviert',
   proposedRoute:'Dial('+destination+',30)',applied:false});
 }
 return {mode:'preview-only',applied:false,entries,warning:'Vorschau: Keine Änderungen an extensions.conf oder laufenden Gesprächen. Geschlossen-Ansage und Zeitregel werden noch nicht aktiviert.'};
}

function normalizeE164(raw){const value=String(raw||'').trim().replace(/[()\s/.-]/g,'');let number=value.startsWith('00')?'+'+value.slice(2):value;if(/^0[1-9]\d+$/.test(number))number='+49'+number.slice(1);if(!/^\+[1-9]\d{6,14}$/.test(number))throw Error('Bitte eine gültige internationale Rufnummer eingeben, z. B. +496031123456.');return number}


async function readAmiStatus(){
 const config=fs.readFileSync(process.env.AMI_CONFIG||'/run/secrets/ami.conf','utf8');
 const user=/^\[([^\]]+)\]/gm;const names=[...config.matchAll(user)].map(x=>x[1]);const username=names.find(x=>x!=='general');
 const secret=/^secret\s*=\s*(\S+)/m.exec(config)?.[1];
 if(!username||!secret)throw Error('AMI credentials missing');
 return new Promise((resolve,reject)=>{
  const client=net.createConnection({host:process.env.AMI_HOST||'tariq-telefonie-asterisk',port:5038});
  let buffer='',stage=0,done=false;
  const finish=(err,data)=>{if(done)return;done=true;client.destroy();err?reject(err):resolve(data)};
  client.setTimeout(4500,()=>finish(Error('AMI timeout')));
  client.on('error',err=>finish(err));
  client.on('data',chunk=>{
   buffer+=chunk.toString('utf8');
   if(buffer.length>16000)return finish(Error('AMI response too large'));
   if(stage===0&&buffer.includes('Asterisk Call Manager/')){
    client.write('Action: Login\r\nUsername: '+username+'\r\nSecret: '+secret+'\r\nEvents: off\r\n\r\n');buffer='';stage=1;
   }else if(stage===1&&buffer.includes('\r\n\r\n')){
    if(!buffer.includes('Response: Success'))return finish(Error('AMI authentication rejected'));
    buffer='';stage=2;client.write('Action: Ping\r\n\r\n');
   }else if(stage===2&&buffer.includes('\r\n\r\n')){
    if(!buffer.includes('Response: Success'))return finish(Error('AMI Ping not permitted'));
    const lines=Object.fromEntries(buffer.split('\r\n').filter(x=>x.includes(': ')).map(x=>{const n=x.indexOf(': ');return [x.slice(0,n),x.slice(n+2)]}));
    finish(null,{connected:true,checkedAt:new Date().toISOString()});
   }
  });
 });
}


function readLivePbx(){
 const file=path.join(storeDir,'pbx-status.json');
 let data;
 try{data=JSON.parse(fs.readFileSync(file,'utf8'))}catch{return {monitoring:'unavailable',registrations:[],extensions:[],activeChannels:null,activeCalls:null,note:'Statusabruf noch nicht verfügbar'}}
 const age=Date.now()-Date.parse(data.checkedAt);
 if(!Number.isFinite(age)||age< -10000||age>150000)return {monitoring:'stale',checkedAt:data.checkedAt,registrations:[],extensions:[],activeChannels:null,activeCalls:null,note:'Statusdaten sind veraltet'};
 const errors=Array.isArray(data.errors)?data.errors:[];
 return {monitoring:errors.length?'partial':'connected',checkedAt:data.checkedAt,
  registrations:Array.isArray(data.registrations)?data.registrations:[],
  extensions:Array.isArray(data.extensions)?data.extensions:[],
  activeChannels:Number.isInteger(data.activeChannels)&&data.activeChannels>=0?data.activeChannels:null,
  activeCalls:Number.isInteger(data.activeCalls)&&data.activeCalls>=0?data.activeCalls:null,
  errors};
}




function audioRange(value,length){
 if(!value)return null;
 const m=/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!m||(!m[1]&&!m[2]))throw Error('Ungültiger Bereich');
 const start=m[1]?Number(m[1]):Math.max(0,length-Number(m[2]));
 const end=m[1]?(m[2]?Math.min(Number(m[2]),length-1):length-1):length-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=length||end<start||(!m[1]&&Number(m[2])<=0))throw Error('Ungültiger Bereich');
 return {start,end};
}

function todayBerlin(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const value=type=>parts.find(p=>p.type===type).value;
 return value('year')+'-'+value('month')+'-'+value('day');
}
function validateHours(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.enabled!=='boolean'||typeof raw.closedToday!=='boolean')throw Error('Ungültiger Öffnungszeiten-Plan.');
 if(!Array.isArray(raw.week)||raw.week.length!==7)throw Error('Bitte alle sieben Wochentage angeben.');
 const week=raw.week.map(day=>{
  if(!day||typeof day.enabled!=='boolean'||typeof day.start!=='string'||typeof day.end!=='string'||
   !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(day.end)||day.start>=day.end)throw Error('Die Endzeit muss nach der Startzeit liegen. Nachtzeiten bitte auf zwei Tage aufteilen.');
  return {enabled:day.enabled,start:day.start,end:day.end};
 });
 return {enabled:raw.enabled,closedDate:raw.closedToday?todayBerlin():null,week};
}

function readRouting(){
 let value;
 try{value=JSON.parse(fs.readFileSync(path.join(storeDir,'pbx-routing.json'),'utf8'))}catch{return {available:false,mappings:{},note:'Rufziel-Service wird vorbereitet.'}}
 const age=Date.now()-Date.parse(value.checkedAt);
 if(!Number.isFinite(age)||age< -10000||age>150000)return {available:false,mappings:{},note:'Rufziel-Status ist veraltet. Bitte erneut laden.'};
 let pending=null;
 try{const r=JSON.parse(fs.readFileSync(path.join(storeDir,'pbx-routing-request.json'),'utf8'));pending={id:r.id,createdAt:r.createdAt}}catch{}
 return {...value,pending};
}
function normalizeRouteTarget(raw,extensions,own){
 if(typeof raw!=='string')throw Error('Ungültiges Rufziel.');
 if(extensions.includes(raw))return raw;
 let value=raw.trim().replace(/[\s()./\-]/g,'');
 if(value.startsWith('00'))value='+'+value.slice(2);
 else if(value.startsWith('0'))value='+49'+value.slice(1);
 if(!/^\+49[1-9][0-9]{6,12}$/.test(value))throw Error('Bitte eine deutsche Handy- oder Festnetznummer eingeben.');
 const national='0'+value.slice(3);
 if(!(/^01[567][0-9]{7,9}$/.test(national)||/^0[2-9][0-9]{5,10}$/.test(national))||['0137','0180','0190','0700','0800','0900'].some(p=>national.startsWith(p)))throw Error('Bitte eine reguläre deutsche Handy- oder Festnetznummer eingeben.');
 if(own.includes(value))throw Error('Eine eigene Firmennummer kann nicht als externes Rufziel verwendet werden.');
 return value;
}

function queueRouting(input,kind='routing'){
 const status=readRouting();
 if(!status.available)throw Error(status.note||'Rufziel-Service nicht bereit.');
 if(status.pending)throw Error('Eine Änderung wird bereits übernommen.');
 if(!input||typeof input!=='object'||input.revision!==status.revision)throw Error('Zuordnung wurde verändert. Bitte neu laden.');
 let mappings=input.mappings;let hours=status.hours||{};
 if(kind==='announcement'){
  if(!status.hoursReady||!allowedLines.includes(input.line))throw Error('Ansage-Service nicht bereit.');
  if(input.announcementId!=='default')speech.getDraft(input.line,input.announcementId);
  mappings=status.mappings;
 }
 if(kind==='hours'){
  if(!status.hoursReady)throw Error('Die Geschlossen-Ansagen sind noch nicht bereit.');
  if(!allowedLines.includes(input.line))throw Error('Ungültige Rufnummer.');
  mappings=status.mappings;hours={...hours,[input.line]:validateHours(input.profile)};
 }
 if(!mappings||typeof mappings!=='object'||Array.isArray(mappings)||
  Object.keys(mappings).length!==allowedLines.length||
  allowedLines.some(line=>!Object.hasOwn(mappings,line)))throw Error('Ungültige Rufziel-Zuordnung.');
 mappings=Object.fromEntries(allowedLines.map(line=>[line,normalizeRouteTarget(mappings[line],allowedExtensions,allowedLines)]));
 const request={id:randomBytes(16).toString('hex'),createdAt:new Date().toISOString(),revision:status.revision,mappings,hours,kind,line:['hours','announcement'].includes(kind)?input.line:null,announcementId:kind==='announcement'?input.announcementId:null};
 const pending=path.join(storeDir,'pbx-routing-request.json'),temp=pending+'.'+request.id;
 fs.writeFileSync(temp,JSON.stringify(request),{mode:0o600,flag:'wx'});
 try{fs.linkSync(temp,pending)}finally{fs.unlinkSync(temp)}
 return {id:request.id,state:'pending',message:'Einstellungen werden innerhalb einer Minute übernommen.'};
}


function readInfrastructure(now=Date.now()){
 let data;try{data=JSON.parse(fs.readFileSync(path.join(storeDir,'pbx-status.json'),'utf8'))}catch{return {status:'unknown',checkedAt:null}}
 const age=now-Date.parse(data.checkedAt),fresh=Number.isFinite(age)&&age>=-10000&&age<=150000;
 const wg=data.wireguard;
 if(!fresh||!wg)return {status:fresh?'unknown':'stale',checkedAt:data.checkedAt||null};
 return {status:['connected','idle','no-handshake','unknown'].includes(wg.status)?wg.status:'unknown',
  checkedAt:data.checkedAt,handshakeAgeSeconds:Number.isInteger(wg.handshakeAgeSeconds)&&wg.handshakeAgeSeconds>=0?wg.handshakeAgeSeconds:null,
  routingService:['active','inactive','failed','activating','deactivating'].includes(wg.routingService)?wg.routingService:'unknown',
  policyRule:typeof wg.policyRule==='boolean'?wg.policyRule:null};
}
function buildSettingsExport(){
 let routing;try{routing=JSON.parse(fs.readFileSync(path.join(storeDir,'pbx-routing.json'),'utf8'))}catch{routing={}}
 const current=readRouting();
 const numbers=readNumbers().map(number=>{
  let target=null;try{target=normalizeRouteTarget(routing.mappings?.[number.e164],allowedExtensions,allowedLines)}catch{}
  let hours=null;const raw=routing.hours?.[number.e164];
  if(raw)try{const clean=validateHours({...raw,closedToday:false});hours={...clean,closedDate:/^\d{4}-\d{2}-\d{2}$/.test(raw.closedDate)?raw.closedDate:null}}catch{}
  const announcement=routing.announcements?.[number.e164];
  return {...number,target,hours,announcement:{mode:announcement?'custom':'standard',text:typeof announcement?.text==='string'?announcement.text.slice(0,800):null}};
 });
 return {format:'tariq-telefonie-settings',version:1,exportedAt:new Date().toISOString(),
  routingCheckedAt:routing.checkedAt||null,routingCurrent:current.available===true,pendingChangesExcluded:true,
  contents:['Firmenbezeichnungen','Rufziele','Öffnungszeiten','Gespeicherte eigene Ansagetexte'],
  excluded:['Zugangsdaten','Ansage-Audiodateien','Anrufliste','Server- und SIP-Konfiguration'],numbers};
}

function queryCallHistory(params,now=Date.now()){
 const allowedFilters=['all','incoming','outgoing','missed','internal'];
 const filter=params.get('filter')||'all',company=params.get('company')||'all';
 const dayValue=params.get('days')||'30',pageValue=params.get('page')||'1';
 if(!allowedFilters.includes(filter)||(company!=='all'&&!allowedLines.includes(company))||!['7','30','90'].includes(dayValue)||!/^[1-9][0-9]{0,4}$/.test(pageValue))throw Error('Ungültige Anruflisten-Auswahl.');
 const q=(params.get('q')||'').trim().slice(0,80),days=Number(dayValue);
 let data;
 try{data=JSON.parse(fs.readFileSync(path.join(storeDir,'call-history.json'),'utf8'))}catch{data={calls:[],source:{available:false,note:'Anrufliste wird vorbereitet.'}}}
 const age=now-Date.parse(data.checkedAt),fresh=Number.isFinite(age)&&age>=-10000&&age<=180000;
 const source={...data.source,checkedAt:data.checkedAt||null,
  status:data.source?.available?(fresh?'connected':'stale'):'unavailable'};
 const labels=new Map(readNumbers().map(n=>[n.e164,n.label]));
 let selected=(Array.isArray(data.calls)?data.calls:[]).map(row=>row?{...row,companyLabel:labels.get(row.company)||row.companyLabel}:row).filter(row=>row&&Number.isFinite(Date.parse(row.startedAt))&&Date.parse(row.startedAt)>=now-days*86400000);
 if(company!=='all')selected=selected.filter(row=>row.company===company);
 if(q){
  const numeric=/^[+0-9\s()./\-]+$/.test(q);
  let needle=numeric?q.replace(/\D/g,''):q.toLowerCase();
  if(numeric&&needle.startsWith('00'))needle=needle.slice(2);
  else if(numeric&&needle.startsWith('0'))needle='49'+needle.slice(1);
  selected=selected.filter(row=>{
   const values=[row.from,row.to,row.forwardedTo,row.company,row.extension,row.companyLabel].filter(v=>v!=null);
   return values.some(v=>(numeric?String(v).replace(/\D/g,''):String(v).toLowerCase()).includes(needle));
  });
 }
 const stats={total:selected.length,incoming:selected.filter(r=>r.direction==='incoming').length,
  outgoing:selected.filter(r=>r.direction==='outgoing').length,internal:selected.filter(r=>r.direction==='internal').length,
  missed:selected.filter(r=>r.missed===true).length};
 if(filter==='missed')selected=selected.filter(r=>r.missed===true);
 else if(filter!=='all')selected=selected.filter(r=>r.direction===filter);
 const pageSize=25,total=selected.length,pages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(Number(pageValue),pages);
 return {source,stats,filter,company,days,q,page,pageSize,pages,total,calls:selected.slice((page-1)*pageSize,page*pageSize)};
}

const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js'};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const respond=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))};
const cookie=req=>/\btelefonie_session=([a-f0-9]{64})/.exec(req.headers.cookie||'')?.[1];
async function supabaseRequest(endpoint,options={}){
 const r=await fetch(supabase+'/auth/v1'+endpoint,{...options,redirect:'error',signal:AbortSignal.timeout(12000),headers:{apikey:apiKey,'Content-Type':'application/json',...options.headers}});
 if(!r.ok)throw Error('Supabase '+r.status);
 return r.json();
}
const approved=u=>u?.id===adminId&&u.email?.toLowerCase()===adminEmail&&u.email_confirmed_at&&!u.is_anonymous;
function assurance(u,token){
 if(!u.factors?.some(f=>f.status==='verified'))return true;
 try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url')).aal==='aal2'}catch{return false}
}
async function authenticated(req){
 const sid=cookie(req),entry=sessions.get(sid);
 if(!entry)return false;
 if(entry.until<Date.now()){sessions.delete(sid);return false}
 try{
  if(entry.refreshAt<Date.now()){
   const t=await supabaseRequest('/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:entry.refresh})});
   entry.access=t.access_token;entry.refresh=t.refresh_token;entry.refreshAt=Date.now()+(Number(t.expires_in)||3600)*1000-60000;
  }
  const u=await supabaseRequest('/user',{headers:{Authorization:'Bearer '+entry.access}});
  if(!approved(u)||!assurance(u,entry.access)){sessions.delete(sid);return false}
  return true;
 }catch{return false}
}
async function readBody(req){
 let total=0,parts=[];
 for await(const part of req){total+=part.length;if(total>4096)throw Error('Eingabe zu lang');parts.push(part)}
 return JSON.parse(Buffer.concat(parts).toString()||'{}');
}
function checkPost(req){const origin=process.env.APP_ORIGIN||'https://telefonie.tariq-itconsulting.de';return req.headers.origin===origin&&String(req.headers['content-type']||'').startsWith('application/json')}
http.createServer(async(req,res)=>{
 const pathname=new URL(req.url||'/', 'http://localhost').pathname;
 try{
 if(pathname==='/api/session'&&req.method==='GET')return respond(res,200,{authenticated:await authenticated(req),email:adminEmail});
 if(pathname==='/api/login'&&req.method==='POST'){
  if(!checkPost(req))return respond(res,403,{error:'Ungültige Anfrage'});
  const key=req.socket.remoteAddress||'client',now=Date.now(),v=attempts.get(key)||{until:0,count:0};
  if(now>v.until){v.count=0;v.until=now+60000}if(++v.count>8)return respond(res,429,{error:'Zu viele Anmeldeversuche'});attempts.set(key,v);
  const b=await readBody(req);
  if(String(b.email||'').trim().toLowerCase()!==adminEmail||typeof b.password!=='string'||!b.password||b.password.length>512)return respond(res,401,{error:'Anmeldung fehlgeschlagen'});
  let t,u;
  try{
   t=await supabaseRequest('/token?grant_type=password',{method:'POST',body:JSON.stringify({email:adminEmail,password:b.password})});
   u=await supabaseRequest('/user',{headers:{Authorization:'Bearer '+t.access_token}});
  }catch{return respond(res,401,{error:'Anmeldung fehlgeschlagen'})}
  if(!approved(u)||!assurance(u,t.access_token)||!t.refresh_token)return respond(res,403,{error:'Kein bestätigter Administratorzugang'});
  const sid=randomBytes(32).toString('hex');
  sessions.set(sid,{access:t.access_token,refresh:t.refresh_token,refreshAt:Date.now()+(Number(t.expires_in)||3600)*1000-60000,until:Date.now()+12*3600000});
  res.setHeader('Set-Cookie','telefonie_session='+sid+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200');
  return respond(res,200,{ok:true});
 }
 if(pathname==='/api/logout'&&req.method==='POST'){
  if(!checkPost(req))return respond(res,403,{error:'Ungültige Anfrage'});
  sessions.delete(cookie(req));
  res.setHeader('Set-Cookie','telefonie_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
  return respond(res,200,{ok:true});
 }




 if(pathname==='/api/settings'&&req.method==='GET'){
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  const session=sessions.get(cookie(req));
  return respond(res,200,{checkedAt:new Date().toISOString(),wireguard:readInfrastructure(),
   access:{email:adminEmail,role:'Administrator',expiresAt:session?new Date(session.until).toISOString():null},
   routing:{available:readRouting().available===true},
   callHistory:queryCallHistory(new URLSearchParams()).source});
 }
 if(pathname==='/api/settings/export'&&req.method==='GET'){
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  res.setHeader('Content-Disposition','attachment; filename="tariq-telefonie-einstellungen-'+new Date().toISOString().slice(0,10)+'.json"');
  return respond(res,200,buildSettingsExport());
 }

 if(pathname==='/api/calls'&&req.method==='GET'){
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  try{return respond(res,200,queryCallHistory(new URL(req.url,'http://localhost').searchParams))}catch(e){return respond(res,400,{error:e.message})}
 }

 if(pathname==='/api/pbx/hours'){
  if(!['GET','POST'].includes(req.method))return respond(res,405,{error:'Methode nicht erlaubt'});
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  if(req.method==='GET')return respond(res,200,{...readRouting(),drafts:readPlans(),announcementDrafts:speech.latest()});
  if(!checkPost(req))return respond(res,403,{error:'Ungültiger Ursprung'});
  try{return respond(res,202,queueRouting(await readBody(req),'hours'))}catch(e){return respond(res,409,{error:e.code==='EEXIST'?'Eine Änderung wird bereits übernommen.':e.message})}
 }

 if(pathname==='/api/pbx/announcement-draft'&&req.method==='POST'){
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  if(!checkPost(req))return respond(res,403,{error:'Ungültiger Ursprung'});
  try{
   const input=await readBody(req),draft=await speech.generate(input.line,input.text);
   return respond(res,200,{draft});
  }catch(e){return respond(res,400,{error:e.message})}
 }
 if(pathname==='/api/pbx/announcement'&&req.method==='POST'){
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  if(!checkPost(req))return respond(res,403,{error:'Ungültiger Ursprung'});
  try{return respond(res,202,queueRouting(await readBody(req),'announcement'))}catch(e){return respond(res,409,{error:e.code==='EEXIST'?'Eine Änderung wird bereits übernommen.':e.message})}
 }

 if(pathname==='/api/pbx/announcement'&&['GET','HEAD'].includes(req.method)){
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  const line=new URL(req.url,'http://localhost').searchParams.get('line');
  const index=allowedLines.indexOf(line);
  if(index<0)return respond(res,400,{error:'Ungültige Rufnummer'});
  try{
   const preview=new URL(req.url,'http://localhost').searchParams.get('draft');
   const active=readRouting().announcements?.[line]?.id;
   const id=preview||active;
   const data=fs.readFileSync(id?speech.audioPath(line,id):path.join(pub,'audio','tariq-closed-'+(index+1)+'.wav'));
   let range;
   try{range=audioRange(req.headers.range,data.length)}catch{res.writeHead(416,{'Content-Range':'bytes */'+data.length});return res.end()}
   const headers={'Content-Type':'audio/wav','Content-Length':range?range.end-range.start+1:data.length,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
   if(range)headers['Content-Range']='bytes '+range.start+'-'+range.end+'/'+data.length;
   res.writeHead(range?206:200,headers);
   return res.end(req.method==='HEAD'?'':range?data.subarray(range.start,range.end+1):data);
  }catch{return respond(res,404,{error:'Ansage wird vorbereitet'})}
 }

 if(pathname==='/api/pbx/routing'){
  if(!['GET','POST'].includes(req.method))return respond(res,405,{error:'Methode nicht erlaubt'});
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  if(req.method==='GET')return respond(res,200,readRouting());
  if(!checkPost(req))return respond(res,403,{error:'Ungültiger Ursprung'});
  try{return respond(res,202,queueRouting(await readBody(req)))}catch(e){return respond(res,409,{error:e.code==='EEXIST'?'Eine Änderung wird bereits übernommen.':e.message})}
 }

 if(pathname==='/api/routing-preview'&&req.method==='GET'){
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  return respond(res,200,previewDialplan());
 }
 if(pathname==='/api/routing-plans'){
  if(!['GET','POST'].includes(req.method))return respond(res,405,{error:'Methode nicht erlaubt'});
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  if(req.method==='GET')return respond(res,200,{plans:readPlans(),applied:false});
  if(!checkPost(req))return respond(res,403,{error:'Ungültiger Ursprung'});
  let plan;try{plan=validatePlan(await readBody(req))}catch(e){return respond(res,400,{error:e.message})}
  const all=readPlans();all[plan.line]=plan;
  const tmp=plansPath+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(all,null,2),{mode:0o600});fs.renameSync(tmp,plansPath);
  return respond(res,200,{plan,applied:false});
 }
 if(pathname==='/api/pbx/live'&&req.method==='GET'){
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  try{return respond(res,200,readLivePbx())}catch{return respond(res,200,{monitoring:'unavailable',registrations:[],extensions:[],activeChannels:null,note:'Asterisk-Live-Abfrage nicht verfügbar'})}
 }
 if(pathname==='/api/pbx/status'&&req.method==='GET'){
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  try{const status=await readAmiStatus();return respond(res,200,{engine:'Asterisk 22',monitoring:'connected',asterisk:status,telekomSip:'last-confirmed',friedbergRoute:'last-confirmed',sipRegistrations:[]});}catch(e){return respond(res,200,{engine:'Asterisk 22',monitoring:'unavailable',telekomSip:'last-confirmed',friedbergRoute:'last-confirmed',sipRegistrations:[],note:'AMI-Status derzeit nicht erreichbar'});}
 }
 if(pathname==='/api/numbers'){
  if(!['GET','POST'].includes(req.method))return respond(res,405,{error:'Methode nicht erlaubt'});
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  if(req.method==='GET')return respond(res,200,{numbers:readNumbers()});
  if(!checkPost(req))return respond(res,403,{error:'Ungültiger Ursprung'});
  const input=await readBody(req);
  try{const number=saveNumberProfile(input);return respond(res,200,{number,numbers:readNumbers()})}
  catch(err){return respond(res,400,{error:err.message})}
 }
 if(pathname.startsWith('/api/'))return respond(res,404,{error:'Nicht gefunden'});
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return}
 const file=pathname==='/logo.png'?logo:path.join(pub,files[pathname]||'__404__');
 fs.readFile(file,(err,buf)=>{
  if(err){res.writeHead(404).end('Not found');return}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(req.method==='HEAD'?'':buf);
 });
 }catch{respond(res,400,{error:'Anfrage konnte nicht verarbeitet werden'})}
}).listen(Number(process.env.PORT)||3095,'0.0.0.0');


