# Anrufliste

Die Liste verwendet echte abgeschlossene CDRs. Zum Einrichtungszeitpunkt existierten
keine bisherigen CSV-/Custom-CDR-Dateien; eine historische Rückgewinnung wird deshalb
nicht behauptet.

setup-cdr.py sichert cdr.conf und cdr_custom.conf unter private/cdr-backups, aktiviert
unbeantwortete/fehlgeschlagene Anrufe und richtet eine eigene JSON-Dateizuordnung mit
Epoch-Zeitstempeln, uniqueid und linkedid ein. Es werden nur CDR-Module neu geladen,
keine SIP- oder Wählplanmodule. Bestehende Backend-Konfigurationen bleiben erhalten.
Die Logs befinden sich im bestehenden persistenten Asterisk-Logvolume.

call_history.py liest nur die letzten 4 MiB der Quelldatei, überspringt unvollständige
Zeilen und speichert normalisierte Metadaten mit stabilen Schlüsseln in
private/call-history.sqlite3. linkedid fasst Weiterleitungsabschnitte zusammen.
Die Verbindungsdauer wird nicht über alle Teilstrecken summiert.

Die Webansicht enthält maximal 5.000 zusammengefasste Anrufe der letzten 90 Tage.
Die SQLite-Zwischenspeicherung entfernt ältere Datensätze; das originale Asterisk-
Log wird von dieser Funktion nicht verändert oder gelöscht. Ein Quellausfall
entfernt keine gespeicherten Portal-Einträge. Die Benutzeroberfläche kennzeichnet
veraltete Daten ausdrücklich.

Die Quelle /var/log/asterisk/cdr-custom/tariq-calls.json und die abgeleiteten Dateien
sind nur für den jeweiligen Dienstbenutzer lesbar. Datensätze werden nicht in
Actions-Logs geschrieben. Die Oberfläche erhält keine Kanalnamen oder internen
Asterisk-IDs. Alle API-Abfragen benötigen die bestehende Admin-Sitzung.

GET /api/calls unterstützt Richtung, verpasst, Firma, 7/30/90 Tage, Rufnummernsuche
und 25 Einträge pro Seite. Zeiten werden in Europe/Berlin dargestellt. Neue
abgeschlossene Anrufe werden über den vorhandenen Minutenabruf übernommen.

CDR ANSWERED belegt, dass die Verbindung angenommen wurde; das kann auch eine
Ansage sein. Ein erkannter Playback-Datensatz wird gesondert als Ansage markiert.
Die Anrufliste behauptet keine Aufzeichnung des Gesprächsinhalts.
