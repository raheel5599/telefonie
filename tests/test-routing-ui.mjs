import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('public/app.js','utf8').split("nav.forEach(b=>b.addEventListener")[0];
const ctx=vm.createContext({document:{querySelector:()=>({}),querySelectorAll:()=>[]},Date});
vm.runInContext(source,ctx);
let html=vm.runInContext('screens.forwards()',ctx);
assert.equal((html.match(/class="forward-form/g)||[]).length,3);
assert(html.includes('Noch nicht abrufbar'));
vm.runInContext("routingState={available:true,mappings:{'+4960316868187':'102','+4960316843466':'101','+4960316871811':'102'}}",ctx);
html=vm.runInContext('screens.forwards()',ctx);
assert(html.includes('Nebenstelle 102'));
assert.equal((html.match(/Aktiv bestätigt/g)||[]).length,3);
vm.runInContext("routeDraft['+4960316868187']='100'",ctx);
html=vm.runInContext('screens.forwards()',ctx);
assert(html.includes('value="100" selected'));
vm.runInContext("routingState.pending={id:'x'}",ctx);
html=vm.runInContext('screens.forwards()',ctx);
assert(html.includes('Änderung wird übernommen'));
assert.equal((html.match(/<button class="save-number" type="submit" disabled/g)||[]).length,3);

const server=fs.readFileSync('server.mjs','utf8');
const code=server.slice(server.indexOf('function readRouting()'),server.indexOf('const files='));
const files=new Map();
const fakeFs={
 readFileSync:p=>{if(!files.has(p))throw Error('missing');return files.get(p)},
 writeFileSync:(p,text)=>files.set(p,text),
 linkSync:(a,b)=>{if(files.has(b))throw Object.assign(Error('exists'),{code:'EEXIST'});files.set(b,files.get(a))},
 unlinkSync:p=>files.delete(p),
};
const env=vm.createContext({fs:fakeFs,path:{join:(...parts)=>parts.join('/')},storeDir:'/data',Date,
 randomBytes:()=>({toString:()=> 'a'.repeat(32)}),
 allowedLines:['+4960316868187','+4960316843466','+4960316871811'],allowedExtensions:['100','101','102']});
vm.runInContext(code,env);
const status={available:true,checkedAt:new Date().toISOString(),revision:'revision',
 mappings:{'+4960316868187':'100','+4960316843466':'101','+4960316871811':'102'}};
files.set('/data/pbx-routing.json',JSON.stringify(status));
env.input={revision:'old',mappings:status.mappings};
assert.throws(()=>vm.runInContext('queueRouting(input)',env),/verändert/);
env.input={revision:'revision',mappings:{...status.mappings,'+4960316868187':'09001234567'}};
assert.throws(()=>vm.runInContext('queueRouting(input)',env),/Handy|Festnetz|Ungültige/);
env.input={revision:'revision',mappings:{...status.mappings,'+4960316868187':'102'}};
assert.equal(vm.runInContext('queueRouting(input).state',env),'pending');
assert.throws(()=>vm.runInContext('queueRouting(input)',env),/bereits/);
assert.equal(JSON.parse(files.get('/data/pbx-routing-request.json')).mappings['+4960316868187'],'102');
files.set('/data/pbx-routing.json',JSON.stringify({...status,checkedAt:new Date(Date.now()-160000).toISOString()}));
assert.equal(vm.runInContext('readRouting().available',env),false);
console.log('Routing UI, validation, optimistic concurrency and stale-state tests passed.');

files.delete('/data/pbx-routing-request.json');
files.set('/data/pbx-routing.json',JSON.stringify(status));
env.input={revision:'revision',mappings:{...status.mappings,'+4960316868187':'0170 5996911'}};
assert.equal(vm.runInContext('queueRouting(input).state',env),'pending');
assert.equal(JSON.parse(files.get('/data/pbx-routing-request.json')).mappings['+4960316868187'],'+491705996911');
vm.runInContext("routingState={available:true,mappings:{'+4960316868187':'+491705996911','+4960316843466':'101','+4960316871811':'102'}};routeDraft={}",ctx);
html=vm.runInContext('screens.forwards()',ctx);
assert(html.includes('Externe Nummer'));
assert(html.includes('name="externalNumber"'));
assert(html.includes('Extern: +491705996911'));
assert(html.includes('value="+491705996911"'));
assert(html.includes('Deine Öffnungszeiten bleiben aktiv.'));
console.log('External target selector, canonical phone storage and active destination display passed.');
