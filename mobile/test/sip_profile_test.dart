import 'package:flutter_test/flutter_test.dart';
import 'package:tariq_telefonie/sip_profile.dart';

Map<String,dynamic> fields()=>{'label':'Empfang','domain':'sip.firma.de','user':'100','authUser':'','password':'example-only-test','webSocketUrl':'wss://sip.firma.de/ws'};
void main(){
  test('WSS default port, auth fallback and direct SIP address',(){
    final p=SipProfile.parse(fields());
    expect(p.uri,'sip:100@sip.firma.de');expect(p.authUser,'100');
    expect(p.target('0 170-1234567'),'sip:01701234567@sip.firma.de');
    expect(p.target('+49 170 1234567'),'sip:+491701234567@sip.firma.de');
    expect(p.target('*21#'),'sip:*21%23@sip.firma.de');
    expect(p.stun,isEmpty);expect(p.turn,isEmpty);
  });
  test('unsupported transport, endpoint credentials and SIP header injection rejected',(){
    for(final v in ['ws://sip.firma.de/ws','https://sip.firma.de/ws','wss://u:p@sip.firma.de/ws','wss://sip.firma.de/ws?secret=value','wss://sip.firma.de:0/ws']) {
      expect(()=>SipProfile.parse({...fields(),'webSocketUrl':v}),throwsFormatException);
    }
    final p=SipProfile.parse(fields());
    for(final v in ['100\r\nX-Header: value','sip:100@other.de','100?Subject=x','100@other.de','']) {
      expect(()=>p.target(v),throwsFormatException);
    }
    expect(()=>SipProfile.parse({...fields(),'user':'100\r\nHeader'}),throwsFormatException);
    expect(()=>SipProfile.parse({...fields(),'password':''}),throwsFormatException);
    expect(()=>SipProfile.parse({...fields(),'domain':'https://sip.firma.de'}),throwsFormatException);
  });
  test('TURN settings round trip and history is scoped to account and server',(){
    final p=SipProfile.parse({...fields(),'turn':'turns:turn.firma.de:5349','turnUser':'u','turnPassword':'test-turn-only'});
    expect(SipProfile.parse(p.toJson()).turnPassword,'test-turn-only');
    expect(p.historyKey,SipProfile.parse({...p.toJson(),'password':'changed'}).historyKey);
    expect(p.historyKey,isNot(SipProfile.parse({...p.toJson(),'user':'101'}).historyKey));
    expect(p.historyKey,isNot(SipProfile.parse({...p.toJson(),'webSocketUrl':'wss://other.firma.de/ws'}).historyKey));
    expect(()=>SipProfile.parse({...fields(),'stun':'https://stun.firma.de'}),throwsFormatException);
  });
}
