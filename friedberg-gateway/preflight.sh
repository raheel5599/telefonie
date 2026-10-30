#!/usr/bin/env bash
# TARIQ Telefonie - schreibgeschuetzter Preflight auf dem geplanten Linux-Gateway in Friedberg.
set -u
echo "=== Host ==="
hostname
uname -srm
echo "=== Default route (muss lokal ueber Telekom laufen) ==="
ip -4 route show default || true
echo "=== WireGuard interfaces ==="
ip -brief address show | grep -E 'wg|tun' || true
echo "=== DNS SRV Telekom SIP ==="
if command -v dig >/dev/null 2>&1; then
  dig +short SRV _sip._udp.tel.t-online.de
  dig +short SRV _sip._tcp.tel.t-online.de
else
  echo "dig fehlt. Installation ueber Betriebssystempakete moeglich."
fi
echo "=== DNS vom Betriebssystem ==="
getent ahostsv4 tel.t-online.de | head -n 4 || true
echo "=== Docker (nur Version) ==="
if command -v docker >/dev/null 2>&1; then docker --version; else echo "Docker nicht installiert"; fi
echo "=== Keine Zugangsdaten verarbeitet, keine Registrierung durchgefuehrt ==="
