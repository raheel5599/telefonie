let storedNumbers=[];
let pbxStatus=null;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const main=document.querySelector('#main');const nav=[...document.querySelectorAll('[data-page]')];const sidebar=document.querySelector('#sidebar');
const numberRows=[1,2,3].map(i=>'<div class="item"><span class="circle">☎</span><div class="item-text"><strong>Telekom-Rufnummer '+i+'</strong><small>Friedberg · Nummer noch nicht hinterlegt</small></div><span class="pill">Nicht verbunden</span></div>').join('');
const header=(title,desc)=>'<section class="hero"><div><div class="eyebrow">TARIQ TELEFONIE · VERWALTUNG</div><h1>'+title+'</h1><p>'+desc+'</p></div><img class="hero-mark" src="/logo.png" alt=""></section>';
const notice='<div class="warning">◉ &nbsp; <strong>Testumgebung:</strong> Asterisk wurde bisher nur auf seine Version getestet. Es gibt noch keine Telekom-SIP-Anmeldung, keine Anrufdaten und keine aktiven Weiterleitungen.</div>';
const panel=(title,content,subtitle='')=>'<section class="panel"><div class="panel-head"><h2>'+title+'</h2><small>'+subtitle+'</small></div>'+content+'</section>';
const screens={
overview:()=>header('Deine Telefonie. Alles im Blick.','Verwalte künftig Rufnummern, Anrufverteilung, Weiterleitungen und Nebenstellen an einem Ort.')+notice+'<div class="stats"><div class="stat"><div class="kicker">Telekom-Rufnummern</div><strong>3</strong><small>Vertrag vorhanden · nicht angebunden</small></div><div class="stat"><div class="kicker">Aktive Weiterleitungen</div><strong>–</strong><small>Keine Live-Daten</small></div><div class="stat"><div class="kicker">Anrufprotokolle</div><strong>–</strong><small>Noch nicht verfügbar</small></div><div class="stat"><div class="kicker">Asterisk</div><strong>Test</strong><small>Version 22.10.1 geprüft</small></div></div><div class="grid">'+panel('Deine Rufnummern',numberRows,'3 Plätze')+panel('Einrichtung', '<div class="panel-pad"><p>Wir verbinden zuerst den Telekom-SIP-Zugang über Friedberg mit der isolierten Asterisk-Instanz.</p><div class="steps"><div class="step"><b>1</b> Asterisk isoliert dauerhaft installieren</div><div class="step"><b>2</b> Telekom-SIP-Routing über UniFi testen</div><div class="step"><b>3</b> Rufnummer registrieren und Testanruf durchführen</div><div class="step"><b>4</b> Weiterleitungen sicher freischalten</div></div></div>','Projektstatus')+'</div>',
numbers:()=>header('Rufnummern','Hinterlege deine drei Telekom-Rufnummern. Sie werden einheitlich im internationalen Format +49… gespeichert.')+notice+panel('Telekom · Friedberg','<div class="panel-pad"><form id="numbers-form"><p class="page-text">Beispiel: 06031 123456 oder 00496031123456 wird als +496031123456 gespeichert. Das Hinterlegen aktiviert noch keine SIP-Verbindung.</p>'+[0,1,2].map(i=>'<div class="number-field"><label>Bezeichnung <input maxlength="60" name="label'+i+'" value="'+escapeHtml(storedNumbers[i]?.label||'Rufnummer '+(i+1))+'"></label><label>Rufnummer <input type="tel" autocomplete="off" name="number'+i+'" placeholder="+496031…" value="'+escapeHtml(storedNumbers[i]?.e164||'')+'"></label></div>').join('')+'<p id="numbers-message" class="page-text" role="status"></p><button type="submit" class="save-number">Rufnummern speichern</button></form></div>','SIP noch nicht verbunden'),
forwards:()=>header('Weiterleitungen','Später steuerst du hier Umleitungen bei Besetzt, Nichtmelden oder außerhalb der Geschäftszeiten.')+notice+panel('Weiterleitungsregeln','<div class="panel-pad"><p>Es sind noch keine echten Regeln abrufbar. Das Erstellen und Aktivieren wird erst nach erfolgreicher Telefonie-Anbindung freigeschaltet.</p><button class="action-disabled" disabled>+ Weiterleitung erstellen · bald verfügbar</button></div>'),
extensions:()=>header('Nebenstellen','Interne Nummern für Empfang, Büro und Mitarbeiter – später mit SIP-Endgeräten oder Softphones.')+notice+panel('Nebenstellen','<div class="panel-pad"><p>Keine Nebenstellen eingerichtet.</p><button class="action-disabled" disabled>+ Nebenstelle hinzufügen · bald verfügbar</button></div>'),
calls:()=>header('Anrufliste','Alle eingehenden, ausgehenden und verpassten Gespräche – sobald Asterisk angebunden ist.')+notice+panel('Anrufprotokoll','<div class="panel-pad"><p>Keine Datenverbindung vorhanden. Hier werden bewusst keine Beispielanrufe als echte Ereignisse angezeigt.</p></div>'),
settings:()=>header('Einstellungen','SIP-Trunks, Status und Zugriffssteuerung für die zukünftige Telefonanlage.')+notice+panel('Verbindungsstatus','<div class="item"><span class="circle">⌁</span><div class="item-text"><strong>Asterisk</strong><small>'+(pbxStatus?.monitoring==='connected'?'AMI-Verbindung erreichbar':pbxStatus?.monitoring==='unavailable'?'AMI nicht erreichbar':'Status wird geprüft')+'</small></div><span class="pill">Test</span></div><div class="item"><span class="circle">☎</span><div class="item-text"><strong>Telekom SIP</strong><small>Noch nicht verbunden</small></div><span class="pill">Offen</span></div><div class="item"><span class="circle">⇄</span><div class="item-text"><strong>Verwaltungs-API</strong><small>Noch nicht eingerichtet</small></div><span class="pill">Offen</span></div>')
};
function render(){const id=location.hash.slice(1)||'overview';const page=screens[id]?id:'overview';main.innerHTML=screens[page]();nav.forEach(b=>b.classList.toggle('active',b.dataset.page===page));sidebar.classList.remove('open');document.title='TARIQ Telefonie · '+({overview:'Übersicht',numbers:'Rufnummern',forwards:'Weiterleitungen',extensions:'Nebenstellen',calls:'Anrufliste',settings:'Einstellungen'})[page];}
nav.forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.page;render()}));document.querySelector('#menu').addEventListener('click',()=>sidebar.classList.toggle('open'));window.addEventListener('hashchange',()=>{if(document.body.classList.contains('authenticated'))render()});
async function authApi(url,options={}){
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
 const value=await response.json();if(!response.ok)throw new Error(value.error||'Anmeldung fehlgeschlagen');return value;
}
async function initializeAuth(){
 try{
 const result=await authApi('/api/session');
 if(result.authenticated){document.body.classList.add('authenticated');render();loadNumbers();loadPbxStatus();}
 else{document.body.classList.remove('authenticated');document.querySelector('[name=email]').value=result.email||''}
 }catch{document.querySelector('#login-error').textContent='Verbindung zur Anmeldung nicht verfügbar.'}
}
document.querySelector('#login-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),error=document.querySelector('#login-error');
 error.textContent='';button.disabled=true;
 try{
  await authApi('/api/login',{method:'POST',body:JSON.stringify({email:form.elements.email.value,password:form.elements.password.value})});
  form.elements.password.value='';document.body.classList.add('authenticated');render();loadNumbers();loadPbxStatus();
 }catch(e){error.textContent=e.message}
 finally{button.disabled=false}
});
document.querySelector('#logout').addEventListener('click',async()=>{
 try{await authApi('/api/logout',{method:'POST',body:'{}'})}catch{}
 document.body.classList.remove('authenticated');document.querySelector('[name=password]').value='';
});
initializeAuth();
async function loadPbxStatus(){try{pbxStatus=await authApi('/api/pbx/status');if(location.hash.slice(1)==='settings')render();}catch{pbxStatus={monitoring:'unavailable'}}}
async function loadNumbers(){
 try{const r=await authApi('/api/numbers');storedNumbers=r.numbers||[];if(location.hash.slice(1)==='numbers')render();}
 catch(e){console.warn('Rufnummern nicht geladen',e.message)}
}
document.addEventListener('submit',async ev=>{
 if(ev.target.id!=='numbers-form')return;
 ev.preventDefault();const form=ev.target,button=form.querySelector('[type=submit]'),message=form.querySelector('#numbers-message');
 const numbers=[0,1,2].map(i=>({label:form.elements['label'+i].value,number:form.elements['number'+i].value.trim()})).filter(x=>x.number);
 button.disabled=true;message.textContent='Speichern …';
 try{const r=await authApi('/api/numbers',{method:'POST',body:JSON.stringify({numbers})});storedNumbers=r.numbers;message.textContent='Rufnummern gespeichert. SIP ist weiterhin nicht verbunden.';render();const msg=document.querySelector('#numbers-message');if(msg)msg.textContent='Rufnummern erfolgreich gespeichert. SIP-Verbindung noch nicht aktiv.';}
 catch(e){message.textContent=e.message}finally{button.disabled=false}
});
