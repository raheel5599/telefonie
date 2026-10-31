# Telekom inbound SIP and RTP — staging plan

## Proven
- Gateway-to-Telekom SIP OPTIONS returned 200 OK.
- Digest REGISTER through Kamailio returned 401 -> 200, and deregistration 200.
- Asterisk has only internal UDP transport, no registrations yet.

## Unproven and blocking activation
1. **Public Contact:** The provider saw a public Friedberg IP in the Via received parameter; that alone does not establish a reachable Contact. Verify whether Telekom targets Contact, its observed socket, or another provider-specific route. Do not publish 172.25.0.2 or 192.168.2.2 as a public Contact.
2. **Inbound SIP reachability:** Determine whether UniFi WAN has a publicly reachable IPv4, how UDP 5060 is handled, whether port forwarding is possible, and which interface routes packets back over wg-friedberg. The existing controller only allows gateway egress to 217.0.146.5:5060. Do not open SIP to the public internet without provider source restrictions and abuse protection.
3. **Provider IP ranges:** 217.0.146.5 is the tested registrar, not necessarily the full signaling/media IP set. Validate actual inbound source addresses.
4. **SIP topology:** Add provider-facing Record-Route/Contact handling or a tested SIP topology mechanism; do not assume that t_relay alone rewrites Asterisk's private Contact.
5. **RTP:** Plan a media relay (e.g., RTPengine) with tightly scoped UDP port range, negotiated SDP rewriting, source checks, and explicit routing over the intended network. SIP 200 OK does not prove two-way audio.
6. **Asterisk endpoint and dialplan:** Use a gateway-identified inbound endpoint, restrictive context and a safe test destination. No outbound public dialing until authenticated users, limits and fraud controls exist.
7. **Rollback:** Keep known-good Kamailio REGISTER config and route-controller stop procedure. Do not enable persistent service or registration before inbound test and rollback rehearsal.

## Safe sequence
- Read-only network inspection.
- Confirm UniFi public ingress feasibility and Telekom source behavior.
- Build isolated SIP ingress test and RTP relay staging.
- Verify SIP INVITE and two-way RTP end-to-end.
- Enable controlled Asterisk registration, then persistent services with monitoring.
