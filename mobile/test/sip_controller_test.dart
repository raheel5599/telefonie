import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sip_ua/sip_ua.dart' as sip;
import 'package:tariq_telefonie/sip_controller.dart';
import 'package:tariq_telefonie/sip_profile.dart';

class FakeCall implements sip.Call {
  FakeCall(this.id,{this.incoming=true});
  @override final String id;
  final bool incoming;
  Map<String,dynamic>? rejected;
  @override sip.Direction get direction=>incoming?sip.Direction.incoming:sip.Direction.outgoing;
  @override String get remote_identity=>'+491701234567';
  @override void hangup([Map<String,dynamic>? options]){rejected=options??{};}
  @override dynamic noSuchMethod(Invocation invocation)=>super.noSuchMethod(invocation);
}
void main(){
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp((){
    FlutterSecureStorage.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('de.tariq.telefonie/audio'),(_)async=>null);
  });
  test('incoming caller, busy rejection and terminal call history stay local',()async{
    final p=SipPhoneController();
    p.profile=SipProfile.parse({'domain':'sip.example.de','user':'100','password':'test-secret-only','webSocketUrl':'wss://sip.example.de/ws'});
    await p.openProfile();p.enabled=true;
    final first=FakeCall('call-a');
    p.callStateChanged(first,sip.CallState(sip.CallStateEnum.CALL_INITIATION));
    expect(p.call?['from'],'+491701234567');expect(p.call?['to'],'100');expect(p.call?['status'],'ringing');
    final second=FakeCall('call-b');
    p.callStateChanged(second,sip.CallState(sip.CallStateEnum.CALL_INITIATION));
    expect(second.rejected?['status_code'],486);expect(p.call?['id'],'call-a');
    p.callStateChanged(first,sip.CallState(sip.CallStateEnum.CONFIRMED));
    expect(p.call?['status'],'active');
    p.callStateChanged(first,sip.CallState(sip.CallStateEnum.ENDED));
    await p.historyWrites;
    expect(p.call,isNull);expect(p.calls,hasLength(1));
    expect(p.calls.first['status'],'answered');expect(p.calls.first['missed'],false);
    expect(p.calls.first['from'],'+491701234567');
    p.callStateChanged(first,sip.CallState(sip.CallStateEnum.CALL_INITIATION));
    expect(p.call,isNull);expect(p.calls,hasLength(1));
    final stored=await SipPhoneController.storage.read(key:p.profile!.historyKey);
    expect(stored,contains('+491701234567'));expect(stored,isNot(contains('test-secret-only')));
    p.dispose();await Future<void>.delayed(Duration.zero);
  });
  test('offline incoming call is not accepted or presented as active',()async{
    final p=SipPhoneController();final c=FakeCall('offline');
    p.callStateChanged(c,sip.CallState(sip.CallStateEnum.CALL_INITIATION));
    expect(c.rejected,isNotNull);expect(p.call,isNull);
    p.dispose();await Future<void>.delayed(Duration.zero);
  });
}
