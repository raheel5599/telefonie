import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';

export const speechLines=['+4960316868187','+4960316843466','+4960316871811'];
export function cleanAnnouncementText(raw){
 if(typeof raw!=='string')throw Error('Bitte einen Ansagetext eingeben.');
 const text=raw.trim().replace(/\s+/g,' ');
 if(!text||text.length>800||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))throw Error('Bitte 1 bis 800 Zeichen ohne Steuerzeichen eingeben.');
 return text;
}
export function validateTelephoneWav(data){
 if(!Buffer.isBuffer(data)||data.length>1500000||data.length<44||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE')throw Error('Ungültige Audiodatei.');
 let format=null,size=null;
 for(let offset=12;offset+8<=data.length;){
  const type=data.toString('ascii',offset,offset+4),length=data.readUInt32LE(offset+4),start=offset+8;
  if(start+length>data.length)throw Error('Unvollständige Audiodatei.');
  if(type==='fmt '){
   if(length<16)throw Error('Ungültiges Audioformat.');
   format={codec:data.readUInt16LE(start),channels:data.readUInt16LE(start+2),rate:data.readUInt32LE(start+4),bits:data.readUInt16LE(start+14)};
  }
  if(type==='data')size=length;
  offset=start+length+(length%2);
 }
 if(!format||format.codec!==1||format.channels!==1||format.rate!==8000||format.bits!==16||size===null||size<1600||size>1440000)throw Error('Die Ansage muss zwischen 0,1 und 90 Sekunden lang sein.');
 return {duration:size/16000};
}
function command(binary,args,input){
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['pipe','ignore','pipe']});
  let complete=false,stderr='';
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('Spracherzeugung hat zu lange gedauert.'))},30000);
  function finish(error){if(complete)return;complete=true;clearTimeout(timer);error?reject(error):resolve()}
  child.stderr.on('data',c=>{stderr=(stderr+c.toString()).slice(-2048)});
  child.on('error',()=>finish(Error('Spracherzeugung ist derzeit nicht verfügbar.')));
  child.on('close',code=>finish(code===0?null:Error('Spracherzeugung fehlgeschlagen. Bitte erneut versuchen.')));
  child.stdin.on('error',()=>{});
  child.stdin.end(input||'');
 });
}
export function createSpeechService(storeDir){
 const dir=path.join(storeDir,'announcements');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 let busy=false;
 const index=line=>{const i=speechLines.indexOf(line);if(i<0)throw Error('Ungültige Rufnummer.');return i+1};
 const idPath=(id,suffix)=>{if(!/^[a-f0-9]{32}$/.test(id))throw Error('Ungültige Ansage.');return path.join(dir,id+suffix)};
 function getDraft(line,id){
  index(line);
  const metadata=JSON.parse(fs.readFileSync(idPath(id,'.json'),'utf8'));
  if(metadata.line!==line||metadata.id!==id)throw Error('Ansage gehört nicht zu dieser Firma.');
  validateTelephoneWav(fs.readFileSync(idPath(id,'.wav')));
  return metadata;
 }
 function latest(){
  const result={};
  for(const line of speechLines){
   try{
    const value=JSON.parse(fs.readFileSync(path.join(dir,'latest-'+index(line)+'.json'),'utf8'));
    result[line]=getDraft(line,value.id);
   }catch{}
  }
  return result;
 }
 async function generate(line,raw){
  const i=index(line),text=cleanAnnouncementText(raw);
  if(busy)throw Error('Eine Ansage wird bereits erzeugt. Bitte kurz warten.');
  busy=true;
  const id=randomBytes(16).toString('hex'),source=idPath(id,'.input.wav'),temp=idPath(id,'.tmp.wav');
  try{
   await command('espeak-ng',['-v','de','-s','145','-w',source,'--stdin'],text);
   await command('sox',[source,'-r','8000','-c','1','-b','16','-e','signed-integer',temp]);
   const audio=validateTelephoneWav(fs.readFileSync(temp));
   fs.renameSync(temp,idPath(id,'.wav'));fs.chmodSync(idPath(id,'.wav'),0o600);
   const value={id,line,text,duration:audio.duration,createdAt:new Date().toISOString()};
   fs.writeFileSync(idPath(id,'.json'),JSON.stringify(value),{mode:0o600});
   const target=path.join(dir,'latest-'+i+'.json');
   fs.writeFileSync(target+'.tmp',JSON.stringify({id}),{mode:0o600});fs.renameSync(target+'.tmp',target);
   return value;
  }finally{
   busy=false;
   for(const file of [source,temp])try{fs.unlinkSync(file)}catch{}
  }
 }
 return {generate,getDraft,latest,audioPath:(line,id)=>{getDraft(line,id);return idPath(id,'.wav')}};
}
