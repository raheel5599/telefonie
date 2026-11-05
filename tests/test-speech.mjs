import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {cleanAnnouncementText,validateTelephoneWav,createSpeechService,speechLines} from '../speech.mjs';

assert.equal(cleanAnnouncementText('  Guten Tag!\nWir sind geschlossen.  '),'Guten Tag! Wir sind geschlossen.');
assert.throws(()=>cleanAnnouncementText(''));
assert.throws(()=>cleanAnnouncementText('x'.repeat(801)));
assert.throws(()=>cleanAnnouncementText('text\u0000text'));
const data=Buffer.alloc(16044);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVE',8);
data.write('fmt ',12);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(8000,24);
data.writeUInt32LE(16000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(16000,40);
assert.equal(validateTelephoneWav(data).duration,1);
assert.throws(()=>validateTelephoneWav(Buffer.from('invalid')));
const invalid=Buffer.from(data);invalid.writeUInt32LE(48000,24);assert.throws(()=>validateTelephoneWav(invalid));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'telephone-speech-'));
try{
 const service=createSpeechService(dir),id='a'.repeat(32),root=path.join(dir,'announcements');
 fs.writeFileSync(path.join(root,id+'.wav'),data);
 fs.writeFileSync(path.join(root,id+'.json'),JSON.stringify({id,line:speechLines[0],text:'Guten Tag.'}));
 fs.writeFileSync(path.join(root,'latest-1.json'),JSON.stringify({id}));
 assert.equal(service.getDraft(speechLines[0],id).text,'Guten Tag.');
 assert.equal(service.latest()[speechLines[0]].id,id);
 assert.throws(()=>service.getDraft(speechLines[1],id));
 assert.throws(()=>service.audioPath(speechLines[0],'../../etc/passwd'));
}finally{fs.rmSync(dir,{recursive:true,force:true})}
console.log('Speech text, WAV validation and per-company draft access tests passed.');
