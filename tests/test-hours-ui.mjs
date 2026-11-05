import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('public/app.js','utf8').split("nav.forEach(b=>b.addEventListener")[0];
const ctx=vm.createContext({document:{querySelector:()=>({}),querySelectorAll:()=>[]},Date});
vm.runInContext(source,ctx);
let html=vm.runInContext('screens.hours()',ctx);
assert.equal((html.match(/class="hours-day"/g)||[]).length,7);
assert(html.includes('Heute geschlossen'));
assert(html.includes('Deine Geschlossen-Ansage'));
assert(html.includes('name="announcementText"'));
assert(html.includes('Ansage erzeugen'));
assert(html.includes('controls preload="none"'));
assert(html.includes('fieldset disabled'));
ctx.input={available:true,hoursReady:true,today:'2026-11-05',hoursConfigured:[],mappings:{'+4960316868187':'100'},open:{'+4960316868187':true},
 drafts:{'+4960316868187':{enabled:true,days:[0,1],start:'10:00',end:'15:00'}}};
vm.runInContext('routingState=input',ctx);
const profile=vm.runInContext("profileFor('+4960316868187')",ctx);
assert.equal(profile.enabled,false);
assert.equal(profile.week[0].start,'10:00');
assert.equal(profile.week[2].enabled,false);
html=vm.runInContext('screens.hours()',ctx);
assert(html.includes('Aktuell geöffnet'));
assert(html.includes('Nebenstelle 100'));

const server=fs.readFileSync('server.mjs','utf8');
const code=server.slice(server.indexOf('function todayBerlin()'),server.indexOf('const files='));
const env=vm.createContext({Date,Intl});
vm.runInContext(code,env);
const week=Array.from({length:7},(_,i)=>({enabled:i<5,start:'09:00',end:'17:00'}));
env.input={enabled:true,closedToday:true,week};
const saved=vm.runInContext('validateHours(input)',env);
assert.match(saved.closedDate,/^\d{4}-\d{2}-\d{2}$/);
assert.equal(saved.week.length,7);
env.input={enabled:true,closedToday:false,week:week.map((v,i)=>i? v:{...v,start:'17:00',end:'09:00'})};
assert.throws(()=>vm.runInContext('validateHours(input)',env),/Endzeit/);
env.input={enabled:true,closedToday:false,week:week.slice(1)};
assert.throws(()=>vm.runInContext('validateHours(input)',env),/sieben/);
console.log('Hours UI, draft migration and server validation tests passed.');

const audioCode=server.slice(server.indexOf('function audioRange('),server.indexOf('function todayBerlin()'));
vm.runInContext(audioCode,env);
assert.equal(vm.runInContext("audioRange('bytes=0-1',100).end",env),1);
assert.equal(vm.runInContext("audioRange('bytes=95-',100).start",env),95);
assert.equal(vm.runInContext("audioRange('bytes=-10',100).start",env),90);
assert.throws(()=>vm.runInContext("audioRange('bytes=100-101',100)",env));
assert.throws(()=>vm.runInContext("audioRange('bytes=0-1,4-5',100)",env));
console.log('Safari audio range handling tests passed.');

vm.runInContext("routingState.announcementDrafts={'+4960316868187':{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',text:'Eigener Text'}}",ctx);
html=vm.runInContext('screens.hours()',ctx);
assert(html.includes('Eigener Text'));
assert(html.includes('Neue Ansage vorhören'));
assert(html.includes('draft=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
assert(html.includes('Ansage aktivieren'));
console.log('Custom announcement editor and preview tests passed.');
