#!/usr/bin/env bash
# Read-only: inspect healthcheck failures and Compose ownership.
set -Eeuo pipefail
C=tariq-telefonie-asterisk
echo '=== HEALTHCHECK DEFINITION ==='
docker inspect "$C" --format '{{json .Config.Healthcheck}}'
echo '=== LAST HEALTHCHECK RESULTS ==='
docker inspect "$C" --format '{{range .State.Health.Log}}Exit={{.ExitCode}} Output={{printf "%q" .Output}}{{println}}{{end}}'
echo '=== COMPOSE LABELS ==='
docker inspect "$C" --format '{{range $k,$v := .Config.Labels}}{{if eq $k "com.docker.compose.project.working_dir"}}{{$k}}={{$v}}{{println}}{{end}}{{if eq $k "com.docker.compose.project.config_files"}}{{$k}}={{$v}}{{println}}{{end}}{{end}}'
echo '=== LIVE CONFIG MOUNTS ==='
docker inspect "$C" --format '{{range .Mounts}}{{if eq .Destination "/etc/asterisk"}}{{.Type}} {{.Source}} -> {{.Destination}} RW={{.RW}}{{println}}{{end}}{{if eq .Destination "/etc/asterisk/pjsip.conf"}}{{.Type}} {{.Source}} -> {{.Destination}} RW={{.RW}}{{println}}{{end}}{{if eq .Destination "/etc/asterisk/extensions.conf"}}{{.Type}} {{.Source}} -> {{.Destination}} RW={{.RW}}{{println}}{{end}}{{end}}'
echo '=== ASTERISK PJSIP STATUS AS SERVICE USER ==='
docker exec -u asterisk -w /tmp "$C" asterisk -rx 'pjsip show version'
echo 'Inspection complete; nothing changed.'
