#!/bin/sh
set -eu
container=tariq-telefonie-telefonie-web-1
previous="$container-before-backend-$(date -u +%Y%m%d%H%M%S)"
compose() { docker compose -f compose.web.yml "$@"; }

project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container")
case "$project" in
  tariq-telefonie|tariq-backend) ;;
  *) echo 'Unerwartetes Compose-Projekt des Telefonie-Webdiensts.' >&2; exit 1 ;;
esac
test "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$container")" = tariq-telefonie_telefonie_data

compose config --quiet
compose build --pull telefonie-web
if [ "$project" = tariq-telefonie ]; then
  docker stop "$container" >/dev/null
  docker rename "$container" "$previous" || { docker start "$container" >/dev/null; exit 1; }
fi
ready() {
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS --max-time 3 -o /dev/null http://127.0.0.1:3095/api/session &&
       docker exec fahrschulpilot-caddy-1 wget -qO /dev/null "http://$container:3095/api/session"; then
      return 0
    fi
    sleep 2
  done
  return 1
}
if ! compose up -d --no-deps --no-build telefonie-web || ! ready; then
  if docker container inspect "$previous" >/dev/null 2>&1; then
    compose stop telefonie-web || true
    compose rm -f telefonie-web || true
    docker rename "$previous" "$container"
    docker start "$container"
  fi
  exit 1
fi
test "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container")" = tariq-backend
echo 'Telefonie-Webdienst im Compose-Projekt tariq-backend erreichbar.'
