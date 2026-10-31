# TARIQ Telefonie - SIP/RTP gateway staging

**Status: design only, not deployed.** No changes to Asterisk, host default route, firewall or WireGuard.

## Proven
- Telekom REGISTER: 401 challenge -> authenticated 200 -> deregistration 200 via temporary isolated probe.
- Asterisk 22.10.1 running as user `asterisk` in Docker internal network `172.25.0.0/16`, address `172.25.0.2`, no default route.
- WireGuard `wg-friedberg` reaches Friedberg. Docker host FORWARD default DROP.
- Tested Telekom SIP address `217.0.146.5` is a **single test endpoint**, not a complete SIP/RTP allowlist.

## Candidate architecture (pending validation)
Asterisk internal Docker network <-> dedicated SIP signaling proxy / RTP media relay <-> restricted host WireGuard routing <-> UniFi Friedberg <-> Telekom.

The gateway requires a dedicated isolated Docker network interface attached to Asterisk's private network and a separate constrained egress network. Do not attach Asterisk directly to a generic internet-connected bridge. Choose SIP proxy and RTP relay implementation only after verifying required transport, contact/Via rewriting, authentication behavior, inbound signaling, SDP addresses, RTP ranges and routing. A generic UDP forwarder alone is insufficient.

## Non-negotiable safety gates
1. Run read-only `deployment/gateway-readiness.sh` to capture actual runtime details.
2. Confirm existing Compose stack, volumes, PJSIP config mounts and Asterisk healthcheck. Do not overwrite them.
3. Test DNS/SRV and registrar failover for `tel.t-online.de`. Confirm Telekom service constraints and registration behavior behind NAT.
4. Design **both directions** of SIP and RTP. Validate Contact/Via/Record-Route and SDP media addresses; plan symmetric RTP and media anchoring.
5. Define explicit gateway-only firewall allowlist, per-interface routing and source NAT over `wg-friedberg`; avoid host default route changes and avoid opening public SIP/RTP ports.
6. Prepare rollback before deployment and test only the first number +4960316868187. Leave the other two numbers untouched.
7. Confirm caller ID, inbound DID routing, authorized outbound dialplan and toll-fraud controls before live calling.

## Next steps
- Review read-only readiness output and Compose configuration.
- Select and implement a concrete gateway with tested routing/health checks in this branch.
- Validate configuration offline, then deploy to a staging container.
- After explicit review, conduct a single-number registration and audio test.

## Notes
The prior registration probe does not prove incoming calls or RTP audio. Staging PJSIP configuration must not be included in production until signaling/media path is validated.
