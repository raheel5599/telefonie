# Isolated real Kamailio SIP syntax and policy test

**This is NOT the Telekom gateway.** It uses a real Kamailio SIP process, tests OPTIONS => 200 and unauthorized INVITE => 403, but does not forward calls, register Telekom or handle RTP. No public ports, no production Asterisk connection, no WireGuard change.

From repo root:
```bash
docker compose -f deployment/gateway-sip-test/compose.yml config --quiet
docker compose -f deployment/gateway-sip-test/compose.yml up --abort-on-container-exit --exit-code-from tester
docker compose -f deployment/gateway-sip-test/compose.yml down
```

If the image tag is unavailable or Kamailio fails to start, stop and report the logs; do not modify production networking. Next phase requires an explicit end-to-end SIP registration topology and RTPengine media routing design, including the return path via Friedberg.
