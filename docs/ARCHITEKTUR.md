# TARIQ Telefonie — Architektur V1

## Entscheidung
Asterisk mit PJSIP als Telefonie-Kern, eigenständiges Repository. Die TARIQ Verwaltung bleibt das Web-Frontend. Die Produktivsysteme FahrschulPilot, VPN und bestehende Verwaltung werden nicht durch diesen Startstand verändert.

## Ablauf
1. Entwicklungs-/Testbetrieb ohne Telekom-Trunk, ohne Rufumleitung und ohne öffentliche SIP-Ports.
2. Isolierte Installation auf Hetzner (separates System oder klar getrennte Container-/VM-Umgebung); keine bestehende Anwendung unterbrechen.
3. Verifizieren, wie der Telekom-Privatkunden-SIP-Dienst ausschließlich über den Friedberger Anschluss korrekt angebunden werden kann. Der WireGuard-Tunnel ist vorhanden; Routing, DNS, RTP und Rückweg müssen separat getestet werden.
4. Mit Test-Nebenstelle und erlaubten Netzen Funktion prüfen; dann drei Telekom-Rufnummern zuordnen und Weiterleitungen testen.
5. Nur authentifizierte und autorisierte API zum Portal; Statusdaten niemals simulieren; keine SIP-Passwörter im Browser.
6. Migration zum eigenen Server in Friedberg nach Glasfaser-Aktivierung.

## Sicherheit
- SIP-Port 5060 und RTP-Portbereich nicht ungeprüft am Internet öffnen.
- Management und SIP auf VPN/private Netzbereiche beschränken, wenn technisch möglich.
- Anrufdaten nur nach definierter Aufbewahrungsfrist und Berechtigungen speichern.
- Notrufe, Erreichbarkeit und Ausfallverhalten vor Produktivsetzung testen.
- Zugangsdaten ausschließlich als Server-Secrets; nicht im Git-Repository.
- Änderungen an WireGuard, Caddy und produktiven Diensten sind ausdrücklich nicht Teil dieser Phase.

## Testkonfiguration
Die `.example`-Dateien sind absichtlich nicht an einen externen SIP-Trunk angebunden und verwenden Loopback. Sie dienen als Ausgangspunkt, **nicht** als produktive Telefonanlage.

## Status (30.10.2026)
- Testimage Asterisk 22.10.1 auf Hetzner erfolgreich geladen und mit `docker compose -f compose.test.yml run --rm asterisk-test` die Version ausgegeben.
- Dies ist nur ein einmaliger Container-Versionstest; keine laufende PBX, keine SIP-Registrierung, keine Ports geöffnet.
- Gewünschte Web-Subdomain: `telefonie.tariq-itconsulting.de` (DNS/HTTPS und Weboberfläche noch nicht verifiziert).
- Nächste Phase: isolierte PBX-Testinstanz und später eine geschützte Verwaltungs-API. Telekom-Routing via Friedberg noch zu prüfen.
