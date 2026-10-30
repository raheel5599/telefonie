import http from 'node:http';
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
const numbersPath=path.join(storeDir,'numbers.json');
function readNumbers(){try{const data=JSON.parse(fs.readFileSync(numbersPath,'utf8'));return Array.isArray(data)?data:[]}catch(e){if(e.code==='ENOENT')return [];throw e}}
function writeNumbers(numbers){const temp=numbersPath+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(numbers,null,2),{mode:0o600});fs.renameSync(temp,numbersPath)}
function normalizeE164(raw){const value=String(raw||'').trim().replace(/[()\s/.-]/g,'');let number=value.startsWith('00')?'+'+value.slice(2):value;if(/^0[1-9]\d+$/.test(number))number='+49'+number.slice(1);if(!/^\+[1-9]\d{6,14}$/.test(number))throw Error('Bitte eine gültige internationale Rufnummer eingeben, z. B. +496031123456.');return number}

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
 if(pathname==='/api/pbx/status'&&req.method==='GET'){
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  return respond(res,200,{engine:'Asterisk 22',monitoring:'not-connected',telekomSip:'not-configured',friedbergRoute:'not-configured',sipRegistrations:[],note:'Asterisk wird derzeit nicht durch die Web-API überwacht. Keine Live-Anrufe aktiv.'});
 }
 if(pathname==='/api/numbers'){
  if(!['GET','POST'].includes(req.method))return respond(res,405,{error:'Methode nicht erlaubt'});
  if(!await authenticated(req))return respond(res,401,{error:'Bitte erneut anmelden'});
  if(req.method==='GET')return respond(res,200,{numbers:readNumbers(),sipConnected:false});
  if(!checkPost(req))return respond(res,403,{error:'Ungültiger Ursprung'});
  const input=await readBody(req);
  if(!Array.isArray(input.numbers)||input.numbers.length>3)return respond(res,400,{error:'Maximal drei Rufnummern'});
  let prepared;
  try{
    prepared=input.numbers.map((row,i)=>({id:i+1,label:String(row.label||'Rufnummer '+(i+1)).trim().slice(0,60),e164:normalizeE164(row.number)}));
    if(new Set(prepared.map(n=>n.e164)).size!==prepared.length)throw Error('Doppelte Rufnummer');
  }catch(err){return respond(res,400,{error:err.message})}
  writeNumbers(prepared);return respond(res,200,{numbers:prepared,sipConnected:false});
 }
 if(pathname.startsWith('/api/'))return respond(res,404,{error:'Nicht gefunden'});
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return}
 const file=pathname==='/logo.png'?logo:path.join(pub,files[pathname]||'__404__');
 fs.readFile(file,(err,buf)=>{
  if(err){res.writeHead(404).end('Not found');return}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(req.method==='HEAD'?'':buf);
 });
 }catch{respond(res,400,{error:'Anfrage konnte nicht verarbeitet werden'})}
}).listen(Number(process.env.PORT)||3095,'0.0.0.0');
