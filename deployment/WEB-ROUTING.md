# Rufziele aus der Webverwaltung

Die drei eingehenden Nummern können ausschließlich den Nebenstellen 100, 101 und
102 zugeordnet werden. POST /api/pbx/routing ist durch denselben bestätigten
Administratorzugang und dieselbe Origin-Prüfung wie die übrige Verwaltung geschützt.

## Ablauf

- GET liest den tatsächlichen Wählplan-Status aus dem Statusdienst.
- POST prüft die Revision und legt atomar genau einen Änderungsauftrag an.
- Der bestehende Host-Abruf verarbeitet den Auftrag innerhalb einer Minute.
- Der Helfer prüft den gesamten Wählplanaufbau und sichert die Host-Datei.
- Er ersetzt ausschließlich Priorität 2 / Dial(PJSIP/100|101|102,30) für die drei
  erlaubten Nummern in from-telekom sowie die zweite Nummer in from-telekom-2.
- Der geladene Wählplan wird erneut gelesen und alle Ziele werden verifiziert.
- Nur bestätigte Ziele werden in der Host-Datei und private/web-routing.json gespeichert.
- Bei einem Fehler werden alte Ziele wiederhergestellt und erneut geprüft.
- Die Oberfläche zeigt erst nach Bestätigung Erfolg. Parallele, veraltete und
  abgelaufene Aufträge werden abgewiesen.

SIP-Registrierungen, pjsip.conf, AMI-Rechte, VPN, Firewall und RTP bleiben unberührt.
Es erfolgen weder Asterisk-Neustart noch pjsip/dialplan reload. Änderungen gelten
für neue Anrufe; bereits ausgeführte Dial-Aufrufe bleiben bestehen.

## Datei-Mounts und Wiederanlauf

Eine per Datei eingebundene extensions.conf kann nach externem Dateiaustausch
noch einen älteren Inode anzeigen. Deshalb werden erlaubte Rufziele direkt im
geladenen Wählplan ersetzt und außerdem in der Host-Datei gespeichert. Abweichungen
außerhalb dieser vier Dial-Zeilen sperren die Übernahme. Nach einem externen
Wählplan-Reload prüft der Statusdienst gespeicherte Web-Ziele und stellt sie bei
Bedarf spätestens im nächsten Minutenlauf wieder her. In diesem Zeitfenster kann
ein alter Datei-Mount vorübergehend die vorherigen Ziele enthalten. Ein zukünftiges
Verzeichnis-Mount kann diese Altlast beseitigen; die Webänderung erstellt die PBX
dafür ausdrücklich nicht neu.

Vor der ersten Web-Änderung liest der Helfer ausschließlich. Danach verwaltet er
diese vier Zielzeilen gemäß den gespeicherten Web-Einstellungen. Außerhalb des
Portals vorgenommene Änderungen an diesen Zielen können dadurch zurückgesetzt
werden. Andere Wählplanänderungen werden nicht überschrieben.

Aufträge /data/pbx-routing-request.json und Ergebnisse /data/pbx-routing.json
enthalten nur die drei Firmennummern, Ziele und Statusdaten. Der Webcontainer
erhält keinen Docker-Socket. Sicherungen liegen neben der Host-extensions.conf
als extensions.conf.backup-web-*.
