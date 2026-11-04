const main=document.querySelector('#main'),sidebar=document.querySelector('#sidebar');
const nav=[...document.querySelectorAll('[data-page]')];
let pbxStatus=null,storedNumbers=[];
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
const lineRows=()=>lines.map(x=>row('☎',x.label,x.e164+' · Nebenstelle '+x.ext,pill(x.verified?'Anruf getestet':'Registrierung bestätigt',x.verified?'good':'neutral'))).join('');
const stat=(name,value,sub)=>'<div class="stat"><div class="kicker">'+name+'</div><strong>'+value+'</strong><small>'+sub+'</small></div>';
const monitor=()=>pbxStatus?.monitoring==='connected'?'Verbunden':pbxStatus?.monitoring==='unavailable'?'Nicht erreichbar':'Nicht geprüft';
const screens={
 overview:()=>head('Telefonie im Überblick','Drei Telekom-Rufnummern, Nebenstellen und Systemverbindungen zentral verwalten.')+notice+
 '<div class="stats">'+stat('Telekom-Rufnummern','3','Zuletzt erfolgreich registriert')+stat('Nebenstellen','3','100 · 101 · 102 konfiguriert')+stat('Aktive Gespräche','—','Live-Abfrage noch nicht verfügbar')+stat('Asterisk AMI',esc(monitor()),'Verbindung zum Monitoring')+'</div>'+
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
 panel('Geplante Funktionen','<div class="panel-pad"><div class="feature-grid">'+['Wochenplan','Feiertagskalender','Geschlossen-Ansage','Warteschleife','Sprachmenü (IVR)','Voicemail per E-Mail'].map(x=>'<div class="feature">✓ '+x+' <small>In Vorbereitung</small></div>').join('')+'</div></div>'),
 settings:()=>head('Systemeinstellungen','Verbindungen, Sicherheit und technische Konfiguration.')+
 panel('Verbindungsstatus',row('◉','Asterisk AMI',monitor(),pill(pbxStatus?.monitoring==='connected'?'Erreichbar':'Nicht bestätigt',pbxStatus?.monitoring==='connected'?'good':'neutral'))+
 row('☎','Telekom SIP','Drei Registrierungen zuletzt bestätigt',pill('Live-Prüfung folgt'))+
 row('⇄','WireGuard','Friedberg ↔ Hetzner · zuletzt getestet',pill('Live-Prüfung folgt')))+
 panel('Administration','<div class="panel-pad"><div class="feature-grid">'+['SIP-Trunks','Nebenstellen & Geräte','Sicherheit & Rollen','Anrufaufzeichnung (optional)','Backups & Wiederherstellung','API / WebRTC'].map(x=>'<div class="feature">⚙ '+x+' <small>Später konfigurierbar</small></div>').join('')+'</div><p class="page-text">Produktive Einstellungen werden erst nach Authentifizierung, Validierung und sicherem Rollback freigegeben.</p></div>')
};
function render(){const id=location.hash.slice(1),page=screens[id]?id:'overview';main.innerHTML=screens[page]();nav.forEach(b=>b.classList.toggle('active',b.dataset.page===page));sidebar.classList.remove('open');document.title='TARIQ Telefonie · '+page;}
nav.forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.page;render()}));
document.querySelector('#menu').addEventListener('click',()=>sidebar.classList.toggle('open'));
window.addEventListener('hashchange',()=>{if(document.body.classList.contains('authenticated'))render()});
async function api(url,options={}){const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const result=await response.json();if(!response.ok)throw Error(result.error||'Anfrage fehlgeschlagen');return result;}
async function loadStatus(){try{pbxStatus=await api('/api/pbx/status')}catch{pbxStatus={monitoring:'unavailable'}}render();}
async function initialize(){try{const r=await api('/api/session');if(r.authenticated){document.body.classList.add('authenticated');render();loadStatus()}else{document.querySelector('[name=email]').value=r.email||''}}catch{document.querySelector('#login-error').textContent='Anmeldeserver nicht erreichbar.'}}
document.querySelector('#login-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),error=document.querySelector('#login-error');button.disabled=true;error.textContent='';try{await api('/api/login',{method:'POST',body:JSON.stringify({email:form.elements.email.value,password:form.elements.password.value})});form.elements.password.value='';document.body.classList.add('authenticated');render();loadStatus()}catch(err){error.textContent=err.message}finally{button.disabled=false}});
document.querySelector('#logout').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST',body:'{}'})}catch{}document.body.classList.remove('authenticated');pbxStatus=null;document.querySelector('[name=password]').value='';});
initialize();
