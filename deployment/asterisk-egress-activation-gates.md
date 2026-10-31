# Asterisk SIP Test – vorbereitete Host-Aktivierung
#
# NICHT als vollstaendiges Aktivierungsskript ausfuehren.
# Dieser Ablauf beschreibt die Mindestbedingungen fuer die Aktivierung.
#
# Ziel: ausschliesslich Asterisk -> Telekom SIP ueber wg-friedberg.
# Asterisk-Container: tariq-telefonie-asterisk
# bestehendes internes Netz: tariq-telefonie-pbx_pbx_private
#
# Sicherheitsanforderungen vor docker network connect:
# 1. Festen, konfliktfreien IP-Bereich fuer dedizierte zweite Docker-Bridge pruefen.
# 2. Egress dieser IP in DOCKER-USER default-deny; nur SIP-Server
#    ueber wg-friedberg erlauben; ESTABLISHED/RELATED Rueckweg.
# 3. Telekom-SRV-Aufloesung und dynamische IPs kontrollieren.
# 4. WG AllowedIPs und Policy-Route fuer SIP-Ziele einrichten.
# 5. SNAT fuer ausschliesslich diese Quell-IP/Ziele auf 192.168.2.2
#    vor Docker-MASQUERADE platzieren.
# 6. Mit tcpdump nachweisen, dass kein SIP-Paket ueber eth0 geht.
# 7. Zweites Docker-Netz erst nach aktiver Egress-Sperre verbinden.
# 8. Erst SIP OPTIONS, danach PJSIP REGISTER.
# 9. Persistenz und Rollback fuer iptables, ip rule, wg und Docker testen.
#
# Ein ungesichertes 'docker network connect' waere NICHT ausreichend.
