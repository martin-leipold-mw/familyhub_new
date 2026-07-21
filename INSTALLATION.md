# FamilyHub — Installation auf Synology NAS

## Voraussetzungen

| Anforderung | Details |
|-------------|---------|
| DSM | 7.0 oder höher |
| RAM | Mindestens 2 GB frei |
| Speicher | Mindestens 2 GB frei |
| Pakete | **Container Manager** (Docker) |
| Zugang | SSH empfohlen |

## 1. Repository klonen

```bash
ssh admin@NAS-IP
mkdir -p /volume1/docker
cd /volume1/docker
git clone https://github.com/GITHUB_USER/familyhub.git
cd familyhub
```

## 2. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
vi .env
```

Folgende Werte müssen gesetzt werden:

| Variable | Beschreibung | Beispiel |
|----------|--------------|---------|
| `POSTGRES_PASSWORD` | Datenbankpasswort | zufälliger String |
| `SPRING_DATASOURCE_PASSWORD` | Muss identisch zu `POSTGRES_PASSWORD` sein | |
| `FAMILYHUB_ENCRYPTION_KEY` | 32+ Zeichen, für OAuth-Token-Verschlüsselung | `openssl rand -base64 32` |

```bash
# Sicheren Schlüssel generieren:
openssl rand -base64 32
```

## 3. GHCR-Pakete als öffentlich setzen (einmalig)

Gehe zu `github.com/GITHUB_USER` → Packages → je Paket → Settings → Visibility → Public.  
Danach braucht Watchtower keine Anmeldung.

## 4. Stack starten

```bash
docker-compose up -d
```

Beim ersten Start lädt Docker die Images herunter (~200 MB). Das dauert je nach Verbindung 1–5 Minuten.

```bash
# Status prüfen:
docker-compose ps

# Logs:
docker-compose logs -f
```

## 5. Ersteinrichtung

Öffne im Browser: `http://NAS-IP:3080`

Der Setup-Wizard führt durch:
1. PIN setzen (Kindersicherung für Einstellungen)
2. Familienmitglieder anlegen
3. Google OAuth verbinden (optional, für Kalender & Aufgaben)
4. Synology Photos verbinden (optional, für Slideshow)
5. Wetter-API einrichten (optional)

## 6. Updates

Updates erfolgen automatisch über Watchtower. Nach jedem Push auf `main` im GitHub-Repository:

1. GitHub Actions baut neue Docker-Images und pusht sie zu GHCR (~3–5 Minuten)
2. Watchtower prüft alle 5 Minuten auf neue Images
3. Bei neuen Images: Container werden automatisch neu gestartet (~30 Sekunden Downtime)

Manuelles Update erzwingen:
```bash
docker-compose pull && docker-compose up -d
```

## 7. Backup

```bash
# Datenbank sichern:
docker-compose exec postgres pg_dump -U familyhub familyhub > backup-$(date +%Y%m%d).sql

# Backup wiederherstellen:
docker-compose exec -T postgres psql -U familyhub familyhub < backup-YYYYMMDD.sql
```

**Wichtig:** Den Wert `FAMILYHUB_ENCRYPTION_KEY` aus `.env` separat sichern — ohne ihn sind gespeicherte OAuth-Tokens nicht entschlüsselbar.

## 8. Troubleshooting

**Container startet nicht:**
```bash
docker-compose logs backend
```
Häufigste Ursache: `FAMILYHUB_ENCRYPTION_KEY` nicht gesetzt oder zu kurz.

**Datenbank nicht erreichbar:**
```bash
docker-compose ps postgres  # Healthcheck-Status prüfen
```

**Ports:**

| Port | Dienst | Zugang |
|------|--------|--------|
| 3080 | Frontend (öffentlich im LAN) | `http://NAS-IP:3080` |
| alle anderen | intern | nicht von außen erreichbar |
