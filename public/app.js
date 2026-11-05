const main=document.querySelector('#main'),sidebar=document.querySelector('#sidebar');
const nav=[...document.querySelectorAll('[data-page]')];
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
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pill=(text,kind='neutral')=>'<span class="pill '+kind+'">'+esc(text)+'</span>';
const panel=(title,content,subtitle='')=>'<section class="panel"><div class="panel-head"><h2>'+title+'</h2><small>'+subtitle+'</small></div>'+content+'</section>';
const head=(title,description)=>'<section class="hero"><div><div class="eyebrow">TARIQ TELEFONIE · ZENTRALE</div><h1>'+title+'</h1><p>'+description+'</p></div><img class="hero-mark" src="/logo.png" alt=""></section>';
const liveReady=()=>['connected','partial'].includes(liveStatus?.monitoring);
const liveTime=()=>liveStatus?.checkedAt?new Date(liveStatus.checkedAt).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const notice=()=>'<div class="warning">'+(liveStatus?.monitoring==='connected'?'Status aktualisiert um '+esc(liveTime())+' Uhr · automatische Aktualisierung jede Minute.':liveStatus?.monitoring==='partial'?'Einzelne Statusabfragen sind nicht verfügbar. Unbekannte Werte werden mit — angezeigt.':liveStatus?.monitoring==='stale'?'Die letzte Statusabfrage ist veraltet. Es werden keine alten Werte als live angezeigt.':'Die Live-Überwachung wird eingerichtet. Die bestehende Telefonie läuft unabhängig davon weiter.')+' Zeitregeln werden unter Öffnungszeiten verwaltet.</div><div class="live-toolbar"><span>Letzte Abfrage: '+esc(liveTime())+'</span><button type="button" id="refresh-status">Status aktualisieren</button></div>';
const row=(icon,title,sub,right='')=>'<div class="item"><span class="circle">'+icon+'</span><div class="item-text"><strong>'+esc(title)+'</strong><small>'+esc(sub)+'</small></div>'+right+'</div>';
const lineRows=()=>lines.map((x,i)=>{const registration=liveStatus?.registrations?.find(r=>r.id===(i?'telekom-registration-'+(i+1):'telekom-registration'));const label=registration?(registration.status==='Registered'?'Live registriert':registration.status):(liveReady()&&!liveStatus.errors?.includes('registrations')?'Nicht registriert':x.verified?'Anruf getestet · letzter Stand':'Registrierung zuletzt bestätigt');return row('☎',x.label,x.e164+' · '+(activeRoute(x)?targetLabel(activeRoute(x)):'Rufziel derzeit nicht abrufbar'),pill(label,registration?.status==='Registered'?'good':'neutral'))}).join('');
const stat=(name,value,sub)=>'<div class="stat"><div class="kicker">'+name+'</div><strong>'+value+'</strong><small>'+sub+'</small></div>';
const monitor=()=>pbxStatus?.monitoring==='connected'?'Verbunden':pbxStatus?.monitoring==='unavailable'?'Nicht erreichbar':'Nicht geprüft';

const activeRoute=x=>routingState?.available?routingState.mappings?.[x.e164]:null;
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

const targetLabel=target=>target?.startsWith('+')?'Extern: '+target:'Nebenstelle '+target;
const choiceTarget=(type,extension,phone)=>{
 if(type==='extension')return extension;
 const target=normalizeRouteTarget(phone,lines.map(x=>x.ext),lines.map(x=>x.e164));
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
 return '<section class="panel forward-card"><div class="panel-head"><div><div class="eyebrow">RUFZIEL</div><h2>'+esc(x.label)+'</h2><p class="forward-number">'+esc(x.e164)+'</p></div>'+pill(active?'Aktiv bestätigt':'Nicht geprüft',active?'good':'neutral')+'</div><form class="forward-form panel-pad" data-line="'+x.e164+'"><div class="forward-current"><span>Aktuelles Rufziel</span><strong>'+esc(active?targetLabel(active):'Noch nicht abrufbar')+'</strong></div><fieldset '+(disabled?'disabled':'')+'><div class="target-types"><label class="'+(draft.type==='extension'?'selected':'')+'"><input type="radio" name="targetType" value="extension" '+(draft.type==='extension'?'checked':'')+'> Nebenstelle</label><label class="'+(draft.type==='external'?'selected':'')+'"><input type="radio" name="targetType" value="external" '+(draft.type==='external'?'checked':'')+'> Externe Nummer</label></div>'+(draft.type==='extension'?'<label class="field">Ziel-Nebenstelle<select name="extension">'+lines.map(t=>'<option value="'+t.ext+'" '+(draft.extension===t.ext?'selected':'')+'>'+t.ext+' · '+esc(t.label)+'</option>').join('')+'</select></label>':'<label class="field">Handy- oder Festnetznummer<input type="tel" name="externalNumber" inputmode="tel" autocomplete="tel" maxlength="40" placeholder="z. B. 0170 1234567" value="'+esc(draft.phone)+'" required></label><p class="target-hint">Mit deutscher Vorwahl oder +49 eingeben.</p>')+'<button class="save-number" type="submit" '+(disabled||selected===active||(draft.type==='external'&&!draft.phone.trim())?'disabled':'')+'>Übernehmen</button></fieldset><p class="page-text">Gilt für neue eingehende Anrufe. Deine Öffnungszeiten bleiben aktiv.</p></form></section>';
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

const standardAnnouncement=line=>'Willkommen bei '+line.label+'. Sie rufen außerhalb unserer Öffnungszeiten an. Bitte versuchen Sie es zu unseren Geschäftszeiten erneut. Vielen Dank.';
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
 else body='<div class="table-wrap"><table class="table call-table"><caption class="sr-only">Anrufliste nach Zeitpunkt absteigend</caption><thead><tr><th>Richtung</th><th>Rufnummer</th><th>Firma</th><th>Zeitpunkt</th><th>Dauer</th><th>Status</th></tr></thead><tbody>'+data.calls.map(row=>{
  const number=row.direction==='incoming'?row.from:row.to;
  const icon=row.missed?'↙':row.direction==='incoming'?'↙':row.direction==='outgoing'?'↗':'⇄';
  const status=row.announcement?'Ansage':row.status==='answered'?(row.direction==='outgoing'?'Verbunden':'Angenommen'):row.status==='busy'?'Besetzt':row.status==='failed'?'Fehlgeschlagen':row.direction==='incoming'?'Verpasst':'Nicht angenommen';
  const detail=row.direction==='incoming'?'an '+partyLabel(row.to):'von '+partyLabel(row.from);
  const phone=number?'<a href="tel:'+esc(number)+'">'+esc(partyLabel(number))+'</a>':'Anonym';
  return '<tr><td data-label="Richtung"><span class="call-direction '+(row.missed?'missed':esc(row.direction))+'"><span class="circle">'+icon+'</span>'+callDirection(row.direction)+'</span></td><td data-label="Rufnummer"><div class="call-party"><strong>'+phone+'</strong><small>'+esc(detail)+'</small>'+(row.forwardedTo?'<small>Weiterleitung: '+esc(partyLabel(row.forwardedTo))+'</small>':'')+'</div></td><td data-label="Firma">'+esc(row.companyLabel)+'</td><td data-label="Zeitpunkt"><time datetime="'+esc(row.startedAt)+'">'+esc(callDate.format(new Date(row.startedAt)))+'</time></td><td data-label="Dauer">'+(row.status==='answered'?esc(callDuration(row.billsec)):'—')+'</td><td data-label="Status">'+pill(status,row.status==='answered'?'good':'call-status '+(row.missed?'missed':row.status))+'</td></tr>';
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
 calls:callsView,
 hours:hoursView,
 settings:()=>head('Systemeinstellungen','Verbindungen, Sicherheit und technische Konfiguration.')+
 panel('Verbindungsstatus',row('◉','Asterisk AMI',monitor(),pill(pbxStatus?.monitoring==='connected'?'Erreichbar':'Nicht bestätigt',pbxStatus?.monitoring==='connected'?'good':'neutral'))+
 row('☎','Telekom SIP',liveReady()&&!liveStatus.errors?.includes('registrations')?liveStatus.registrations.filter(r=>r.status==='Registered').length+' von 3 Rufnummern registriert':'Drei Registrierungen zuletzt bestätigt',pill(liveReady()&&!liveStatus.errors?.includes('registrations')?'Live-Status':'Zuletzt bestätigt'))+
 row('⇄','WireGuard','Friedberg ↔ Hetzner · zuletzt getestet',pill('Live-Prüfung folgt')))+
 panel('Administration','<div class="panel-pad"><div class="feature-grid">'+['SIP-Trunks','Nebenstellen & Geräte','Sicherheit & Rollen','Anrufaufzeichnung (optional)','Backups & Wiederherstellung','API / WebRTC'].map(x=>'<div class="feature">⚙ '+x+' <small>Später konfigurierbar</small></div>').join('')+'</div><p class="page-text">Produktive Einstellungen werden erst nach Authentifizierung, Validierung und sicherem Rollback freigegeben.</p></div>')
};
function render(){const id=location.hash.slice(1),page=screens[id]?id:'overview';main.innerHTML=screens[page]();nav.forEach(b=>b.classList.toggle('active',b.dataset.page===page));sidebar.classList.remove('open');document.title='TARIQ Telefonie · '+page;if(page==='calls'&&!callCache&&!callsLoading)loadCallHistory();}
nav.forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.page;render()}));
document.querySelector('#menu').addEventListener('click',()=>sidebar.classList.toggle('open'));
window.addEventListener('hashchange',()=>{if(document.body.classList.contains('authenticated'))render()});
async function api(url,options={}){const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const result=await response.json();if(!response.ok)throw Error(result.error||'Anfrage fehlgeschlagen');return result;}
let statusLoading=false;
async function loadStatus(){
 if(statusLoading)return;statusLoading=true;
 const button=document.querySelector('#refresh-status');if(button)button.disabled=true;
 try{const [pbx,live]=await Promise.allSettled([api('/api/pbx/status'),api('/api/pbx/live')]);pbxStatus=pbx.status==='fulfilled'?pbx.value:{monitoring:'unavailable'};liveStatus=live.status==='fulfilled'?live.value:null;
 if(!document.querySelector('#routing-form')&&!document.querySelector('.forward-form')&&!document.querySelector('.hours-form')&&!document.querySelector('.call-controls')&&document.body.classList.contains('authenticated'))render();
 }finally{statusLoading=false;if(button?.isConnected)button.disabled=false}
}
main.addEventListener('click',e=>{if(e.target.closest('#refresh-status'))loadStatus()});
async function initialize(){try{const r=await api('/api/session');if(r.authenticated){document.body.classList.add('authenticated');render();loadStatus();loadRoutes()}else{document.querySelector('[name=email]').value=r.email||''}}catch{document.querySelector('#login-error').textContent='Anmeldeserver nicht erreichbar.'}}
document.querySelector('#login-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),error=document.querySelector('#login-error');button.disabled=true;error.textContent='';try{await api('/api/login',{method:'POST',body:JSON.stringify({email:form.elements.email.value,password:form.elements.password.value})});form.elements.password.value='';document.body.classList.add('authenticated');render();loadStatus();loadRoutes()}catch(err){error.textContent=err.message}finally{button.disabled=false}});
document.querySelector('#logout').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST',body:'{}'})}catch{}document.body.classList.remove('authenticated');pbxStatus=null;liveStatus=null;callCache=null;callError='';++callRequestVersion;callsLoading=false;callFilters={filter:'all',company:'all',days:'30',q:'',page:1};document.querySelector('[name=password]').value='';});
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
  if(['#forwards','#hours'].includes(location.hash)&&document.body.classList.contains('authenticated')&&!document.activeElement?.closest('.forward-form')&&!document.activeElement?.closest('.hours-form')&&!document.activeElement?.closest('.announcement-form')&&document.querySelector('audio')?.paused!==false)render();
 }catch{routingState={available:false,note:'Rufziele derzeit nicht abrufbar.'};if(['#forwards','#hours'].includes(location.hash))render()}
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
