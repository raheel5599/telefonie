import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'api.dart';
import 'native_audio.dart';

class PhoneController extends ChangeNotifier {
  PhoneController({PhoneApi? backend, NativeAudio? native}): api=backend??PhoneApi(), audio=native??NativeAudio();
  final PhoneApi api;
  final NativeAudio audio;
  Map<String,dynamic>? session;
  Map<String,dynamic> state={}, holdSettings={};
  List<Map<String,dynamic>> contacts=[], calls=[];
  Map<String,dynamic>? get call => state['currentCall'] is Map ? Map<String,dynamic>.from(state['currentCall']) : null;
  bool busy=false, muted=false, speaker=false;
  String error='';
  StreamSubscription? eventSubscription, captureSubscription, socketSubscription;
  WebSocket? socket;
  String? mediaCall;
  int generation=0;
  Future<void> initialize() async {
    try { await api.restore(); if(api.token != null) { final s=await api.json('/api/session'); if(s['authenticated']==true){session=s;await refresh();} else {await api.forget();} } } catch(e){error=e.toString();}
    notifyListeners();
  }
  Future<void> run(Future<void> Function() action) async {
    if(busy)return;busy=true;error='';notifyListeners();
    try { await action(); } catch(e) { error=e.toString(); if(e is ApiException && e.status==401){await disconnect();session=null;await api.forget();} }
    finally {busy=false;notifyListeners();}
  }
  Future<void> login(String name,String password) => run(() async {session=await api.login(name,password);await refresh();});
  Future<void> refresh() async {
    state=await api.json('/api/phone/status');
    contacts=List<Map<String,dynamic>>.from((await api.json('/api/phone/directory'))['devices']??[]);
    holdSettings=await api.json('/api/phone/hold-settings');
    notifyListeners();
  }
  Future<void> online() => run(() async {
    await audio.prepare();
    final next=await api.json('/api/phone/connect',body:{});
    await eventSubscription?.cancel();
    final current=++generation;
    eventSubscription=api.events(next['token']).listen((value) async {
      if(current!=generation)return;
      state=value;
      final c=call;
      if(c==null)await stopMedia();
      else if(c['status']!='ringing' && mediaCall!=c['id'] && mediaCall!=null)await attach(c['id']);
      await audio.mute(muted || ['held','transferring'].contains(c?['status']));
      await audio.ring(c?['incoming']==true&&c?['status']=='ringing');
      notifyListeners();
    },onError:(Object e){if(current==generation){state={...state,'online':false};error='Verbindung unterbrochen. Bitte erneut online gehen.';unawaited(stopMedia());notifyListeners();}},onDone:(){if(current==generation){state={...state,'online':false};notifyListeners();}});
  });
  Future<void> disconnect() async {
    generation++;await eventSubscription?.cancel();eventSubscription=null;await stopMedia();
    try{await api.json('/api/phone/offline',body:{});}catch(_){}
    state={...state,'online':false,'currentCall':null};
  }
  Future<void> offline() => run(disconnect);
  Future<void> attach(String id) async {
    if(mediaCall==id && socket!=null)return;
    await stopMedia();
    mediaCall=id;final current=generation;
    await audio.start();
    final ws=await api.media(id);
    if(current!=generation || mediaCall!=id){await ws.close();await audio.stop();return;}
    socket=ws;
    final pending=<int>[];
    captureSubscription=audio.capture.listen((data){
      if(socket!=ws||muted||['held','transferring'].contains(call?['status']))return;
      pending.addAll(data);
      while(pending.length>=640){ws.add(Uint8List.fromList(pending.sublist(0,640)));pending.removeRange(0,640);}
      if(pending.length>6400)pending.clear();
    });
    socketSubscription=ws.listen((data){if(data is List<int>)unawaited(audio.play(Uint8List.fromList(data)));},onError:(Object e){error='Audioverbindung unterbrochen.';notifyListeners();},onDone:(){if(socket==ws){socket=null;unawaited(audio.stop());}});
  }
  Future<void> stopMedia() async {
    final old=socket;socket=null;mediaCall=null;
    await captureSubscription?.cancel();captureSubscription=null;
    await socketSubscription?.cancel();socketSubscription=null;
    await old?.close();await audio.stop();
  }
  Future<void> dial(String target) => run(() async {
    if(state['online']!=true)throw ApiException('Bitte zuerst online gehen.');
    await audio.prepare();
    final c=await api.json('/api/phone/call',body:{'target':target,'company':session?['company']});
    state={...state,'currentCall':c};await attach(c['id']);
  });
  Future<void> answer() => run(() async {final id=call?['id'];await audio.prepare();final c=await api.json('/api/phone/answer',body:{'id':id});state={...state,'currentCall':c};await attach(id);});
  Future<void> hangup() => run(() async {await api.json('/api/phone/hangup',body:{'id':call?['id']});await stopMedia();state={...state,'currentCall':null};});
  Future<void> control(String action,{String? target}) => run(() async {final c=await api.json('/api/phone/$action',body:{'id':call?['id'],if(target!=null)'target':target});state={...state,'currentCall':c.isEmpty?null:c};});
  Future<void> dtmf(String digit) => run(() async {await api.json('/api/phone/dtmf',body:{'id':call?['id'],'digit':digit});});
  Future<void> toggleMute() => run(() async {muted=!muted;await audio.mute(muted||['held','transferring'].contains(call?['status']));});
  Future<void> toggleSpeaker() => run(() async {speaker=!speaker;await audio.speaker(speaker);});
  Future<void> history([String filter='all']) => run(() async {calls=List<Map<String,dynamic>>.from((await api.json('/api/phone/history?filter=$filter'))['calls']??[]);});
  Future<void> chooseHold(String choice) => run(() async {holdSettings=await api.json('/api/phone/hold-settings',body:{'mode':choice=='text'?'text':'music','track':choice=='text'?(holdSettings['track']??'music1'):choice});});
  Future<void> makeHoldText(String text) => run(() async {holdSettings=await api.json('/api/phone/hold-announcement',body:{'text':text});});
  Future<void> changePassword(String current,String next) => run(() async {await api.json('/api/phone/password',body:{'currentPassword':current,'newPassword':next});await disconnect();await api.forget();session=null;});
  Future<void> logout() => run(() async {await disconnect();await api.logout();session=null;calls=[];contacts=[];});
  @override void dispose(){generation++;unawaited(eventSubscription?.cancel()??Future<void>.value());unawaited(stopMedia());api.client.close(force:true);super.dispose();}
}
