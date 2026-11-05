# Live-Anzeige

Der Webdienst bleibt ohne Docker-Socket und ohne zusätzliche AMI-Rechte.
`collect-pbx-status.py` läuft als vorhandener Deploy-Benutzer auf dem Host.
Er führt ausschließlich diese festen Abfragen als Benutzer `asterisk` aus:

- `pjsip show registrations`
- `pjsip show endpoints`
- `core show channels count`

Nur gefilterte Registrierungszustände, Nebenstellenzustände und Zähler werden
über den Webcontainer in `/data/pbx-status.json` geschrieben. Keine SIP-Passwörter,
Rufnummern von Gesprächsteilnehmern oder vollständigen CLI-Ausgaben werden gespeichert.
Dateien werden atomar ersetzt. Abfragen ändern weder Konfiguration noch Gespräche.

Der Web-Workflow richtet mit `--install-cron` einen Statusabruf pro Minute ein.
Andere Cronjobs bleiben erhalten. Ein erster Abruf erfolgt direkt beim Deploy.
Voraussetzungen: Python 3, crontab und der bereits vorhandene Docker-Zugriff von fpadmin.
Mit `python3 deployment/collect-pbx-status.py` lässt sich ein Abruf manuell testen.
Abfragefehler betreffen nur die jeweilige Statusgruppe. Nach 150 Sekunden werden alte
Werte nicht mehr als live angezeigt. Ein registrierter Kontakt ohne Qualify-Prüfung
wird als angemeldet, aber nicht als nachweislich erreichbar angezeigt.

Zum Entfernen nur die mit `# tariq-telefonie-status` markierte Zeile aus
`crontab -e` löschen. Asterisk benötigt keinen Reload oder Neustart.

Die Oberfläche fragt alle 30 Sekunden den zuletzt erfassten Stand ab. Der Zeitstempel
zeigt den tatsächlichen Abrufzeitpunkt in Europe/Berlin an. Zeitpläne bleiben Entwürfe.
