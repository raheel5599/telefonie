import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createPhoneHistory} from '../phone-history.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phone-history-'));
try{
 const h=createPhoneHistory(dir),base={createdAt:new Date().toISOString(),company:'+4960316868187',from:'800',to:'801',incoming:true,device:'801',owner:'first'};
 h.record({...base,id:'missed'});h.record({...base,id:'answered',startedAt:new Date(Date.now()-3000).toISOString()});h.record({...base,id:'other',owner:'second'});h.record({...base,id:'echo',test:true});
 const restored=createPhoneHistory(dir);
 assert.equal(restored.query({role:'phone',accountId:'first'}).calls.length,2);
 assert.equal(restored.query({role:'phone',accountId:'first'},'missed').calls.length,1);
 assert.equal(restored.query({role:'phone',accountId:'second'}).calls.length,1);
 assert.equal(restored.query({role:'admin'}).calls.length,3);
 assert(!JSON.stringify(restored.query({role:'phone',accountId:'first'})).includes('accountId'));
 assert.equal(restored.query({role:'phone',accountId:'third'}).total,0);
 console.log('Durable call history preserves ownership across restarts, missed filters and admin visibility.');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
