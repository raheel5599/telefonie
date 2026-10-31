# TARIQ Telefonie: persistent gateway design staging

**NOT LIVE / NOT READY FOR REGISTRATION.** This is a reproducible configuration proposal, not a working persistent Telekom trunk.

## What is prepared
- Kamailio has a fixed address 172.25.254.10 on the existing isolated Asterisk Docker network.
- A second isolated Docker network 172.29.247.0/28 is reserved for gateway egress.
- No ports are published to the Hetzner host.
- SIP health check returns 200; other SIP methods return 403.
- Asterisk registration preview references the gateway but is not included in live pjsip.conf.
- No changes to running Asterisk or its mounts.

## Validation before starting
1. Confirm 172.25.254.10 is free in the existing network and 172.29.247.0/28 does not conflict with routes/VPNs, not just Docker networks.
2. Confirm Docker compose config and Kamailio config syntax without deploying.
3. Decide whether attaching a gateway to the live PBX network is acceptable and how ingress will be authenticated.
4. Configure persistent scoped WireGuard AllowedIPs, policy routing, NAT, FORWARD/DOCKER-USER rules and reverse conntrack handling. Do not alter the Hetzner default route.
5. Test Telekom REGISTER 401 -> authenticated 200 -> clean deregistration through Kamailio.
6. Validate Via, Contact, Record-Route, inbound signaling, DNS failover and RTP media relay. The single test IP 217.0.146.5 is NOT a full Telekom allowlist.
7. Only after the above, enable Asterisk registration with automatic renewal and verify inbound/outbound calls.
8. Prepare restart ordering, health checks, rollback and safe firewall persistence before enabling restart: unless-stopped.

## Safe offline checks (no container start)
```bash
docker compose -f deployment/permanent-gateway-staging/compose.yml config --quiet
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges \
  --mount type=bind,src="$PWD/deployment/permanent-gateway-staging/kamailio.cfg",dst=/etc/kamailio/kamailio.cfg,readonly \
  --entrypoint /usr/sbin/kamailio tariq-sip-forward-test-proxy:latest \
  -c -f /etc/kamailio/kamailio.cfg
```

**Do not** run `docker compose up` for this staging project yet. It intentionally rejects REGISTER and INVITE.
