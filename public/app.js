let currentSession=null;
let settingsState=null,settingsLoading=false,settingsError='',settingsExporting=false,settingsExportMessage='';
const main=document.querySelector('#main'),sidebar=document.querySelector('#sidebar');
const nav=[...document.querySelectorAll('[data-page]')];
let numberDrafts={},numberMessage='',numberSaving=false,numbersReady=false;
let announcementTexts={},voiceDrafts={},voiceGenerating=false,voiceMessage='';
let hoursLine='+4960316868187',hoursDraft={};
let routeTypeDraft={},routePhoneDraft={},routeExtensionDraft={};
let callCache=null,callsLoading=false,callError='',callRequestVersion=0,callSearchTimer=null;
let callFilters={filter:'all',company:'all',days:'30',q:'',page:1};
let routingState=null,routeDraft={},routeBusy=false,routeMessage='';
let pbxStatus=null,liveStatus=null,storedNumbers=[],routingPlans={},routingPreview=null;
const lines=[
 {label:'TARIQ Fahrdienst',e164:'+4960316868187',ext:'100',verified:true},
 {label:'TARIQ',e164:'+4960316843466',ext:'101',verified:false},
 {label:'TARIQ Zulassungsservice',e164:'+4960316871811',ext:'102',verified:false}
];
lines.forEach(x=>x.defaultLabel=x.label);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pill=(text,kind='neutral')=>'<span class="pill '+kind+'">'+esc(text)+'</span>';
const panel=(title,content,subtitle='')=>'<section class="panel"><div class="panel-head"><h2>'+title+'</h2><small>'+subtitle+'</small></div>'+content+'</section>';
const head=(title,description)=>'<section class="hero"><div><div class="eyebrow">TARIQ TELEFONIE · ZENTRALE</div><h1>'+title+'</h1><p>'+description+'</p></div><img class="hero-mark" src="/logo.png" alt=""></section>';
const liveReady=()=>['connected','partial'].includes(liveStatus?.monitoring);
const liveTime=()=>liveStatus?.checkedAt?new Date(liveStatus.checkedAt).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const notice=()=>'<div class="warning">'+(liveStatus?.monitoring==='connected'?'Status aktualisiert um '+esc(liveTime())+' Uhr · automatische Aktualisierung jede Minute.':liveStatus?.monitoring==='partial'?'Einzelne Statusabfragen sind nicht verfügbar. Unbekannte Werte werden mit — angezeigt.':liveStatus?.monitoring==='stale'?'Die letzte Statusabfrage ist veraltet. Es werden keine alten Werte als live angezeigt.':'Die Live-Überwachung wird eingerichtet. Die bestehende Telefonie läuft unabhängig davon weiter.')+' Zeitregeln werden unter Öffnungszeiten verwaltet.</div><div class="live-toolbar"><span>Letzte Abfrage: '+esc(liveTime())+'</span><button type="button" id="refresh-status">Status aktualisieren</button></div>';
const row=(icon,title,sub,right='')=>'<div class="item"><span class="circle">'+icon+'</span><div class="item-text"><strong>'+esc(title)+'</strong><small>'+esc(sub)+'</small></div>'+right+'</div>';
const lineRows=()=>lines.map((x,i)=>{const registration=liveStatus?.registrations?.find(r=>r.id===(i?'telekom-registration-'+(i+1):'telekom-registration'));const label=registration?(registration.status==='Registered'?'Telekom registriert':registration.status):(liveReady()&&!liveStatus.errors?.includes('registrations')?'Nicht registriert':x.verified?'Anruf getestet · letzter Stand':'Registrierung zuletzt bestätigt');return row('☎',x.label,x.e164+' · '+(activeRoute(x)?targetLabel(activeRoute(x)):'Rufziel derzeit nicht abrufbar'),'<div class="line-status">'+pill(label,registration?.status==='Registered'?'good':'neutral')+pill(targetAvailability(x).label,targetAvailability(x).kind)+'</div>')}).join('');
const stat=(name,value,sub)=>'<div class="stat"><div class="kicker">'+name+'</div><strong>'+value+'</strong><small>'+sub+'</small></div>';
const monitor=()=>pbxStatus?.monitoring==='connected'?'Verbunden':pbxStatus?.monitoring==='unavailable'?'Nicht erreichbar':'Nicht geprüft';

const activeRoute=x=>routingState?.available?routingState.mappings?.[x.e164]:null;
function endpointAvailability(extension){
 if(!liveReady()||liveStatus.errors?.includes('extensions'))return {label:'Gerätestatus unbekannt',kind:'neutral'};
 const endpoint=liveStatus.extensions?.find(e=>e.id===extension);
 if(!endpoint)return {label:'Gerätestatus unbekannt',kind:'neutral'};
 if(!endpoint.configured)return {label:'Nebenstelle nicht eingerichtet',kind:'offline'};
 if(!endpoint.registered)return {label:'Telefon/App offline',kind:'offline'};
 if(endpoint.online===false)return {label:'Gerät nicht erreichbar',kind:'offline'};
 if(endpoint.online===true)return {label:'Telefon/App online',kind:'good'};
 return {label:'Telefon/App angemeldet',kind:'neutral'};
}
function targetAvailability(line){
 const target=activeRoute(line);
 if(!target)return {label:'Rufzielstatus unbekannt',kind:'neutral'};
 if(target.startsWith('+'))return {label:'Externes Rufziel · Status nicht prüfbar',kind:'neutral'};
 return endpointAvailability(target);
}

function normalizeRouteTarget(raw,extensions,own){
 if(typeof raw!=='string')throw Error('Ungültiges Rufziel.');
 if(extensions.includes(raw))return raw;
 let value=raw.trim().replace(/[\s()./\-]/g,'');
 if(value.startsWith('00'))value='+'+value.slice(2);
 else if(value.startsWith('0'))value='+49'+value.slice(1);
 if(!/^\+49[1-9][0-9]{6,12}$/.test(value))throw Error('Bitte eine deutsche Handy- oder Festnetznummer eingeben.');
 const national='0'+value.slice(3);
 if(!(/^01[567][0-9]{7,9}$/.test(national)||/^0[2-9][0-9]{5,10}$/.test(national))||['0137','0180','0190','0700','0800','0900'].some(p=>national.startsWith(p)))throw Error('Bitte eine reguläre deutsche Handy- oder Festnetznummer eingeben.');
 if(own.includes(value))throw Error('Eine eigene Firmennummer kann nicht als externes Rufziel verwendet werden.');
 return value;
}

const routeExtensions=()=>['100','101','102',...Array.from({length:20},(_,i)=>String(800+i))];
const phoneTargets=()=>[...lines,...((typeof window!=='undefined'&&window.browserDevices)||[{id:'800',name:'Administrator · Browser'}]).map(d=>({ext:d.id,label:'Browser · '+d.name}))];
const targetLabel=target=>target?.startsWith('+')?'Extern: '+target:Number(target)>=800&&Number(target)<=819?'Browser-Telefon '+target:'Nebenstelle '+target;
const choiceTarget=(type,extension,phone)=>{
 if(type==='extension')return extension;
 const target=normalizeRouteTarget(phone,routeExtensions(),lines.map(x=>x.e164));
 if(!target.startsWith('+'))throw Error('Bitte eine Handy- oder Festnetznummer eingeben.');
 return target;
};
function forwardDraft(x){
 const active=activeRoute(x),desired=routeDraft[x.e164]||active||x.ext;
 return {type:routeTypeDraft[x.e164]||(desired.startsWith('+')?'external':'extension'),
  extension:routeExtensionDraft[x.e164]||(!desired.startsWith('+')?desired:x.ext),
  phone:routePhoneDraft[x.e164]??(desired.startsWith('+')?desired:'')};
}

const forwardCards=()=>'<div class="forward-grid">'+lines.map(x=>{
 const active=activeRoute(x),draft=forwardDraft(x);
 const disabled=routeBusy||routingState?.pending||!routingState?.available;
 let selected;try{selected=choiceTarget(draft.type,draft.extension,draft.phone)}catch{selected=null}
 return '<section class="panel forward-card"><div class="panel-head"><div><div class="eyebrow">RUFZIEL</div><h2>'+esc(x.label)+'</h2><p class="forward-number">'+esc(x.e164)+'</p></div>'+pill(active?'Aktiv bestätigt':'Nicht geprüft',active?'good':'neutral')+'</div><form class="forward-form panel-pad" data-line="'+x.e164+'"><div class="forward-current"><span>Aktuelles Rufziel</span><strong>'+esc(active?targetLabel(active):'Noch nicht abrufbar')+'</strong></div><fieldset '+(disabled?'disabled':'')+'><div class="target-types"><label class="'+(draft.type==='extension'?'selected':'')+'"><input type="radio" name="targetType" value="extension" '+(draft.type==='extension'?'checked':'')+'> Nebenstelle</label><label class="'+(draft.type==='external'?'selected':'')+'"><input type="radio" name="targetType" value="external" '+(draft.type==='external'?'checked':'')+'> Externe Nummer</label></div>'+(draft.type==='extension'?'<label class="field">Ziel-Telefon<select name="extension">'+phoneTargets().map(t=>'<option value="'+t.ext+'" '+(draft.extension===t.ext?'selected':'')+'>'+t.ext+' · '+esc(t.label)+'</option>').join('')+'</select></label>':'<label class="field">Handy- oder Festnetznummer<input type="tel" name="externalNumber" inputmode="tel" autocomplete="tel" maxlength="40" placeholder="z. B. 0170 1234567" value="'+esc(draft.phone)+'" required></label><p class="target-hint">Mit deutscher Vorwahl oder +49 eingeben.</p>')+'<button class="save-number" type="submit" '+(disabled||selected===active||(draft.type==='external'&&!draft.phone.trim())?'disabled':'')+'>Übernehmen</button></fieldset><p class="page-text">Gilt für neue eingehende Anrufe. Deine Öffnungszeiten bleiben aktiv.</p></form></section>';
}).join('')+'</div>';
const forwardView=()=>head('Weiterleitungen','Für jede Firma zwischen interner Nebenstelle und externer Rufnummer wählen.')+
 '<div class="forward-info"><span class="status-dot"></span><span>'+esc(routingState?.pending?'Änderung wird übernommen · dies dauert bis zu einer Minute.':routingState?.available?'Aktive Rufziele werden direkt in Asterisk geprüft.':routingState?.note||'Rufziele werden geladen …')+'</span></div>'+
 '<p class="forward-message" role="status" aria-live="polite">'+esc(routeMessage)+'</p>'+forwardCards()+
 panel('Weitere Regeln','<div class="panel-pad"><p class="page-text">Die eingestellten Öffnungszeiten gelten auch für externe Rufziele. Regeln für Besetzt und Nichtmelden folgen als nächster Schritt.</p></div>');


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

const standardAnnouncement=line=>'Willkommen bei '+(line.defaultLabel||line.label)+'. Sie rufen außerhalb unserer Öffnungszeiten an. Bitte versuchen Sie es zu unseren Geschäftszeiten erneut. Vielen Dank.';
const cleanVoiceText=text=>String(text||'').trim().replace(/\s+/g,' ');
function announcementForm(line){
 const active=routingState?.announcements?.[line.e164];
 const draft=voiceDrafts[line.e164]||routingState?.announcementDrafts?.[line.e164];
 const text=announcementTexts[line.e164]??draft?.text??active?.text??standardAnnouncement(line);
 const matches=!!draft&&draft.text===cleanVoiceText(text);
 const disabled=routeBusy||!!routingState?.pending||!routingState?.available||!routingState?.hoursReady;
 const preview=matches?'&draft='+draft.id:active?'&draft='+active.id:'';
 const label=matches&&draft.id!==active?.id?'Neue Ansage vorhören':active?'Aktive eigene Ansage vorhören':'Standardansage vorhören';
 return '<form id="announcement-form" class="announcement-form" data-line="'+line.e164+'"><div class="announcement-icon">◷</div><div class="voice-heading"><h3>Deine Geschlossen-Ansage</h3>'+pill(!routingState?.available?'Nicht geprüft':active?'Eigene Ansage aktiv':'Standardansage aktiv',active&&routingState?.available?'good':'neutral')+'</div><p class="page-text">Text eingeben, deutsche Sprachansage erzeugen und vorhören. Erst mit „Ansage aktivieren“ wird die bisherige Ansage ersetzt.</p><label class="field">Ansagetext<textarea name="announcementText" rows="6" maxlength="800" required '+(voiceGenerating?'disabled':'')+'>'+esc(text)+'</textarea></label><div class="voice-counter"><span>Deutsche Computerstimme</span><span id="voice-count">'+text.length+' / 800 Zeichen</span></div><div class="voice-actions"><button class="save-number" type="submit" '+(voiceGenerating?'disabled':'')+'>'+(voiceGenerating?'Ansage wird erzeugt …':'Ansage erzeugen')+'</button><button class="voice-activate" data-voice-activate type="button" '+(disabled||voiceGenerating||!matches||draft?.id===active?.id?'disabled':'')+'>Ansage aktivieren</button></div><p class="voice-message" role="status" aria-live="polite">'+esc(voiceMessage)+'</p><label class="announcement-label">'+label+'</label><audio id="announcement-audio" controls preload="none" src="/api/pbx/announcement?line='+encodeURIComponent(line.e164)+preview+'"></audio>'+(active?'<button class="voice-default" data-voice-default type="button" '+(disabled||voiceGenerating?'disabled':'')+'>Standardansage verwenden</button>':'')+'<p class="page-text">Die aktive Ansage wird außerhalb der Öffnungszeiten abgespielt. Anschließend endet der Anruf.</p></form>';
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
 panel('Geschlossen-Ansage','<div class="panel-pad">'+announcementForm(line)+'<div class="forward-current"><span>Rufziel während der Öffnungszeiten</span><strong>'+esc(activeRoute(line)?targetLabel(activeRoute(line)):'Noch nicht abrufbar')+'</strong></div></div>')+'</div>';
}


const callDate=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'});
const callTime=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',timeStyle:'short'});
const partyLabel=value=>value==null?'Anonym':['100','101','102'].includes(value)?'Nebenstelle '+value:value.startsWith('+49')?'0'+value.slice(3):value;
const callDuration=seconds=>{const n=Math.max(0,Number(seconds)||0),h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=Math.floor(n%60);return (h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(s).padStart(2,'0')};
const callDirection=direction=>({incoming:'Eingehend',outgoing:'Ausgehend',internal:'Intern'}[direction]||'Anruf');
function callsResults(){
 const data=callCache,stats=data?.stats,source=data?.source;
 const known=!!data&&(source?.status==='connected'||data.calls?.length>0||stats?.total>0);
 const value=key=>known?stats?.[key]??0:'—';
 let content='<div class="stats call-stats">'+stat('Anrufe gesamt',value('total'),'Gewählter Zeitraum')+stat('Eingehend',value('incoming'),'Externe Anrufer')+stat('Ausgehend',value('outgoing'),'Anrufe nach außen')+stat('Verpasst',value('missed'),'Eingehend · nicht angenommen')+'</div>';
 if(callError)content+='<div class="warning" role="status">'+esc(callError)+'</div>';
 if(source?.status!=='connected'&&data)content+='<div class="warning">'+esc(source?.note||'Die Anrufliste wird gerade nicht aktualisiert. Gespeicherte Einträge bleiben sichtbar.')+'</div>';
 const stamp=source?.checkedAt?callTime.format(new Date(source.checkedAt)):'—';
 let body='';
 if(!data)body='<div class="call-empty"><span class="circle">☎</span><h3>'+(callsLoading?'Anrufliste wird geladen …':'Anrufliste noch nicht verfügbar')+'</h3><p>Hier erscheinen die tatsächlich erfassten Anrufe.</p></div>';
 else if(!data.calls?.length)body='<div class="call-empty"><span class="circle">☎</span><h3>'+(stats?.total||callFilters.q||callFilters.filter!=='all'?'Keine Anrufe für diese Auswahl':'Noch keine abgeschlossenen Anrufe')+'</h3><p>Neue Anrufe erscheinen nach Gesprächsende innerhalb etwa einer Minute.</p></div>';
 else body='<div class="table-wrap"><table class="table call-table"><caption class="sr-only">Anrufliste nach Zeitpunkt absteigend</caption><thead><tr><th>Richtung</th><th>Anrufer / Rufziel</th><th>Firma</th><th>Zeitpunkt</th><th>Dauer</th><th>Status</th></tr></thead><tbody>'+data.calls.map(row=>{
  const number=row.direction==='incoming'?row.from:row.to;
  const icon=row.missed?'↙':row.direction==='incoming'?'↙':row.direction==='outgoing'?'↗':'⇄';
  const status=row.announcement?'Ansage':row.status==='answered'?(row.direction==='outgoing'?'Verbunden':'Angenommen'):row.status==='busy'?'Besetzt':row.failureReason==='target-unavailable'?'Rufziel nicht erreichbar':row.status==='failed'?'Nicht verbunden':row.direction==='incoming'?'Verpasst':'Nicht angenommen';
  const detail=row.direction==='incoming'?'an '+partyLabel(row.to):'von '+partyLabel(row.from);
  const phone=number?'<a href="tel:'+esc(number)+'">'+esc(partyLabel(number))+'</a>':row.callerIdStatus==='unconfirmed'?'Anrufernummer nicht erfasst':'Anonym / nicht übermittelt';
  return '<tr><td data-label="Richtung"><span class="call-direction '+(row.missed?'missed':esc(row.direction))+'"><span class="circle">'+icon+'</span>'+callDirection(row.direction)+'</span></td><td data-label="Anrufer / Rufziel"><div class="call-party"><strong>'+phone+'</strong><small>'+esc(detail)+'</small>'+(row.forwardedTo?'<small>Weiterleitung: '+esc(partyLabel(row.forwardedTo))+'</small>':'')+'</div></td><td data-label="Firma">'+esc(row.companyLabel)+'</td><td data-label="Zeitpunkt"><time datetime="'+esc(row.startedAt)+'">'+esc(callDate.format(new Date(row.startedAt)))+'</time></td><td data-label="Dauer">'+(row.status==='answered'?esc(callDuration(row.billsec)):'—')+'</td><td data-label="Status">'+pill(status,row.status==='answered'?'good':'call-status '+(row.missed?'missed':row.status))+'</td></tr>';
 }).join('')+'</tbody></table></div>';
 const total=data?.total||0,page=data?.page||1,pages=data?.pages||1;
 content+=panel('Gesprächsverlauf','<div class="call-source"><span>Aktualisiert: '+esc(stamp)+' Uhr · deutsche Ortszeit</span><button class="call-refresh" data-call-refresh type="button" '+(callsLoading?'disabled':'')+'>'+(callsLoading?'Aktualisiere …':'Aktualisieren')+'</button></div>'+body+'<div class="call-pagination"><span>'+total+' '+(total===1?'Eintrag':'Einträge')+' · Seite '+page+' von '+pages+'</span><div><button type="button" data-call-page="'+(page-1)+'" '+(page<=1||callsLoading?'disabled':'')+'>Zurück</button><button type="button" data-call-page="'+(page+1)+'" '+(page>=pages||callsLoading?'disabled':'')+'>Weiter</button></div></div>');
 return content+'<p class="call-retention">Die Liste zeigt die letzten 90 Tage, höchstens 5.000 Anrufe. Zusammengehörige Weiterleitungsabschnitte werden zusammengefasst.</p>';
}
function callsView(){
 const tabs=[['all','Alle'],['incoming','Eingehend'],['outgoing','Ausgehend'],['missed','Verpasst'],['internal','Intern']];
 return head('Anrufliste','Eingehende, ausgehende und verpasste Anrufe deiner Firmen im Überblick.')+
 '<div class="call-controls"><div class="call-tabs" role="tablist" aria-label="Anrufe filtern">'+tabs.map(([value,title])=>'<button type="button" role="tab" data-call-filter="'+value+'" aria-selected="'+(callFilters.filter===value)+'" class="'+(callFilters.filter===value?'active':'')+'">'+title+'</button>').join('')+'</div><form id="call-search-form" class="call-search"><label class="sr-only" for="call-query">Rufnummer suchen</label><input id="call-query" name="q" type="search" maxlength="80" placeholder="Rufnummer suchen …" value="'+esc(callFilters.q)+'"><label class="sr-only" for="call-company">Firma</label><select id="call-company" name="company"><option value="all">Alle Firmen</option>'+lines.map(x=>'<option value="'+x.e164+'" '+(callFilters.company===x.e164?'selected':'')+'>'+esc(x.label)+'</option>').join('')+'</select><label class="sr-only" for="call-days">Zeitraum</label><select id="call-days" name="days">'+[['7','Letzte 7 Tage'],['30','Letzte 30 Tage'],['90','Letzte 90 Tage']].map(([v,t])=>'<option value="'+v+'" '+(callFilters.days===v?'selected':'')+'>'+t+'</option>').join('')+'</select></form></div><div id="call-results" aria-live="polite">'+callsResults()+'</div>';
}

function wireguardState(){
 const wg=settingsState?.wireguard,status=wg?.status;
 const handshake=wg?.handshakeAgeSeconds;
 const age=Number.isInteger(handshake)?(handshake<60?handshake+' Sekunden':Math.floor(handshake/60)<60?Math.floor(handshake/60)+' Minuten':Math.floor(handshake/3600)+' Stunden'):null;
 const stamp=wg?.checkedAt?new Date(wg.checkedAt).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}):'—';
 return {label:status==='connected'?'Verbunden':status==='idle'?'Kein aktueller Handshake':status==='no-handshake'?'Noch kein Handshake':status==='stale'?'Abfrage veraltet':wg?.reason==='permission-required'?'Leserecht fehlt':'Nicht geprüft',
  detail:(age?'Letzter Handshake vor '+age:wg?.reason==='permission-required'?'Handshake-Abfrage benötigt eine einmalige Freigabe':'Handshake derzeit nicht abrufbar')+' · geprüft '+stamp+' Uhr',good:status==='connected'};
}
function settingsView(){
 const wg=wireguardState(),data=settingsState;
 const sipKnown=liveReady()&&!liveStatus.errors?.includes('registrations');
 const registered=sipKnown?liveStatus.registrations.filter(r=>r.status==='Registered').length:null;
 const routing=data?.wireguard?.status==='stale'?null:data?.wireguard?.policyRule;
 const service=data?.wireguard?.routingService;
 const routeLabel=routing===false?'Routing-Regel fehlt':service==='failed'?'Dienstfehler':service==='inactive'?'Dienst inaktiv':routing===true&&service==='active'?'Vorbereitet':'Nicht vollständig geprüft';
 const expiry=data?.access?.expiresAt?new Date(data.access.expiresAt).toLocaleString('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'}):'—';
 const stamp=data?.checkedAt?new Date(data.checkedAt).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}):'—';
 return head('Systemeinstellungen','Verbindungen prüfen, Verwaltung öffnen und deine Einstellungen sichern.')+
 '<div class="live-toolbar"><span>Letzte Abfrage: '+esc(stamp)+' Uhr · automatische Aktualisierung</span><button type="button" data-settings-refresh '+(settingsLoading?'disabled':'')+'>'+(settingsLoading?'Wird geprüft …':'Status aktualisieren')+'</button></div>'+
 (settingsError?'<div class="warning" role="status">'+esc(settingsError)+'</div>':'')+
 panel('Verbindungsstatus',row('◉','Asterisk AMI',monitor(),pill(pbxStatus?.monitoring==='connected'?'Erreichbar':'Nicht bestätigt',pbxStatus?.monitoring==='connected'?'good':'neutral'))+
 row('☎','Telekom SIP',registered===null?'Registrierungen derzeit nicht abrufbar':registered+' von 3 Rufnummern registriert',pill(registered===null?'Nicht geprüft':registered===3?'Registriert':'Prüfen',registered===3?'good':'neutral'))+
 row('⇄','WireGuard · Friedberg',wg.detail,pill(wg.label,wg.good?'good':'neutral'))+
 row('⇄','Telekom-Routing','Tunnel-Routing und Routing-Dienst',pill(routeLabel,routing===true&&service==='active'?'good':'neutral'))+
 row('↪','Rufziele & Öffnungszeiten',data?.routing?.available?'Aktive Zuordnungen werden geprüft':'Status derzeit nicht abrufbar',pill(data?.routing?.available?'Bereit':'Nicht geprüft',data?.routing?.available?'good':'neutral'))+
 row('≡','Anrufliste',data?.callHistory?.status==='connected'?'Neue Einträge nach Gesprächsende innerhalb etwa einer Minute':'Die Erfassung wird derzeit nicht live bestätigt',pill(data?.callHistory?.status==='connected'?'Verbunden':'Nicht geprüft',data?.callHistory?.status==='connected'?'good':'neutral')))+
 '<div class="settings-grid">'+panel('Telefonanlage verwalten','<div class="panel-pad settings-links"><a class="settings-link" href="#numbers"><span class="circle">☎</span><span><strong>SIP-Trunks & Rufnummern</strong><small>Drei Telekom-Rufnummern, Status und Firmenbezeichnungen</small></span><span aria-hidden="true">↗</span></a><a class="settings-link" href="#extensions"><span class="circle">♧</span><span><strong>Nebenstellen & Geräte</strong><small>Nebenstellen 100, 101 und 102 · aktueller Gerätestatus</small></span><span aria-hidden="true">↗</span></a><a class="settings-link" href="#forwards"><span class="circle">↪</span><span><strong>Weiterleitungen</strong><small>Interne Nebenstelle oder externe Rufnummer festlegen</small></span><span aria-hidden="true">↗</span></a><a class="settings-link" href="#hours"><span class="circle">◷</span><span><strong>Öffnungszeiten & Ansagen</strong><small>Wochenpläne und eigene Geschlossen-Ansagen verwalten</small></span><span aria-hidden="true">↗</span></a></div>')+
 panel('Zugang & Sicherheit','<div class="panel-pad"><dl class="settings-details"><div><dt>Angemeldet als</dt><dd>'+esc(data?.access?.email||'Wird geladen …')+'</dd></div><div><dt>Berechtigung</dt><dd>'+esc(data?.access?.role||'Wird geprüft …')+'</dd></div><div><dt>Sitzung gültig bis</dt><dd>'+esc(expiry)+' Uhr</dd></div><div><dt>Anmeldung</dt><dd>Bestätigter Administratorzugang</dd></div></dl><p class="page-text">Nur der freigegebene Administrator kann Einstellungen ändern. Mit „Abmelden“ beendest du deine aktuelle Sitzung.</p></div>')+'</div>'+
 '<div class="settings-grid">'+panel('Einstellungen sichern','<div class="panel-pad"><p class="page-text">Firmenbezeichnungen, Rufziele, Öffnungszeiten und gespeicherte eigene Ansagetexte als JSON herunterladen.</p><button type="button" class="save-number" data-settings-export '+(settingsExporting?'disabled':'')+'>'+(settingsExporting?'Export wird erstellt …':'Einstellungen herunterladen')+'</button><p class="forward-message" role="status" aria-live="polite">'+esc(settingsExportMessage)+'</p><p class="page-text">Der Export enthält keine Passwörter, Audiodateien oder Anrufdaten und ersetzt kein vollständiges Anlagen-Backup. Ein automatischer Import ist noch nicht eingerichtet.</p></div>')+
 panel('Weitere Funktionen','<div class="panel-pad"><div class="settings-capability"><div><h3>Anrufaufzeichnung</h3><p>Über dieses Portal noch nicht eingerichtet.</p></div>'+pill('Nicht eingerichtet')+'</div><div class="settings-capability"><div><h3>Browser-Telefonie</h3><p>Unter Telefon online gehen, anrufen und Anrufe annehmen. Telefonzugänge werden vom Administrator zugewiesen.</p><a href="#phone">Telefon öffnen ↗</a></div>'+pill('Verfügbar','good')+'</div></div>')+'</div>';
}

const screens={
 phone:()=>typeof window!=='undefined'&&window.PhoneUI?window.PhoneUI.render():head('Telefon','Telefon wird geladen …'),
 'phone-users':()=>typeof window!=='undefined'&&window.PhoneUI?window.PhoneUI.renderUsers():head('Telefonzugänge','Zugänge werden geladen …'),
 overview:()=>head('Telefonie im Überblick','Drei Telekom-Rufnummern, Nebenstellen und Systemverbindungen zentral verwalten.')+notice()+
 '<div class="stats">'+stat('Telekom-Rufnummern',liveReady()&&!liveStatus.errors?.includes('registrations')?liveStatus.registrations.filter(r=>r.status==='Registered').length+' / 3':'3',liveReady()&&!liveStatus.errors?.includes('registrations')?'Aktuell registriert':'Eingerichtet · Live-Status unbekannt')+stat('Nebenstellen',liveReady()&&!liveStatus.errors?.includes('extensions')?liveStatus.extensions.filter(e=>e.online===true).length+' / '+liveStatus.extensions.filter(e=>e.configured).length:'3',liveReady()&&!liveStatus.errors?.includes('extensions')?'Aktuell erreichbar':'100 · 101 · 102 eingerichtet')+stat('Laufende Gespräche',liveStatus?.activeCalls??'—',liveStatus?.activeChannels==null?'Live-Abfrage nicht verfügbar':esc(liveStatus.activeChannels)+' aktive Kanäle · einzelne Verbindungen')+stat('Asterisk AMI',esc(monitor()),'Verbindung zum Monitoring')+'</div>'+
 '<div class="grid">'+panel('Rufnummern & Zuordnung',lineRows(),'Telekom · Friedberg')+
 panel('Systemverbindungen',row('◉','Asterisk AMI',monitor(),pill(pbxStatus?.monitoring==='connected'?'Online':'Nicht bestätigt',pbxStatus?.monitoring==='connected'?'good':'neutral'))+
 row('⇄','WireGuard · Friedberg',wireguardState().detail,pill(wireguardState().label,wireguardState().good?'good':'neutral'))+
 row('◈','Browser-Telefon','Anrufe direkt im Browser · unter Telefon öffnen',pill(typeof window!=='undefined'&&window.PhoneUI?.state()?.online?'Online':'Bereit',typeof window!=='undefined'&&window.PhoneUI?.state()?.online?'good':'neutral')),'Statusübersicht')+'</div>',
 numbers:()=>head('Rufnummern','Deine Telekom-Rufnummern, Firmenbezeichnungen und Rufziele zentral verwalten.')+
 panel('Telekom · Rufnummern',lineRows(),'3 Registrierungen')+
 panel('Rufnummernverwaltung','<div class="panel-pad"><p class="page-text">Bezeichnungen bearbeiten und Rufziele, Öffnungszeiten und Ansagen für jede Firma verwalten.</p><p class="forward-message" role="status" aria-live="polite">'+esc(numberMessage)+'</p><div class="number-grid">'+lines.map(x=>{
  const target=activeRoute(x),hours=routingState?.hours?.[x.e164];
  const state=!routingState?.available?'Status derzeit nicht abrufbar':hours?.closedDate===routingState.today?'Heute manuell geschlossen':hours?.enabled?(routingState.open?.[x.e164]?'Geöffnet · Wochenplan aktiv':'Geschlossen · Wochenplan aktiv'):'Ohne Wochenplan erreichbar';
  return '<article class="number-card"><div class="number-heading"><span class="circle">☎</span><div><h3>'+esc(x.label)+'</h3><p>'+esc(x.e164)+'</p></div></div><form class="number-profile-form" data-line="'+x.e164+'"><label class="field">Firmenbezeichnung<input name="label" maxlength="60" required value="'+esc(numberDrafts[x.e164]??x.label)+'" '+(!numbersReady||numberSaving?'disabled':'')+'></label><button class="save-number" type="submit" '+(!numbersReady||numberSaving?'disabled':'')+'>Bezeichnung speichern</button></form><dl class="number-details"><div><dt>Aktuelles Rufziel</dt><dd>'+esc(target?targetLabel(target):'Derzeit nicht abrufbar')+'</dd></div><div><dt>Telefon / App am Rufziel</dt><dd>'+pill(targetAvailability(x).label,targetAvailability(x).kind)+'</dd></div><div><dt>Öffnungszeiten</dt><dd>'+esc(state)+'</dd></div></dl><div class="number-actions"><a href="#forwards">Weiterleitung bearbeiten ↗</a><a href="#hours" data-number-hours="'+x.e164+'">Öffnungszeiten & Ansage ↗</a></div></article>';
 }).join('')+'</div><p class="page-text">Die Bezeichnung wird in der Übersicht und Anrufliste übernommen. Ansagetexte bearbeitest du unter Öffnungszeiten & Ansagen.</p></div>'),
 forwards:forwardView,
 extensions:()=>head('Nebenstellen','Interne Anschlüsse und Softphones unserer Telefonanlage.')+
 panel('SIP-Nebenstellen',lines.map(x=>{const health=endpointAvailability(x.ext);return row('♧',x.ext+' · '+x.label,'Telefon/App muss angemeldet sein, um hier Anrufe anzunehmen.',pill(health.label,health.kind))}).join(''),'Aktueller Gerätestatus')+
 panel('Geräte & Zugang','<div class="panel-pad"><p class="page-text">Registrierte Geräte, SIP-Zugangsdaten zurücksetzen, Endgeräte zuweisen und neue Nebenstellen erstellen: folgt mit der sicheren Asterisk-Anbindung. Passwörter werden niemals in der Oberfläche offengelegt.</p></div>'),
 calls:callsView,
 hours:hoursView,
 settings:settingsView
};
function render(){const id=location.hash.slice(1),page=currentSession?.role==='phone'?'phone':screens[id]?id:'overview';main.innerHTML=screens[page]();nav.forEach(b=>b.classList.toggle('active',b.dataset.page===page));sidebar.classList.remove('open');document.title='TARIQ Telefonie · '+page;if(page==='calls'&&!callCache&&!callsLoading)loadCallHistory();}
nav.forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.page;render()}));
document.querySelector('#menu').addEventListener('click',()=>sidebar.classList.toggle('open'));
window.addEventListener('hashchange',()=>{if(document.body.classList.contains('authenticated'))render()});
async function api(url,options={}){const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const result=await response.json();if(!response.ok)throw Error(result.error||'Anfrage fehlgeschlagen');return result;}
let statusLoading=false;
async function loadStatus(){
 if(currentSession?.role==='phone')return;
 if(statusLoading)return;statusLoading=true;
 const button=document.querySelector('#refresh-status');if(button)button.disabled=true;
 try{const [pbx,live]=await Promise.allSettled([api('/api/pbx/status'),api('/api/pbx/live')]);pbxStatus=pbx.status==='fulfilled'?pbx.value:{monitoring:'unavailable'};liveStatus=live.status==='fulfilled'?live.value:null;
 if(!document.querySelector('#routing-form')&&!document.querySelector('.forward-form')&&!document.querySelector('.hours-form')&&!document.querySelector('.call-controls')&&!document.querySelector('#phone-user-form')&&!document.querySelector('#phone-password-form')&&!document.querySelector('#phone-dial-form')&&(!document.querySelector('.number-profile-form')||!document.activeElement?.closest('.number-profile-form'))&&document.body.classList.contains('authenticated'))render();
 }finally{statusLoading=false;if(button?.isConnected)button.disabled=false}
}
main.addEventListener('click',e=>{if(e.target.closest('#refresh-status'))loadStatus()});
function applySession(session){
 currentSession=session;document.body.dataset.role=session.role;document.body.classList.add('authenticated');
 document.querySelector('footer').textContent=session.role==='phone'?'© TARIQ Telefonie · Telefon':'© TARIQ Telefonie · Verwaltung · Asterisk / Telekom';
 if(session.role==='phone')location.hash='phone';
 render();
 if(session.role==='admin'){loadStatus();loadRoutes();loadNumberProfiles();loadSettings()}
 if(typeof window!=='undefined'&&window.PhoneUI)void window.PhoneUI.initialize();
}
async function initialize(){try{const session=await api('/api/session');if(session.authenticated)applySession(session)}catch{document.querySelector('#login-error').textContent='Anmeldeserver nicht erreichbar.'}}
document.querySelector('#login-form').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),error=document.querySelector('#login-error');button.disabled=true;error.textContent='';
 try{await api('/api/login',{method:'POST',body:JSON.stringify({email:form.elements.email.value,password:form.elements.password.value})});form.elements.password.value='';applySession(await api('/api/session'))}catch(err){error.textContent=err.message}finally{button.disabled=false}
});
document.querySelector('#logout').addEventListener('click',async()=>{
 if(typeof window!=='undefined'&&window.PhoneUI)await window.PhoneUI.logout();
 try{await api('/api/logout',{method:'POST',body:'{}'})}catch{}
 currentSession=null;document.body.classList.remove('authenticated');delete document.body.dataset.role;
 pbxStatus=null;liveStatus=null;settingsState=null;settingsError='';callCache=null;callError='';++callRequestVersion;callsLoading=false;
 callFilters={filter:'all',company:'all',days:'30',q:'',page:1};document.querySelector('[name=password]').value='';
});
initialize();

setInterval(()=>{if(document.body.classList.contains('authenticated'))loadStatus()},30000);

let routesLoading=false;
async function loadRoutes(){
 if(currentSession?.role==='phone')return;
 if(routesLoading)return;routesLoading=true;
 try{
  routingState=await api('/api/pbx/hours');
  const last=routingState.lastRequest;
  if(last?.id&&last.id===window.pendingRouteId&&!routingState.pending){
   routeBusy=false;routeMessage=last.message;
   if(last.state==='applied'){routeDraft={};if(window.pendingHoursLine)delete hoursDraft[window.pendingHoursLine]}
   if(window.pendingVoiceLine){
    voiceMessage=last.message;
    if(last.state==='applied'&&window.pendingVoiceDefault){
     announcementTexts[window.pendingVoiceLine]=standardAnnouncement(lines.find(x=>x.e164===window.pendingVoiceLine));
     voiceDrafts[window.pendingVoiceLine]=null;
    }
   }
   window.pendingVoiceLine=null;window.pendingVoiceDefault=false;
   window.pendingHoursLine=null;
   window.pendingRouteId=null;
  }
  if(['#forwards','#hours','#numbers'].includes(location.hash)&&document.body.classList.contains('authenticated')&&!document.activeElement?.closest('.forward-form')&&!document.activeElement?.closest('.hours-form')&&!document.activeElement?.closest('.announcement-form')&&!document.activeElement?.closest('.number-profile-form')&&document.querySelector('audio')?.paused!==false)render();
 }catch{routingState={available:false,note:'Rufziele derzeit nicht abrufbar.'};if(['#forwards','#hours','#numbers'].includes(location.hash))render()}
 finally{routesLoading=false}
}
function updateForwardDraft(form){
 const line=form.dataset.line,type=form.elements.targetType.value;
 routeTypeDraft[line]=type;
 if(form.elements.extension){routeExtensionDraft[line]=form.elements.extension.value;routeDraft[line]=form.elements.extension.value}
 if(form.elements.externalNumber)routePhoneDraft[line]=form.elements.externalNumber.value;
 let target;try{target=choiceTarget(type,routeExtensionDraft[line]||lines.find(x=>x.e164===line).ext,routePhoneDraft[line]||'')}catch{target=null}
 const button=form.querySelector('[type=submit]');
 button.disabled=routeBusy||!!routingState?.pending||!routingState?.available||target===routingState?.mappings?.[line]||(type==='external'&&!routePhoneDraft[line]?.trim());
}
main.addEventListener('input',e=>{const form=e.target.closest('.forward-form');if(form)updateForwardDraft(form)});
main.addEventListener('change',e=>{
 const form=e.target.closest('.forward-form');if(!form)return;
 updateForwardDraft(form);
 if(e.target.name==='targetType')render();
});
document.addEventListener('submit',async e=>{
 if(!e.target.matches('.forward-form'))return;
 e.preventDefault();
 if(routeBusy||routingState?.pending||!routingState?.available)return;
 const form=e.target,line=form.dataset.line;
 updateForwardDraft(form);
 let target;
 try{target=choiceTarget(form.elements.targetType.value,routeExtensionDraft[line]||lines.find(x=>x.e164===line).ext,routePhoneDraft[line]||'')}
 catch(err){routeMessage=err.message;render();return}
 const mappings={...routingState.mappings,[line]:target};
 routeBusy=true;routeMessage='Rufziel wird übernommen …';render();
 try{
  const result=await api('/api/pbx/routing',{method:'POST',body:JSON.stringify({revision:routingState.revision,mappings})});
  window.pendingRouteId=result.id;routeMessage=result.message;await loadRoutes();
 }catch(err){routeBusy=false;routeMessage=err.message;await loadRoutes()}
 if(['#forwards','#hours','#numbers'].includes(location.hash))render();
});
setInterval(()=>{if(document.body.classList.contains('authenticated')&&(routeBusy||routingState?.pending))loadRoutes()},5000);
setInterval(()=>{if(document.body.classList.contains('authenticated'))loadRoutes()},30000);
window.addEventListener('hashchange',()=>{if(['#forwards','#hours','#numbers'].includes(location.hash)&&document.body.classList.contains('authenticated'))loadRoutes()});

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

main.addEventListener('input',e=>{
 const form=e.target.closest('#announcement-form');
 if(!form||e.target.name!=='announcementText')return;
 announcementTexts[form.dataset.line]=e.target.value;
 const count=form.querySelector('#voice-count');if(count)count.textContent=e.target.value.length+' / 800 Zeichen';
 const draft=voiceDrafts[form.dataset.line]||routingState?.announcementDrafts?.[form.dataset.line];
 form.querySelector('[data-voice-activate]').disabled=routeBusy||!!routingState?.pending||!routingState?.available||!routingState?.hoursReady||!draft||draft.text!==cleanVoiceText(e.target.value)||draft.id===routingState?.announcements?.[form.dataset.line]?.id;
});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='announcement-form')return;
 e.preventDefault();if(voiceGenerating)return;
 const line=e.target.dataset.line,text=e.target.elements.announcementText.value;
 announcementTexts[line]=text;voiceGenerating=true;voiceMessage='Deutsche Sprachansage wird erzeugt …';render();
 try{
  const result=await api('/api/pbx/announcement-draft',{method:'POST',body:JSON.stringify({line,text})});
  voiceDrafts[line]=result.draft;announcementTexts[line]=result.draft.text;
  voiceMessage='Ansage ist bereit. Bitte vorhören und anschließend aktivieren.';
 }catch(err){voiceMessage=err.message}
 finally{voiceGenerating=false;if(location.hash==='#hours')render()}
});
main.addEventListener('click',async e=>{
 const button=e.target.closest('[data-voice-activate],[data-voice-default]');
 if(!button||routeBusy||routingState?.pending||!routingState?.available)return;
 const form=button.closest('#announcement-form'),line=form.dataset.line,isDefault=button.hasAttribute('data-voice-default');
 const draft=voiceDrafts[line]||routingState?.announcementDrafts?.[line];
 if(!isDefault&&(!draft||draft.text!==cleanVoiceText(form.elements.announcementText.value)))return;
 routeBusy=true;voiceMessage='Ansage wird aktiviert …';routeMessage=voiceMessage;render();
 try{
  const result=await api('/api/pbx/announcement',{method:'POST',body:JSON.stringify({revision:routingState.revision,line,announcementId:isDefault?'default':draft.id})});
  window.pendingRouteId=result.id;window.pendingVoiceLine=line;window.pendingVoiceDefault=isDefault;
  voiceMessage=result.message;await loadRoutes();
 }catch(err){routeBusy=false;voiceMessage=err.message;await loadRoutes()}
 if(location.hash==='#hours')render();
});

function paintCallResults(){
 if(location.hash!=='#calls'||!document.body.classList.contains('authenticated'))return;
 const target=document.querySelector('#call-results');if(target)target.innerHTML=callsResults();
 document.querySelectorAll('[data-call-filter]').forEach(button=>{const active=button.dataset.callFilter===callFilters.filter;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});
}
async function loadCallHistory(force=false){
 if(callsLoading&&!force)return;
 const version=++callRequestVersion;callsLoading=true;paintCallResults();
 try{
  const result=await api('/api/calls?'+new URLSearchParams({...callFilters,page:String(callFilters.page)}));
  if(version!==callRequestVersion)return;
  callCache=result;callFilters.page=result.page;callError='';
 }catch(err){if(version===callRequestVersion)callError=err.message}
 finally{if(version===callRequestVersion){callsLoading=false;paintCallResults()}}
}
main.addEventListener('click',e=>{
 const tab=e.target.closest('[data-call-filter]');
 if(tab){callFilters.filter=tab.dataset.callFilter;callFilters.page=1;loadCallHistory(true);return}
 const page=e.target.closest('[data-call-page]');
 if(page&&!page.disabled){callFilters.page=Number(page.dataset.callPage);loadCallHistory();return}
 if(e.target.closest('[data-call-refresh]'))loadCallHistory();
});
main.addEventListener('input',e=>{
 if(e.target.id!=='call-query')return;
 callFilters.q=e.target.value;callFilters.page=1;clearTimeout(callSearchTimer);
 callSearchTimer=setTimeout(()=>loadCallHistory(true),350);
});
main.addEventListener('change',e=>{
 if(!e.target.closest('#call-search-form'))return;
 if(['company','days'].includes(e.target.name)){callFilters[e.target.name]=e.target.value;callFilters.page=1;loadCallHistory(true)}
});
document.addEventListener('submit',e=>{if(e.target.id==='call-search-form'){e.preventDefault();clearTimeout(callSearchTimer);callFilters.page=1;loadCallHistory(true)}});
window.addEventListener('hashchange',()=>{if(location.hash==='#calls'&&document.body.classList.contains('authenticated'))loadCallHistory()});
setInterval(()=>{if(location.hash==='#calls'&&document.body.classList.contains('authenticated'))loadCallHistory()},30000);


function applyNumberProfiles(numbers){
 for(const row of numbers||[]){const line=lines.find(x=>x.e164===row.e164);if(line)line.label=row.label}
}
async function loadNumberProfiles(){
 if(currentSession?.role==='phone')return;
 try{const data=await api('/api/numbers');applyNumberProfiles(data.numbers);numbersReady=true;numberMessage='';}
 catch{numbersReady=false;numberMessage='Bezeichnungen konnten nicht geladen werden. Bitte die Seite neu laden.'}
 if(location.hash==='#numbers'&&!document.activeElement?.closest('.number-profile-form'))render();
}
main.addEventListener('input',e=>{const form=e.target.closest('.number-profile-form');if(form)numberDrafts[form.dataset.line]=form.elements.label.value});
main.addEventListener('click',e=>{const link=e.target.closest('[data-number-hours]');if(link)hoursLine=link.dataset.numberHours});
main.addEventListener('submit',async e=>{
 const form=e.target.closest('.number-profile-form');if(!form)return;e.preventDefault();if(numberSaving||!numbersReady)return;
 const line=form.dataset.line,label=form.elements.label.value;numberDrafts[line]=label;numberSaving=true;numberMessage='Bezeichnung wird gespeichert …';render();
 try{const data=await api('/api/numbers',{method:'POST',body:JSON.stringify({line,label})});applyNumberProfiles(data.numbers);delete numberDrafts[line];callCache=null;numberMessage='Bezeichnung gespeichert.'}
 catch(err){numberMessage=err.message}finally{numberSaving=false;if(location.hash==='#numbers')render()}
});

async function loadSettings(){
 if(currentSession?.role==='phone')return;
 if(settingsLoading)return;settingsLoading=true;
 try{const data=await api('/api/settings');if(document.body.classList.contains('authenticated')){settingsState=data;settingsError=''}}
 catch{settingsState=null;settingsError='Systemstatus konnte nicht geladen werden. Bitte erneut versuchen.'}
 finally{settingsLoading=false;if(location.hash==='#settings'&&document.body.classList.contains('authenticated'))render()}
}
main.addEventListener('click',async e=>{
 if(e.target.closest('[data-settings-refresh]')){await Promise.all([loadStatus(),loadSettings()]);return}
 if(!e.target.closest('[data-settings-export]')||settingsExporting)return;
 settingsExporting=true;settingsExportMessage='';render();let url;
 try{
  const response=await fetch('/api/settings/export',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error(response.status===401?'Bitte erneut anmelden.':'Einstellungen konnten nicht exportiert werden.');
  const data=await response.json();
  url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='tariq-telefonie-einstellungen-'+data.exportedAt.slice(0,10)+'.json';document.body.append(link);link.click();link.remove();
  settingsExportMessage=data.routingCurrent?'Export zum Herunterladen erstellt.':'Export erstellt. Die Rufziel-Daten sind zuletzt gespeicherte Werte und derzeit nicht live bestätigt.';
 }catch(err){settingsExportMessage=err.message}
 finally{settingsExporting=false;if(url)setTimeout(()=>URL.revokeObjectURL(url),60000);if(location.hash==='#settings')render()}
});
window.addEventListener('hashchange',()=>{if(location.hash==='#settings'&&document.body.classList.contains('authenticated'))loadSettings()});
setInterval(()=>{if(document.body.classList.contains('authenticated'))loadSettings()},30000);
