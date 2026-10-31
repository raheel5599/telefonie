# Gateway transport smoke test (safe and isolated)

This is a **transport prerequisite test**, NOT a functioning SIP proxy or RTP media relay. It validates bidirectional UDP between two ephemeral containers on an isolated Docker network, without ports, Asterisk configuration, Telekom credentials or WireGuard changes.

Run from repository root:
```bash
docker compose -f deployment/gateway-smoke/compose.yml config --quiet
docker compose -f deployment/gateway-smoke/compose.yml up --abort-on-container-exit --exit-code-from client
docker compose -f deployment/gateway-smoke/compose.yml down
```

The lab uses a distinct project name, `tariq-sip-gateway-smoke`, so it cannot recreate the production Asterisk container. It may pull the python:3.12-alpine image. The network is `internal: true` and no ports are published.

Next: build a real SIP proxy + media relay only after confirming SIP/SDP topology, Asterisk transport, NAT and Telekom registration response routing. Kamailio + rtpengine is a candidate; an isolated UDP echo test is not proof of SIP or RTP compatibility.
