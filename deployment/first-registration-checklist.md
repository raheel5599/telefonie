# Telekom-Registrierung: isolierter Umsetzungsplan (NICHT LIVE)

Ziel: Testnummer +4960316868187, Registrar tel.t-online.de. Stand: SIP OPTIONS ueber WireGuard vom Host (192.168.2.2) zu 217.0.146.5 hat 200 OK und received=84.146.134.196 geliefert. Das beweist den Host-Netzwerkpfad, nicht die Erreichbarkeit aus Asterisk oder eine Registrierung.

## Istzustand
- Asterisk: 172.25.0.2 im Docker-Netz tariq-telefonie-pbx_pbx_private, internal=true, kein Default-Gateway.
- Docker-Bridge: br-534e3704cedd, Gateway auf Host 172.25.0.1. Docker-FORWARD default DROP und DOCKER-INTERNAL blockiert egress.
- WireGuard: wg-friedberg, 192.168.2.2/32, peer AllowedIPs 192.168.20.0/24 und 192.168.2.1/32.
- Host-Default via eth0 muss unangetastet bleiben. Tabelle 24680 und Prioritaet 12468 wurden temporär getestet und danach entfernt.

## Vor produktiver Aktivierung
1. Dediziertes *zweites*, nicht-internes Docker-Bridge-Netz ausschliesslich fuer Asterisk planen; keine Aenderung am vorhandenen pbx_private und keine oeffentlichen SIP-/RTP-Portfreigaben. Vorher pruefen, dass Docker DNS/Transport, PJSIP Contact und AMI weiterhin funktionieren.
2. Beschraenkung des Asterisk-Egress auf Telekom SIP-Ziele und erforderliche DNS-Aufloesung durch explizite Host-Firewall-Regeln (IPv4/IPv6 beruecksichtigen). Docker-Firewallregeln nicht pauschal lockern. Asterisk-Quelladresse vor wg-friedberg auf 192.168.2.2 SNATen, sodass UniFi die bereits getestete VPN-Quelladresse sieht.
3. Nur PBX-Verkehr per policy routing ueber wg-friedberg fuehren. Telekom SRV/A-Ziele dynamisch ermitteln, nicht dauerhaft 217.0.146.5 festschreiben. wg AllowedIPs und Policy-Route gemeinsam und atomar mit Rollback verwalten. Kein wg-quick save, keine globale Default-Route aendern.
4. Vor Asterisk-Registrierung aus exakt derselben Netzwerkumgebung wie der PBX einen SIP OPTIONS Test senden und pruefen, dass received die aktuelle Telekom-WAN-IP ist. Bei Misserfolg Rueckbau.
5. Registrierungstest ohne Passwort fuer +4960316868187; Status mit pjsip show registrations auslesen. 401/403 ist keine erfolgreiche Registrierung. Keine ausgehenden kostenpflichtigen Anrufe.
6. Danach gesondert RTP, eingehende Anrufe, SRV-Failover, persistente Firewall/Route und Reboot-Verhalten testen.

## Offene Risiken
- Telekoms Authentifizierungsanforderungen und korrekte Rufnummern-/Contact-Formate sind noch nicht nachgewiesen.
- Die verwendete Asterisk-Container-Image-Konfiguration und Reload-Verhalten muessen vor Aktivierung validiert werden.
- Docker-Bridge-IP und iptables-Regeln koennen bei Container-Recreate wechseln.
- Kein Live-Deploy dieser Testbranch ohne vorherige Host-Backups, reproduzierbaren Rollback und Netzwerkpfadtest.
