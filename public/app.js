const main=document.querySelector('#main'),sidebar=document.querySelector('#sidebar');
const nav=[...document.querySelectorAll('[data-page]')];
let hoursLine='+4960316868187',hoursDraft={};
let routingState=null,routeDraft={},routeBusy=false,routeMessage='';
let pbxStatus=null,liveStatus=null,storedNumbers=[],routingPlans={},routingPreview=null;
const lines=[
 {label:'TARIQ Fahrdienst',e164:'+4960316868187',ext:'100',verified:true},
 {label:'TARIQ',e164:'+4960316843466',ext:'101',verified:false},
 {label:'TARIQ Zulassungsservice',e164:'+4960316871811',ext:'102',verified:false}
];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pill=(text,kind='neutral')=>'<span class="pill '+kind+'">'+esc(text)+'</span>';
const panel=(title,content,subtitle='')=>'<section class="panel"><div class="panel-head"><h2>'+title+'</h2><small>'+subtitle+'</small></div>'+content+'</section>';
const head=(title,description)=>'<section class="hero"><div><div class="eyebrow">TARIQ TELEFONIE · ZENTRALE</div><h1>'+title+'</h1><p>'+description+'</p></div><img class="hero-mark" src="/logo.png" alt=""></section>';
const liveReady=()=>['connected','partial'].includes(liveStatus?.monitoring);
const liveTime=()=>liveStatus?.checkedAt?new Date(liveStatus.checkedAt).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const notice=()=>'<div class="warning">'+(liveStatus?.monitoring==='connected'?'Status aktualisiert um '+esc(liveTime())+' Uhr · automatische Aktualisierung jede Minute.':liveStatus?.monitoring==='partial'?'Einzelne Statusabfragen sind nicht verfügbar. Unbekannte Werte werden mit — angezeigt.':liveStatus?.monitoring==='stale'?'Die letzte Statusabfrage ist veraltet. Es werden keine alten Werte als live angezeigt.':'Die Live-Überwachung wird eingerichtet. Die bestehende Telefonie läuft unabhängig davon weiter.')+' Zeitregeln werden unter Öffnungszeiten verwaltet.</div><div class="live-toolbar"><span>Letzte Abfrage: '+esc(liveTime())+'</span><button type="button" id="refresh-status">Status aktualisieren</button></div>';
const row=(icon,title,sub,right='')=>'<div class="item"><span class="circle">'+icon+'</span><div class="item-text"><strong>'+esc(title)+'</strong><small>'+esc(sub)+'</small></div>'+right+'</div>';
const lineRows=()=>lines.map((x,i)=>{const registration=liveStatus?.registrations?.find(r=>r.id===(i?'telekom-registration-'+(i+1):'telekom-registration'));const label=registration?(registration.status==='Registered'?'Live registriert':registration.status):(liveReady()&&!liveStatus.errors?.includes('registrations')?'Nicht registriert':x.verified?'Anruf getestet · letzter Stand':'Registrierung zuletzt bestätigt');return row('☎',x.label,x.e164+' · '+(activeRoute(x)?'Nebenstelle '+activeRoute(x):'Zuletzt: Nebenstelle '+x.ext),pill(label,registration?.status==='Registered'?'good':'neutral'))}).join('');
const stat=(name,value,sub)=>'<div class="stat"><div class="kicker">'+name+'</div><strong>'+value+'</strong><small>'+sub+'</small></div>';
const monitor=()=>pbxStatus?.monitoring==='connected'?'Verbunden':pbxStatus?.monitoring==='unavailable'?'Nicht erreichbar':'Nicht geprüft';

const activeRoute=x=>routingState?.available?routingState.mappings?.[x.e164]:null;
const forwardCards=()=>'<div class="forward-grid">'+lines.map(x=>{
 const active=activeRoute(x),selected=routeDraft[x.e164]||active||x.ext;
 const disabled=routeBusy||routingState?.pending||!routingState?.available;
 return '<section class="panel forward-card"><div class="panel-head"><div><div class="eyebrow">RUFZIEL</div><h2>'+esc(x.label)+'</h2><p class="forward-number">'+esc(x.e164)+'</p></div>'+pill(active?'Aktiv bestätigt':'Nicht geprüft',active?'good':'neutral')+'</div><form class="forward-form panel-pad" data-line="'+x.e164+'"><div class="forward-current"><span>Aktuelles Rufziel</span><strong>'+esc(active?'Nebenstelle '+active:'Noch nicht abrufbar')+'</strong></div><label class="field">Anrufe weiterleiten an<select name="extension" '+(disabled?'disabled':'')+'>'+lines.map(t=>'<option value="'+t.ext+'" '+(selected===t.ext?'selected':'')+'>'+t.ext+' · '+esc(t.label)+'</option>').join('')+'</select></label><button class="save-number" type="submit" '+(disabled||selected===active?'disabled':'')+'>Übernehmen</button><p class="page-text">Gilt für neue eingehende Anrufe.</p></form></section>';
}).join('')+'</div>';
const forwardView=()=>head('Weiterleitungen','Für jede Firma festlegen, an welcher Nebenstelle neue Anrufe klingeln.')+
 '<div class="forward-info"><span class="status-dot"></span><span>'+esc(routingState?.pending?'Änderung wird übernommen · dies dauert bis zu einer Minute.':routingState?.available?'Aktive Rufziele werden direkt in Asterisk geprüft.':routingState?.note||'Rufziele werden geladen …')+'</span></div>'+
 '<p class="forward-message" role="status" aria-live="polite">'+esc(routeMessage)+'</p>'+forwardCards()+
 panel('Weitere Regeln','<div class="panel-pad"><p class="page-text">Weiterleitungen bei Besetzt, Nichtmelden und außerhalb der Öffnungszeiten folgen als nächster Schritt.</p></div>');


const weekNames=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
function profileFor(line){
 if(hoursDraft[line])return hoursDraft[line];
 let p=routingState?.hours?.[line];
 const old=routingState?.drafts?.[line];
 if(!routingState?.hoursConfigured?.includes(line)&&old){
  p={enabled:false,closedDate:null,week:weekNames.map((_,i)=>({enabled:old.days?.includes(i)||false,start:old.start||'09:00',end:old.end||'17:00'}))};
 }
 p=p||{enabled:false,closedDate:null,week:weekNames.map((_,i)=>({enabled:i<5,start:'09:00',end:'17:00'}))};
 return {enabled:p.enabled,closedToday:!!p.closedDate&&p.closedDate===routingState?.today,week:p.week.map(d=>({...d}))};
}
function hoursView(){
 const line=lines.find(x=>x.e164===hoursLine)||lines[0],p=profileFor(line.e164);
 const disabled=routeBusy||!!routingState?.pending||!routingState?.available||!routingState?.hoursReady;
 const ready=routingState?.available&&routingState?.hoursReady;
 const saved=routingState?.hours?.[line.e164];
 const state=!ready?'Status unbekannt':routingState.open?.[line.e164]?'Aktuell geöffnet':'Aktuell geschlossen';
 return head('Öffnungszeiten & Ansagen','Wochenpläne und Geschlossen-Ansagen für jede Firma getrennt verwalten.')+
 '<div class="hours-companies">'+lines.map(x=>'<button type="button" class="hours-company '+(hoursLine===x.e164?'selected':'')+'" data-hours-line="'+x.e164+'" aria-pressed="'+(hoursLine===x.e164)+'"><span class="eyebrow">FIRMENPROFIL</span><strong>'+esc(x.label)+'</strong><small>'+esc(x.e164)+'</small>'+pill(routingState?.available?(routingState.open?.[x.e164]?'Geöffnet':'Geschlossen'):'Nicht geprüft',routingState?.available&&routingState.open?.[x.e164]?'good':'neutral')+'</button>').join('')+'</div>'+
 '<div class="forward-info"><span class="status-dot"></span><span>'+esc(routingState?.pending?'Einstellungen werden übernommen · dies dauert bis zu einer Minute.':ready?'Deutsche Ortszeit · Sommer- und Winterzeit werden automatisch berücksichtigt.':routingState?.note||'Ansagen und Zeitregeln werden vorbereitet.')+'</span></div>'+
 '<p class="forward-message" role="status" aria-live="polite">'+esc(routeMessage)+'</p>'+
 '<div class="hours-editor-grid">'+panel(esc(line.label)+' · Wochenplan','<form id="hours-form" class="panel-pad hours-form" data-line="'+line.e164+'"><div class="hours-state">'+pill(state,ready&&routingState.open?.[line.e164]?'good':'neutral')+'<span>'+esc(saved?.closedDate===routingState?.today?'Heute manuell geschlossen':saved?.enabled?'Wochenplan aktiv':'Ohne Wochenplan durchgehend erreichbar')+'</span></div><fieldset '+(disabled?'disabled':'')+'><label class="hours-toggle"><span><strong>Öffnungszeiten aktivieren</strong><small>Außerhalb dieser Zeiten hören Anrufer die Geschlossen-Ansage.</small></span><input name="hoursEnabled" type="checkbox" '+(p.enabled?'checked':'')+'></label><div class="hours-week">'+p.week.map((d,i)=>'<div class="hours-day"><label><input type="checkbox" name="day'+i+'" '+(d.enabled?'checked':'')+'> '+weekNames[i]+'</label><div class="hours-times"><input aria-label="'+weekNames[i]+' von" type="time" name="start'+i+'" value="'+esc(d.start)+'" required><span>bis</span><input aria-label="'+weekNames[i]+' bis" type="time" name="end'+i+'" value="'+esc(d.end)+'" required></div></div>').join('')+'</div><label class="hours-toggle hours-today"><span><strong>Heute geschlossen</strong><small>Gilt nur heute. Ab Mitternacht greift wieder der Wochenplan.</small></span><input name="closedToday" type="checkbox" '+(p.closedToday?'checked':'')+'></label><button class="save-number" type="submit">Speichern & aktivieren</button></fieldset><p class="page-text">Ohne aktivierte Öffnungszeiten klingeln Anrufe am gewählten Rufziel. Alte Zeitplan-Entwürfe werden erst mit diesem Button übernommen.</p></form>')+
 panel('Geschlossen-Ansage','<div class="panel-pad"><div class="announcement-icon">◷</div><h3>Deutsche Standardansage</h3><p class="page-text">Willkommen bei '+esc(line.label)+'. Sie rufen außerhalb unserer Öffnungszeiten an. Bitte versuchen Sie es zu unseren Geschäftszeiten erneut. Vielen Dank.</p><label class="announcement-label">Ansage vorhören</label><audio controls preload="none" src="/api/pbx/announcement?line='+encodeURIComponent(line.e164)+'"></audio><p class="page-text">Die Ansage wird nur bei geschlossener Firma abgespielt. Anschließend endet der Anruf.</p><div class="forward-current"><span>Rufziel während der Öffnungszeiten</span><strong>'+esc(activeRoute(line)?'Nebenstelle '+activeRoute(line):'Noch nicht abrufbar')+'</strong></div></div>')+'</div>';
}

const screens={
 overview:()=>head('Telefonie im Überblick','Drei Telekom-Rufnummern, Nebenstellen und Systemverbindungen zentral verwalten.')+notice()+
 '<div class="stats">'+stat('Telekom-Rufnummern',liveReady()&&!liveStatus.errors?.includes('registrations')?liveStatus.registrations.filter(r=>r.status==='Registered').length+' / 3':'3',liveReady()&&!liveStatus.errors?.includes('registrations')?'Aktuell registriert':'Eingerichtet · Live-Status unbekannt')+stat('Nebenstellen',liveReady()&&!liveStatus.errors?.includes('extensions')?liveStatus.extensions.filter(e=>e.online===true).length+' / 3':'3',liveReady()&&!liveStatus.errors?.includes('extensions')?'Aktuell erreichbar':'100 · 101 · 102 eingerichtet')+stat('Laufende Gespräche',liveStatus?.activeCalls??'—',liveStatus?.activeChannels==null?'Live-Abfrage nicht verfügbar':esc(liveStatus.activeChannels)+' aktive Kanäle · einzelne Verbindungen')+stat('Asterisk AMI',esc(monitor()),'Verbindung zum Monitoring')+'</div>'+
 '<div class="grid">'+panel('Rufnummern & Zuordnung',lineRows(),'Telekom · Friedberg')+
 panel('Systemverbindungen',row('◉','Asterisk AMI',monitor(),pill(pbxStatus?.monitoring==='connected'?'Online':'Nicht bestätigt',pbxStatus?.monitoring==='connected'?'good':'neutral'))+
 row('⇄','WireGuard · Friedberg','SIP-Routing zuletzt erfolgreich getestet',pill('Zuletzt getestet'))+
 row('◈','Telefonie-Web-App','Browser-Telefonie in Vorbereitung',pill('Geplant')),'Statusübersicht')+'</div>',
 numbers:()=>head('Rufnummern','Alle drei Telekom-Rufnummern und ihre Zuordnung im Überblick.')+
 panel('Telekom · Rufnummern',lineRows(),'3 Registrierungen')+
 panel('Rufnummernverwaltung','<div class="panel-pad"><p class="page-text">Die Zuordnung wird derzeit in Asterisk verwaltet. Änderungen über das Portal werden erst mit sicherer PBX-Synchronisierung freigeschaltet, damit die laufende Telefonie unverändert bleibt.</p></div>'),
 forwards:forwardView,
 extensions:()=>head('Nebenstellen','Interne Anschlüsse und Softphones unserer Telefonanlage.')+
 panel('SIP-Nebenstellen',lines.map(x=>{const e=liveReady()?liveStatus.extensions?.find(e=>e.id===x.ext):null;const label=!e?'Status unbekannt':!e.configured?'Nicht eingerichtet':e.online===true?'Erreichbar':e.online===null?'Angemeldet · nicht geprüft':'Nicht erreichbar';return row('♧',x.ext+' · '+x.label,e?.registered?'Endgerät angemeldet':'SIP-Nebenstelle',pill(label,e?.online===true?'good':'neutral'))}).join(''),'Aktueller Gerätestatus')+
 panel('Geräte & Zugang','<div class="panel-pad"><p class="page-text">Registrierte Geräte, SIP-Zugangsdaten zurücksetzen, Endgeräte zuweisen und neue Nebenstellen erstellen: folgt mit der sicheren Asterisk-Anbindung. Passwörter werden niemals in der Oberfläche offengelegt.</p></div>'),
 calls:()=>head('Anrufliste','Eingehende, ausgehende und verpasste Anrufe auf einen Blick.')+
 panel('Gesprächsverlauf','<div class="panel-pad"><p class="page-text">Noch keine Live-Anrufhistorie angebunden. Hier erscheinen nach der CDR-Integration nur tatsächliche Anrufe – keine erfundenen Testdaten.</p></div>'),
 hours:hoursView,
 settings:()=>head('Systemeinstellungen','Verbindungen, Sicherheit und technische Konfiguration.')+
 panel('Verbindungsstatus',row('◉','Asterisk AMI',monitor(),pill(pbxStatus?.monitoring==='connected'?'Erreichbar':'Nicht bestätigt',pbxStatus?.monitoring==='connected'?'good':'neutral'))+
 row('☎','Telekom SIP',liveReady()&&!liveStatus.errors?.includes('registrations')?liveStatus.registrations.filter(r=>r.status==='Registered').length+' von 3 Rufnummern registriert':'Drei Registrierungen zuletzt bestätigt',pill(liveReady()&&!liveStatus.errors?.includes('registrations')?'Live-Status':'Zuletzt bestätigt'))+
 row('⇄','WireGuard','Friedberg ↔ Hetzner · zuletzt getestet',pill('Live-Prüfung folgt')))+
 panel('Administration','<div class="panel-pad"><div class="feature-grid">'+['SIP-Trunks','Nebenstellen & Geräte','Sicherheit & Rollen','Anrufaufzeichnung (optional)','Backups & Wiederherstellung','API / WebRTC'].map(x=>'<div class="feature">⚙ '+x+' <small>Später konfigurierbar</small></div>').join('')+'</div><p class="page-text">Produktive Einstellungen werden erst nach Authentifizierung, Validierung und sicherem Rollback freigegeben.</p></div>')
};
function render(){const id=location.hash.slice(1),page=screens[id]?id:'overview';main.innerHTML=screens[page]();nav.forEach(b=>b.classList.toggle('active',b.dataset.page===page));sidebar.classList.remove('open');document.title='TARIQ Telefonie · '+page;}
nav.forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.page;render()}));
document.querySelector('#menu').addEventListener('click',()=>sidebar.classList.toggle('open'));
window.addEventListener('hashchange',()=>{if(document.body.classList.contains('authenticated'))render()});
async function api(url,options={}){const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const result=await response.json();if(!response.ok)throw Error(result.error||'Anfrage fehlgeschlagen');return result;}
let statusLoading=false;
async function loadStatus(){
 if(statusLoading)return;statusLoading=true;
 const button=document.querySelector('#refresh-status');if(button)button.disabled=true;
 try{const [pbx,live]=await Promise.allSettled([api('/api/pbx/status'),api('/api/pbx/live')]);pbxStatus=pbx.status==='fulfilled'?pbx.value:{monitoring:'unavailable'};liveStatus=live.status==='fulfilled'?live.value:null;
 if(!document.querySelector('#routing-form')&&!document.querySelector('.forward-form')&&!document.querySelector('.hours-form')&&document.body.classList.contains('authenticated'))render();
 }finally{statusLoading=false;if(button?.isConnected)button.disabled=false}
}
main.addEventListener('click',e=>{if(e.target.closest('#refresh-status'))loadStatus()});
async function initialize(){try{const r=await api('/api/session');if(r.authenticated){document.body.classList.add('authenticated');render();loadStatus();loadRoutes()}else{document.querySelector('[name=email]').value=r.email||''}}catch{document.querySelector('#login-error').textContent='Anmeldeserver nicht erreichbar.'}}
document.querySelector('#login-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),error=document.querySelector('#login-error');button.disabled=true;error.textContent='';try{await api('/api/login',{method:'POST',body:JSON.stringify({email:form.elements.email.value,password:form.elements.password.value})});form.elements.password.value='';document.body.classList.add('authenticated');render();loadStatus();loadRoutes()}catch(err){error.textContent=err.message}finally{button.disabled=false}});
document.querySelector('#logout').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST',body:'{}'})}catch{}document.body.classList.remove('authenticated');pbxStatus=null;liveStatus=null;document.querySelector('[name=password]').value='';});
initialize();

setInterval(()=>{if(document.body.classList.contains('authenticated'))loadStatus()},30000);

let routesLoading=false;
async function loadRoutes(){
 if(routesLoading)return;routesLoading=true;
 try{
  routingState=await api('/api/pbx/hours');
  const last=routingState.lastRequest;
  if(last?.id&&last.id===window.pendingRouteId&&!routingState.pending){
   routeBusy=false;routeMessage=last.message;
   if(last.state==='applied'){routeDraft={};if(window.pendingHoursLine)delete hoursDraft[window.pendingHoursLine]}
   window.pendingHoursLine=null;
   window.pendingRouteId=null;
  }
  if(['#forwards','#hours'].includes(location.hash)&&document.body.classList.contains('authenticated')&&!document.activeElement?.closest('.hours-form')&&document.querySelector('audio')?.paused!==false)render();
 }catch{routingState={available:false,note:'Rufziele derzeit nicht abrufbar.'};if(['#forwards','#hours'].includes(location.hash))render()}
 finally{routesLoading=false}
}
main.addEventListener('change',e=>{
 const form=e.target.closest('.forward-form');
 if(!form||e.target.name!=='extension')return;
 routeDraft[form.dataset.line]=e.target.value;
 form.querySelector('[type=submit]').disabled=routeBusy||!!routingState?.pending||!routingState?.available||e.target.value===activeRoute(lines.find(x=>x.e164===form.dataset.line));
});
document.addEventListener('submit',async e=>{
 if(!e.target.matches('.forward-form'))return;
 e.preventDefault();
 if(routeBusy||routingState?.pending||!routingState?.available)return;
 const form=e.target,line=form.dataset.line,target=form.elements.extension.value;
 const mappings={...routingState.mappings,[line]:target};
 routeBusy=true;routeMessage='Rufziel wird übernommen …';render();
 try{
  const result=await api('/api/pbx/routing',{method:'POST',body:JSON.stringify({revision:routingState.revision,mappings})});
  window.pendingRouteId=result.id;routeMessage=result.message;await loadRoutes();
 }catch(err){routeBusy=false;routeMessage=err.message;await loadRoutes()}
 if(['#forwards','#hours'].includes(location.hash))render();
});
setInterval(()=>{if(document.body.classList.contains('authenticated')&&(routeBusy||routingState?.pending))loadRoutes()},5000);
setInterval(()=>{if(document.body.classList.contains('authenticated'))loadRoutes()},30000);
window.addEventListener('hashchange',()=>{if(['#forwards','#hours'].includes(location.hash)&&document.body.classList.contains('authenticated'))loadRoutes()});

function captureHours(form){
 return {enabled:form.elements.hoursEnabled.checked,closedToday:form.elements.closedToday.checked,
  week:weekNames.map((_,i)=>({enabled:form.elements['day'+i].checked,start:form.elements['start'+i].value,end:form.elements['end'+i].value}))};
}
main.addEventListener('input',e=>{const form=e.target.closest('#hours-form');if(form)hoursDraft[form.dataset.line]=captureHours(form)});
main.addEventListener('change',e=>{const form=e.target.closest('#hours-form');if(form)hoursDraft[form.dataset.line]=captureHours(form)});
main.addEventListener('click',e=>{const button=e.target.closest('[data-hours-line]');if(button){hoursLine=button.dataset.hoursLine;render()}});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='hours-form')return;
 e.preventDefault();
 if(routeBusy||routingState?.pending||!routingState?.available||!routingState?.hoursReady)return;
 const form=e.target,line=form.dataset.line,profile=captureHours(form);
 if(profile.week.some(d=>d.start>=d.end)){routeMessage='Die Endzeit muss nach der Startzeit liegen. Nachtzeiten bitte auf zwei Tage aufteilen.';hoursDraft[line]=profile;render();return}
 hoursDraft[line]=profile;routeBusy=true;routeMessage='Öffnungszeiten werden übernommen …';render();
 try{
  const result=await api('/api/pbx/hours',{method:'POST',body:JSON.stringify({revision:routingState.revision,line,profile})});
  window.pendingRouteId=result.id;window.pendingHoursLine=line;routeMessage=result.message;await loadRoutes();
 }catch(err){routeBusy=false;routeMessage=err.message;await loadRoutes()}
 if(location.hash==='#hours')render();
});
