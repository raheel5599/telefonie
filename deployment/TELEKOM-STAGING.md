# Telekom trunk - staging plan (not live)

Verified: SIP REGISTER 401 -> authenticated 200 -> deregistration 200 using the temporary WireGuard probe. Only +4960316868187 was tested. Other Telekom numbers untouched.

## Files
- `asterisk/telekom-trunk-staging.conf`: proposed PJSIP auth, registration, endpoint; **not included in live config**.
- `asterisk/telekom-dialplan-staging.conf`: deny-by-default inbound test context.

## Activation gates
1. Confirm Asterisk Docker container networks, IP, compose mounts, and actual loaded PJSIP config. Preserve default host route, existing applications and firewall rules.
2. Design persistent restricted SIP egress over wg-friedberg. Do not simply add default route to Asterisk container. Verify Telekom DNS/SRV behavior and dynamic registrar/proxy IPs.
3. Determine inbound signaling and RTP return path, NAT Contact/Via and SDP address. The successful registration probe did **not** prove audio.
4. Restrict inbound SIP to Telekom signaling and verify PJSIP endpoint identification. No public open SIP ports.
5. Load staging includes only after explicit review; reload PJSIP in maintenance window and check `pjsip show registrations`.
6. Place a controlled incoming test call; then test audio both directions and authorized outbound dialing. Add outbound routes only after call permissions and rate limits.
7. Rollback: remove staging includes and reload Asterisk, restore prior network policy.

Do not use the old `telekom-registration-test.conf` as production config: its parameters predate the successful Digest test.
