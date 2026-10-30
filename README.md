# TARIQ Telefonie

Eigenständiges Repository für die zukünftige Telefonie-Plattform der TARIQ IT Consulting.

## Architektur
- **Telefonie-Backend:** geplant: Asterisk / FreePBX oder kompatible SIP-PBX in isolierter Umgebung
- **Telekom:** drei vorhandene Rufnummern in Friedberg, SIP-Anbindung noch nicht eingerichtet oder getestet
- **Verwaltungsportal:** separates Repository `raheel5599/verwaltung`, Menüpunkt **Telefonie** (zunächst reine Vorbereitung)
- **Hosting:** zunächst isoliert auf Hetzner, später Umzug auf eigenen Linux-Server in Friedberg
- **Netzwerk:** UniFi Cloud Gateway Fiber, mit bestehender WireGuard-Verbindung zu Hetzner

## Geplante Funktionen
1. Rufnummern und SIP-Trunks konfigurieren
2. Weiterleitungen: sofort, besetzt, nicht erreichbar, Zeitpläne
3. Interne Nebenstellen und Rufgruppen
4. Anrufprotokolle, Voicemail und optional Sprachmenüs
5. Geschützte API für das Verwaltungsportal

## Aktueller Status
**Grundgerüst – keine produktive Telefonie.** Es sind keine Rufnummern registriert, keine Anrufe möglich und keine Weiterleitungen aktiv. Die vorhandenen Telekom-Rufnummern sind noch nicht auf die PBX geschaltet.

## Sicherheit und Betrieb
- Keine SIP-Passwörter, Telekom-Zugangsdaten, API-Tokens oder Anrufdaten ins Repository.
- Keine ungeschützten SIP-/Administrationsports öffentlich freigeben.
- PBX getrennt von den produktiven Webanwendungen betreiben.
- Verbindungsversuche zunächst im Testbetrieb durchführen; Telekom-SIP-Betrieb über Friedberger Anschluss verifizieren.
- Verwaltungs-API erst nach Authentifizierung, Protokollierung und Berechtigungsmodell aktivieren.
- Für Betrieb: sichere Updates, Backups, Firewall- und Notrufkonzept.

## Integration mit TARIQ Verwaltung
Das Portal zeigt zunächst ausdrücklich **Nicht verbunden / In Vorbereitung**. Erst später werden echte Status- und Konfigurationsdaten über einen abgesicherten Server-zu-Server-Zugang synchronisiert.
