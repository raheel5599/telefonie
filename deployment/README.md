# GitHub Actions → Hetzner

Workflow: `.github/workflows/deploy.yml`

## GitHub Secrets
Im Repository **raheel5599/telefonie** unter Settings → Secrets and variables → Actions oder im Environment `production`:
- `HETZNER_SSH_PRIVATE_KEY`: privater Deploy-Schlüssel des bestehenden `fpadmin`-SSH-Zugangs
- `HETZNER_KNOWN_HOSTS`: **vorher verifizierter** SSH-Hostkey des Hetzner-Servers

Bestehende Repository-Secrets anderer Projekte werden nicht automatisch übernommen. Keine Secrets in den Chat oder GitHub-Dateien kopieren.

## Ausführung
Die Action läuft bei Änderungen an Telefonie-Website/Server/Compose auf `main` und kann manuell über Actions → **TARIQ Telefonie · Hetzner Deploy** → Run workflow gestartet werden.

- Prüft JavaScript mit `node --check`.
- Überträgt ausschließlich Dateien nach `/home/fpadmin/apps/telefonie`.
- Aktualisiert ausschließlich den Docker-Compose-Dienst `telefonie-web` unter dem Projekt `tariq-telefonie`.
- Prüft lokal `http://127.0.0.1:3095/api/session`.
- Die Action ändert weder Caddy noch WireGuard, noch bestehende Container.
- Asterisk wird **nicht** gestartet; die Telefonie-Weboberfläche ist weiterhin nur eine Vorbereitung.

## Erste Veröffentlichung (separater Admin-Schritt)
Die Website hört nur auf `127.0.0.1:3095`. Um `telefonie.tariq-itconsulting.de` öffentlich über HTTPS verfügbar zu machen, muss der **bestehende** Caddy-Reverse-Proxy separat und mit Backup/Validierung für diese Domain konfiguriert werden. Dies ist absichtlich nicht Teil des Workflows. Die Domain muss auf die richtige Hetzner-IP zeigen.

**Sicherheit:** Die Weboberfläche benötigt Supabase-Adminlogin. Login-/Session-Code vor öffentlicher Freigabe testen. Im jetzigen Testdesign werden Sitzungen nur im Arbeitsspeicher gehalten und bei Container-Neustarts abgemeldet.

## Fehleranalyse
- Fehlt SSH-Key/known_hosts, beendet die Action den Deploy, bevor die Anwendung verändert wird.
- Ohne bestehenden Docker-Zugriff des `fpadmin` funktioniert das Deployment nicht.
- Für einen erfolgreichen Login muss der Host Supabase erreichen können.
