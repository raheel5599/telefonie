# Externe Weiterleitung

Unter Weiterleitungen kann jede Firma zwischen Nebenstelle und externer deutscher
Handy-/Festnetznummer wählen. Intern gespeicherte Ziele 100/101/102 bleiben
kompatibel. Externe Nummern werden aus 0..., 0049... und +49... nach +49 normalisiert.
Sonderziele, ungültige Werte und die eigenen drei Firmennummern werden abgewiesen.

Die Oberfläche übermittelt weiter dieselben drei Zuordnungen samt Revision.
Server und Host prüfen die Nummern unabhängig. Host-Sicherung, aktive Bestätigung
und Rücksetzung bei Fehlern bleiben im bestehenden Übernahmeverfahren erhalten.

Ein externes Ziel wird als Dial(Local/0...@outbound-de/n,30) eingebaut. So wird der
bereits getestete Telekom-Ausgang verwendet, der die ausgehende Rufnummer
+4960316868187 setzt und PJSIP/Nummer@telekom verwendet. Die übermittelte Identität
ist damit die bestehende geschäftliche Ausgangsnummer, nicht die ursprüngliche
Anrufernummer. Die Telekom-Anmeldung und der Ausgangskontext werden nicht verändert.

Vor einer externen Übernahme kontrolliert der Host die erwarteten aktiven
Anweisungen im Ausgangskontext. Bestehende Öffnungszeiten und Heute-geschlossen
gelten auch für externe Ziele. Außerhalb der Öffnungszeiten wird die konfigurierte
Geschlossen-Ansage abgespielt.

Der Parser erkennt direkte externe Rufziele und externe Dial-Aufrufe innerhalb
versionierter Zeitkontexte. Nur die vier zuvor verwalteten Eingangseinträge
werden geändert. Es erfolgen keine SIP-, VPN- oder RTP-Änderungen und kein
Asterisk-Neustart. Ein realer Weiterleitungsanruf ist nach Auswahl des Ziels noch
zu testen.
