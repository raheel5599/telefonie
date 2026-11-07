import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tariq_telefonie/sip_controller.dart';
import 'package:tariq_telefonie/sip_account_page.dart';
void main(){
  testWidgets('SIP setup explains compatibility and masks credentials',(tester) async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('de.tariq.telefonie/audio'),(_)async=>null);
    final phone=SipPhoneController();
    await tester.pumpWidget(MaterialApp(home:SipAccountPage(phone:phone,onSaved:(){})));
    expect(find.text('Deine Telefonanlage'),findsOneWidget);
    expect(find.textContaining('UDP-/TCP'),findsOneWidget);
    final password=tester.widget<TextFormField>(find.widgetWithText(TextFormField,'SIP-Passwort'));
    expect(password, isNotNull);
    final editable=tester.widget<TextField>(find.descendant(of:find.widgetWithText(TextFormField,'SIP-Passwort'),matching:find.byType(TextField)));
    expect(editable.obscureText,isTrue);
    await tester.pumpWidget(const SizedBox());phone.dispose();await tester.pump();
  });
}
