# TARIQ Telefonie – SIP-Gateway Friedberg (Vorbereitung)

## Architektur
Telekom SIP-Trunk (registriert ausschließlich über den Telekom-Festnetzanschluss in Friedberg)
⇄ lokales SIP-Gateway auf künftigem Linux-Mini-PC
⇄ bestehendes, separat abzusicherndes WireGuard-VPN
⇄ Asterisk auf Hetzner
⇄ TARIQ Telefonie (Webverwaltung).

**Noch nicht live:** Keine Telekom-Registrierung, kein SIP-Trunk und keine Anrufweiterleitung. Der Gateway-Rechner in Friedberg wird vorausgesetzt, ist aber noch nicht vorhanden bzw. nicht betriebsbereit bestätigt.

## Vorabprüfung
Auf dem späteren lokalen Linux-Rechner in Friedberg:

```bash
bash friedberg-gateway/preflight.sh
```

Dies prüft nur Routing, lokale Voraussetzungen und DNS. Das Skript ändert keine Konfiguration und zeigt keine Zugangsdaten an.

## Nächste technische Schritte – vor einer Aktivierung
1. Lokale Hardware/VM festlegen, stabile LAN-IP vergeben und Installation härten. Bevorzugt kabelgebunden im Office-/Server-VLAN, nicht im Gast-/Kamera-VLAN.
2. Aus Friedberg DNS-NAPTR/SRV und die tatsächlich erreichbaren Telekom-SIP-Ziele überprüfen. `tel.t-online.de` ist ein SIP-Domainname; ein leeres `getent ahostsv4` allein ist **kein** Telekom-Ausfall, da SRV-Records relevant sind.
3. Das Gateway ausschließlich über den Friedberger Telekom-WAN-Anschluss zur Telekom kommunizieren lassen; zu Hetzner nur über WireGuard. Freigaben auf minimal nötige IPs/Ports beschränken.
4. Gateway-Technologie festlegen (z. B. SIP-Proxy mit RTP-Relay oder eigenständiger Asterisk); vollständigen SIP/SDP/RTP-Audiofluss inklusive NAT/DTMF/Failover testen, bevor Rufnummern registriert werden.
5. Zugangsdaten nur lokal als private Secrets und nie in GitHub; Identifizierung und Eingangs-Dialplan explizit begrenzen. Ausgehende Anrufe zunächst gesperrt lassen (Schutz vor Gebührenbetrug).
6. Erst kontrollierter Test mit einer Rufnummer, dann zweite Rufnummer, danach Rufverteilung und Web-UI.

## Telekom Referenzen
* https://www.telekom.de/hilfe/internet-telefonie/telefonie/voice-over-ip-sip-client
* https://docs.asterisk.org/Configuration/Channel-Drivers/SIP/Configuring-res_pjsip/Configuring-Outbound-Registrations/

## Bestehende Infrastruktur
* Hetzner Asterisk bleibt im privaten Docker-Netz ohne öffentliche SIP-/RTP-Portfreigaben.
* `wg-friedberg` mit Routen auf `192.168.2.1` und `192.168.20.0/24`. Nur Route vorhanden; **Ende-zu-Ende-Erreichbarkeit nicht nachgewiesen**.
* Die Hetzner-Standardroute bleibt `eth0`. Nicht durch das VPN überschreiben.
* Bestehendes Caddy, Supabase-Login, gespeicherte Rufnummern und andere Apps nicht verändern.
