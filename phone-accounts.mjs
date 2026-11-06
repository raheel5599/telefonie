import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
export const PHONE_LINES=['+4960316868187','+4960316843466','+4960316871811'];
export const PHONE_DEVICES=Array.from({length:20},(_,i)=>String(800+i));
const cleanUsername=value=>{if(typeof value!=='string'||! /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value.trim().toLowerCase()))throw Error('Benutzername: 3–32 Zeichen, Buchstaben, Zahlen, Punkt, Bindestrich oder Unterstrich.');return value.trim().toLowerCase()};
const publicUser=({id,username,name,company,device,enabled,version})=>({id,username,name,company,device,enabled,version});
export function createPhoneAccounts(directory){
 const file=path.join(directory,'phone-users.json');
 function read(){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(v))throw Error('Zugangsdatei beschädigt.');return v}catch(e){if(e.code==='ENOENT')return [];throw e}}
 function write(users){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(users),{mode:0o600});fs.renameSync(tmp,file)}
 function list(){return read().map(publicUser)}
 function find(id){return read().find(x=>x.id===id)}
 async function passwordHash(password,salt){return Buffer.from(await scrypt(password,salt,32,{N:16384,r:8,p:1,maxmem:33554432})).toString('hex')}
 async function authenticate(username,password){
  const user=read().find(x=>x.username===String(username||'').trim().toLowerCase());
  const salt=user?.salt||'00000000000000000000000000000000';
  const hash=await passwordHash(String(password||''),salt);
  if(!user?.enabled||typeof user.hash!=='string'||user.hash.length!==64||!timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(user.hash,'hex')))return null;
  return publicUser(user);
 }
 async function create(input){
  const username=cleanUsername(input?.username),name=String(input?.name||'').trim();
  if(!name||name.length>60||/[\x00-\x1f\x7f]/.test(name)||!PHONE_LINES.includes(input.company))throw Error('Bitte Name und gültige Rufnummer auswählen.');
  const password=randomBytes(15).toString('base64url'),salt=randomBytes(16).toString('hex');
  const hash=await passwordHash(password,salt),users=read();
  if(users.some(u=>u.username===username))throw Error('Benutzername ist bereits vergeben.');
  const device=PHONE_DEVICES.slice(1).find(d=>!users.some(u=>u.device===d));
  if(!device)throw Error('Maximal 19 zusätzliche Telefonzugänge.');
  const user={id:randomBytes(16).toString('hex'),username,name,company:input.company,device,enabled:true,version:1,salt,hash};
  users.push(user);write(users);return {user:publicUser(user),password};
 }
 async function change(input){
  if(!/^[a-f0-9]{32}$/.test(input?.id||''))throw Error('Ungültiger Zugang.');
  let password,salt,hash;
  if(input.action==='reset'){password=randomBytes(15).toString('base64url');salt=randomBytes(16).toString('hex');hash=await passwordHash(password,salt)}
  else if(input.action==='assign'){if(!PHONE_LINES.includes(input.company))throw Error('Ungültige Rufnummer.')}
  else if(input.action!=='enable'&&input.action!=='disable')throw Error('Ungültige Aktion.');
  const users=read(),user=users.find(u=>u.id===input.id);if(!user)throw Error('Zugang nicht gefunden.');
  if(password){user.salt=salt;user.hash=hash}else if(input.action==='assign')user.company=input.company;else user.enabled=input.action==='enable';
  user.version++;write(users);return {user:publicUser(user),...(password?{password}:{})};
 }
 async function changePassword(id,currentPassword,newPassword){
  const original=find(id);
  if(!original?.enabled||typeof currentPassword!=='string'||currentPassword.length>512||!await authenticate(original.username,currentPassword))throw Error('Das bisherige Passwort ist nicht korrekt.');
  if(typeof newPassword!=='string'||newPassword.length<12||newPassword.length>128)throw Error('Das neue Passwort muss 12 bis 128 Zeichen haben.');
  if(newPassword===currentPassword)throw Error('Bitte ein anderes neues Passwort wählen.');
  const salt=randomBytes(16).toString('hex'),hash=await passwordHash(newPassword,salt);
  const users=read(),user=users.find(u=>u.id===id);if(!user?.enabled||user.version!==original.version)throw Error('Der Zugang wurde geändert. Bitte erneut anmelden.');
  user.salt=salt;user.hash=hash;user.version++;write(users);
 }
 function identity(entry){const user=find(entry?.accountId);return user?.enabled&&user.version===entry.version?{role:'phone',accountId:user.id,username:user.username,name:user.name,company:user.company,device:user.device}:null}
 return {list,find,create,change,authenticate,identity,changePassword};
}
