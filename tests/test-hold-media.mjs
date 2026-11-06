import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHoldMedia} from '../hold-media.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tariq-hold-'));
try{
 fs.mkdirSync(path.join(dir,'private'));fs.writeFileSync(path.join(dir,'private/webphone-backend.json'),JSON.stringify({password:'a'.repeat(64)}));fs.mkdirSync(path.join(dir,'public/audio'),{recursive:true});for(const id of ['music1','music2','music3'])fs.writeFileSync(path.join(dir,'public/audio/hold-'+id+'.wav'),'fixture');
 const hold=createHoldMedia({root:dir,directory:dir}),one={accountId:'one'},two={accountId:'two'};
 hold.select(one,{mode:'music',track:'music2'});assert.equal(hold.settings(one).track,'music2');assert.equal(hold.settings(two).track,'music1');
 const uri=hold.playback(one).replace('sound:',''),parts=new URL(uri).pathname.split('/');assert(hold.resolve(parts[3],parts[4].slice(0,-4)));
 assert.equal(hold.resolve('music2','0'.repeat(64)),null);assert.equal(hold.resolve('../secret','a'.repeat(64)),null);
 assert.throws(()=>hold.select(one,{mode:'text',track:'music1'}));assert.throws(()=>hold.select(one,{mode:'music',track:'../secret'}));
 assert.equal(createHoldMedia({root:dir,directory:dir}).settings(one).track,'music2');
 console.log('Hold choices persist per user; signed media rejects forged tokens and path traversal.');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
