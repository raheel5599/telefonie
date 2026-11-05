# Eigene Geschlossen-Ansagen

Jede Firma hat einen eigenen Text mit maximal 800 Zeichen. Erzeugen und Aktivieren
sind getrennt. Der Text wird per stdin an espeak-ng im Telefonie-Webcontainer
übergeben. Es gibt keinen Shell-Aufruf und keine externe Sprach-API. SoX erzeugt
WAV / PCM signed 16-bit / Mono / 8000 Hz; Format und Dauer (0,1–90 Sekunden)
werden serverseitig geprüft. Eine Vorschau ist nur mit Admin-Sitzung möglich.

Das Web-Image enthält dafür espeak-ng und SoX. Der Build-Kontext schließt lokale
Konfigurationen und private Daten aus. Ein Build-Fehler beendet den Deploy vor dem
Austausch des laufenden Webcontainers.

Entwürfe liegen mit zufälliger ID im persistenten Web-Datenvolume, pro Firma
getrennt. Benutzertexte werden nie als Dateipfad oder Kommando verwendet.
Eine einzige Spracherzeugung läuft gleichzeitig, mit Zeitlimit pro Prozess.

„Ansage aktivieren“ erzeugt einen Auftrag im vorhandenen Rufziel-Protokoll.
Der Host prüft Zuordnung, Revision und Audio erneut, überträgt die Datei durch den
laufenden Container und ersetzt sie atomar. Die installierten Bytes werden per
SHA-256 geprüft. Bei Fehlern wird die vorherige Audiodatei wiederhergestellt.
SIP, VPN und die Öffnungszeiten bleiben bei einer Ansage-Aktivierung unverändert.

Die aktive ID und der Hash werden in private/web-routing.json und im geschützten
Status gespeichert. Updates lassen vorhandene PBX-Ansagen bestehen; gespeicherte
eigene Ansagen werden bei Abweichungen aus dem persistenten Entwurf wiederhergestellt.
„Standardansage verwenden“ aktiviert die im Repository-Build erzeugte Standardaufnahme.

Die Vorschau unterstützt Byte-Range-Anfragen für Safari/iPad. Alte fehlgeschlagene
Actions-Läufe werden nicht erneut gestartet: der aktuelle Workflow verwendet keine
docker-cp-Operationen auf dem PBX-Root-Dateisystem mehr.
