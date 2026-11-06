# WireGuard-Status

Die Webseite liest keine Schlüssel. Der minütliche Host-Collector fragt ausschließlich
`wg show wg-friedberg latest-handshakes` ab und veröffentlicht nur Alter und Status.
Routing-Dienst und Policy-Regel werden ebenfalls nur gelesen.

Falls `fpadmin` für die Handshake-Abfrage ein sudo-Passwort benötigt, muss ein Administrator
auf dem Server einmalig diesen eng begrenzten Zugriff einrichten:

```sh
cd /home/fpadmin/apps/telefonie
sudo python3 deployment/setup-system-status.py
python3 deployment/collect-pbx-status.py
```

Das Skript validiert eine eigene sudoers-Datei vor dem Anlegen. Es überschreibt keine
bestehende andere Regel und erlaubt nur den oben genannten festen Lesebefehl. Es gibt
keine Berechtigung zum Ändern von VPN, Routing oder Firewall und keine Abfrage privater
Schlüssel. Das Deployment führt diesen privilegierten Einrichtungsschritt nicht aus.

Der JSON-Export unter Einstellungen ist eine Referenz der gespeicherten Portalwerte.
Er enthält keine Zugangsdaten, Audiodateien, Anrufliste oder vollständige SIP-/Server-
Konfiguration. Er ist kein automatisch einspielbares Vollbackup.
