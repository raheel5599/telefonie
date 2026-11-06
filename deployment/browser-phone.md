# Browser-Telefon und Telefonzugänge

Die bestehende Telefonie-Adresse bleibt der gemeinsame Einstieg.

- Administrator: bestehender bestätigter Supabase-Zugang; komplette Verwaltung.
- Telefonbenutzer: vom Administrator angelegter Benutzername und Passwort; ausschließlich das zugewiesene Telefon.
- Telefon 800 ist für den Administrator reserviert. Zusätzliche Telefonzugänge erhalten 801–819.
- Das Anlegen eines Zugangs verändert keine bestehende Rufverteilung. Unter Weiterleitungen das gewünschte Browser-Telefon als Rufziel auswählen.

Telefonpasswörter werden mit zufälligem Salt und scrypt gehasht gespeichert. Passwörter werden nur beim Anlegen oder Zurücksetzen einmalig zurückgegeben. Sperren, Passwort-Reset und Neuzuweisen widerrufen bestehende Sitzungen dieses Zugangs.

Asterisk `chan_websocket` transportiert Audio über den bestehenden HTTPS-Zugang. Die Webseite vermittelt ausschließlich den eigenen Medienkanal des angemeldeten Benutzers. ARI-Zugangsdaten bleiben im privaten Serververzeichnis und gelangen nicht in den Browser. Port 8088 wird nicht öffentlich veröffentlicht; bestehende SIP-, VPN- und RTP-Transportregeln bleiben erhalten.

Die Einrichtung ergänzt private Browser-Kontexte und erlaubt das Mikrofon nur auf der Telefonie-Domain. Falls ein Asterisk-Neustart notwendig ist, wird er bei einem laufenden Gespräch verweigert. HTTP-/ARI-Konfiguration und Wählplan werden vorab gesichert.

Nach Veröffentlichung prüft `check-webphone.mjs` die private ARI-Verbindung, den Audio-WebSocket und einen synthetischen Asterisk-Echo-Rückweg. Dabei wird keine externe Nummer angerufen. Für den echten Test im Browser unter Telefon online gehen, Mikrofon erlauben und Mikrofon & Ton testen. Auf iPhone/iPad muss das Fenster geöffnet bleiben; Hintergrund-/Push-Anrufe werden nicht zugesichert.
