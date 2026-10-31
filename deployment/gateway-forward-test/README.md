# Isolated Kamailio SIP REGISTER forwarding test

No real Telekom number, authentication, WireGuard routing, Asterisk configuration, public ports, or RTP.

This test runs a Kamailio transaction proxy, a mock registrar, and a client in a private Docker network. It verifies REGISTER forwarding and return of a SIP 200 response. It is **not** proof of Telekom registration.

From repo root:
```bash
docker compose -f deployment/gateway-forward-test/compose.yml config --quiet
docker compose -f deployment/gateway-forward-test/compose.yml up --build --abort-on-container-exit --exit-code-from tester
docker compose -f deployment/gateway-forward-test/compose.yml down
```
If it fails, capture logs before modifying the test. The registrar only simulates an unauthenticated 200 response; a production registrar requires Digest authentication, NAT/contact rewriting, secure routing and RTP relay.
