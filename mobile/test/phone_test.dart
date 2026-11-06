import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tariq_telefonie/main.dart';
void main(){
  testWidgets('native login asks for phone credentials and identifies test mode',(tester) async {
    await tester.pumpWidget(const TariqApp());await tester.pump();
    expect(find.text('Dein TARIQ Telefon'),findsOneWidget);
    expect(find.widgetWithText(TextFormField,'Benutzername oder E-Mail'),findsOneWidget);
    expect(find.textContaining('Native Testversion'),findsOneWidget);
    expect(find.text('Tastatur'),findsNothing);
  });
}
