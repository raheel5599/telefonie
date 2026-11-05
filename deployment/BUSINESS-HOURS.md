# Öffnungszeiten und Geschlossen-Ansagen

Pro Firma: sieben Tagesfenster, ein Aktivierungsschalter und „Heute geschlossen“.
Zeitzone ist immer Europe/Berlin. Endzeiten sind exklusiv; ein Plan 09:00–17:00
schließt um 17:00. Nachtfenster sind in dieser Version auf zwei Tage aufzuteilen.
Ein deaktivierter Wochenplan lässt Anrufe durchgehend zum gewählten Rufziel.
„Heute geschlossen“ überschreibt den Wochenplan nur für das gespeicherte deutsche
Kalenderdatum und läuft um Mitternacht automatisch aus.

## Aktivierung

Alte routing-plans.json-Einträge erscheinen nur als nicht aktivierte Entwürfe.
Erst „Speichern & aktivieren“ erzeugt einen bestätigungspflichtigen Auftrag im
bereits vorhandenen Web-Rufziel-Protokoll. Der Host prüft Revision, Daten und
Wählplanaufbau; unbekannte Anweisungen werden abgewiesen. Originaldateien werden
gesichert. Fehler beim Umschalten stellen die vorherigen Eingangsregeln wieder her.

Die drei Rufziele und Zeitprofile sind gemeinsam versioniert; parallele
Rufziel- und Zeitänderungen können sich nicht still überschreiben.
Die Übernahme wird innerhalb einer Minute verarbeitet. Die Zeitprüfung selbst
erfolgt danach bei jedem Anruf in Asterisk, unabhängig vom Minutenabruf.

## Wählplan

Ein Plan erhält einen eigenen, nach Inhalt versionierten tariq-hours-*-Kontext.
Er wird zuerst vollständig aufgebaut und geprüft. Erst danach werden die vier
bereits verwalteten Eingangseinträge auf Gosub umgestellt. Bestehende Gespräche
bleiben auf ihren bisherigen Kontexten. Frühere generierte Kontexte werden während
des Betriebs deshalb nicht gelöscht; ein normaler späterer Neustart lädt nur die
zuletzt in der Host-Datei gespeicherten Kontexte.

Der Kontext prüft das heutige Schließdatum mit STRFTIME und den Wochenplan mit
GotoIfTime. Geöffnet: Dial zur gewählten Nebenstelle, danach Return.
Geschlossen: Answer, eine Sekunde Medienvorlauf, Playback, Hangup.

Nur der markierte Zeitregel-Block und die vier bekannten Eingangsziele werden
persistiert. SIP, AMI-Rechte, VPN, NAT und RTP werden nicht verändert. Es erfolgen
keine PBX-Neustarts und keine SIP- oder vollständigen Wählplan-Reloads.

## Standardansagen

build-announcements.py erzeugt auf dem CI-Runner drei deutsche synthetische
Standardansagen, je Firma mit Namensnennung. Format: WAV, PCM signed 16-bit,
Mono, 8000 Hz. Das Build prüft Format und Dauer. Der Deploy kopiert nur diese
Dateien in sounds/custom der bestehenden PBX. Vor einer Zeitplan-Aktivierung
werden die Lesbarkeit der Audiodateien und die Berliner Zeitzonendatei geprüft.

Eine Vorschau steht nur nach Admin-Anmeldung unter /api/pbx/announcement bereit.
Die HTML-CSP erlaubt dafür media-src self. Eine eigene Aufnahme oder Textbearbeitung
ist in dieser Version nicht enthalten.
