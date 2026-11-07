import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:logger/logger.dart';
import 'package:sip_ua/sip_ua.dart' as sip;
import 'phone_controller.dart';
import 'sip_profile.dart';

/// Direct SIP signalling and WebRTC media. Does not use PhoneApi or TARIQ ARI.
class SipPhoneController extends PhoneController implements sip.SipUaHelperListener {
  SipPhoneController() {
    helper = sip.SIPUAHelper(customLogger: Logger(level: Level.off));
    helper.addSipUaHelperListener(this);
  }
  static const storage = FlutterSecureStorage();
  late final sip.SIPUAHelper helper;
  SipProfile? profile;
  sip.Call? active;
  RTCVideoRenderer? renderer;
  Timer? registrationTimer;
  bool enabled = false, disposed = false;
  DateTime? started, answered;
  String? currentHistoryId;
  List<Map<String,dynamic>> records = [];
  Future<void> historyWrites = Future.value();
  final recorded = <String>{};
  final finishedCallIds = <String?>{};
  String selectedFilter = 'all', registration = 'Offline';
  void changed() { if (!disposed) notifyListeners(); }

  @override Future<void> initialize() async {
    try {
      final raw = await storage.read(key:'sip_profile');
      if (raw != null) {profile = SipProfile.parse(Map<String,dynamic>.from(jsonDecode(raw)));await openProfile();}
    } catch (_) {error='SIP-Zugang konnte nicht gelesen werden. Bitte neu einrichten.';}
    changed();
  }
  Future<void> openProfile() async {
    final p = profile!;
    session={'role':'sip','companyLabel':p.label,'name':p.label,'device':p.user,'company':p.uri};
    state={'online':false,'currentCall':null}; registration='Offline'; records=[];calls=[];
    try {
      final raw=await storage.read(key:p.historyKey);
      if(raw!=null) records=List<Map<String,dynamic>>.from(jsonDecode(raw));
    } catch (_) {error='Der lokale Anrufverlauf ist nicht lesbar.';}
    filterHistory();
  }
  Future<void> saveProfile(Map<String,dynamic> fields) async {
    if(call!=null) throw const FormatException('Bitte das Gespräch vor dem Ändern beenden.');
    final value=SipProfile.parse(fields);
    await disconnect();
    await storage.write(key:'sip_profile',value:jsonEncode(value.toJson()));
    await storage.write(key:'phone_mode',value:'sip');
    profile=value;await openProfile();changed();
  }
  @override Future<void> run(Future<void> Function() action) async {
    if(busy || disposed)return;busy=true;error='';changed();
    try {await action();}
    on FormatException catch(e) {error=e.message;}
    catch(_) {error='Die SIP-Aktion konnte nicht ausgeführt werden. Verbindung und Mikrofonfreigabe prüfen.';}
    finally {busy=false;changed();}
  }
  @override Future<void> refresh() async {changed();}
  @override Future<void> online() => run(() async {
    final p=profile;
    if(p==null)throw const FormatException('Bitte zuerst ein SIP-Konto einrichten.');
    if(enabled)return;
    await audio.prepare();
    enabled=true;registration='Verbindung wird hergestellt …';
    final settings=sip.UaSettings()
      ..transportType=sip.TransportType.WS
      ..webSocketUrl=p.webSocketUrl
      ..uri=p.uri
      ..authorizationUser=p.authUser
      ..password=p.password
      ..displayName=p.label
      ..userAgent='TARIQ Telefonie 0.2'
      ..register=true
      ..register_expires=600
      ..sessionTimers=false
      ..dtmfMode=sip.DtmfMode.RFC2833
      ..iceGatheringTimeout=2000
      ..iceServers=[
        if(p.stun.isNotEmpty) {'urls':p.stun},
        if(p.turn.isNotEmpty) {'urls':p.turn,'username':p.turnUser,'credential':p.turnPassword},
      ];
    // System CA validation stays enabled; never accept arbitrary certificates.
    settings.webSocketSettings.allowBadCertificate=false;
    registrationTimer?.cancel();
    registrationTimer=Timer(const Duration(seconds:30),(){
      if(enabled && !helper.registered){
        enabled=false;helper.stop();registration='Nicht verbunden';
        error='Keine SIP-Registrierung bestätigt. WSS-Adresse, SIP-Zugang und WebRTC-Freigabe der Anlage prüfen.';
        changed();
      }
    });
    try {await helper.start(settings);}catch(_){enabled=false;registrationTimer?.cancel();rethrow;}
  });
  @override Future<void> disconnect() async {
    enabled=false;registrationTimer?.cancel();registrationTimer=null;
    final old=active;
    if(old!=null){try{old.hangup();}catch(_){}await finishCall(old,failed:false);}
    helper.stop();
    await audio.ring(false);
    state={'online':false,'currentCall':null};registration='Offline';
    changed();
  }
  @override Future<void> stopMedia() async {await audio.ring(false);}
  @override Future<void> offline() => run(disconnect);
  @override Future<void> dial(String target) => run(() async {
    if(!enabled || !helper.registered)throw const FormatException('Bitte zuerst online gehen.');
    if(active!=null)throw const FormatException('Es läuft bereits ein Gespräch.');
    final uri=profile!.target(target);
    await audio.prepare();
    if(!await helper.call(uri,voiceOnly:true))throw const FormatException('Der Anruf konnte nicht gestartet werden.');
  });
  @override Future<void> answer() => run(() async {
    if(active==null || call?['incoming']!=true) return;
    await audio.prepare();await audio.ring(false);
    active!.answer(helper.buildCallOptions(true));
  });
  @override Future<void> hangup() => run(() async {active?.hangup();});
  @override Future<void> control(String action,{String? target}) => run(() async {
    if(active==null)return;
    if(action=='hold') {active!.hold();}
    else if(action=='resume') {active!.unhold();}
    else {throw const FormatException('Vermittlung im eigenen SIP-Modus ist noch nicht freigegeben.');}
  });
  @override Future<void> dtmf(String digit) => run(() async {
    if(!RegExp(r'^[0-9*#]$').hasMatch(digit))return;active?.sendDTMF(digit);
  });
  @override Future<void> toggleMute() => run(() async {
    if(active==null)return;
    muted=!muted;
    if(muted) {active!.mute(true,false);} else {active!.unmute(true,false);}
  });
  @override Future<void> toggleSpeaker() => run(() async {speaker=!speaker;await Helper.setSpeakerphoneOn(speaker);});
  void filterHistory() {
    final cutoff=DateTime.now().toUtc().subtract(const Duration(days:90));
    records.removeWhere((r)=>(DateTime.tryParse(r['startedAt']??'')??DateTime(1970)).isBefore(cutoff));
    if(records.length>500)records=records.take(500).toList();
    calls=records.where((r)=>selectedFilter=='all'||selectedFilter=='missed'&&r['missed']==true||selectedFilter=='incoming'&&r['incoming']==true||selectedFilter=='outgoing'&&r['incoming']!=true).toList();
  }
  @override Future<void> history([String filter='all']) async {selectedFilter=filter;filterHistory();changed();}
  Future<void> finishCall(sip.Call c,{required bool failed}) async {
    if(active?.id!=c.id)return;
    final previous=call;
    final id=currentHistoryId;
    if(id!=null && recorded.add(id)) {
      records.insert(0,{'id':id,'incoming':previous?['incoming']==true,
        'from':previous?['from']??'', 'to':previous?['to']??'',
        'startedAt':(started??DateTime.now()).toUtc().toIso8601String(),
        'status':answered!=null?'answered':failed?'failed':'unanswered',
        'missed':previous?['incoming']==true&&answered==null,
        'duration':answered==null?0:DateTime.now().difference(answered!).inSeconds});
    }
    finishedCallIds.add(c.id);
    if(finishedCallIds.length>1000)finishedCallIds.remove(finishedCallIds.first);
    active=null;state={...state,'currentCall':null};started=null;answered=null;currentHistoryId=null;muted=false;
    final oldRenderer=renderer;renderer=null;
    filterHistory();changed();
    final key=profile?.historyKey, snapshot=jsonEncode(records);
    if(key!=null)historyWrites=historyWrites.catchError((_){ }).then((_)=>storage.write(key:key,value:snapshot));
    unawaited(historyWrites.catchError((_){error='Anrufverlauf konnte nicht gespeichert werden.';changed();}));
    await audio.ring(false);
    if(oldRenderer!=null){oldRenderer.srcObject=null;await oldRenderer.dispose();}
  }
  @override void transportStateChanged(sip.TransportState value) {
    if(disposed || !enabled)return;
    if(value.state==sip.TransportStateEnum.DISCONNECTED){
      state={...state,'online':false};registration='Verbindung unterbrochen';
      error='SIP-Verbindung unterbrochen. Die App versucht erneut zu verbinden.';
      final c=active;if(c!=null)unawaited(finishCall(c,failed:true));
    } else if(value.state==sip.TransportStateEnum.CONNECTING) {registration='Verbindung wird hergestellt …';}
    changed();
  }
  @override void registrationStateChanged(sip.RegistrationState value) {
    if(disposed || !enabled)return;
    final ok=value.state==sip.RegistrationStateEnum.REGISTERED;
    state={...state,'online':ok};
    if(ok){registrationTimer?.cancel();registration='Bereit für Anrufe';error='';}
    else if(value.state==sip.RegistrationStateEnum.REGISTRATION_FAILED){
      enabled=false;registrationTimer?.cancel();helper.stop();registration='Registrierung fehlgeschlagen';
      error='Die Anlage hat die Registrierung nicht bestätigt. Benutzername, Authentifizierungsname und Passwort prüfen.';
    } else {registration='Nicht registriert';}
    changed();
  }
  @override void callStateChanged(sip.Call c,sip.CallState event) {
    if(disposed)return;
    if(active!=null && active!.id!=c.id){
      if(event.state==sip.CallStateEnum.CALL_INITIATION)c.hangup({'status_code':486});
      return;
    }
    if(event.state==sip.CallStateEnum.ENDED || event.state==sip.CallStateEnum.FAILED) {
      if(active?.id==c.id){if(event.state==sip.CallStateEnum.FAILED)error='Anruf nicht verbunden oder vom Ziel abgelehnt.';unawaited(finishCall(c,failed:event.state==sip.CallStateEnum.FAILED));}
      return;
    }
    if(active==null){
      if(!enabled || finishedCallIds.contains(c.id)){if(event.state==sip.CallStateEnum.CALL_INITIATION)c.hangup();return;}
      if(event.state!=sip.CallStateEnum.CALL_INITIATION)return;
      active=c;started=DateTime.now();answered=null;currentHistoryId='${c.id}-${started!.microsecondsSinceEpoch}';
      final incoming=c.direction==sip.Direction.incoming;
      state={...state,'currentCall':{'id':c.id,'incoming':incoming,'from':incoming?c.remote_identity:profile?.user,'to':incoming?profile?.user:c.remote_identity,'status':incoming?'ringing':'dialing'}};
      if(incoming)unawaited(audio.ring(true));
    }
    final current=call!;
    if(event.state==sip.CallStateEnum.ACCEPTED || event.state==sip.CallStateEnum.CONFIRMED){
      answered??=DateTime.now();current['status']='active';unawaited(audio.ring(false));
    }
    if(event.state==sip.CallStateEnum.HOLD && event.originator==sip.Originator.local)current['status']='held';
    if(event.state==sip.CallStateEnum.UNHOLD && event.originator==sip.Originator.local)current['status']='active';
    state={...state,'currentCall':current};
    if(event.state==sip.CallStateEnum.STREAM && event.originator==sip.Originator.remote && event.stream!=null) {
      unawaited(attachRemote(c,event.stream!));
    }
    changed();
  }
  Future<void> attachRemote(sip.Call c,MediaStream stream) async {
    try {
      var view=renderer;
      if(view==null){view=RTCVideoRenderer();renderer=view;await view.initialize();}
      if(disposed || active?.id!=c.id || renderer!=view){await view.dispose();return;}
      view.srcObject=stream;await Helper.setSpeakerphoneOn(speaker);
    }catch(_){error='Audio konnte nicht gestartet werden. Mikrofonfreigabe prüfen.';changed();}
  }
  @override void onNewMessage(sip.SIPMessageRequest msg) {}
  @override void onNewNotify(sip.Notify ntf) {}
  @override void onNewReinvite(sip.ReInvite event) {}
  @override Future<void> logout() => run(() async {
    await disconnect();await storage.delete(key:'sip_profile');await storage.delete(key:'phone_mode');profile=null;session=null;records=[];calls=[];
  });
  @override void dispose(){
    disposed=true;enabled=false;registrationTimer?.cancel();helper.removeSipUaHelperListener(this);helper.stop();
    final view=renderer;renderer=null;if(view!=null)unawaited(view.dispose());
    super.dispose();
  }
}
