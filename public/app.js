const main=document.querySelector('#main'),sidebar=document.querySelector('#sidebar');
const nav=[...document.querySelectorAll('[data-page]')];
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
const notice=()=>'<div class="warning">'+(liveStatus?.monitoring==='connected'?'Status aktualisiert um '+esc(liveTime())+' Uhr · automatische Aktualisierung jede Minute.':liveStatus?.monitoring==='partial'?'Einzelne Statusabfragen sind nicht verfügbar. Unbekannte Werte werden mit — angezeigt.':liveStatus?.monitoring==='stale'?'Die letzte Statusabfrage ist veraltet. Es werden keine alten Werte als live angezeigt.':'Die Live-Überwachung wird eingerichtet. Die bestehende Telefonie läuft unabhängig davon weiter.')+' Gespeicherte Zeitpläne bleiben Entwürfe.</div><div class="live-toolbar"><span>Letzte Abfrage: '+esc(liveTime())+'</span><button type="button" id="refresh-status">Status aktualisieren</button></div>';
const row=(icon,title,sub,right='')=>'<div class="item"><span class="circle">'+icon+'</span><div class="item-text"><strong>'+esc(title)+'</strong><small>'+esc(sub)+'</small></div>'+right+'</div>';
const lineRows=()=>lines.map((x,i)=>{const registration=liveStatus?.registrations?.find(r=>r.id===(i?'telekom-registration-'+(i+1):'telekom-registration'));const label=registration?(registration.status==='Registered'?'Live registriert':registration.status):(liveReady()&&!liveStatus.errors?.includes('registrations')?'Nicht registriert':x.verified?'Anruf getestet · letzter Stand':'Registrierung zuletzt bestätigt');return row('☎',x.label,x.e164+' · '+(activeRoute(x)?'Nebenstelle '+activeRoute(x):'Zuletzt: Nebenstelle '+x.ext),pill(label,registration?.status==='Registered'?'good':'neutral'))}).join('');
const stat=(name,value,sub)=>'<div class="stat"><div class="kicker">'+name+'</div><strong>'+value+'</strong><small>'+sub+'</small></div>';
const monitor=()=>pbxStatus?.monitoring==='connected'?'Verbunden':pbxStatus?.monitoring==='unavailable'?'Nicht erreichbar':'Nicht geprüft';

const previewPanel=()=>panel('Vorschau der Rufverteilung',routingPreview?.entries?.length?routingPreview.entries.map(p=>row('↪',lines.find(x=>x.e164===p.line)?.label||p.line,'Nebenstelle '+p.extension+' · '+p.description,pill('Nicht aktiviert'))).join('')+'<div class="panel-pad"><p class="page-text">Die Vorschau ändert keine produktiven Asterisk-Regeln.</p></div>':'<div class="panel-pad"><p class="page-text">Noch keine gespeicherten Rufverteilungspläne vorhanden.</p></div>','Schreibgeschützt');
const planForm=()=>'<form id="routing-form" class="panel-pad"><p class="page-text">Planung speichern – keine Änderung an der laufenden Telefonanlage. Nach der späteren Freigabe können wir diese Regeln in Asterisk übernehmen.</p><label class="field">Rufnummer<select name="line">'+lines.map(x=>'<option value="'+x.e164+'">'+esc(x.label)+' · '+x.e164+'</option>').join('')+'</select></label><label class="field">Ziel-Nebenstelle<select name="extension">'+lines.map(x=>'<option value="'+x.ext+'">'+x.ext+' · '+esc(x.label)+'</option>').join('')+'</select></label><label class="field"><input type="checkbox" name="enabled"> Öffnungszeiten-Regel vormerken</label><div class="feature-grid"><label class="field">Von<input type="time" name="start" value="09:00" required></label><label class="field">Bis<input type="time" name="end" value="17:00" required></label></div><div class="days">'+['Mo','Di','Mi','Do','Fr','Sa','So'].map((x,i)=>'<label><input type="checkbox" name="day" value="'+i+'" '+(i<5?'checked':'')+'> '+x+'</label>').join('')+'</div><button class="save-number" type="submit">Planung speichern</button><p id="routing-message" class="page-text" role="status"></p></form>';
function populatePlan(form){const p=routingPlans[form.elements.line.value];form.elements.extension.value=p?.extension||lines.find(x=>x.e164===form.elements.line.value)?.ext||'100';form.elements.enabled.checked=p?.enabled||false;form.elements.start.value=p?.start||'09:00';form.elements.end.value=p?.end||'17:00';[...form.querySelectorAll('[name=day]')].forEach(c=>c.checked=p?p.days.includes(Number(c.value)):Number(c.value)<5)}


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
 hours:()=>head('Öffnungszeiten & Ansagen','Für jede Rufnummer eigene Zeiten, Feiertage und Ansagen planen.')+
 panel('Firmenprofile',lines.map(x=>{const p=routingPlans[x.e164];return row('◷',x.label,p?'Nebenstelle '+p.extension+' · '+p.start+'–'+p.end:'Noch kein Zeitplan gespeichert',pill(p?'Entwurf gespeichert':'Noch nicht geplant'))}).join(''))+
 panel('Öffnungszeiten planen',planForm())+previewPanel()+panel('Weitere Möglichkeiten','<div class="panel-pad"><div class="feature-grid">'+['Wochenplan','Feiertagskalender','Geschlossen-Ansage','Warteschleife','Sprachmenü (IVR)','Voicemail per E-Mail'].map(x=>'<div class="feature">✓ '+x+' <small>In Vorbereitung</small></div>').join('')+'</div></div>'),
 settings:()=>head('Systemeinstellungen','Verbindungen, Sicherheit und technische Konfiguration.')+
 panel('Verbindungsstatus',row('◉','Asterisk AMI',monitor(),pill(pbxStatus?.monitoring==='connected'?'Erreichbar':'Nicht bestätigt',pbxStatus?.monitoring==='connected'?'good':'neutral'))+
 row('☎','Telekom SIP',liveReady()&&!liveStatus.errors?.includes('registrations')?liveStatus.registrations.filter(r=>r.status==='Registered').length+' von 3 Rufnummern registriert':'Drei Registrierungen zuletzt bestätigt',pill(liveReady()&&!liveStatus.errors?.includes('registrations')?'Live-Status':'Zuletzt bestätigt'))+
 row('⇄','WireGuard','Friedberg ↔ Hetzner · zuletzt getestet',pill('Live-Prüfung folgt')))+
 panel('Administration','<div class="panel-pad"><div class="feature-grid">'+['SIP-Trunks','Nebenstellen & Geräte','Sicherheit & Rollen','Anrufaufzeichnung (optional)','Backups & Wiederherstellung','API / WebRTC'].map(x=>'<div class="feature">⚙ '+x+' <small>Später konfigurierbar</small></div>').join('')+'</div><p class="page-text">Produktive Einstellungen werden erst nach Authentifizierung, Validierung und sicherem Rollback freigegeben.</p></div>')
};
function render(){const id=location.hash.slice(1),page=screens[id]?id:'overview';main.innerHTML=screens[page]();nav.forEach(b=>b.classList.toggle('active',b.dataset.page===page));sidebar.classList.remove('open');document.title='TARIQ Telefonie · '+page;if(page==='hours')populatePlan(document.querySelector('#routing-form'));}
nav.forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.page;render()}));
document.querySelector('#menu').addEventListener('click',()=>sidebar.classList.toggle('open'));
window.addEventListener('hashchange',()=>{if(document.body.classList.contains('authenticated'))render()});
async function api(url,options={}){const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const result=await response.json();if(!response.ok)throw Error(result.error||'Anfrage fehlgeschlagen');return result;}
async function loadPlans(){try{const [r,p]=await Promise.all([api('/api/routing-plans'),api('/api/routing-preview')]);routingPlans=r.plans||{};routingPreview=p;if(location.hash==='#hours')render()}catch(e){console.warn('Pläne nicht geladen',e.message)}}
let statusLoading=false;
async function loadStatus(){
 if(statusLoading)return;statusLoading=true;
 const button=document.querySelector('#refresh-status');if(button)button.disabled=true;
 try{const [pbx,live]=await Promise.allSettled([api('/api/pbx/status'),api('/api/pbx/live')]);pbxStatus=pbx.status==='fulfilled'?pbx.value:{monitoring:'unavailable'};liveStatus=live.status==='fulfilled'?live.value:null;
 if(!document.querySelector('#routing-form')&&!document.querySelector('.forward-form')&&document.body.classList.contains('authenticated'))render();
 }finally{statusLoading=false;if(button?.isConnected)button.disabled=false}
}
main.addEventListener('click',e=>{if(e.target.closest('#refresh-status'))loadStatus()});
async function initialize(){try{const r=await api('/api/session');if(r.authenticated){document.body.classList.add('authenticated');render();loadStatus();loadPlans();loadRoutes()}else{document.querySelector('[name=email]').value=r.email||''}}catch{document.querySelector('#login-error').textContent='Anmeldeserver nicht erreichbar.'}}
document.querySelector('#login-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),error=document.querySelector('#login-error');button.disabled=true;error.textContent='';try{await api('/api/login',{method:'POST',body:JSON.stringify({email:form.elements.email.value,password:form.elements.password.value})});form.elements.password.value='';document.body.classList.add('authenticated');render();loadStatus();loadPlans();loadRoutes()}catch(err){error.textContent=err.message}finally{button.disabled=false}});
document.querySelector('#logout').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST',body:'{}'})}catch{}document.body.classList.remove('authenticated');pbxStatus=null;liveStatus=null;document.querySelector('[name=password]').value='';});
initialize();

setInterval(()=>{if(document.body.classList.contains('authenticated'))loadStatus()},30000);

document.addEventListener('change',e=>{if(e.target.name==='line'&&e.target.closest('#routing-form'))populatePlan(e.target.form)});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='routing-form')return;
 e.preventDefault();const form=e.target,button=form.querySelector('[type=submit]'),message=form.querySelector('#routing-message');
 const plan={line:form.elements.line.value,extension:form.elements.extension.value,enabled:form.elements.enabled.checked,start:form.elements.start.value,end:form.elements.end.value,days:[...form.querySelectorAll('[name=day]:checked')].map(x=>Number(x.value))};
 button.disabled=true;message.textContent='Speichere Planung …';
 try{const result=await api('/api/routing-plans',{method:'POST',body:JSON.stringify(plan)});routingPlans[result.plan.line]=result.plan;const preview=await api('/api/routing-preview');routingPreview=preview;message.textContent='Planung gespeichert. Noch nicht in Asterisk aktiviert.';const current=form.elements.line.value;render();document.querySelector('#routing-form').elements.line.value=current;populatePlan(document.querySelector('#routing-form'));document.querySelector('#routing-message').textContent='Planung gespeichert. Noch nicht in Asterisk aktiviert.'}
 catch(err){message.textContent=err.message}finally{button.disabled=false}
});


let routesLoading=false;
async function loadRoutes(){
 if(routesLoading)return;routesLoading=true;
 try{
  routingState=await api('/api/pbx/routing');
  const last=routingState.lastRequest;
  if(last?.id&&last.id===window.pendingRouteId&&!routingState.pending){
   routeBusy=false;routeMessage=last.message;
   if(last.state==='applied')routeDraft={};
   window.pendingRouteId=null;
  }
  if(location.hash==='#forwards'&&document.body.classList.contains('authenticated'))render();
 }catch{routingState={available:false,note:'Rufziele derzeit nicht abrufbar.'};if(location.hash==='#forwards')render()}
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
 if(location.hash==='#forwards')render();
});
setInterval(()=>{if(document.body.classList.contains('authenticated')&&(routeBusy||routingState?.pending))loadRoutes()},5000);
setInterval(()=>{if(document.body.classList.contains('authenticated'))loadRoutes()},30000);
window.addEventListener('hashchange',()=>{if(location.hash==='#forwards'&&document.body.classList.contains('authenticated'))loadRoutes()});
