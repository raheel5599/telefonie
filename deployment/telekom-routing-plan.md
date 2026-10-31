# TARIQ Telefonie – isolierter Telekom-SIP-Routingplan (NICHT AKTIV)

Stand: 2026-10-31. Ziel: Asterisk bleibt auf Hetzner; nur SIP/RTP über WireGuard und Telekom-WAN1 in Friedberg. **Keine Konfigurationsänderung durch dieses Dokument.**

## Bestätigte Fakten
- Telekom-Magenta-XL an UniFi Cloud Gateway Fiber WAN1, öffentliche IPv4 dynamisch.
- WireGuard UniFi Server: `192.168.2.0/24`, Hetzner Peer `192.168.2.2`, UniFi `192.168.2.1`.
- UniFi Standard-Masquerade für WAN1 enthält `192.168.2.0/24`; tatsächliches VPN→WAN Forwarding nicht getestet.
- Asterisk ist in Docker `pbx_private` mit `internal: true` und kann derzeit nicht nach außen routen.
- Telekom SRV `_sip._udp.tel.t-online.de` liefert mehrere Ziele. Zum Diagnosezeitpunkt: 217.0.146.5, 217.0.147.197, 217.0.147.5; **dynamisch, nicht als statische Whitelist festschreiben**.
- Hetzner Host routet diese Ziele bisher über `eth0`, nicht über WireGuard.

## Kritische technische Hürden
1. WireGuard ist *cryptokey routed*: Ein `ip route` allein genügt nicht. Die `AllowedIPs` des Hetzner-Peers müssen die SIP-Zieladressen umfassen, damit WireGuard diese Pakete zum UniFi-Peer verschlüsselt. Die Gegenstelle muss Pakete mit Quelladresse aus dem Hetzner-PBX-Netz bzw. aus `192.168.2.2` akzeptieren. `AllowedIPs=0.0.0.0/0` würde eine unerwünschte Default-Route riskieren und wird **nicht** verwendet.
2. Der PBX-Container benötigt eine dedizierte, restriktive Ausgangsverbindung zum Host-VPN, ohne das öffentliche Docker-Netz oder das Docker-Socket freizugeben. Dazu kommen DNS-Auflösung, SIP-Signalisierung und UDP-RTP-Audio in beide Richtungen.
3. UniFi muss WireGuard→WAN1 weiterleiten und NAT/Conntrack für den Verkehr durchführen; vorhandene Masquerade-Quellnetze allein beweisen das nicht. Rückweg und Firewall/Traffic Rules prüfen.
4. Telekom SIP verwendet SRV-Failover; IPs und ggf. weitere RTP-Ziele können wechseln. Keine Registrierung ohne kontrollierte Tests, SIP-Zugangsdaten niemals in GitHub.
5. Kein öffentlicher SIP-Port und keine ausgehenden kostenpflichtigen Anrufe bis zu abgesicherter Testfreigabe.

## Sicherer Testablauf
- **Phase A (nur lesend):** `wg show ... allowed-ips`, `ip rule`, `ip route`, `docker inspect` (ohne Secrets) und DNS SRV/A. Ergebnis zeigt, ob bereits ein geeigneter Pfad besteht.
- **Phase B (separat freizugeben):** Ein temporärer, streng begrenzter Test-Netzwerk-Namespace mit eigener IP/Route, DNS und UDP-Paket-Test; ausschließlich Testverkehr, keine Asterisk-Rufnummernregistrierung. Muss WireGuard AllowedIPs, UniFi NAT und Rückweg vorab berücksichtigen.
- **Phase C (separat freizugeben):** Persistente Policy-Routes nur für PBX, eng begrenzte Firewall, Asterisk-Netzwerk, SIP-Test einer Rufnummer; danach RTP-Audio und Failover.

## Rückbau
Testnamespace und nur eigens angelegte Regeln entfernen; niemals global `ip route replace default`, `wg-quick down`, bestehende UniFi-Masquerade oder andere Docker-Netze ändern.
