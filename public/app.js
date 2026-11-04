const main=document.querySelector('#main'),sidebar=document.querySelector('#sidebar');
const nav=[...document.querySelectorAll('[data-page]')];
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
const notice='<div class="warning">Die Rufnummern wurden in Asterisk registriert. Der aktuelle Registrierungsstatus und die Gesprächsdaten werden erst nach Anbindung der Live-Überwachung angezeigt. Änderungen an der Telefonanlage sind hier noch gesperrt.</div>';
const row=(icon,title,sub,right='')=>'<div class="item"><span class="circle">'+icon+'</span><div class="item-text"><strong>'+esc(title)+'</strong><small>'+esc(sub)+'</small></div>'+right+'</div>';
const lineRows=()=>lines.map((x,i)=>{const registration=liveStatus?.registrations?.find(r=>r.id===(i?'telekom-registration-'+(i+1):'telekom-registration'));const label=registration?(registration.status==='Registered'?'Live registriert':registration.status):(liveStatus?.monitoring==='connected'?'Nicht bestätigt':x.verified?'Anruf getestet · letzter Stand':'Registrierung zuletzt bestätigt');return row('☎',x.label,x.e164+' · Nebenstelle '+x.ext,pill(label,registration?.status==='Registered'?'good':'neutral'))}).join('');
const stat=(name,value,sub)=>'<div class="stat"><div class="kicker">'+name+'</div><strong>'+value+'</strong><small>'+sub+'</small></div>';
const monitor=()=>pbxStatus?.monitoring==='connected'?'Verbunden':pbxStatus?.monitoring==='unavailable'?'Nicht erreichbar':'Nicht geprüft';

const previewPanel=()=>panel('Vorschau der Rufverteilung',routingPreview?.entries?.length?routingPreview.entries.map(p=>row('↪',lines.find(x=>x.e164===p.line)?.label||p.line,'Nebenstelle '+p.extension+' · '+p.description,pill('Nicht aktiviert'))).join('')+'<div class="panel-pad"><p class="page-text">Die Vorschau ändert keine produktiven Asterisk-Regeln.</p></div>':'<div class="panel-pad"><p class="page-text">Noch keine gespeicherten Rufverteilungspläne vorhanden.</p></div>','Schreibgeschützt');
const planForm=()=>'<form id="routing-form" class="panel-pad"><p class="page-text">Planung speichern – keine Änderung an der laufenden Telefonanlage. Nach der späteren Freigabe können wir diese Regeln in Asterisk übernehmen.</p><label class="field">Rufnummer<select name="line">'+lines.map(x=>'<option value="'+x.e164+'">'+esc(x.label)+' · '+x.e164+'</option>').join('')+'</select></label><label class="field">Ziel-Nebenstelle<select name="extension">'+lines.map(x=>'<option value="'+x.ext+'">'+x.ext+' · '+esc(x.label)+'</option>').join('')+'</select></label><label class="field"><input type="checkbox" name="enabled"> Öffnungszeiten-Regel vormerken</label><div class="feature-grid"><label class="field">Von<input type="time" name="start" value="09:00" required></label><label class="field">Bis<input type="time" name="end" value="17:00" required></label></div><div class="days">'+['Mo','Di','Mi','Do','Fr','Sa','So'].map((x,i)=>'<label><input type="checkbox" name="day" value="'+i+'" '+(i<5?'checked':'')+'> '+x+'</label>').join('')+'</div><button class="save-number" type="submit">Planung speichern</button><p id="routing-message" class="page-text" role="status"></p></form>';
function populatePlan(form){const p=routingPlans[form.elements.line.value];form.elements.extension.value=p?.extension||lines.find(x=>x.e164===form.elements.line.value)?.ext||'100';form.elements.enabled.checked=p?.enabled||false;form.elements.start.value=p?.start||'09:00';form.elements.end.value=p?.end||'17:00';[...form.querySelectorAll('[name=day]')].forEach(c=>c.checked=p?p.days.includes(Number(c.value)):Number(c.value)<5)}

const screens={
 overview:()=>head('Telefonie im Überblick','Drei Telekom-Rufnummern, Nebenstellen und Systemverbindungen zentral verwalten.')+notice+
 '<div class="stats">'+stat('Telekom-Rufnummern',liveStatus?.registrations?.length??'3',liveStatus?.monitoring==='connected'?'Asterisk Live-Status':'Zuletzt erfolgreich registriert')+stat('Nebenstellen','3','100 · 101 · 102 konfiguriert')+stat('Aktive Kanäle',liveStatus?.activeChannels??'—',liveStatus?.activeChannels===null?'Live-Abfrage nicht verfügbar':'Asterisk Live-Daten')+stat('Asterisk AMI',esc(monitor()),'Verbindung zum Monitoring')+'</div>'+
 '<div class="grid">'+panel('Rufnummern & Zuordnung',lineRows(),'Telekom · Friedberg')+
 panel('Systemverbindungen',row('◉','Asterisk AMI',monitor(),pill(pbxStatus?.monitoring==='connected'?'Online':'Nicht bestätigt',pbxStatus?.monitoring==='connected'?'good':'neutral'))+
 row('⇄','WireGuard · Friedberg','SIP-Routing zuletzt erfolgreich getestet',pill('Zuletzt getestet'))+
 row('◈','Telefonie-Web-App','Browser-Telefonie in Vorbereitung',pill('Geplant')),'Statusübersicht')+'</div>',
 numbers:()=>head('Rufnummern','Alle drei Telekom-Rufnummern und ihre Zuordnung im Überblick.')+
 panel('Telekom · Rufnummern',lineRows(),'3 Registrierungen')+
 panel('Rufnummernverwaltung','<div class="panel-pad"><p class="page-text">Die Zuordnung wird derzeit in Asterisk verwaltet. Änderungen über das Portal werden erst mit sicherer PBX-Synchronisierung freigeschaltet, damit die laufende Telefonie unverändert bleibt.</p></div>'),
 forwards:()=>head('Weiterleitungen','Rufziele und Umleitungen für jede Firma zentral steuern.')+
 panel('Aktuelle Rufverteilung',lines.map(x=>row('↪',x.label,x.e164+' → Nebenstelle '+x.ext,pill('Konfiguriert'))).join(''))+
 panel('Geplante Regeln','<div class="panel-pad"><div class="feature-grid">'+['Sofortige Weiterleitung','Bei Besetzt','Bei Nichtmelden','Außerhalb der Öffnungszeiten','Rufgruppen und Reihenfolge','Voicemail und Ansagen'].map(x=>'<div class="feature">✓ '+esc(x)+' <small>In Vorbereitung</small></div>').join('')+'</div><p class="page-text">Die Regeln werden erst nach einer gesicherten API-Anbindung bearbeitbar.</p></div>'),
 extensions:()=>head('Nebenstellen','Interne Anschlüsse und Softphones unserer Telefonanlage.')+
 panel('SIP-Nebenstellen',row('♧','100 · Fahrdienst','Zoiper · Eingehender und ausgehender Anruf getestet',pill('Getestet','good'))+
 row('♧','101 · TARIQ Büro','SIP-Nebenstelle konfiguriert · Anruf noch nicht getestet',pill('Test offen'))+
 row('♧','102 · Zulassungsservice','SIP-Nebenstelle konfiguriert · Anruf noch nicht getestet',pill('Test offen')))+
 panel('Geräte & Zugang','<div class="panel-pad"><p class="page-text">Registrierte Geräte, SIP-Zugangsdaten zurücksetzen, Endgeräte zuweisen und neue Nebenstellen erstellen: folgt mit der sicheren Asterisk-Anbindung. Passwörter werden niemals in der Oberfläche offengelegt.</p></div>'),
 calls:()=>head('Anrufliste','Eingehende, ausgehende und verpasste Anrufe auf einen Blick.')+
 panel('Gesprächsverlauf','<div class="panel-pad"><p class="page-text">Noch keine Live-Anrufhistorie angebunden. Hier erscheinen nach der CDR-Integration nur tatsächliche Anrufe – keine erfundenen Testdaten.</p></div>'),
 hours:()=>head('Öffnungszeiten & Ansagen','Für jede Rufnummer eigene Zeiten, Feiertage und Ansagen planen.')+
 panel('Firmenprofile',lines.map(x=>row('◷',x.label,'Individuelle Geschäftszeiten und Feiertage',pill('Noch nicht eingerichtet'))).join(''))+
 panel('Öffnungszeiten planen',planForm())+previewPanel()+panel('Weitere Möglichkeiten','<div class="panel-pad"><div class="feature-grid">'+['Wochenplan','Feiertagskalender','Geschlossen-Ansage','Warteschleife','Sprachmenü (IVR)','Voicemail per E-Mail'].map(x=>'<div class="feature">✓ '+x+' <small>In Vorbereitung</small></div>').join('')+'</div></div>'),
 settings:()=>head('Systemeinstellungen','Verbindungen, Sicherheit und technische Konfiguration.')+
 panel('Verbindungsstatus',row('◉','Asterisk AMI',monitor(),pill(pbxStatus?.monitoring==='connected'?'Erreichbar':'Nicht bestätigt',pbxStatus?.monitoring==='connected'?'good':'neutral'))+
 row('☎','Telekom SIP','Drei Registrierungen zuletzt bestätigt',pill('Live-Prüfung folgt'))+
 row('⇄','WireGuard','Friedberg ↔ Hetzner · zuletzt getestet',pill('Live-Prüfung folgt')))+
 panel('Administration','<div class="panel-pad"><div class="feature-grid">'+['SIP-Trunks','Nebenstellen & Geräte','Sicherheit & Rollen','Anrufaufzeichnung (optional)','Backups & Wiederherstellung','API / WebRTC'].map(x=>'<div class="feature">⚙ '+x+' <small>Später konfigurierbar</small></div>').join('')+'</div><p class="page-text">Produktive Einstellungen werden erst nach Authentifizierung, Validierung und sicherem Rollback freigegeben.</p></div>')
};
function render(){const id=location.hash.slice(1),page=screens[id]?id:'overview';main.innerHTML=screens[page]();nav.forEach(b=>b.classList.toggle('active',b.dataset.page===page));sidebar.classList.remove('open');document.title='TARIQ Telefonie · '+page;if(page==='hours')populatePlan(document.querySelector('#routing-form'));}
nav.forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.page;render()}));
document.querySelector('#menu').addEventListener('click',()=>sidebar.classList.toggle('open'));
window.addEventListener('hashchange',()=>{if(document.body.classList.contains('authenticated'))render()});
async function api(url,options={}){const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const result=await response.json();if(!response.ok)throw Error(result.error||'Anfrage fehlgeschlagen');return result;}
async function loadPlans(){try{const [r,p]=await Promise.all([api('/api/routing-plans'),api('/api/routing-preview')]);routingPlans=r.plans||{};routingPreview=p;if(location.hash==='#hours')render()}catch(e){console.warn('Pläne nicht geladen',e.message)}}
async function loadStatus(){try{[pbxStatus,liveStatus]=await Promise.all([api('/api/pbx/status'),api('/api/pbx/live')])}catch{pbxStatus={monitoring:'unavailable'};liveStatus=null}render();}
async function initialize(){try{const r=await api('/api/session');if(r.authenticated){document.body.classList.add('authenticated');render();loadStatus();loadPlans()}else{document.querySelector('[name=email]').value=r.email||''}}catch{document.querySelector('#login-error').textContent='Anmeldeserver nicht erreichbar.'}}
document.querySelector('#login-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),error=document.querySelector('#login-error');button.disabled=true;error.textContent='';try{await api('/api/login',{method:'POST',body:JSON.stringify({email:form.elements.email.value,password:form.elements.password.value})});form.elements.password.value='';document.body.classList.add('authenticated');render();loadStatus()}catch(err){error.textContent=err.message}finally{button.disabled=false}});
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
