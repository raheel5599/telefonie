import fs from 'node:fs';import path from 'node:path';import {createHash,createHmac,timingSafeEqual} from 'node:crypto';import {createSpeechService} from './speech.mjs';
export const HOLD_TRACKS=[{id:'music1',name:'Sanftes Klavier'},{id:'music2',name:'Akustische Ruhe'},{id:'music3',name:'Entspannter Lounge-Klang'}];
export function createHoldMedia({root,directory}){
 const dir=path.join(directory,'hold-media');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const speech=createSpeechService(path.join(dir,'speech'));
 const key=i=>createHash('sha256').update(i.accountId||'admin').digest('hex');
 const file=i=>path.join(dir,'settings-'+key(i)+'.json');
 function read(i){try{return JSON.parse(fs.readFileSync(file(i),'utf8'))}catch(e){if(e.code==='ENOENT')return {mode:'music',track:'music1',text:'Einen Moment bitte. Wir sind gleich wieder für Sie da.'};throw e}}
 function save(i,v){const f=file(i);fs.writeFileSync(f+'.tmp',JSON.stringify(v),{mode:0o600});fs.renameSync(f+'.tmp',f)}
 function settings(i){const v=read(i);return {mode:v.mode,track:v.track,text:v.text,hasAnnouncement:!!v.announcementId,tracks:HOLD_TRACKS}}
 function select(i,input){if(!['music','text'].includes(input.mode)||!HOLD_TRACKS.some(t=>t.id===input.track))throw Error('Bitte eine Wartemusik oder Ansage auswählen.');const v=read(i);if(input.mode==='text'&&!v.announcementId)throw Error('Bitte zuerst die Warteansage erzeugen.');save(i,{...v,mode:input.mode,track:input.track});return settings(i)}
 async function generate(i,text){const draft=await speech.generate(i.company,text);fs.copyFileSync(speech.audioPath(draft.line,draft.id),path.join(dir,draft.id+'.wav'));fs.chmodSync(path.join(dir,draft.id+'.wav'),0o600);save(i,{...read(i),text:draft.text,announcementId:draft.id});return settings(i)}
 const valid=id=>HOLD_TRACKS.some(t=>t.id===id)||/^[a-f0-9]{32}$/.test(id);
 const asset=id=>{if(!valid(id))throw Error('Ungültige Warteansage.');return /^music/.test(id)?path.join(root,'public/audio/hold-'+id+'.wav'):path.join(dir,id+'.wav')};
 function token(id){const config=JSON.parse(fs.readFileSync(path.join(root,'private/webphone-backend.json'),'utf8'));return createHmac('sha256',config.password).update('hold-audio:'+id).digest('hex')}
 function playback(i){const v=read(i),id=v.mode==='text'?v.announcementId:v.track;if(!id||!fs.existsSync(asset(id)))throw Error('Warteaudio ist noch nicht bereit.');return 'sound:http://tariq-telefonie-telefonie-web-1:3095/internal/hold-audio/'+id+'/'+token(id)+'.wav'}
 function resolve(id,signature){if(!valid(id)||! /^[a-f0-9]{64}$/.test(signature||''))return null;try{return timingSafeEqual(Buffer.from(token(id),'hex'),Buffer.from(signature,'hex'))?asset(id):null}catch{return null}}
 function preview(i){const v=read(i);return asset(v.mode==='text'?v.announcementId:v.track)}
 return {settings,select,generate,playback,resolve,preview};
}
