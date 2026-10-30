# Isolierter Asterisk-Starttest

**Noch nicht auf dem Hetzner-Server gestartet.** Der Testcontainer nutzt `network_mode: none` und veröffentlicht keinerlei SIP- oder RTP-Ports. Er prüft zunächst lediglich die Asterisk-Version, nicht die Telekom-Registrierung.

## Test auf Hetzner
```bash
git clone https://github.com/raheel5599/telefonie.git ~/apps/telefonie
cd ~/apps/telefonie
docker compose -f compose.test.yml config -q
docker compose -f compose.test.yml run --rm asterisk-test
```

Vor dem Test das Community-Image prüfen. Es handelt sich **nicht um ein offiziell veröffentlichtes Asterisk-Docker-Image**. Der einmalige Test kann ein Image herunterladen, ändert aber keine vorhandenen Container, VPN- oder Caddy-Konfigurationen.

Für produktiven Betrieb später ein überprüftes, auf feste Digest-Version gepinntes Image oder eigenen Build verwenden. SIP/RTP und Telekom-Routing sind ausdrücklich noch offen.
