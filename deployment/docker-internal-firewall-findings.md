# Asterisk Netzwerkfreigabe – konkrete Umsetzung nach Firewall-Pruefung

Bestätigt 2026-10-31:
- Docker internal Netzwerk tariq-telefonie-pbx_pbx_private, Asterisk 172.25.0.2, Bridge br-534e3704cedd.
- DOCKER-INTERNAL blockiert jeden Ausgang von dieser Bridge zu Zielen ausserhalb 172.25.0.0/16.
- NetworkMode=tariq-telefonie-pbx_pbx_private; kein Default-Gateway im Container.
- Host WG 192.168.2.2, Telekom SIP OPTIONS über temporäre /32 Policy Route erfolgreich (200 OK, received Telekom-WAN-IP).

## Umsetzungsentscheidung
Die Docker-internen DROP-Regeln NICHT entfernen, NICHT übersteuern. Einen dedizierten zweiten Egress-Netzwerkanschluss fuer Asterisk vorbereiten, nicht den bestehenden ersetzen. Vor Aktivierung prüfen, ob Docker Compose die zwei Netzwerke korrekt und stabil zuweist, sowie AMI/Web-Konnektivität weiterhin funktioniert.

Der neue Netzwerkanschluss allein reicht NICHT: Host muss SIP-Pakete dieses Containers mit quell- und zielgebundener Policy Route via WireGuard schicken, vor WG auf 192.168.2.2 SNATen, DNS-SRV-Ziele aktualisieren und andere Egress-Wege explizit blockieren. Keine globale Default Route und kein blanket AllowedIPs 0.0.0.0/0 ohne vorherigen Netzwerk-/Firewall-Nachweis. Nach SIP OPTIONS aus Asterisk-Netz erst Registrierung testen.

## Abbruchkriterien
- SIP-Verkehr aus Asterisk kann ueber eth0 statt WG entweichen.
- SIP OPTIONS aus Container-Netz erreicht Telekom nicht mit Telekom-WAN-IP.
- Web/AMI oder andere Container verlieren Erreichbarkeit.
- Rollback und Reboot-Verhalten nicht dokumentiert.
