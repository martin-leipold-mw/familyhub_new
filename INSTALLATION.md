# FamilyHub — Installation auf Synology NAS

## Voraussetzungen

| Anforderung | Details |
|-------------|---------|
| DSM | 7.0 oder höher |
| RAM | Mindestens 2 GB frei |
| Speicher | Mindestens 2 GB frei |
| Pakete | **Container Manager** (Docker) |
| Zugang | SSH empfohlen |

## 1. Repository per SSH klonen

Das Repository wird mit einem **Deploy Key** geklont: ein SSH-Schlüssel, der nur für dieses eine
Repository gilt und nur lesen darf. Er liegt im Home-Verzeichnis des NAS-Benutzers, mit dem du dich
per SSH anmeldest (im Folgenden `admin`).

### 1.1 Vorbereitung in DSM (einmalig)

1. **SSH aktivieren:** Systemsteuerung → Terminal & SNMP → **SSH-Dienst aktivieren**.
2. **Benutzer-Home aktivieren:** Systemsteuerung → Benutzer und Gruppe → Erweitert →
   **Home-Dienst für Benutzer aktivieren**. Ohne diesen Schalter hat der Benutzer kein
   Home-Verzeichnis, und `~/.ssh` lässt sich nicht anlegen.
3. **Git installieren:** Paket-Zentrum → Paket **Git Server** installieren. DSM bringt von Haus aus
   kein `git` mit; das Paket stellt den Befehl auf der Kommandozeile bereit.

### 1.2 SSH-Schlüssel auf der NAS erzeugen

```bash
ssh admin@NAS-IP

mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "familyhub-nas" -f ~/.ssh/familyhub_deploy -N ""
```

Das erzeugt zwei Dateien:

| Datei | Inhalt | Wohin |
|-------|--------|-------|
| `~/.ssh/familyhub_deploy` | privater Schlüssel | bleibt auf der NAS, niemals weitergeben |
| `~/.ssh/familyhub_deploy.pub` | öffentlicher Schlüssel | wird bei GitHub hinterlegt |

`~` ist bei Synology `/var/services/homes/admin` (bzw. `/volume1/homes/admin`). Der Schlüssel hat
bewusst keine Passphrase (`-N ""`), damit `git pull` ohne Rückfrage funktioniert — er darf ja nur
dieses eine Repository lesen.

### 1.3 Öffentlichen Schlüssel bei GitHub als Deploy Key eintragen

```bash
cat ~/.ssh/familyhub_deploy.pub
```

Die ausgegebene Zeile (beginnt mit `ssh-ed25519`) kopieren und auf GitHub eintragen:
Repository `martin-leipold-mw/familyhub_new` → **Settings → Deploy keys → Add deploy key**.
Titel z. B. „Synology NAS", **„Allow write access" nicht anhaken**.

### 1.4 SSH-Konfiguration anlegen

Damit `git` für GitHub automatisch den Deploy Key verwendet:

```bash
cat >> ~/.ssh/config <<'CONF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/familyhub_deploy
    IdentitiesOnly yes
CONF
chmod 600 ~/.ssh/config ~/.ssh/familyhub_deploy
```

Verbindung testen (beim ersten Mal den Fingerprint mit `yes` bestätigen):

```bash
ssh -T git@github.com
# Erwartet: "Hi martin-leipold-mw/familyhub_new! You've successfully authenticated, ..."
```

Kommt `Permission denied (publickey)`: Deploy Key in GitHub prüfen und die Rechte kontrollieren
(`ls -la ~/.ssh` — Verzeichnis `drwx------`, Schlüssel und `config` `-rw-------`).

### 1.5 Repository klonen

```bash
sudo mkdir -p /volume1/docker/familyhub
sudo chown "$(whoami)" /volume1/docker/familyhub
git clone git@github.com:martin-leipold-mw/familyhub_new.git /volume1/docker/familyhub
cd /volume1/docker/familyhub
```

Das Verzeichnis gehört deinem Benutzer, damit `git pull` ohne `sudo` läuft — sonst würde Git als
`root` den Schlüssel in `/root/.ssh` suchen und nicht finden.

> **Hinweis:** Docker-Befehle (`docker-compose …`) brauchen auf der Synology `sudo`,
> `git`-Befehle dagegen **nicht** — immer als normaler Benutzer ausführen.

## 2. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
vi .env
```

Folgende Werte müssen gesetzt werden:

| Variable | Beschreibung | Beispiel |
|----------|--------------|---------|
| `GITHUB_USER` | GitHub-Konto, unter dem die Images in GHCR liegen (klein geschrieben) | `martin-leipold-mw` |
| `POSTGRES_PASSWORD` | Datenbankpasswort | zufälliger String |
| `SPRING_DATASOURCE_PASSWORD` | Muss identisch zu `POSTGRES_PASSWORD` sein | |
| `FAMILYHUB_ENCRYPTION_KEY` | 32+ Zeichen, für OAuth-Token-Verschlüsselung | `openssl rand -base64 32` |

```bash
# Sicheren Schlüssel generieren:
openssl rand -base64 32
```

## 3. GHCR-Pakete als öffentlich setzen (einmalig)

Gehe zu `github.com/GITHUB_USER` → Packages → je Paket → Settings → Visibility → Public.  
Danach brauchen Docker und Watchtower keine Anmeldung bei GHCR.

## 4. Stack starten

```bash
sudo docker-compose up -d
```

Beim ersten Start lädt Docker die Images herunter (~200 MB). Das dauert je nach Verbindung 1–5 Minuten.

```bash
# Status prüfen:
sudo docker-compose ps

# Logs:
sudo docker-compose logs -f
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

Watchtower aktualisiert nur die **Images** von Backend und Frontend. Ändert sich
`docker-compose.yml` selbst (neuer Dienst, neue Umgebungsvariable), muss das Repository
nachgezogen werden:

```bash
cd /volume1/docker/familyhub
git pull                                   # als normaler Benutzer, nutzt den Deploy Key
sudo docker-compose up -d                  # übernimmt die geänderte Konfiguration
```

Manuelles Update erzwingen:
```bash
sudo docker-compose pull && sudo docker-compose up -d
```

## 7. Backup

```bash
# Datenbank sichern:
sudo docker-compose exec postgres pg_dump -U familyhub familyhub > backup-$(date +%Y%m%d).sql

# Backup wiederherstellen:
sudo docker-compose exec -T postgres psql -U familyhub familyhub < backup-YYYYMMDD.sql
```

**Wichtig:** Den Wert `FAMILYHUB_ENCRYPTION_KEY` aus `.env` separat sichern — ohne ihn sind gespeicherte OAuth-Tokens nicht entschlüsselbar.

## 8. Troubleshooting

**Container startet nicht:**
```bash
sudo docker-compose logs backend
```
Häufigste Ursache: `FAMILYHUB_ENCRYPTION_KEY` nicht gesetzt oder zu kurz.

**`The data directory was initialized by PostgreSQL version 15, which is not compatible with this version 16`:**
Die Datenbank hat ein fremdes Datenvolume erwischt, typischerweise das einer älteren Installation.
FamilyHub verwendet das fest benannte Volume `familyhub-new-postgres-data`. Mit `git pull` den
aktuellen Stand holen und neu starten:
```bash
git pull
sudo docker-compose down
sudo docker-compose up -d
sudo docker volume ls | grep postgres      # familyhub-new-postgres-data muss auftauchen
```
Das alte Volume bleibt dabei unangetastet.

**`invalid reference format: repository name must be lowercase`:**
`GITHUB_USER` in `.env` ist nicht gesetzt, steht noch auf einem Platzhalter oder enthält
Großbuchstaben. Der Wert wird in die Image-Namen (`ghcr.io/${GITHUB_USER}/…`) eingesetzt, und
Docker erlaubt dort nur Kleinbuchstaben. Prüfen und korrigieren:
```bash
grep GITHUB_USER .env                      # muss GITHUB_USER=martin-leipold-mw lauten
sudo docker-compose config | grep image:   # zeigt die tatsächlich verwendeten Image-Namen
```

**Datenbank nicht erreichbar:**
```bash
sudo docker-compose ps postgres  # Healthcheck-Status prüfen
```

**Ports:**

| Port | Dienst | Zugang |
|------|--------|--------|
| 3080 | Frontend (öffentlich im LAN) | `http://NAS-IP:3080` |
| alle anderen | intern | nicht von außen erreichbar |

---

## 9. Google-Cloud-Einrichtung (Kalender & Aufgaben)

### 9.1 Google-Cloud-Projekt anlegen und API aktivieren

1. Öffne die [Google Cloud Console](https://console.cloud.google.com/) und erstelle ein neues Projekt (z. B. „FamilyHub").
2. Navigiere zu **APIs & Dienste → Bibliothek** und aktiviere die **Google Calendar API**.

### 9.2 OAuth-Zustimmungsbildschirm konfigurieren

1. Navigiere zu **APIs & Dienste → OAuth-Zustimmungsbildschirm**.
2. Wähle **Extern** als Benutzertyp (auch für private Familienprojekte).
3. Trage App-Name, Support-E-Mail und Entwickler-E-Mail ein und klicke **Speichern und weiter**.
4. Füge folgende Scopes hinzu:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/userinfo.email`
5. Trage unter **Testnutzer** alle Google-Konten ein, die sich mit FamilyHub verbinden sollen.
6. Klicke **Speichern und weiter** bis zum Abschluss.

> **Wichtig — 7-Tage-Ablauf im Testing-Status:** Solange die App im Status **„In Prüfung"** (Testing)
> verbleibt, laufen Refresh-Tokens nach 7 Tagen ab. Familienmitglieder müssen sich dann erneut
> verbinden. Um das zu vermeiden, kann die App in den Status **„In Produktion"** versetzt werden —
> für eine private, nicht öffentlich zugängliche Instanz ist keine formale Google-Prüfung erforderlich,
> solange die App nicht im Play Store oder ähnlichem veröffentlicht wird.

### 9.3 OAuth-Client-ID erstellen (Typ: Webanwendung)

1. Navigiere zu **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**.
2. Wähle als Anwendungstyp **Webanwendung**.
3. Trage unter **Autorisierte Weiterleitungs-URIs** genau **eine** URI ein:

   ```
   http://<NAS-IP>:<Port>/oauth/callback
   ```

   Beispiel: `http://192.168.1.100:3080/oauth/callback`

   > Trage ausschließlich diese eine URI ein — keine Trailing-Slashes, keine Varianten.

4. Klicke **Erstellen**. Die angezeigte **Client-ID** und das **Client-Secret** werden im nächsten Schritt benötigt.

### 9.4 Zugangsdaten im Setup-Wizard eingeben

1. Öffne `http://NAS-IP:3080` im Browser.
2. Navigiere im Setup-Wizard zum Abschnitt **Google-Verbindung**.
3. Trage ein:
   - **Client-ID** (aus Schritt 9.3)
   - **Client-Secret** (aus Schritt 9.3)
   - **Redirect-URI**: identisch zur URI aus Schritt 9.3
4. Speichern — die Zugangsdaten werden **verschlüsselt** in der Datenbank abgelegt.

### 9.5 Sync-Einstellungen

| Einstellung | Standardwert | Beschreibung |
|-------------|-------------|--------------|
| `google.sync.interval.minutes` | `15` | Intervall (in Minuten), in dem Kalender und Aufgaben aus Google synchronisiert werden. |
| `family.timezone` | `Europe/Berlin` | Zeitzone für die Darstellung von Terminen und Aufgaben. |

Diese Werte können über Umgebungsvariablen oder im Setup-Wizard überschrieben werden.
