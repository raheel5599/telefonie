import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const server=fs.readFileSync('server.mjs','utf8');
const code=server.slice(server.indexOf('function queryCallHistory('),server.indexOf('const files='));
const now=Date.now(),startedAt=new Date(now-10000).toISOString();
let data={checkedAt:new Date(now).toISOString(),source:{available:true},calls:[
 {id:'incoming',direction:'incoming',from:'+491701234567',to:'+4960316868187',company:'+4960316868187',companyLabel:'TARIQ Fahrdienst',startedAt,status:'answered',missed:false,billsec:12},
 {id:'missed',direction:'incoming',from:null,to:'+4960316843466',company:'+4960316843466',companyLabel:'TARIQ',startedAt,status:'missed',missed:true,billsec:0},
 {id:'outgoing',direction:'outgoing',from:'101',to:'+493012345678',company:'+4960316843466',companyLabel:'TARIQ',startedAt,status:'answered',missed:false,billsec:20},
]};
const env=vm.createContext({phoneHistory:{all:()=>[]},fs:{readFileSync:()=>JSON.stringify(data)},path:{join:()=>''},storeDir:'/data',Date,
 readNumbers:()=>[{e164:'+4960316868187',label:'Fahrdienst Büro'}],
 allowedLines:['+4960316868187','+4960316843466','+4960316871811']});
vm.runInContext(code,env);
function query(values={}){env.params=new URLSearchParams(values);env.now=now;return vm.runInContext('queryCallHistory(params,now)',env)}
assert.equal(query().total,3);
assert.equal(query({q:'Fahrdienst Büro'}).calls[0].companyLabel,'Fahrdienst Büro');
assert.equal(query({filter:'missed'}).calls[0].id,'missed');
assert.equal(query({filter:'outgoing'}).total,1);
assert.equal(query({company:'+4960316868187'}).total,1);
assert.equal(query({q:'0170'}).calls[0].id,'incoming');
assert.equal(query({q:'03012345678'}).calls[0].id,'outgoing');
assert.equal(query({page:'999'}).page,1);
assert.throws(()=>query({filter:'invalid'}));
assert.throws(()=>query({days:'9999'}));
data.checkedAt=new Date(now-200000).toISOString();
assert.equal(query().source.status,'stale');
assert.equal(query().calls.length,3);

const app=fs.readFileSync('public/app.js','utf8').split("nav.forEach(b=>b.addEventListener")[0];
const ctx=vm.createContext({document:{querySelector:()=>({}),querySelectorAll:()=>[]},Date,Intl});
vm.runInContext(app,ctx);
let html=vm.runInContext('screens.calls()',ctx);
assert(html.includes('Rufnummer suchen'));
assert(html.includes('Alle Firmen'));
assert(html.includes('Verpasst'));
ctx.input=query({filter:'missed'});
vm.runInContext('callCache=input',ctx);
html=vm.runInContext('screens.calls()',ctx);
assert(html.includes('Anonym'));
assert(html.includes('Verpasst'));
console.log('Call history filters, search, pagination, stale data and UI rendering tests passed.');

