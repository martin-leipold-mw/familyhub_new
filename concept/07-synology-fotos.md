# 07 — Fotos, Slideshow und Synology-NAS-Anbindung

## Zweck & Geltungsbereich

Dieses Dokument beschreibt vollständig den Ist-Zustand der Foto- und Slideshow-Funktionalität des
bestehenden FamilyHub, mit Schwerpunkt auf der Anbindung an eine Synology NAS über die Synology
Photos Web-API. Es ist so geschrieben, dass ein Entwicklungsteam die Anbindung ohne Zugriff auf den
Altcode und ohne Synology-Herstellerdokumentation neu implementieren kann: alle API-Namen,
Versionen, Methoden, Query-Parameter, Response-Felder, Fehlercodes, Timeouts und Default-Werte sind
im Text genannt. Nicht behandelt werden Kalender, Aufgaben, Haushaltsrotation und Badges (siehe die
jeweiligen Dokumente).

Reservierte Anforderungs-Präfixe dieses Dokuments: `FA-FOTO-` (fachliche Anforderungen) und
`TA-FOTO-` (technische Anforderungen).

> **Hinweis zu Zugangsdaten:** In diesem Dokument werden ausschließlich Platzhalter verwendet:
> Host `nas.example.local`, Benutzer `familyhub`, Passwörter und Session-IDs als `<redacted>`.
> Reale Werte aus `.env` oder aus der Datenbank sind bewusst nicht übernommen.

---

## Inhaltsverzeichnis

- [1. Überblick der Foto-Funktionalität](#1-überblick-der-foto-funktionalität)
- [2. Systemarchitektur der Foto-Kette](#2-systemarchitektur-der-foto-kette)
- [3. Synology-Photos-API im Detail](#3-synology-photos-api-im-detail)
  - [3.1 Adressierung, Ports, Protokolle, Zertifikate](#31-adressierung-ports-protokolle-zertifikate)
  - [3.2 Login / Authentifizierung](#32-login--authentifizierung)
  - [3.3 Session-Verwaltung, Ablauf und Re-Login](#33-session-verwaltung-ablauf-und-re-login)
  - [3.4 Logout](#34-logout)
  - [3.5 Album-Abruf](#35-album-abruf)
  - [3.6 Album-Auswahl und Passphrase](#36-album-auswahl-und-passphrase)
  - [3.7 Foto-/Medien-Listen-Abruf](#37-foto-medien-listen-abruf)
  - [3.8 Binär-Download von Bild und Video](#38-binär-download-von-bild-und-video)
  - [3.9 Vollständige Tabelle aller Synology-API-Requests](#39-vollständige-tabelle-aller-synology-api-requests)
  - [3.10 Sequenzdiagramm eines Slideshow-Zyklus](#310-sequenzdiagramm-eines-slideshow-zyklus)
  - [3.11 Fehlerbehandlung und Fehlercodes](#311-fehlerbehandlung-und-fehlercodes)
- [4. Backend-REST-API des FamilyHub](#4-backend-rest-api-des-familyhub)
- [5. Konfiguration und Persistenz](#5-konfiguration-und-persistenz)
- [6. Setup-Wizard aus Nutzersicht](#6-setup-wizard-aus-nutzersicht)
- [7. Caching-Strategie](#7-caching-strategie)
- [8. Slideshow-Verhalten](#8-slideshow-verhalten)
- [9. Datenschutz und Sicherheit](#9-datenschutz-und-sicherheit)
- [10. Anforderungskatalog](#10-anforderungskatalog)
- [11. Bekannte Schwächen / offene Punkte](#11-bekannte-schwächen--offene-punkte)
- [12. Empfehlungen für die Neuauflage](#12-empfehlungen-für-die-neuauflage)

---

## 1. Überblick der Foto-Funktionalität

### 1.1 Rolle im Produkt

FamilyHub läuft auf einem wandmontierten Touch-Display. Die Slideshow ist der Ruhezustand des
Geräts: Sie fungiert als **digitaler Bilderrahmen** und wird automatisch aktiviert, wenn 60 Sekunden
lang keine Benutzerinteraktion erfolgt ist. Der Ansichtswechsel erfolgt im Frontend über den
`ViewMode`-Wert `photos`; im Slideshow-Modus werden Kopfzeile und Bottom-Navigation ausgeblendet
(`familyhub/frontend/src/pages/Index.tsx`).

Konkret gilt im Altsystem:

| Eigenschaft | Wert |
|-------------|------|
| Inaktivitäts-Timeout bis Slideshow | 60 Sekunden (`INACTIVITY_TIMEOUT = 60 * 1000`) |
| Timer läuft nicht, wenn | die Slideshow bereits aktiv ist |
| Als „Aktivität“ gewertet | Touch-/Klick-/Tastatur-Events; `mousemove` ist bewusst **ausgenommen** (Kommentar im Code: „intentionally excluded for touch-first wall displays“) |
| Verlassen der Slideshow | Nur über Benutzerinteraktion mit den eingeblendeten Steuerelementen bzw. Navigation |

### 1.2 Bildquellen — was tatsächlich implementiert ist

| Quelle | Zustand | Bemerkung |
|--------|---------|-----------|
| **Synology Photos (NAS)** | **Umgesetzt** | Einzige produktiv genutzte Quelle. Alle Bilder und Videos der Slideshow stammen aus einem einzelnen, in den Einstellungen ausgewählten Synology-Photos-Album. |
| Lokale Fallback-Bilder | **Nicht umgesetzt (toter Code)** | Unter `familyhub/frontend/src/assets/slideshow/` liegen vier JPEG-Dateien (`family-baking.jpg`, `family-beach.jpg`, `family-hiking.jpg`, `family-picnic.jpg`, zusammen ca. 1,0 MB). Eine Codesuche über das gesamte Frontend findet **keine einzige Referenz** auf dieses Verzeichnis oder auf die Dateinamen. Es existiert also **kein** Fallback auf lokale Bilder, wenn das NAS nicht erreichbar ist. |
| Google Photos | **Nicht umgesetzt** | Trotz Nennung in `PRODUCT_REQUIREMENTS.md`. Im gesamten Backend und Frontend existiert kein Treffer für `photoslibrary`, `GooglePhotos` o. ä. Lediglich die JPA-Entität `Photo` besitzt ein ungenutztes Feld `google_media_item_id`. |
| Lokal hochgeladene Fotos (DB-Tabelle `photos`) | **Nicht umgesetzt (toter Code)** | Es existieren die Tabelle `photos` (Migration `V3__create_photos.sql`), die Entität `Photo` und das Repository `PhotoRepository` mit Methoden wie `findRandomSlideshowPhoto()`. **Kein Service und kein Controller verwendet `PhotoRepository`.** Es gibt keinen Upload-Endpoint und keinen Endpoint, der aus dieser Tabelle liest. |

Zusätzlich existiert eine zweite, **ungenutzte** Slideshow-Komponente
`familyhub/frontend/src/components/views/PhotosView.tsx`, die Fotos als Prop entgegennimmt
(Typ `SlideshowPhoto`), ein fest verdrahtetes Intervall von 5000 ms besitzt und in keiner Seite
eingebunden ist. Produktiv verwendet wird ausschließlich
`familyhub/frontend/src/components/views/PhotosViewApi.tsx`.

### 1.3 Funktionsumfang in einem Satz

Das Backend meldet sich mit Benutzername/Passwort an der DSM-Web-API an, listet die Alben des
Benutzers, listet die Medien-Objekte des ausgewählten Albums samt Metadaten, und reicht die
Binärdaten jedes einzelnen Bildes/Videos als **Proxy** an das Frontend durch. Das Frontend hält die
**Metadaten** (nicht die Bilddaten) in IndexedDB vor, mischt die Liste und zeigt sie als Slideshow
mit Uhr-, Wetter- und Ort-Overlay an.

---

## 2. Systemarchitektur der Foto-Kette

```mermaid
flowchart TD
    subgraph Display["Wand-Display (Browser, Kiosk-Modus)"]
        PV["PhotosViewApi.tsx<br/>Slideshow-Rendering"]
        PC["usePhotoCache.ts<br/>IndexedDB-Metadaten-Cache"]
        SS["SlideshowService.ts<br/>Shuffle / Transition / Uhrzeit"]
        PV --> PC
        PV --> SS
    end

    subgraph Backend["FamilyHub-Backend (Spring Boot, Port 8081)"]
        CTRL["SynologyPhotosController<br/>/api/synology/**"]
        SVC["SynologyPhotosService<br/>Session-Cache, API-Aufrufe"]
        SET["SettingsService<br/>Tabelle settings"]
        ENC["TokenEncryptionService<br/>AES-256-GCM"]
        RT["synologyRestTemplate<br/>TrustAll-SSL, 30s Connect-Timeout"]
        CTRL --> SVC
        SVC --> SET
        SVC --> ENC
        SVC --> RT
    end

    subgraph NAS["Synology NAS (lokales Netz)"]
        AUTH["/photo/webapi/auth.cgi<br/>SYNO.API.Auth"]
        ENTRY["/photo/webapi/entry.cgi<br/>SYNO.Foto.*"]
        SHARE["/photo/mo/sharing/webapi/entry.cgi<br/>SYNO.Foto.Download (geteilte Alben)"]
    end

    PC -->|"GET /api/synology/photos?limit=500"| CTRL
    PV -->|"GET /api/synology/photo/{id}?cache_key=..."| CTRL
    RT --> AUTH
    RT --> ENTRY
    RT --> SHARE

    PV -.->|"Reverse-Geocoding der GPS-Daten"| NOM["nominatim.openstreetmap.org<br/>(Internet!)"]
```

Beteiligte Dateien im Altsystem:

| Schicht | Datei |
|---------|-------|
| Backend-Service | `familyhub/backend/src/main/kotlin/com/familyhub/service/SynologyPhotosService.kt` |
| Backend-Controller | `familyhub/backend/src/main/kotlin/com/familyhub/controller/SynologyPhotosController.kt` |
| HTTP-Client-Konfiguration | `familyhub/backend/src/main/kotlin/com/familyhub/config/SynologyConfig.kt` |
| DTOs | `familyhub/backend/src/main/kotlin/com/familyhub/dto/SynologyDtos.kt` |
| Fehlerabbildung | `familyhub/backend/src/main/kotlin/com/familyhub/config/GlobalExceptionHandler.kt` |
| Settings-Persistenz | `familyhub/backend/src/main/kotlin/com/familyhub/service/SettingsService.kt` |
| Verschlüsselung | `familyhub/backend/src/main/kotlin/com/familyhub/service/TokenEncryptionService.kt` |
| Slideshow-View | `familyhub/frontend/src/components/views/PhotosViewApi.tsx` |
| Metadaten-Cache | `familyhub/frontend/src/hooks/usePhotoCache.ts` |
| Slideshow-Hilfsfunktionen | `familyhub/frontend/src/services/photos/SlideshowService.ts` |
| Einstellungen NAS | `familyhub/frontend/src/components/settings/SynologySettings.tsx` |
| Einstellungen Slideshow | `familyhub/frontend/src/components/settings/SlideshowSettings.tsx` |
| Einrichtungsassistent | `familyhub/frontend/src/components/settings/SynologySetupWizard.tsx` |

---

## 3. Synology-Photos-API im Detail

Angesprochen wird die **DSM Web API** des Pakets **Synology Photos** (DSM 7.x). Es werden
ausschließlich `GET`-Requests verwendet; alle Parameter, auch Benutzername und Passwort, stehen im
**Query-String**. Antworten sind JSON (Content-Type wird nicht ausgewertet) bzw. bei Downloads reine
Binärdaten.

Verwendete API-Namen:

| API-Name | Version | Verwendete Methoden |
|----------|---------|---------------------|
| `SYNO.API.Auth` | `3` | `login`, `logout` |
| `SYNO.Foto.Browse.Album` | `1` | `list` |
| `SYNO.Foto.Browse.Item` | `1` | `list` |
| `SYNO.Foto.Download` | `1` | `download` |

**Wichtig:** Es werden ausschließlich die `SYNO.Foto.*`-APIs des **persönlichen Bereichs** des
angemeldeten Benutzers verwendet. Die `SYNO.FotoTeam.*`-Varianten (Shared Space / gemeinsamer
Bereich der NAS) werden **nicht** angesprochen. Fotos aus dem Shared Space sind über FamilyHub
folglich nicht erreichbar, es sei denn, sie liegen in einem Album, das dem FamilyHub-Benutzer
persönlich geteilt wurde (siehe [3.6](#36-album-auswahl-und-passphrase)).

Ebenfalls **nicht** verwendet wird `SYNO.API.Info` (Discovery der API-Pfade/-Versionen). Pfade und
Versionen sind im Code fest verdrahtet. Der DTO `SynoApiInfoData` in `SynologyDtos.kt` bildet eine
`SYNO.API.Info`-Antwort ab, ist aber im Code als `@Suppress("unused")` markiert und wird nirgends
deserialisiert.

Ebenfalls **nicht** verwendet wird `SYNO.Foto.Thumbnail` — obwohl der DTO diese API erwähnt und das
Frontend eine `thumbnailUrl` erhält. Siehe [3.8](#38-binär-download-von-bild-und-video).

### 3.1 Adressierung, Ports, Protokolle, Zertifikate

#### Basis-URL

Der Benutzer gibt in den Einstellungen eine **DSM-URL** ein, z. B. `http://nas.example.local:5000`.
Diese wird beim Verbinden normalisiert (`parseDsmBaseUri`):

1. Trimmen von Leerzeichen, Entfernen eines abschließenden `/`.
2. Parsen als `java.net.URI`. Bei `URISyntaxException` → Fehler `"Invalid Synology DSM URL"`.
3. Validierung:
   - Schema muss (case-insensitiv) `http` oder `https` sein.
   - Host darf nicht leer sein.
   - `userInfo`, `query` und `fragment` müssen **null** sein, sonst Fehler
     `"Invalid Synology DSM URL"`. (Damit ist `http://user:pass@nas...` verboten.)
4. Rekonstruktion als `URI(scheme, null, host.lowercase(), port, null, null, null)` —
   **der Pfad wird verworfen.** Eine Eingabe `http://nas.example.local:5000/photo` wird also
   intern zu `http://nas.example.local:5000`.
5. Ist kein Port angegeben (`port == -1`), wird **kein** Port in die URL geschrieben; es gilt der
   Standardport des Schemas (80 bzw. 443). Ein Default auf 5000/5001 findet **nicht** statt.

Der so normalisierte Wert wird als Setting `synology.dsm_url` gespeichert und bei jedem
API-Aufruf erneut aus der Datenbank gelesen und erneut durch `parseDsmBaseUri` geschickt.

#### Pfade

| Konstante | Wert | Verwendung |
|-----------|------|------------|
| `API_PATH` | `photo/webapi` | Normale API-Aufrufe und Auth |
| `SHARING_API_PATH` | `photo/mo/sharing/webapi` | Download aus geteilten Alben (mit Passphrase) |
| `AUTH_CGI` | `auth.cgi` | Login/Logout |
| `ENTRY_CGI` | `entry.cgi` | Alle übrigen Aufrufe |

Daraus ergeben sich genau drei Endpoint-Pfade:

```
/photo/webapi/auth.cgi
/photo/webapi/entry.cgi
/photo/mo/sharing/webapi/entry.cgi
```

#### Ports und Protokoll

Es gibt **keine Port-Logik im Code**. Der Port ist Teil der vom Benutzer eingegebenen DSM-URL.
Die UI weist darauf hin (`SynologySettings.tsx`):

> „Die Adresse deines Synology NAS (Port 5000 fur HTTP, 5001 fur HTTPS)“

Platzhalter im Eingabefeld: `http://nas.local:5000`.

#### Zertifikatsbehandlung

Für die Synology-Kommunikation wird ein **eigener** `RestTemplate` unter dem Bean-Namen
`synologyRestTemplate` erzeugt (`SynologyConfig.kt`). Er ist bewusst so konfiguriert, dass
selbstsignierte Zertifikate akzeptiert werden:

```kotlin
val sslContext = SSLContextBuilder.create()
    .loadTrustMaterial(null, TrustAllStrategy.INSTANCE)   // akzeptiert JEDES Zertifikat
    .build()

val sslSocketFactory = SSLConnectionSocketFactoryBuilder.create()
    .setSslContext(sslContext)
    .setHostnameVerifier(NoopHostnameVerifier.INSTANCE)   // keine Hostname-Prüfung
    .build()
```

| Einstellung | Wert |
|-------------|------|
| HTTP-Client | Apache HttpClient 5 (`org.apache.hc.client5`) über `HttpComponentsClientHttpRequestFactory` |
| Trust-Strategie | `TrustAllStrategy.INSTANCE` — **jede** Zertifikatskette wird akzeptiert |
| Hostname-Verifier | `NoopHostnameVerifier.INSTANCE` — Hostname wird **nicht** geprüft |
| Connection-Manager | `PoolingHttpClientConnectionManager` (Default-Pool-Größen, nicht überschrieben) |
| Connect-Timeout | **30 000 ms** (`setConnectTimeout(30000)`) |
| Connection-Request-Timeout | **30 000 ms** (`setConnectionRequestTimeout(30000)`) |
| Read-/Socket-Timeout | **nicht gesetzt** → unbegrenzt (siehe Schwächen) |
| Redirect-Handling | Default von HttpClient 5 (Redirects werden gefolgt) |

Es gibt **keine** Konfigurationsmöglichkeit, die Zertifikatsprüfung zu aktivieren.

#### Application-Properties

In `familyhub/backend/src/main/resources/application.yml` existieren **keine**
Synology-spezifischen Properties. Die gesamte NAS-Konfiguration liegt in der Datenbank-Tabelle
`settings`. Relevant sind lediglich indirekt:

```yaml
server:
  port: 8081
familyhub:
  security:
    settings-pin: ${FAMILYHUB_SETTINGS_PIN:1234}
    pin-timeout-minutes: ${FAMILYHUB_PIN_TIMEOUT:30}
    encryption-key: ${FAMILYHUB_ENCRYPTION_KEY:defaultKey12345678901234567890123}
```

`familyhub.security.encryption-key` wird für die Verschlüsselung des NAS-Passworts verwendet.

In `familyhub/.env_example` existiert **keine** Synology-Variable. Dokumentiert sind dort nur
`SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`,
`FAMILYHUB_SETTINGS_PIN`, `FAMILYHUB_PIN_TIMEOUT`, `FAMILYHUB_ENCRYPTION_KEY`,
`CREDENTIALS_ENCRYPTION_KEY`, `FAMILYHUB_RATE_LIMIT_ENABLED`, `FAMILYHUB_RATE_LIMIT_RPM`.

---

### 3.2 Login / Authentifizierung

#### Request

```http
GET /photo/webapi/auth.cgi
    ?api=SYNO.API.Auth
    &version=3
    &method=login
    &account=familyhub
    &passwd=<redacted>
Host: nas.example.local:5000
```

Beispiel-URL mit Platzhalter-Host (eine Zeile, hier umbrochen):

```
http://nas.example.local:5000/photo/webapi/auth.cgi?api=SYNO.API.Auth&version=3
    &method=login&account=familyhub&passwd=<redacted>
```

Parameter im Detail:

| Parameter | Wert | Pflicht | Bemerkung |
|-----------|------|---------|-----------|
| `api` | `SYNO.API.Auth` | ja | fest verdrahtet |
| `version` | `3` | ja | fest verdrahtet |
| `method` | `login` | ja | |
| `account` | Benutzername, z. B. `familyhub` | ja | aus Setting `synology.username` bzw. aus dem Connect-Request |
| `passwd` | Klartext-Passwort | ja | Im Klartext im Query-String. Aus Setting `synology.password_encrypted`, vorher AES-entschlüsselt. |

**Bewusst NICHT gesetzt** (obwohl in der Synology-Praxis üblich):

| Parameter | Ist-Zustand |
|-----------|-------------|
| `session` | **wird nicht gesendet** (weder `FileStation` noch `SynologyPhotos`) |
| `format` (`sid` / `cookie`) | **wird nicht gesendet** → DSM liefert per Default `sid` im JSON-Body |
| `otp_code` | **wird nicht gesendet** → 2FA-Konten können sich nicht anmelden |
| `enable_syno_token` | **wird nicht gesendet** |
| `device_id` / `device_name` | **wird nicht gesendet** (kein Trusted-Device-Mechanismus) |

Die URL wird über `UriComponentsBuilder … .build().encode().toUri()` gebaut. `encode()` prozentkodiert
Zeichen, die in einer Query-Komponente unzulässig sind. Zeichen wie `&`, `=` oder `+`, die in einer
Query **zulässig** sind, werden dabei **nicht** maskiert — ein Passwort mit diesen Zeichen zerlegt den
Query-String (siehe [Kapitel 11](#11-bekannte-schwächen--offene-punkte)).

#### Response

Erwartetes JSON (Wrapper `SynoApiResponse<SynoLoginData>`):

```json
{
  "success": true,
  "data": {
    "sid": "<redacted>",
    "did": "<redacted>"
  }
}
```

Ausgewertete Felder:

| Feld | Typ | Verwendung |
|------|-----|------------|
| `success` | boolean | `false` → Fehlerpfad, siehe unten |
| `data.sid` | String, nullable | **Die Session-ID.** Ist sie `null`, wird `BadRequestException("No session ID returned from login")` geworfen. |
| `data.did` | String, nullable | wird deserialisiert, aber **nicht verwendet** |
| `error.code` | Int | Fehlercode bei `success == false` |

Alle unbekannten Felder werden ignoriert (`@JsonIgnoreProperties(ignoreUnknown = true)` auf allen
Synology-DTOs).

Fehlerantwort:

```json
{ "success": false, "error": { "code": 400 } }
```

#### Abbildung der Login-Fehlercodes

| Synology-Fehlercode | Meldung im Backend | Bedeutung |
|---------------------|--------------------|-----------|
| `400` | `"Invalid credentials"` | Falscher Benutzername oder falsches Passwort |
| `401` | `"Account disabled"` | Konto deaktiviert |
| `402` | `"Permission denied"` | Keine Berechtigung |
| `403` | `"Two-factor authentication required"` | 2FA erforderlich — **von FamilyHub nicht unterstützt** |
| `404` | `"Two-factor authentication failed"` | 2FA-Code falsch |
| alle anderen | `"Login failed with error code <code>"` | |

Diese Meldungen werden als `BadRequestException` geworfen und vom `GlobalExceptionHandler` als
HTTP `400 Bad Request` mit JSON-Body ausgeliefert:

```json
{
  "status": 400,
  "error": "Bad Request",
  "message": "Invalid credentials",
  "timestamp": "2026-07-21T09:00:00Z"
}
```

#### Logging

Vor dem Login wird geloggt (Level `INFO`):

```
Attempting login to Synology DSM: http://nas.example.local:5000/photo/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=login&account=familyhub&passwd=[REDACTED]
```

Die Maskierung erfolgt über `sanitizeUrl()`, das per Regex `(_sid|passwd)=[^&]+` durch
`$1=[REDACTED]` ersetzt. Maskiert werden also nur `_sid` und `passwd`, **nicht** `passphrase`
(siehe Schwächen).

---

### 3.3 Session-Verwaltung, Ablauf und Re-Login

#### Speicherort der Session

Die Session-ID (`sid`) wird **ausschließlich im Arbeitsspeicher** des Backends gehalten:

```kotlin
private data class SessionInfo(val sid: String, val expiresAt: Long)
private val session = AtomicReference<SessionInfo?>(null)
```

Eigenschaften:

| Eigenschaft | Wert |
|-------------|------|
| Speicherort | `AtomicReference` im Singleton-Service, **nicht** in DB, **nicht** in Redis, **nicht** auf Platte |
| Gültigkeitsdauer im Cache | **14 Minuten** (`SESSION_REFRESH_INTERVAL = 14.minutes`) |
| Kommentar im Code | „Session expires after 15 minutes, refresh after 14“ — die 15 Minuten sind eine **Annahme** über DSM, nicht aus einer DSM-Antwort abgeleitet. |
| Anzahl paralleler Sessions | genau **eine** — für alle FamilyHub-Benutzer und alle Anfragen gemeinsam |
| Persistenz über Neustart | keine; nach Backend-Neustart erfolgt beim ersten Zugriff ein Neu-Login |

#### Ablauf `getOrRefreshSid()`

1. Wenn eine gecachte `SessionInfo` existiert **und** `System.currentTimeMillis() < expiresAt`,
   wird die gespeicherte `sid` zurückgegeben.
2. Andernfalls:
   - `synology.dsm_url` lesen → sonst `BadRequestException("Synology not configured - DSM URL missing")`
   - `synology.username` lesen → sonst `BadRequestException("Synology username not configured")`
   - `synology.password_encrypted` lesen → sonst `BadRequestException("Synology password not configured")`
   - Passwort mit `TokenEncryptionService.decrypt()` entschlüsseln
   - `login(...)` aufrufen
   - `expiresAt = System.currentTimeMillis() + 14 min` setzen und Session cachen
   - neue `sid` zurückgeben

Ein **expliziter Ablauf-/Ping-Check gegen das NAS findet nicht statt.** Die Gültigkeit wird
ausschließlich über die lokale 14-Minuten-Uhr geschätzt.

#### Re-Login bei „Session abgelaufen“ mitten im Aufruf

Für alle JSON-API-Aufrufe (`callSynoApi`) gilt folgende Retry-Logik:

```mermaid
sequenceDiagram
    participant SVC as SynologyPhotosService
    participant NAS as Synology NAS

    SVC->>SVC: getOrRefreshSid() (evtl. Login)
    SVC->>NAS: GET entry.cgi?...&_sid=<redacted>
    NAS-->>SVC: {"success":false,"error":{"code":106}}
    Note over SVC: Fehlercode ∈ {105,106,107,119}<br/>→ SynologyAuthException
    SVC->>SVC: clearSession()  (AtomicReference := null)
    SVC->>NAS: GET auth.cgi?...&method=login (Re-Login)
    NAS-->>SVC: {"success":true,"data":{"sid":"<neu>"}}
    SVC->>NAS: GET entry.cgi?...&_sid=<neu>   (Retry, genau 1x)
    alt Erfolg
        NAS-->>SVC: {"success":true,"data":{...}}
    else Erneut Auth-Fehler
        NAS-->>SVC: {"success":false,"error":{"code":106}}
        SVC->>SVC: throw SynologyAuthException("Synology session expired. Re-authentication failed.")
    end
```

| Aspekt | Ist-Zustand |
|--------|-------------|
| Auslösende Fehlercodes | `105`, `106`, `107`, `119` (Konstante `AUTH_ERROR_CODES`) |
| Anzahl Retries | genau **einer** |
| Backoff / Wartezeit | keine |
| Gilt für Binär-Downloads (`downloadFromSynology`) | **nein** — dort gibt es keinen Retry (siehe Schwächen) |

Bedeutung der abgefangenen Codes (DSM-Standardcodes):

| Code | Bedeutung |
|------|-----------|
| `105` | The logged-in session does not have permission / unzureichende Rechte |
| `106` | Session timeout — die Session ist abgelaufen |
| `107` | Session interrupted by duplicate login — jemand anderes hat sich mit demselben Konto angemeldet |
| `119` | SID not found / ungültige Session-ID |

Weitere DSM-Codes, die im Code **nicht** gesondert behandelt werden (sie führen zu generischem
HTTP 400): `100` (unknown error), `101` (invalid parameter), `102` (API does not exist), `103`
(method does not exist), `104` (version not supported), `117` (kommt in der Praxis bei
Download-Fehlern vor und wird nur als JSON-in-Bytes erkannt, siehe [3.8](#38-binär-download-von-bild-und-video)).

---

### 3.4 Logout

Logout wird **nur an einer einzigen Stelle** aufgerufen: beim `connect()`, direkt nach dem
Verifizierungs-Login. Es gibt **keinen** Logout beim `disconnect()` und keinen beim
Backend-Shutdown.

```http
GET /photo/webapi/auth.cgi
    ?api=SYNO.API.Auth
    &version=3
    &method=logout
    &_sid=<redacted>
Host: nas.example.local:5000
```

| Eigenschaft | Wert |
|-------------|------|
| Parameter `session` | wird **nicht** gesendet |
| Antwortauswertung | **keine** — der Response-String wird verworfen |
| Fehlerbehandlung | in `runCatching { }` gekapselt; bei Exception nur ein `WARN`-Log `"Logout failed: <message>"` |

---

### 3.5 Album-Abruf

#### Request

```http
GET /photo/webapi/entry.cgi
    ?api=SYNO.Foto.Browse.Album
    &version=1
    &method=list
    &_sid=<redacted>
    &offset=0
    &limit=100
Host: nas.example.local:5000
```

Beispiel-URL:

```
http://nas.example.local:5000/photo/webapi/entry.cgi?api=SYNO.Foto.Browse.Album&version=1
    &method=list&_sid=<redacted>&offset=0&limit=100
```

| Parameter | Wert | Bemerkung |
|-----------|------|-----------|
| `api` | `SYNO.Foto.Browse.Album` | |
| `version` | `1` | |
| `method` | `list` | |
| `_sid` | Session-ID | wird immer **vor** den restlichen Parametern eingefügt |
| `offset` | `"0"` | **fest verdrahtet**, keine Paginierung |
| `limit` | `"100"` | **fest verdrahtet** → maximal 100 Alben werden je gesehen |

**Nicht gesendet:** `sort_by`, `sort_direction`, `additional`, `category`, `type`. Die Sortierung
ist damit die DSM-Default-Sortierung (im Code nicht ermittelbar, nach Beobachtung DSM-seitig
i. d. R. nach Album-Name bzw. Erstellzeitpunkt).

#### Response

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": 3,
        "name": "FamilyHub Slideshow",
        "item_count": 128,
        "shared": true,
        "passphrase": "<redacted>",
        "cant_migrate_condition": {}
      }
    ]
  }
}
```

Ausgewertete Felder (`SynoAlbumItem`):

| JSON-Feld | Kotlin-Feld | Typ | Default | Verwendung |
|-----------|-------------|-----|---------|------------|
| `id` | `id` | Long | — (Pflicht) | Album-ID, wird als `synology.album_id` gespeichert |
| `name` | `name` | String | — (Pflicht) | Anzeigename, wird als `synology.album_name` gespeichert |
| `item_count` | `itemCount` | Int | `0` | Anzahl Medien; wird als `photoCount` an das Frontend gemeldet |
| `shared` | `shared` | Boolean | `false` | nur zum Loggen und für das DTO |
| `passphrase` | `passphrase` | String? | `null` | **Kritisch:** entscheidet über den Download-Endpoint |
| `cant_migrate_condition` | `cantMigrateCondition` | Any? | `null` | deserialisiert, aber ungenutzt |

Nach außen (an das Frontend) wird ein reduziertes DTO gegeben:

```json
[
  { "id": 3, "name": "FamilyHub Slideshow", "itemCount": 128, "shared": true, "coverUrl": null }
]
```

Die `passphrase` wird **nicht** an das Frontend gegeben. `coverUrl` ist **immer `null`** — es gibt
keine Album-Vorschaubilder.

---

### 3.6 Album-Auswahl und Passphrase

`selectAlbum(albumId)` führt aus:

1. Erneuter Aufruf `SYNO.Foto.Browse.Album/list` (offset 0, limit 100) — die Liste aus dem
   vorherigen Aufruf wird **nicht** wiederverwendet.
2. Suche des Albums per `id`. Nicht gefunden → `BadRequestException("Album not found: <id>")` → HTTP 400.
3. `synology.album_id` = `<albumId>` (als String)
4. `synology.album_name` = `<album.name>`
5. Wenn `album.passphrase` nicht leer: `synology.album_passphrase` = `<passphrase>` **im Klartext**.
   Sonst: Setting `synology.album_passphrase` wird **gelöscht**.
6. Log (Level `INFO`): `Selected album: <name> (ID: <id>, shared: <bool>)`

#### Bedeutung der Passphrase

Synology vergibt für **geteilte Alben** (Shared Albums / Freigabe-Links) eine `passphrase`. FamilyHub
nutzt diese als Weiche für den Download-Endpoint:

| Passphrase vorhanden? | Interpretation | Verwendeter Download-Pfad |
|-----------------------|----------------|---------------------------|
| ja (nicht leer/blank) | „geteiltes Album“ | `/photo/mo/sharing/webapi/entry.cgi` mit zusätzlichem Parameter `passphrase` |
| nein | „persönliches Album“ | `/photo/webapi/entry.cgi` ohne `passphrase` |

Es gibt in FamilyHub **keine** explizite Auswahl „Personal Space vs. Shared Space“. Die Weiche
ergibt sich allein aus dem Vorhandensein einer Passphrase. Der eigentliche Synology-„Shared Space“
(Team-Bereich, `SYNO.FotoTeam.*`) ist damit nicht adressierbar.

#### Nachträgliches Nachladen der Passphrase (`getOrFetchPassphrase()`)

Vor jedem Download wird geprüft:

1. Ist `synology.album_passphrase` gesetzt → diesen Wert verwenden.
2. Sonst: `synology.album_id` lesen (fehlt sie → `null`).
3. `SYNO.Foto.Browse.Album/list` aufrufen (in `runCatching`, Fehler werden geschluckt → `null`).
4. Passende Album-ID suchen, `passphrase` extrahieren; falls nicht leer, dauerhaft in
   `synology.album_passphrase` speichern.

Dadurch entsteht bei jedem Download eines Fotos aus einem **persönlichen** Album (ohne Passphrase)
ein **zusätzlicher** Album-Listen-Aufruf gegen das NAS, weil der Nicht-Vorhandensein-Fall nicht
negativ gecacht wird (siehe Schwächen).

---

### 3.7 Foto-/Medien-Listen-Abruf

#### Request

```http
GET /photo/webapi/entry.cgi
    ?api=SYNO.Foto.Browse.Item
    &version=1
    &method=list
    &_sid=<redacted>
    &album_id=3
    &offset=0
    &limit=100
    &additional=["thumbnail","resolution","gps","video_meta"]
Host: nas.example.local:5000
```

Beispiel-URL (die eckigen Klammern und Anführungszeichen werden beim Bau der `java.net.URI`
prozentkodiert):

```
http://nas.example.local:5000/photo/webapi/entry.cgi?api=SYNO.Foto.Browse.Item&version=1
    &method=list&_sid=<redacted>&album_id=3&offset=0&limit=100
    &additional=%5B%22thumbnail%22,%22resolution%22,%22gps%22,%22video_meta%22%5D
```

| Parameter | Typ / Wert | Herkunft |
|-----------|-----------|----------|
| `api` | `SYNO.Foto.Browse.Item` | fest |
| `version` | `1` | fest |
| `method` | `list` | fest |
| `_sid` | Session-ID | Session-Cache |
| `album_id` | Long | Setting `synology.album_id`. Fehlt es → `BadRequestException("No album selected")` (HTTP 400) |
| `offset` | Int, Default `0` | vom REST-Aufrufer durchgereicht |
| `limit` | Int, Default `100` | vom REST-Aufrufer durchgereicht; das Frontend fordert `limit=500` an |
| `additional` | JSON-Array-Literal `["thumbnail","resolution","gps","video_meta"]` | fest verdrahtet |

**Nicht gesendet:** `sort_by`, `sort_direction`, `type`, `passphrase`, `keyword`, `time_start`,
`time_end`. Es findet also **keine serverseitige Sortierung, Filterung oder Zufallsauswahl** statt.
Die Reihenfolge ist die DSM-Default-Reihenfolge des Albums.

**Filterung nach Medientyp:** Es wird **nicht** gefiltert. Videos werden mit ausgeliefert und in der
Slideshow abgespielt (siehe [8. Slideshow-Verhalten](#8-slideshow-verhalten)).

#### Response

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": 40123,
        "filename": "IMG_2024.jpg",
        "filesize": 3821004,
        "type": "photo",
        "time": 1719312000,
        "indexed_time": 1719400000,
        "additional": {
          "thumbnail": {
            "cache_key": "40123_1719312000",
            "unit_id": 40123,
            "m": "ready",
            "xl": "ready"
          },
          "resolution": { "width": 4032, "height": 3024 },
          "gps": { "latitude": 48.1372, "longitude": 11.5756 },
          "video_meta": {
            "duration": 15000,
            "video_codec": "h264",
            "audio_codec": "aac",
            "bitrate": 12000000,
            "framerate": 30
          }
        }
      }
    ]
  }
}
```

Ausgewertete Felder:

| JSON-Pfad | Kotlin-Feld | Typ | Default | Verwendung |
|-----------|-------------|-----|---------|------------|
| `id` | `id` | Long | Pflicht | Item-ID; Basis für `fullUrl` |
| `filename` | `filename` | String | Pflicht | Anzeige/`alt`-Attribut |
| `filesize` | `filesize` | Long | `0` | deserialisiert, **ungenutzt** |
| `type` | `type` | String | `"photo"` | `"video"` → Video-Behandlung, alles andere → Foto |
| `time` | `time` | Long? | `null` | Unix-Sekunden; wird zu `Instant.ofEpochSecond(t).toString()` als `takenAt` |
| `indexed_time` | `indexedTime` | Long? | `null` | deserialisiert, **ungenutzt** |
| `additional.thumbnail.cache_key` | `cacheKey` | String? | `null` | wird in die URLs eingesetzt; bei `null` → Leerstring |
| `additional.thumbnail.unit_id` | `unitId` | Long? | `null` | wird als Pfadsegment der `thumbnailUrl` verwendet, Fallback ist `id` |
| `additional.thumbnail.m` / `.xl` | `m`, `xl` | String? | `null` | deserialisiert, **ungenutzt** |
| `additional.resolution.width/height` | `width`, `height` | Int | `0` | an das Frontend gemeldet (dort ungenutzt) |
| `additional.gps.latitude/longitude` | `latitude`, `longitude` | Double? | `null` | an das Frontend gemeldet; dort für Reverse-Geocoding verwendet |
| `additional.video_meta.duration` | `duration` | Int? (ms) | `null` | wird durch **1000 geteilt** → Sekunden |
| `additional.video_meta.video_codec` u. a. | | | | deserialisiert, **ungenutzt** |

#### Transformation in das FamilyHub-DTO

```kotlin
val cacheKey = additional?.thumbnail?.cacheKey.orEmpty()
val unitId   = additional?.thumbnail?.unitId ?: id
val isVideo  = type == "video"

SynologyPhotoResponse(
    id           = id,
    filename     = filename,
    type         = if (isVideo) "video" else "photo",
    width        = additional?.resolution?.width,
    height       = additional?.resolution?.height,
    takenAt      = time?.let { Instant.ofEpochSecond(it).toString() },
    thumbnailUrl = "/api/synology/thumbnail/$unitId?cache_key=$cacheKey",
    fullUrl      = if (isVideo) "/api/synology/video/$id"
                   else         "/api/synology/photo/$id?cache_key=$cacheKey",
    cacheKey     = cacheKey,
    latitude     = additional?.gps?.latitude,
    longitude    = additional?.gps?.longitude,
    locationName = null,                       // immer null
    duration     = additional?.videoMeta?.duration?.let { it / 1000 }
)
```

Beispiel-Antwort an das Frontend:

```json
[
  {
    "id": 40123,
    "filename": "IMG_2024.jpg",
    "type": "photo",
    "width": 4032,
    "height": 3024,
    "takenAt": "2024-06-25T10:00:00Z",
    "thumbnailUrl": "/api/synology/thumbnail/40123?cache_key=40123_1719312000",
    "fullUrl": "/api/synology/photo/40123?cache_key=40123_1719312000",
    "cacheKey": "40123_1719312000",
    "latitude": 48.1372,
    "longitude": 11.5756,
    "locationName": null,
    "duration": null
  }
]
```

`locationName` ist **immer** `null` — es findet backendseitig kein Reverse-Geocoding statt.

---

### 3.8 Binär-Download von Bild und Video

Dies ist der zentrale und zugleich der überraschendste Teil der Implementierung.

#### Kernaussage

**`SYNO.Foto.Thumbnail` wird NICHT verwendet.** Es gibt **keine Auflösungsstufen**. Sowohl der
Endpoint `/api/synology/photo/{id}` als auch `/api/synology/thumbnail/{id}` rufen dieselbe
Service-Methode `getPhotoBytes(...)` auf, die den `size`-Parameter (`"xl"` bzw. `"m"`) und den
`cacheKey` **vollständig ignoriert** und in beiden Fällen die **Originaldatei in voller Auflösung**
über `SYNO.Foto.Download` herunterlädt:

```kotlin
fun getPhotoBytes(photoId: Long, cacheKey: String, size: String = "xl"): ByteArray =
    downloadFromSynology(photoId, "photo")     // cacheKey und size werden nicht benutzt

fun getVideoBytes(videoId: Long): ByteArray =
    downloadFromSynology(videoId, "video")
```

Damit lädt das Wand-Display für **jedes** angezeigte Bild die **Originaldatei** (bei modernen
Smartphone-Fotos regelmäßig 3–8 MB) über das Backend.

#### Request — persönliches Album (ohne Passphrase)

```http
GET /photo/webapi/entry.cgi
    ?api=SYNO.Foto.Download
    &version=1
    &method=download
    &id=40123
    &_sid=<redacted>
Host: nas.example.local:5000
```

#### Request — geteiltes Album (mit Passphrase)

```http
GET /photo/mo/sharing/webapi/entry.cgi
    ?api=SYNO.Foto.Download
    &version=1
    &method=download
    &id=40123
    &passphrase=<redacted>
    &_sid=<redacted>
Host: nas.example.local:5000
```

| Parameter | Wert | Bemerkung |
|-----------|------|-----------|
| `api` | `SYNO.Foto.Download` | |
| `version` | `1` | |
| `method` | `download` | |
| `id` | Item-ID (Long) | **Einzelwert, kein Array.** Der in Synology übliche Parameter `unit_id` als JSON-Array wird nicht verwendet. |
| `passphrase` | Album-Passphrase | **nur** im Sharing-Pfad |
| `_sid` | Session-ID | |

**Nicht gesendet:** `cache_key`, `type`, `size`, `mtime`, `force_download`.

Zum Vergleich — so **würde** ein Thumbnail-Aufruf aussehen, er ist im Altsystem aber **nicht
implementiert** (nur zur Einordnung, im Code nicht vorhanden):
`api=SYNO.Foto.Thumbnail&version=1&method=get&id=<unit_id>&cache_key=<cache_key>&type=unit&size=<sm|m|xl>`.

#### Antwortverarbeitung

```kotlin
val bytes = restTemplate.getForObject(uri, ByteArray::class.java)
if (bytes == null || isSynoErrorResponse(bytes)) { … throw BadRequestException(…) }
```

Da DSM Fehler auch bei Binär-Endpoints als **JSON mit HTTP 200** zurückgibt, prüft das Backend
heuristisch:

```kotlin
private fun isSynoErrorResponse(bytes: ByteArray): Boolean {
    if (bytes.size > 200) return false                    // größer als 200 Byte -> gilt als Bild
    val text = String(bytes, Charsets.UTF_8)
    return text.contains("\"success\":false") || text.contains("\"error\"")
}
```

Erkanntes Fehlerbeispiel: `{"error":{"code":117},"success":false}`.

Bei erkanntem Fehler: `ERROR`-Log `Download failed for photo id=<id>: <Rohtext>` und
`BadRequestException("Failed to download photo <id> from Synology")` → HTTP 400.

#### Durchreichung an das Frontend (Proxy-Modell)

Das Backend agiert als **vollständiger Proxy**. Es gibt **keine** direkten NAS-Links im Frontend und
**keine** Base64-Kodierung. Der komplette Bild-/Video-Body wird als `ByteArray` in den Heap des
Backends geladen und dann als HTTP-Response ausgeliefert:

| FamilyHub-Endpoint | Content-Type | Cache-Control | Weitere Header |
|--------------------|--------------|---------------|----------------|
| `GET /api/synology/photo/{id}?cache_key=…` | `image/jpeg` (`MediaType.IMAGE_JPEG`) | `max-age=3600` (1 Stunde) | — |
| `GET /api/synology/thumbnail/{id}?cache_key=…` | `image/jpeg` | `max-age=86400` (24 Stunden) | — |
| `GET /api/synology/video/{id}` | `video/mp4` | `max-age=3600` | `Content-Disposition: inline` |

Der Content-Type ist **fest verdrahtet**. PNG-, HEIC-, GIF- oder WebP-Dateien werden fälschlich als
`image/jpeg` deklariert; alle Videos als `video/mp4` unabhängig vom tatsächlichen Container.

**Kein Streaming, keine Range-Requests:** `ResponseEntity<ByteArray>` liefert den kompletten Body.
`Accept-Ranges`/`206 Partial Content` wird nicht unterstützt. Für Videos bedeutet das, dass der
Browser die vollständige Datei laden muss, bevor die Wiedergabe zuverlässig startet, und dass das
Backend die komplette Videodatei im Speicher hält.

#### Wichtiger Konsistenzbruch: `thumbnailUrl` nutzt `unit_id`

`thumbnailUrl` wird als `/api/synology/thumbnail/{unit_id}` erzeugt, `fullUrl` dagegen als
`/api/synology/photo/{id}`. Beide Endpoints leiten den Pfad-Parameter unverändert als
`SYNO.Foto.Download&id=…` weiter. `unit_id` und `id` sind in Synology Photos **nicht garantiert
identisch** (bei Live-Photos/Bursts weichen sie ab). Die `thumbnailUrl` ist im Frontend derzeit
ohnehin ungenutzt — sie wird in IndexedDB gespeichert, aber in keiner Komponente gerendert.

---

### 3.9 Vollständige Tabelle aller Synology-API-Requests

| # | Zweck | Pfad | `api` | `version` | `method` | Weitere Query-Parameter | Erwartete Rückgabe |
|---|-------|------|-------|-----------|----------|-------------------------|--------------------|
| 1 | Login | `/photo/webapi/auth.cgi` | `SYNO.API.Auth` | `3` | `login` | `account=<user>`, `passwd=<redacted>` | `{"success":true,"data":{"sid":"…","did":"…"}}` |
| 2 | Logout | `/photo/webapi/auth.cgi` | `SYNO.API.Auth` | `3` | `logout` | `_sid=<redacted>` | ignoriert |
| 3 | Alben auflisten | `/photo/webapi/entry.cgi` | `SYNO.Foto.Browse.Album` | `1` | `list` | `_sid`, `offset=0`, `limit=100` | `{"success":true,"data":{"list":[{id,name,item_count,shared,passphrase}]}}` |
| 4 | Medien eines Albums auflisten | `/photo/webapi/entry.cgi` | `SYNO.Foto.Browse.Item` | `1` | `list` | `_sid`, `album_id=<id>`, `offset=<n>`, `limit=<n>`, `additional=["thumbnail","resolution","gps","video_meta"]` | `{"success":true,"data":{"list":[{id,filename,filesize,type,time,indexed_time,additional{…}}]}}` |
| 5 | Original herunterladen (persönliches Album) | `/photo/webapi/entry.cgi` | `SYNO.Foto.Download` | `1` | `download` | `id=<itemId>`, `_sid` | Binärdaten (oder JSON-Fehler mit HTTP 200) |
| 6 | Original herunterladen (geteiltes Album) | `/photo/mo/sharing/webapi/entry.cgi` | `SYNO.Foto.Download` | `1` | `download` | `id=<itemId>`, `passphrase=<redacted>`, `_sid` | Binärdaten (oder JSON-Fehler mit HTTP 200) |

Alle Requests sind `GET`. Es werden **keine** Custom-Header gesetzt (kein `X-SYNO-TOKEN`, kein
`Cookie`, kein `User-Agent`-Override, kein `Accept`).

Parameterreihenfolge in der erzeugten URL:

- `callSynoApi` (Nr. 3, 4): `api`, `version`, `method`, `_sid`, danach die übergebenen Parameter in
  Map-Iterationsreihenfolge.
- `downloadFromSynology` (Nr. 5, 6): `api`, `version`, `method`, `id`, [`passphrase`], `_sid`.
- `login`/`logout` (Nr. 1, 2): `api`, `version`, `method`, danach `account`/`passwd` bzw. `_sid`.

---

### 3.10 Sequenzdiagramm eines Slideshow-Zyklus

Vollständiger Ablauf vom Kaltstart des Displays bis zum Anzeigen des zweiten Bildes:

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (PhotosViewApi)
    participant C as usePhotoCache / IndexedDB
    participant API as Backend /api/synology
    participant S as SynologyPhotosService
    participant NAS as Synology NAS

    Note over B: Slideshow-View wird aktiv<br/>(z. B. nach 60 s Inaktivität)

    B->>API: GET /api/settings/slideshow
    API-->>B: {"durationSeconds":"10","transition":"fade",...}

    B->>API: GET /api/synology/status
    API->>S: getConnectionStatus()
    S->>S: Settings lesen (dsm_url, username, album_id, album_name)
    S->>NAS: (falls Album gesetzt) Album-Liste für photoCount
    NAS-->>S: {"success":true,"data":{"list":[...]}}
    API-->>B: {isConnected:true, selectedAlbumId:3, selectedAlbumName:"...", photoCount:128}

    B->>C: IndexedDB öffnen, gecachte Metadaten + sync-meta lesen
    alt Cache älter als TTL (Default 60 min) oder leer
        C->>API: GET /api/synology/status
        API-->>C: {isConnected:true, selectedAlbumId:3}
        C->>API: GET /api/synology/photos?limit=500
        API->>S: listPhotos(offset=0, limit=500)
        S->>S: getOrRefreshSid()
        alt Kein gültiger Session-Cache (>14 min alt)
            S->>NAS: GET auth.cgi?api=SYNO.API.Auth&version=3&method=login&account=…&passwd=<redacted>
            NAS-->>S: {"success":true,"data":{"sid":"<redacted>"}}
            S->>S: Session cachen (expiresAt = jetzt + 14 min)
        end
        S->>NAS: GET entry.cgi?api=SYNO.Foto.Browse.Item&version=1&method=list&_sid=…&album_id=3&offset=0&limit=500&additional=[...]
        NAS-->>S: {"success":true,"data":{"list":[ 128 Items ]}}
        S-->>API: Liste SynologyPhotoResponse
        API-->>C: JSON-Array (Metadaten, keine Bilddaten)
        C->>C: Diff-Sync in IndexedDB (Löschen/Einfügen/Aktualisieren) + sync-meta
    else Cache gültig
        C-->>B: Metadaten direkt aus IndexedDB
    end

    B->>B: shufflePhotos() (Fisher-Yates), wenn order = "random"
    B->>B: <img>-Elemente für ALLE Fotos rendern (opacity-gesteuert)

    Note over B: Bild 1 wird angezeigt
    B->>API: GET /api/synology/photo/40123?cache_key=40123_1719312000
    API->>S: getPhotoBytes(40123, cacheKey, "xl")
    S->>S: getOrRefreshSid()
    S->>S: getOrFetchPassphrase()
    alt Passphrase-Setting nicht vorhanden
        S->>NAS: GET entry.cgi?api=SYNO.Foto.Browse.Album&version=1&method=list&_sid=…&offset=0&limit=100
        NAS-->>S: Albenliste (Passphrase auslesen/persistieren)
    end
    alt Geteiltes Album (Passphrase vorhanden)
        S->>NAS: GET /photo/mo/sharing/webapi/entry.cgi?api=SYNO.Foto.Download&version=1&method=download&id=40123&passphrase=<redacted>&_sid=…
    else Persönliches Album
        S->>NAS: GET /photo/webapi/entry.cgi?api=SYNO.Foto.Download&version=1&method=download&id=40123&_sid=…
    end
    NAS-->>S: Binärdaten (Originalauflösung)
    S->>S: isSynoErrorResponse(bytes)? (nur wenn <= 200 Byte)
    S-->>API: ByteArray
    API-->>B: 200 OK, Content-Type: image/jpeg, Cache-Control: max-age=3600

    Note over B: Nach durationSeconds (Default 10 s) Wechsel zu Bild 2
    B->>API: GET /api/synology/photo/40124?cache_key=…
    Note over API,NAS: identischer Ablauf; Session-Cache greift jetzt (kein erneuter Login)

    loop alle 5 Minuten
        C->>API: GET /api/synology/status + GET /api/synology/photos?limit=500
        C->>C: Diff-Sync in IndexedDB
        Note over B: photos-Array ändert sich -> useMemo shufflet erneut
    end
```

---

### 3.11 Fehlerbehandlung und Fehlercodes

#### Fehlerklassen im Backend

| Exception | HTTP-Status | `error`-Feld im JSON | Auslöser |
|-----------|-------------|----------------------|----------|
| `BadRequestException` | `400` | `"Bad Request"` | fehlende Konfiguration, Album nicht gefunden, ungültige DSM-URL, Login-Fehler, Download-Fehler, leere Antwort |
| `SynologyAuthException` | `401` | `"synology_auth_expired"` | Synology-Fehlercodes 105/106/107/119; auch nach fehlgeschlagenem Retry |
| `UnauthorizedException` | `401` | `"Unauthorized"` | ungültige/abgelaufene PIN-Session bei `connect`/`disconnect`/`album/select` |
| `Exception` (generisch) | `500` | `"Internal Server Error"` | u. a. **Netzwerkfehler**, denn `RestClientException`/`ResourceAccessException` werden nirgends gefangen |

Antwortformat (`ErrorResponse`):

```json
{
  "status": 401,
  "error": "synology_auth_expired",
  "message": "Synology session expired. Re-authentication failed.",
  "timestamp": "2026-07-21T09:00:00Z"
}
```

#### Vollständige Fehlermeldungs-Liste des Synology-Services

| Auslöser | Meldung | Resultierender HTTP-Status |
|----------|---------|----------------------------|
| DSM-URL fehlt in den Settings | `Synology not configured - DSM URL missing` | 400 |
| DSM-URL syntaktisch ungültig / mit userInfo/query/fragment / falsches Schema | `Invalid Synology DSM URL` | 400 |
| Benutzername fehlt | `Synology username not configured` | 400 |
| Passwort fehlt | `Synology password not configured` | 400 |
| Login-Response ohne `sid` | `No session ID returned from login` | 400 |
| Login-Fehlercode 400/401/402/403/404 | siehe [3.2](#32-login--authentifizierung) | 400 |
| Leere HTTP-Antwort | `Empty response from Synology during <Kontext>` | 400 |
| `success:false`, Code **nicht** in {105,106,107,119} | `Failed to <Kontext>: error code <code>` | 400 |
| `success:true`, aber `data == null` | `Failed to <Kontext>: no data returned` | 400 |
| Auth-Fehlercode nach Retry | `Synology session expired. Re-authentication failed.` | 401 |
| Auth-Fehlercode (erstmalig, aus `fetchApiResponse`) | `Synology session expired (error code <code>)` | 401 |
| Album-ID nicht in der Liste | `Album not found: <id>` | 400 |
| Kein Album ausgewählt | `No album selected` | 400 |
| Download liefert `null` oder JSON-Fehler | `Failed to download <photo|video> <id> from Synology` | 400 |

`<Kontext>`-Werte (`errorContext`): `list albums`, `list albums for selection`, `list photos`,
`fetch album passphrase`, `login`.

#### Szenarien

| Szenario | Verhalten im Altsystem |
|----------|------------------------|
| **NAS nicht erreichbar (Kabel/Strom/DNS)** | Apache HttpClient wirft nach spätestens 30 s Connect-Timeout eine `ResourceAccessException`. Diese wird **nirgends** gefangen → generischer Handler → **HTTP 500**. Das Frontend interpretiert 500 als `errorType: 'general'` und zeigt `"Sync fehlgeschlagen"` bzw. die Server-Message. Es gibt **keinen** Fallback auf lokale Bilder. |
| **NAS antwortet langsam / hängt** | Es ist **kein Read-Timeout** konfiguriert. Der Request kann theoretisch unbegrenzt blockieren und einen Servlet-Thread binden. Das Frontend bricht clientseitig nach **30 000 ms** ab (`api.ts`, `AbortController`) und erhält `ApiError('Request timeout', 408)`. |
| **Ungültige Zugangsdaten** | DSM-Code 400 → `"Invalid credentials"` → HTTP 400. In der Settings-UI erscheint die Meldung im roten Fehlerbanner. |
| **2FA am NAS-Konto aktiv** | DSM-Code 403 → `"Two-factor authentication required"` → HTTP 400. Es gibt **keine** Möglichkeit, einen OTP-Code einzugeben. Das Konto ist damit für FamilyHub unbrauchbar. |
| **Session abgelaufen (Code 106)** | Bei JSON-Aufrufen: automatischer Re-Login und ein Retry. Bei **Binär-Downloads**: **kein** Retry — der JSON-Fehlerkörper wird von `isSynoErrorResponse` erkannt und als HTTP 400 gemeldet; das Bild bleibt schwarz. |
| **Album gelöscht / umbenannt** | `SYNO.Foto.Browse.Item` liefert i. d. R. `success:false` mit einem nicht abgefangenen Code → HTTP 400 → Frontend: `errorType: 'general'`. Die gecachten Metadaten in IndexedDB bleiben bestehen, die Slideshow läuft mit veralteten IDs weiter und zeigt kaputte Bilder. |
| **Album leer** | `data.list` = `[]` → Frontend zeigt Vollbild-Meldung „Keine Fotos“ / „Das ausgewahlte Album enthalt keine Fotos.“ mit Button „Aktualisieren“. |
| **Einzelnes Bild nicht ladbar** | Der `<img>`-Tag erhält HTTP 400. Es gibt **keinen** `onError`-Handler → das Bild bleibt leer/schwarz, die Slideshow schaltet nach Ablauf des Intervalls stumpf weiter. |

---

## 4. Backend-REST-API des FamilyHub

Basis-Pfad: `/api/synology` (Backend-Port **8081**).

| Methode | Pfad | PIN-Session nötig | Request | Response |
|---------|------|-------------------|---------|----------|
| `GET` | `/api/synology/status` | **nein** | — | `SynologyStatusResponse` |
| `POST` | `/api/synology/connect` | **ja** (`X-Settings-Session`) | `{"dsmUrl":"http://nas.example.local:5000","username":"familyhub","password":"<redacted>"}` | `SynologyStatusResponse` |
| `POST` | `/api/synology/disconnect` | **ja** | `{}` | leer (200) |
| `GET` | `/api/synology/albums` | **nein** | — | `SynologyAlbumResponse[]` |
| `POST` | `/api/synology/album/select` | **ja** | `{"albumId": 3}` | `SynologyStatusResponse` |
| `GET` | `/api/synology/photos?offset=0&limit=100` | **nein** | — | `SynologyPhotoResponse[]` |
| `GET` | `/api/synology/photo/{id}?cache_key=…` | **nein** | — | `image/jpeg`, `Cache-Control: max-age=3600` |
| `GET` | `/api/synology/thumbnail/{id}?cache_key=…` | **nein** | — | `image/jpeg`, `Cache-Control: max-age=86400` |
| `GET` | `/api/synology/video/{id}` | **nein** | — | `video/mp4`, `Content-Disposition: inline`, `max-age=3600` |

Der Query-Parameter `cache_key` ist bei `/photo/{id}` und `/thumbnail/{id}` **Pflicht** (kein
`defaultValue`); fehlt er, antwortet Spring mit HTTP 400. Verwendet wird sein Wert jedoch nie.

Zusätzlich relevant (Slideshow-Konfiguration, `SettingsController`):

| Methode | Pfad | PIN-Session nötig | Beschreibung |
|---------|------|-------------------|--------------|
| `GET` | `/api/settings/slideshow` | nein | Liefert alle Settings mit Präfix `slideshow.config.` als flaches `Map<String,String>`, Präfix entfernt |
| `PUT` | `/api/settings/slideshow` | **ja** (`X-Settings-Session`) | Schreibt jeden Map-Eintrag als `slideshow.config.<key>` |

#### PIN-Session

`X-Settings-Session` trägt eine UUID, die durch PIN-Eingabe erzeugt wurde (`PinService`).
Eigenschaften: In-Memory-`ConcurrentHashMap`, Gültigkeit `familyhub.security.pin-timeout-minutes`
(Default **30 Minuten**, Env `FAMILYHUB_PIN_TIMEOUT`), PIN aus DB-Setting `setup.pin`, Fallback
`FAMILYHUB_SETTINGS_PIN` (Default `1234`).

#### Spring-Security-Kontext

`SecurityConfig.kt` konfiguriert:

```kotlin
http.csrf { it.disable() }
    .cors { }
    .authorizeHttpRequests { it.requestMatchers("/api/health").permitAll().anyRequest().permitAll() }
```

Es gibt also **keine** Framework-Authentifizierung. CORS erlaubt `allowedOriginPatterns = ["*"]`
für `/api/**` mit `allowCredentials = true`. Der einzige Schutz ist die manuelle
`X-Settings-Session`-Prüfung in den vier schreibenden Endpoints.

---

## 5. Konfiguration und Persistenz

### 5.1 Settings-Keys der NAS-Anbindung

Alle NAS-Einstellungen liegen in der Datenbanktabelle `settings` (Spalten `key TEXT PK`,
`value TEXT NOT NULL`, `updated_at`). **Keine** davon ist über eine Umgebungsvariable oder
`application.yml` konfigurierbar.

| Setting-Key | Inhalt | Verschlüsselt | Beispielwert | Gesetzt von | Gelöscht von |
|-------------|--------|---------------|--------------|-------------|--------------|
| `synology.dsm_url` | Normalisierte Basis-URL ohne Pfad | nein | `http://nas.example.local:5000` | `connect()` | `disconnect()` |
| `synology.username` | DSM-Benutzername | nein | `familyhub` | `connect()` | `disconnect()` |
| `synology.password_encrypted` | DSM-Passwort | **ja**, AES-256-GCM, Base64 | `<redacted>` | `connect()` | `disconnect()` |
| `synology.album_id` | ID des Slideshow-Albums als String | nein | `3` | `selectAlbum()` | `disconnect()` |
| `synology.album_name` | Anzeigename des Albums | nein | `FamilyHub Slideshow` | `selectAlbum()` | `disconnect()` |
| `synology.album_passphrase` | Passphrase geteilter Alben | **nein — Klartext** | `<redacted>` | `selectAlbum()`, `getOrFetchPassphrase()` | `disconnect()`, `selectAlbum()` bei nicht-geteiltem Album |
| `synology.api_path` | `photo/webapi` | nein | `photo/webapi` | `connect()` | `disconnect()` |

> **Hinweis:** `synology.api_path` wird geschrieben, aber **nirgends gelesen**. Der Pfad ist im Code
> als Konstante `API_PATH` fest verdrahtet. Dieses Setting ist reiner Ballast.

### 5.2 Verschlüsselung des NAS-Passworts

`TokenEncryptionService` (`familyhub/backend/src/main/kotlin/com/familyhub/service/TokenEncryptionService.kt`):

| Eigenschaft | Wert |
|-------------|------|
| Algorithmus | `AES/GCM/NoPadding` |
| Schlüssellänge | AES-256 (32 Byte) |
| Schlüsselquelle | Property `familyhub.security.encryption-key`, Env `FAMILYHUB_ENCRYPTION_KEY` |
| Default-Schlüssel | `defaultKey12345678901234567890123` (im Repository im Klartext, **unsicher**) |
| Schlüsselableitung | **keine KDF** — der String wird mit `'0'` auf 32 Zeichen aufgefüllt bzw. abgeschnitten (`padKey`) |
| IV | 12 Byte, `SecureRandom`, wird dem Chiffrat **vorangestellt** |
| GCM-Tag-Länge | 128 Bit |
| Kodierung | Base64 (Standard-Alphabet) des Gesamtblobs `IV || Ciphertext || Tag` |

Format des gespeicherten Werts: `Base64( IV[12] || Ciphertext || GCM-Tag[16] )`.

**Die Album-Passphrase wird NICHT verschlüsselt** und liegt im Klartext in der Tabelle `settings`.

### 5.3 Slideshow-Settings

Gespeichert unter dem Präfix `slideshow.config.`. Das Frontend liest/schreibt über
`GET`/`PUT /api/settings/slideshow` mit **camelCase**-Schlüsseln:

| Frontend-Schlüssel | Voller DB-Key beim Speichern | Typ | Erlaubte Werte | Frontend-Default |
|--------------------|------------------------------|-----|----------------|------------------|
| `durationSeconds` | `slideshow.config.durationSeconds` | String(Int) | `5`, `10`, `30`, `60`, `120`, `300` | `10` |
| `transition` | `slideshow.config.transition` | String | `fade`, `slide`, `none` | `fade` |
| `transitionDurationMs` | `slideshow.config.transitionDurationMs` | String(Int) | beliebig; UI setzt nur den geladenen Wert | `1000` |
| `order` | `slideshow.config.order` | String | `chronological`, `random` | `random` |
| `showClock` | `slideshow.config.showClock` | String(Bool) | `true`, `false` | `true` |
| `clockPosition` | `slideshow.config.clockPosition` | String | `top-left`, `top-right`, `bottom-left`, `bottom-right` | `top-right` |
| `clockFormat` | `slideshow.config.clockFormat` | String | `12h`, `24h` | `24h` |
| `showMetadata` | `slideshow.config.showMetadata` | String(Bool) | `true`, `false` | `false` |
| `cacheTtlMinutes` | `slideshow.config.cacheTtlMinutes` | String(Int) | `30`, `60`, `120`, `240` | `60` |

Die Datenbank-Migration `V12__refactor_settings_to_string.sql` legt jedoch **snake_case**-Keys an:

```sql
INSERT INTO settings (key, value) VALUES
('slideshow.config.duration_seconds', '10'),
('slideshow.config.transition', 'fade'),
('slideshow.config.transition_duration_ms', '1000'),
('slideshow.config.order', 'random'),
('slideshow.config.show_clock', 'true'),
('slideshow.config.clock_position', 'top-right'),
('slideshow.config.clock_format', '24h'),
('slideshow.config.show_metadata', 'true'),
('slideshow.config.metadata_position', 'bottom');
```

Da das Frontend nach `durationSeconds`, `showClock` usw. sucht, greifen diese Seed-Werte **nie**;
bis zum ersten Speichern gelten stets die Frontend-Defaults. Zusätzlich existieren die Seed-Keys
danach parallel als Karteileichen in der Tabelle. `metadata_position` hat überhaupt kein
Frontend-Gegenstück.

### 5.4 Umgebungsvariablen

In `familyhub/.env_example` und `familyhub/.env` existiert **keine einzige** Synology-Variable.
Relevante Variablen mit indirektem Bezug:

| Variable | Bedeutung | Beispiel-/Default-Wert |
|----------|-----------|------------------------|
| `FAMILYHUB_ENCRYPTION_KEY` | Schlüssel zur Verschlüsselung des NAS-Passworts | `your-32-character-encryption-key` (Doku-Beispiel); Code-Default `defaultKey12345678901234567890123` |
| `FAMILYHUB_SETTINGS_PIN` | PIN für schreibende Settings-Endpoints | `1234` |
| `FAMILYHUB_PIN_TIMEOUT` | Gültigkeit der PIN-Session in Minuten | `30` |
| `SPRING_DATASOURCE_URL` | Ablageort aller NAS-Settings | `jdbc:postgresql://localhost:5433/familyhub` |
| `VITE_API_BASE_URL` (Frontend) | Basis-URL des Backends; bestimmt, gegen welchen Host die Bild-URLs aufgelöst werden | Dev-Default `http://localhost:8081` |

---

## 6. Setup-Wizard aus Nutzersicht

Der Assistent (`SynologySetupWizard.tsx`) ist ein reines **Anleitungs-Dialog** mit fünf Schritten.
Er führt **keine** Aktionen auf der NAS aus, testet **keine** Verbindung und schreibt **keine**
Einstellungen. Er wird über einen Button „Einrichtung“ mit Fragezeichen-Icon rechts oben in der
Sektion „Synology Photos“ geöffnet. Kopfzeile: „Schritt N von 5“ plus Schritttitel, darunter ein
Fortschrittsbalken (`(currentStep+1)/5 * 100 %`) und fünf klickbare Schritt-Punkte. Navigation:
„Zurück“ / „Weiter“, im letzten Schritt „Fertig“ (schließt den Dialog und setzt den Schritt auf 0).

### Schritt 1 — „Übersicht“

> „Diese Anleitung hilft dir, deine Synology NAS für FamilyHub einzurichten. Du wirst lernen, wie du:“
> 1. „Einen dedizierten Benutzer für FamilyHub erstellst“
> 2. „Synology Photos aktivierst und konfigurierst“
> 3. „Ein geteiltes Album für die Slideshow erstellst“
> 4. „FamilyHub mit deiner NAS verbindest“
>
> **Voraussetzungen**
> - „Synology NAS mit DSM 7.0 oder höher“
> - „Synology Photos Paket installiert“
> - „Administrator-Zugang zur NAS“

### Schritt 2 — „Benutzer erstellen“

> „Erstelle einen dedizierten Benutzer für FamilyHub auf deiner Synology NAS. Dies erhöht die
> Sicherheit und vereinfacht die Verwaltung.“
>
> - **Schritt 1: DSM öffnen** — „Öffne das DSM (DiskStation Manager) deiner Synology NAS im Browser.
>   Die Adresse findest du normalerweise unter:“ Codeblock mit Kopier-Button: `http://deine-nas-ip:5000`,
>   Zusatz: „oder mit HTTPS über Port 5001“
> - **Schritt 2: Systemsteuerung öffnen** — „Klicke auf **Systemsteuerung** → **Benutzer und Gruppe**“
> - **Schritt 3: Neuen Benutzer anlegen** — „Klicke auf **Erstellen** und gib folgende Daten ein:“
>   Name: `familyhub` (mit Kopier-Button), Passwort: „(wähle ein sicheres Passwort)“
> - **Schritt 4: Berechtigungen setzen** — „Gruppe: users (Standard)“, „Anwendungen: Synology Photos
>   aktivieren“, „Alle anderen Anwendungen können deaktiviert bleiben“
> - Hinweisbox (bernsteinfarben): „**Tipp:** Notiere dir das Passwort - du brauchst es später für die Verbindung.“

### Schritt 3 — „Synology Photos“

> „Stelle sicher, dass Synology Photos installiert und für den FamilyHub-Benutzer aktiviert ist.“
>
> - Schritt 1: „Öffne das **Paket-Zentrum** im DSM-Hauptmenü.“
> - Schritt 2: „Suche nach **Synology Photos** und installiere es, falls noch nicht geschehen.“
> - Schritt 3: „Melde dich im DSM mit dem neuen `familyhub` Benutzer an. Dies erstellt automatisch
>   den persönlichen Foto-Ordner.“
> - Schritt 4: „Öffne **Synology Photos** aus dem DSM-Menü. Die App wird beim ersten Start initialisiert.“
> - Hinweisbox (blau): „**Hinweis:** Synology Photos ersetzt das ältere Photo Station. Falls du
>   Photo Station nutzt, solltest du zu Synology Photos migrieren.“

### Schritt 4 — „Album erstellen“

> „Erstelle ein Album, das für die Slideshow verwendet wird. Familienmitglieder können Fotos zu
> diesem Album hinzufügen (du kannst es einfach sharen).“
>
> - Schritt 1: „Öffne Synology Photos (als `familyhub` Benutzer).“
> - Schritt 2: „Klicke links auf **Alben** → **+ Erstellen** → **Album**“, Namensvorschlag im
>   Codeblock mit Kopier-Button: `FamilyHub Slideshow`
> - Schritt 3 (optional): „Um anderen Familienmitgliedern das Hinzufügen von Fotos zu ermöglichen:
>   Öffne das Album / Klicke auf **Teilen** (oben rechts) / Wähle einen User aus / Aktiviere
>   **Hochladen erlauben**“
> - Schritt 4: „Lade erste Fotos in das Album hoch oder füge vorhandene Fotos hinzu.“
> - Hinweisbox (grün): „**Tipp:** Du kannst mehrere Alben erstellen und in FamilyHub zwischen ihnen wechseln.“

### Schritt 5 — „Fertig!“

> „**Alles bereit!** — Deine Synology NAS ist jetzt für FamilyHub vorbereitet.“
>
> **Jetzt verbinden** — „Gehe zurück zu den Synology Photos Einstellungen und gib folgende Daten ein:“
> - „DSM URL: Die IP-Adresse deiner NAS (z.B. http://192.168.1.100:5000/photo)“
> - „Benutzername: `familyhub`“
> - „Passwort: Das Passwort, das du in Schritt 2 vergeben hast“
>
> „**Nächster Schritt:** Nach der Verbindung wähle das Album aus, das für die Slideshow verwendet
> werden soll.“
>
> Externer Link: „Synology Photos Dokumentation“ →
> `https://kb.synology.com/en-global/DSM/help/SynologyPhotos/synology_photos_desc`

> **Inkonsistenz:** Der Wizard empfiehlt in Schritt 5 eine URL **mit** `/photo`-Pfad; das Backend
> verwirft den Pfad beim Normalisieren. Die Angabe funktioniert also, ist aber irreführend.

### 6.1 Verbindungsformular (`SynologySettings.tsx`)

Sichtbar in den Einstellungen, Sektion „Synology Photos“ mit Bild-Icon.

**Zustand „nicht verbunden“:**

> „Verbinde dich mit deinem Synology NAS, um Fotos fur die Slideshow zu verwenden.“

| Feld | Label | Platzhalter | Hilfetext |
|------|-------|-------------|-----------|
| DSM-URL | „DSM URL“ | `http://nas.local:5000` | „Die Adresse deines Synology NAS (Port 5000 fur HTTP, 5001 fur HTTPS)“ |
| Benutzername | „Benutzername“ | `familyhub` | — |
| Passwort | „Passwort“ (`type="password"`) | `Passwort` | Enter-Taste löst „Verbinden“ aus |

Alle drei Felder nutzen die Bildschirmtastatur-Komponente `KeyboardInput` (Touch-Bedienung am
Wand-Display). Button: „Verbinden“, während des Vorgangs „Verbinde...“ mit Spinner; deaktiviert,
solange kein `sessionId` vorliegt oder ein Feld leer ist.

**Verbindungstest:** Der `connect()`-Aufruf ist gleichzeitig der Test — das Backend führt einen
echten Login und unmittelbar danach einen Logout durch. Erst bei Erfolg werden die Zugangsdaten
gespeichert. Nach erfolgreicher Verbindung wird das Passwortfeld im Frontend geleert.

**Fehlermeldungen im roten Banner:**

| Situation | Text |
|-----------|------|
| Kein PIN-Login | „Bitte melde dich zuerst mit deinem PIN an“ |
| Leeres Feld | „Bitte fulle alle Felder aus“ (sic, ohne Umlaut) |
| Backend-Fehler beim Verbinden | Server-Message, sonst „Verbindung fehlgeschlagen“ |
| Statusabruf fehlgeschlagen | „Fehler beim Laden des Status“ |
| Trennen fehlgeschlagen | „Trennen fehlgeschlagen“ |
| Album-Auswahl fehlgeschlagen | „Album-Auswahl fehlgeschlagen“ |
| Kein PIN-Login (Anzeige) | „Melde dich mit PIN an, um die Verbindung herzustellen.“ / „Melde dich mit PIN an, um Anderungen vorzunehmen.“ |

**Zustand „verbunden“:**

- Grünes Statusfeld mit Häkchen: „Verbunden mit {dsmUrl}“
- „Benutzer: {username}“
- Label „Foto-Album“ mit Dropdown, Platzhalter „Album auswahlen...“, Einträge im Format
  `{name} ({itemCount} Fotos)`; daneben ein Refresh-Button, der `/synology/albums` neu lädt
- Unter dem Dropdown: „Ausgewahlt: {albumName} ({photoCount} Fotos)“
- Button „Verbindung trennen“ (destruktiv) mit Bestätigungsdialog:
  Titel „Verbindung trennen?“, Text „Mochtest du die Verbindung zu Synology Photos wirklich trennen?
  Die Zugangsdaten werden geloscht.“, Buttons „Abbrechen“ / „Trennen“

Die deutschen Texte enthalten in `SynologySettings.tsx` durchgehend **keine Umlaute** („auswahlen“,
„Ausgewahlt“, „Mochtest“, „geloscht“, „Anderungen“, „fur“) — ein Altlast-Encoding-Problem, das in
der Neuauflage zu bereinigen ist.

---

## 7. Caching-Strategie

### 7.1 Backend-Cache

**Es gibt keinen Backend-Cache für Bilddaten.** Jeder Aufruf von `/api/synology/photo/{id}` löst
einen vollständigen Download vom NAS aus. Es existiert kein Spring-`@Cacheable`, kein Redis-Zugriff
und keine Ablage auf Platte für Synology-Medien. Redis läuft zwar laut `docker-compose.yml` als
Service, wird für Fotos aber nicht verwendet.

Zwischengespeichert werden im Backend lediglich:

| Gegenstand | Ort | Dauer |
|------------|-----|-------|
| Synology-Session-ID (`sid`) | `AtomicReference` im Service | 14 Minuten |
| Album-Passphrase | DB-Setting `synology.album_passphrase` | dauerhaft, bis `disconnect()`/Albumwechsel |

Die einzige Cache-Wirkung nach außen sind die HTTP-`Cache-Control`-Header (1 h für Fotos, 24 h für
Thumbnails, 1 h für Videos), die den **Browser-Cache** des Displays steuern. Ein `ETag` oder
`Last-Modified` wird nicht gesetzt, revalidieren ist damit nicht möglich.

### 7.2 Frontend-Cache — `usePhotoCache`

**Wichtig: Gecacht werden ausschließlich Metadaten, keine Bilddaten.** Es werden keine Blobs,
keine Blob-URLs und kein `URL.createObjectURL()` verwendet. Die eigentlichen Bilder liegen
ausschließlich im HTTP-Cache des Browsers.

| Eigenschaft | Wert |
|-------------|------|
| Speicher | IndexedDB |
| Datenbankname | `familyhub-photos` |
| Version | `1` |
| Object-Store 1 | `photo-cache`, `keyPath: 'id'`, Index `cachedAt` (nicht unique) |
| Object-Store 2 | `cache-meta`, `keyPath: 'key'`, ein einziger Datensatz mit `key = 'sync-meta'` |
| Inhalt `photo-cache` | Alle Felder von `SynologyPhotoResponse` plus `cachedAt` (Unix-ms) |
| Inhalt `cache-meta` | `{ key: 'sync-meta', lastSync: <Unix-ms>, albumId: <number|null> }` |
| TTL (Option `ttlMinutes`) | Default **60** Minuten; in `PhotosViewApi` aus `config.cacheTtlMinutes` gespeist |
| Auto-Refresh (`refreshIntervalMinutes`) | **5** Minuten, fest im Aufruf gesetzt |
| Angeforderte Fotomenge | `GET /synology/photos?limit=500` — **maximal 500 Medien**, `offset` immer 0 |
| Cache-Größenlimit | **keines** |
| Eviction-Strategie | **keine LRU/LFU** — nur der Diff-Sync entfernt Einträge |
| Speicherfreigabe | `db.close()` beim Unmount; explizites Leeren nur über `clearCache()` bzw. den Button „Cache leeren“ |

#### Ablauf `initialize()` (beim Mount)

1. IndexedDB öffnen (bei Bedarf Stores anlegen, `onupgradeneeded`).
2. Alle gecachten Fotos und `sync-meta` lesen.
3. Sind Fotos vorhanden → sofort in den State setzen (**Sofortanzeige ohne Netzwerk**).
4. `cacheAge = Date.now() - meta.lastSync` (bzw. `Infinity`, wenn kein Meta vorhanden).
5. Wenn `cacheAge > ttlMinutes*60*1000` **oder** keine Fotos gecacht → `syncFromServer()`.
6. `isLoading = false`.

#### Ablauf `syncFromServer()`

1. `GET /synology/status`
   - `isConnected == false` → Fehler `"Nicht mit Synology verbunden"`, `errorType = 'general'`, Abbruch.
   - `selectedAlbumId == null` → Fehler `"Kein Album ausgewahlt"`, `errorType = 'general'`, Abbruch.
2. `GET /synology/photos?limit=500`
3. Diff-Sync in einer einzigen `readwrite`-Transaktion über beide Stores:
   - Alle gecachten Einträge, deren `id` nicht mehr in der Serverantwort steht → `delete`.
   - Alle Serverfotos → `put`; `cachedAt` wird für bereits bekannte IDs **beibehalten**, für neue
     auf `Date.now()` gesetzt.
   - `sync-meta` mit `lastSync = Date.now()` und aktueller `albumId` schreiben.
4. State aktualisieren: `photos`, `lastSync`, `cacheStats = { photoCount, cacheAge: 0 }`.

#### Fehlerabbildung im Cache-Hook

| Bedingung | `error` | `errorType` |
|-----------|---------|-------------|
| HTTP 401 mit Body `{"error":"synology_auth_expired"}` | „Synology-Sitzung abgelaufen“ | `auth` |
| HTTP 401 sonst | Server-Message | `auth` |
| `ApiError.status === 0` (Netzwerk-/Fetch-Fehler) | „Verbindung zum Server fehlgeschlagen“ | `network` |
| alles andere | Server-Message bzw. „Sync fehlgeschlagen“ | `general` |

> **Achtung:** Die Auswertung prüft `err.data.error === 'synology_auth_expired'`. Der
> `GlobalExceptionHandler` legt diesen Wert tatsächlich in das Feld `error` der `ErrorResponse` —
> die Auswertung passt also. Ein Backend-500 (z. B. NAS unerreichbar) fällt jedoch in den
> `general`-Zweig und wird dem Nutzer nicht als Netzwerkproblem erklärt.

### 7.3 Preloading und Vermeidung von Flackern

Ein aktives Preloading (`new Image()`, `<link rel="preload">`, Prefetch der nächsten n Bilder)
existiert **nicht**. Stattdessen nutzt `PhotosViewApi` einen impliziten Mechanismus:

- **Alle** Fotos der Liste (bis zu 500) werden gleichzeitig als absolut positionierte
  `<div><img></div>`-Paare im DOM gerendert.
- Sichtbarkeit wird ausschließlich über `opacity` gesteuert (`getTransitionStyle`), nicht über
  Mount/Unmount. Dadurch bleibt ein einmal geladenes Bild dekodiert im Browser und der Wechsel ist
  flackerfrei.
- Das `loading`-Attribut steuert die Ladepriorität:
  ```tsx
  loading={Math.abs(index - currentIndex) <= 1 ? 'eager' : 'lazy'}
  ```
  Das aktuelle Bild sowie direkter Vorgänger und Nachfolger werden `eager` geladen, alle übrigen
  `lazy`. Da alle Elemente jedoch dauerhaft im Viewport-Bereich liegen (`absolute inset-0`), löst
  `lazy` in der Praxis meist trotzdem ein sofortiges Laden aus — der Browser lädt damit potenziell
  **alle 500 Originalbilder** an.
- Zusätzlich sorgt `Cache-Control: max-age=3600` dafür, dass wiederholt gezeigte Bilder aus dem
  Browser-Cache kommen.

### 7.4 „Cache leeren“ aus der UI

`SlideshowSettings.tsx` bietet den Button „Cache leeren“. Er ruft (falls übergeben) den Callback
`onClearCache()` auf und löscht anschließend **die gesamte IndexedDB-Datenbank**:

```ts
indexedDB.deleteDatabase('familyhub-photos');
```

Der Browser-HTTP-Cache mit den eigentlichen Bilddaten wird dabei **nicht** geleert.

---

## 8. Slideshow-Verhalten

Alle folgenden Angaben beziehen sich auf `PhotosViewApi.tsx`.

### 8.1 Wechselintervall

| Aspekt | Wert |
|--------|------|
| Quelle | Setting `slideshow.config.durationSeconds` über `GET /api/settings/slideshow` |
| Auswählbare Werte in der UI | 5 s, 10 s, 30 s, 1 min (60), 2 min (120), 5 min (300) |
| Default, wenn Settings-Abruf scheitert | **10 Sekunden** (`DEFAULT_CONFIG`) |
| Default, wenn Key im Response fehlt | `parseInt(response.durationSeconds \|\| '10', 10)` → 10 Sekunden |
| Umsetzung | `setInterval(..., config.durationSeconds * 1000)`; Index läuft zyklisch `(prev + 1) % photos.length` |
| Pause | Bei `isPlaying === false` läuft kein Timer. Bei nur einem Foto (`photos.length <= 1`) ebenfalls nicht. |

### 8.2 Übergangseffekte

Implementiert in `getTransitionStyle()` (`SlideshowService.ts`):

| Wert `transition` | UI-Bezeichnung | CSS |
|-------------------|----------------|-----|
| `fade` | „Uberblenden“ | `transition: opacity <ms> ease-in-out; opacity: 0/1` |
| `slide` | „Schieben“ | `transition: transform <ms> ease-in-out, opacity <ms> ease-in-out; transform: translateX(0) bzw. translateX(100%); opacity: 0/1` |
| `none` | „Ohne“ | nur `opacity: 0/1`, keine Transition |

`transitionDurationMs`: DB-/Settings-gesteuert, Default beim Parsen `1000` ms.

> **Inkonsistenz:** `DEFAULT_CONFIG` in `PhotosViewApi.tsx` setzt `transition: 'none'`,
> `transitionDurationMs: 0` und `clockPosition: 'bottom-left'`; die Fallbacks beim Parsen der
> Server-Antwort setzen dagegen `'fade'`, `1000` und `'top-right'`. `SlideshowSettings.tsx` nutzt
> wiederum `'fade'` / `1000` / `'top-right'`. Je nachdem, ob der Settings-Abruf erfolgreich ist,
> verhält sich die Slideshow unterschiedlich.

### 8.3 Reihenfolge

| Wert `order` | UI-Bezeichnung | Verhalten |
|--------------|----------------|-----------|
| `random` (Default) | „Zufallig“ | `shufflePhotos()` — Fisher-Yates-Shuffle über eine Kopie des Arrays, in einem `useMemo` mit Dependencies `[cachedPhotos, config.order]` |
| `chronological` | „Chronologisch“ | Liste wird **unverändert** übernommen, also in der DSM-Default-Reihenfolge des Albums. Es wird **nicht** nach `takenAt` sortiert. |

> **Nebenwirkung:** Da `usePhotoCache` alle 5 Minuten neu synchronisiert und dabei ein neues
> `photos`-Array liefert, wird die Liste im Zufallsmodus **alle 5 Minuten neu gemischt**, während
> `currentIndex` unverändert bleibt. Bereits gezeigte Bilder erscheinen dadurch erneut, andere
> werden übersprungen.

### 8.4 Videos

| Aspekt | Verhalten |
|--------|-----------|
| Erkennung | `photo.type === 'video'` (aus dem Synology-Feld `type`) |
| Rendering | `<video src={…} autoPlay={isActive && isPlaying} muted={videoMuted} loop={false} playsInline onEnded={…} />` |
| Ton | Startet **stumm** (`videoMuted` initial `true`); ein Lautsprecher-Button erscheint in der Steuerleiste nur, wenn das aktuelle Medium ein Video ist |
| Weiterschalten | Der reguläre Intervall-Timer ist bei aktivem Video ausgesetzt (`if (isCurrentVideo && !videoEnded) return;`). Nach `onEnded` wird nach **1000 ms** zum nächsten Element geschaltet. |
| Quelle | `/api/synology/video/{id}` — vollständiger Download, kein Streaming, keine Range-Requests |

### 8.5 Overlays

| Overlay | Position | Details |
|---------|----------|---------|
| **Uhrzeit** | konfigurierbar über `clockPosition` (`top-8 left-8` / `top-8 right-8` / `bottom-8 left-8` / `bottom-8 right-8`) | Schriftgröße `text-8xl`, `font-extralight`, weiß mit Schlagschatten `drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]`; Aktualisierung im Sekundentakt; Format `24h` (`HH:MM`, `de-DE`, `2-digit`) oder `12h` (`h:MM AM/PM`) |
| **Datum** | direkt unter der Uhr | `text-2xl`, `toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long' })`, z. B. „Dienstag, 21. Juli“ |
| **Aufnahmeort** | unter dem Datum | `text-lg`, nur wenn GPS-Daten vorhanden; via `useGeocoding` → `reverseGeocode()` gegen `https://nominatim.openstreetmap.org/reverse` |
| **Wetter** | fest `bottom-8 right-8` | `<WeatherWidget variant="slideshow" />`; Deckkraft 100 % bei sichtbaren Controls, sonst 70 % |
| **Albumname** | oben, `left-4` wenn die Uhr `top-right` steht, sonst `right-4` | Pille mit `bg-background/20` |
| **Zähler** | neben dem Albumnamen | „{currentIndex+1} / {photos.length}“ |
| **Video-Badge** | neben dem Zähler | Pille mit Video-Icon und Text „Video“, nur bei Videos |
| **Sync-Indikator** | oben mittig | Pille mit rotierendem Icon und Text „Synchronisiere...“, sichtbar während `isSyncing` |
| **Verlaufsflächen** | oben `h-24` (`from-black/40`), unten `h-40` (`from-black/60`) | dienen der Lesbarkeit der Overlays, `pointer-events-none` |

**Nächster Termin wird NICHT angezeigt.** Es gibt kein Kalender-Overlay in der Slideshow.

Das Setting `showMetadata` („Foto-Infos anzeigen — Zeigt Dateiname und Aufnahmedatum“) wird geladen
und gespeichert, aber in `PhotosViewApi.tsx` **nirgends ausgewertet**. Dateiname und Aufnahmedatum
werden nie angezeigt.

### 8.6 Bedienelemente

- Ein Klick/Tap irgendwo auf die Fläche setzt `showControls = true`.
- Die Controls blenden nach **3000 ms** wieder aus (`opacity-0 pointer-events-none`).
- Links/rechts: runde Pfeil-Buttons für „vorheriges“/„nächstes“ Bild.
- Unten mittig: Punkt-Indikatoren (**nur bei ≤ 20 Fotos**), Play/Pause-Button, ggf.
  Stumm-Button, Refresh-Button (löst `refresh()` des Cache-Hooks aus; deaktiviert während `isSyncing`).

### 8.7 Skalierung und Seitenverhältnis

| Orientierung (Prop `orientation`) | CSS-Klasse | Wirkung |
|-----------------------------------|-----------|---------|
| `landscape` (Default) | `object-cover` | Bild füllt den Bildschirm vollständig, **beschneidet** überstehende Ränder |
| `portrait` | `object-contain` | Bild wird vollständig gezeigt, es entstehen **schwarze Balken** |

Der Container hat `bg-black`, alle Bilder `w-full h-full`. Es gibt **kein** Letterbox-Blur, keinen
Ken-Burns-Effekt und keine automatische Erkennung der Bildorientierung — die Entscheidung hängt
allein am Display-Prop, nicht am einzelnen Foto. Hoch- und Querformatbilder werden im
Landscape-Modus daher gleich behandelt (Hochformatbilder werden stark beschnitten).

### 8.8 Zustände „leer“, „lädt“ und „Fehler“

| Zustand | Darstellung |
|---------|-------------|
| `isLoading \|\| configLoading` | Zentrierter Spinner (`w-12 h-12`) mit Text „Lade Fotos...“ |
| `cacheError && photos.length === 0` | Rotes Icon `ImageOff`, Überschrift = Fehlermeldung, darunter kontextabhängiger Erklärtext, Button „Erneut versuchen“ |
| `photos.length === 0` (ohne Fehler) | Graues Icon `ImageOff`, Überschrift „Keine Fotos“, Text „Das ausgewahlte Album enthalt keine Fotos.“, Button „Aktualisieren“ |

Kontextabhängige Erklärtexte im Fehlerzustand:

| Bedingung | Text |
|-----------|------|
| `errorType === 'auth'` | „Synology-Sitzung abgelaufen. Bitte prüfe die Zugangsdaten in den Einstellungen.“ |
| `!status?.isConnected` | „Verbinde dich mit Synology Photos in den Einstellungen.“ |
| `!status?.selectedAlbumId` | „Wähle ein Album in den Einstellungen aus.“ |
| `errorType === 'network'` | „Verbindung zum Server fehlgeschlagen. Bitte prüfe die Netzwerkverbindung.“ |
| sonst | „Versuche es erneut oder prüfe die Verbindung.“ |

Bei Netzwerkfehlern **mit** vorhandenem Cache läuft die Slideshow mit den zwischengespeicherten
Metadaten weiter — die Bilder selbst werden dann jedoch trotzdem vom Backend angefordert und
schlagen fehl, sofern sie nicht mehr im Browser-Cache liegen.

### 8.9 Burn-in-Vermeidung

**Es existieren keinerlei Maßnahmen gegen Einbrennen.** Konkret:

- Die Uhr steht dauerhaft an derselben Position (ihre Position ist zwar konfigurierbar, wechselt
  aber nicht automatisch).
- Das Wetter-Widget ist fest auf `bottom-8 right-8` verankert und lässt sich nicht verschieben.
- Es gibt keinen Pixel-Shift, keine periodische Verschiebung der Overlays, keinen Bildschirmschoner
  und keine Nachtabschaltung.
- Die Verlaufsflächen oben und unten liegen unverändert an derselben Stelle.

Der Kiosk-Modus (`useKioskMode`) fordert im Gegenteil eine **Wake Lock** an
(`navigator.wakeLock`, Option `autoWakeLock` Default `true`) und verhindert damit aktiv, dass sich
das Display abschaltet.

---

## 9. Datenschutz und Sicherheit

### 9.1 Positive Eigenschaften

| Aspekt | Ist-Zustand |
|--------|-------------|
| Datenhaltung | Alle Fotos verbleiben auf der NAS. Es findet keine Kopie in eine Cloud statt. |
| Übertragungsweg | Ausschließlich Backend ↔ NAS im lokalen Netz, sowie Display ↔ Backend. |
| Passwort im Ruhezustand | AES-256-GCM-verschlüsselt in der Tabelle `settings`. |
| Passwort in Logs | `sanitizeUrl()` maskiert `passwd=` und `_sid=` in geloggten URLs. |
| Passwort im Frontend | Wird nach erfolgreichem `connect()` aus dem React-State gelöscht; `GET /synology/status` liefert Passwort **nicht** zurück (nur `dsmUrl` und `username`). |
| Änderungsschutz | `connect`, `disconnect`, `album/select` und `PUT /settings/slideshow` erfordern eine gültige PIN-Session. |
| Zugriff von außen | Es gibt keinen Mechanismus, der FamilyHub aus dem Internet erreichbar macht. Die Deployment-Anleitung `familyhub/docs/SYNOLOGY_DEPLOYMENT.md` empfiehlt für externen Zugriff ausdrücklich einen DSM-Reverse-Proxy mit Let's-Encrypt-Zertifikat und rät von QuickConnect ab. |

### 9.2 Risiken

| Risiko | Beschreibung |
|--------|--------------|
| **Passwort im Query-String** | Beim Login steht `passwd=<Klartext>` in der URL. Bei HTTP (Port 5000) ist es im Klartext im lokalen Netz mitlesbar; bei HTTPS steht es in DSM-Zugriffslogs. |
| **Zertifikatsprüfung vollständig deaktiviert** | `TrustAllStrategy` + `NoopHostnameVerifier` machen HTTPS zur NAS gegen aktive Man-in-the-Middle-Angriffe wirkungslos. Nicht abschaltbar. |
| **Album-Passphrase im Klartext** | `synology.album_passphrase` liegt unverschlüsselt in der DB und wird von `sanitizeUrl()` **nicht** aus Logs entfernt — sie erscheint im INFO-Log jedes Downloads („Downloading photo: id=…, url=…“). Wer die Passphrase kennt, kann das geteilte Album über den Sharing-Endpoint direkt abrufen. |
| **Unauthentifizierte Lese-Endpoints** | `GET /api/synology/status`, `/albums`, `/photos`, `/photo/{id}`, `/thumbnail/{id}` und `/video/{id}` erfordern **keine** PIN-Session. Jedes Gerät im lokalen Netz kann sämtliche Familienfotos herunterladen, sobald es das Backend erreicht. Zusammen mit `allowedOriginPatterns = ["*"]` und `allowCredentials = true` in `CorsConfig` kann das auch jede beliebige Webseite im Browser eines Netzteilnehmers. |
| **Standard-Verschlüsselungsschlüssel** | Fehlt `FAMILYHUB_ENCRYPTION_KEY`, wird der im Repository stehende Wert `defaultKey12345678901234567890123` verwendet — das NAS-Passwort ist dann faktisch ungeschützt. |
| **Keine Schlüsselableitung** | `padKey()` füllt den Schlüsselstring mit `'0'` auf, statt PBKDF2/Argon2 zu verwenden. |
| **GPS-Daten verlassen das lokale Netz** | `useGeocoding` schickt Breiten-/Längengrad jedes angezeigten Fotos an `https://nominatim.openstreetmap.org/reverse` — einen **öffentlichen Internetdienst**. Damit verlassen präzise Aufenthaltsorte der Familie das Haus, obwohl die Fotos selbst lokal bleiben. Dies ist der einzige externe Datenabfluss der Foto-Funktion. |
| **Kein Rate-Limiting auf Foto-Endpoints** | `familyhub.rate-limit.enabled` ist per Default `false`. |

---

## 10. Anforderungskatalog

### 10.1 Fachliche Anforderungen

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| FA-FOTO-01 | Das System muss Fotos aus einem Synology-Photos-Album als bildschirmfüllende Slideshow anzeigen. | MUSS | Umgesetzt |
| FA-FOTO-02 | Das System muss nach 60 Sekunden Inaktivität automatisch in die Slideshow-Ansicht wechseln. | MUSS | Umgesetzt |
| FA-FOTO-03 | Das System muss dem Benutzer erlauben, DSM-URL, Benutzername und Passwort der NAS über die Oberfläche einzugeben. | MUSS | Umgesetzt |
| FA-FOTO-04 | Das System muss die eingegebenen Zugangsdaten vor dem Speichern durch einen echten Login gegen die NAS verifizieren. | MUSS | Umgesetzt |
| FA-FOTO-05 | Das System muss die auf der NAS verfügbaren Alben auflisten und eine Auswahl genau eines Albums ermöglichen. | MUSS | Umgesetzt (max. 100 Alben) |
| FA-FOTO-06 | Das System muss die Anzahl der Fotos im gewählten Album anzeigen. | SOLL | Umgesetzt |
| FA-FOTO-07 | Das System muss das Trennen der NAS-Verbindung inklusive Löschen aller Zugangsdaten ermöglichen. | MUSS | Umgesetzt |
| FA-FOTO-08 | Das System muss die Anzeigedauer je Bild konfigurierbar machen. | MUSS | Umgesetzt (5/10/30/60/120/300 s) |
| FA-FOTO-09 | Das System muss Übergangseffekte (Überblenden, Schieben, ohne) konfigurierbar machen. | SOLL | Umgesetzt |
| FA-FOTO-10 | Das System muss die Reihenfolge zufällig oder chronologisch darstellen können. | SOLL | Teilweise — „chronologisch“ sortiert **nicht** nach Aufnahmedatum, sondern übernimmt die NAS-Reihenfolge |
| FA-FOTO-11 | Das System muss in der Slideshow Uhrzeit und Datum einblenden können (Position und Format konfigurierbar). | SOLL | Umgesetzt |
| FA-FOTO-12 | Das System soll den Aufnahmeort des aktuellen Fotos als Ortsnamen einblenden. | KANN | Umgesetzt — über externen Dienst (Nominatim) |
| FA-FOTO-13 | Das System soll das aktuelle Wetter in der Slideshow einblenden. | SOLL | Umgesetzt (feste Position unten rechts) |
| FA-FOTO-14 | Das System soll Dateiname und Aufnahmedatum optional einblenden. | KANN | **Nicht umgesetzt** — Setting `showMetadata` existiert, wird aber nicht gerendert |
| FA-FOTO-15 | Das System soll den nächsten anstehenden Termin in der Slideshow einblenden. | KANN | **Nicht umgesetzt** |
| FA-FOTO-16 | Das System muss Videos aus dem Album abspielen und nach Ende automatisch weiterschalten. | SOLL | Umgesetzt (stumm per Default, kein Streaming) |
| FA-FOTO-17 | Das System muss manuelle Navigation (vor/zurück), Pause und manuelle Aktualisierung anbieten. | SOLL | Umgesetzt |
| FA-FOTO-18 | Das System muss bei leerem Album eine verständliche Meldung anzeigen. | MUSS | Umgesetzt |
| FA-FOTO-19 | Das System muss bei fehlender/abgelaufener NAS-Verbindung eine verständliche, handlungsleitende Fehlermeldung anzeigen. | MUSS | Umgesetzt |
| FA-FOTO-20 | Das System muss bei nicht erreichbarer NAS auf lokal hinterlegte Ersatzbilder zurückfallen. | SOLL | **Nicht umgesetzt** — Assets vorhanden, aber nicht eingebunden |
| FA-FOTO-21 | Das System muss eine Schritt-für-Schritt-Anleitung zur NAS-Einrichtung anbieten. | SOLL | Umgesetzt (rein informativ, keine Aktionen) |
| FA-FOTO-22 | Das System muss einen expliziten Verbindungstest mit Rückmeldung anbieten. | SOLL | Teilweise — Test ist implizit Teil von „Verbinden“; kein separater Testbutton |
| FA-FOTO-23 | Das System soll Fotos aus Google Photos beziehen können. | KANN | **Nicht umgesetzt** |
| FA-FOTO-24 | Das System soll lokal hochgeladene Fotos in die Slideshow einbeziehen. | KANN | **Nicht umgesetzt** — DB-Tabelle `photos` und Repository existieren ungenutzt |
| FA-FOTO-25 | Das System muss den lokalen Foto-Cache über die Oberfläche leerbar machen. | SOLL | Umgesetzt (Button „Cache leeren“) |
| FA-FOTO-26 | Das System muss Maßnahmen zur Vermeidung von Display-Einbrennen ergreifen. | SOLL | **Nicht umgesetzt** |

### 10.2 Technische Anforderungen

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| TA-FOTO-01 | Das Backend muss sich über `SYNO.API.Auth` Version 3, Methode `login`, an `/photo/webapi/auth.cgi` authentifizieren und die zurückgelieferte `sid` verwenden. | MUSS | Umgesetzt |
| TA-FOTO-02 | Das Backend muss die Session serverseitig zwischenspeichern und spätestens nach 14 Minuten erneuern. | MUSS | Umgesetzt |
| TA-FOTO-03 | Das Backend muss bei den Synology-Fehlercodes 105, 106, 107 und 119 automatisch neu anmelden und den Aufruf genau einmal wiederholen. | MUSS | Teilweise — gilt nur für JSON-Aufrufe, **nicht** für Binär-Downloads |
| TA-FOTO-04 | Das Backend muss Alben über `SYNO.Foto.Browse.Album` Version 1, Methode `list`, abrufen. | MUSS | Umgesetzt (`offset=0`, `limit=100` fest) |
| TA-FOTO-05 | Das Backend muss Medien über `SYNO.Foto.Browse.Item` Version 1, Methode `list`, mit `additional=["thumbnail","resolution","gps","video_meta"]` abrufen. | MUSS | Umgesetzt |
| TA-FOTO-06 | Das Backend muss Binärdaten über `SYNO.Foto.Download` Version 1, Methode `download`, abrufen und als Proxy an das Frontend ausliefern. | MUSS | Umgesetzt |
| TA-FOTO-07 | Das Backend muss für geteilte Alben den Sharing-Endpoint `/photo/mo/sharing/webapi/entry.cgi` mit Parameter `passphrase` verwenden. | MUSS | Umgesetzt |
| TA-FOTO-08 | Das Backend muss reduzierte Auflösungen (Thumbnails) über `SYNO.Foto.Thumbnail` beziehen. | SOLL | **Nicht umgesetzt** — es wird immer die Originaldatei geladen |
| TA-FOTO-09 | Das Backend muss selbstsignierte NAS-Zertifikate akzeptieren können. | MUSS | Umgesetzt — jedoch **immer** und nicht abschaltbar |
| TA-FOTO-10 | Das Backend muss Verbindungs- und Lesetimeouts für NAS-Aufrufe setzen. | MUSS | Teilweise — Connect- und Connection-Request-Timeout je 30 000 ms, **kein Read-Timeout** |
| TA-FOTO-11 | Das Backend muss das NAS-Passwort verschlüsselt speichern. | MUSS | Umgesetzt (AES-256-GCM) |
| TA-FOTO-12 | Das Backend muss Zugangsdaten und Session-IDs aus Logausgaben maskieren. | MUSS | Teilweise — `passwd` und `_sid` maskiert, `passphrase` **nicht** |
| TA-FOTO-13 | Das Backend muss Synology-Auth-Fehler als HTTP 401 mit maschinenlesbarem Kennzeichen `synology_auth_expired` melden. | MUSS | Umgesetzt |
| TA-FOTO-14 | Das Frontend muss die Foto-Metadaten lokal in IndexedDB zwischenspeichern und beim Start sofort daraus rendern. | MUSS | Umgesetzt (DB `familyhub-photos`, Version 1) |
| TA-FOTO-15 | Das Frontend muss den Metadaten-Cache periodisch mit dem Server abgleichen (Diff-Update statt Vollersatz). | SOLL | Umgesetzt (alle 5 Minuten) |
| TA-FOTO-16 | Das Frontend muss die Bilddaten selbst zwischenspeichern, um Netzwerkausfälle zu überbrücken. | SOLL | **Nicht umgesetzt** — nur HTTP-Cache des Browsers |
| TA-FOTO-17 | Das Frontend muss das jeweils nächste Bild vorladen, um Flackern zu vermeiden. | SOLL | Teilweise — kein aktives Preloading; erreicht über dauerhaftes Rendern aller `<img>`-Elemente |
| TA-FOTO-18 | Alle lesenden Foto-Endpoints müssen gegen unbefugten Zugriff im lokalen Netz geschützt sein. | SOLL | **Nicht umgesetzt** — vollständig unauthentifiziert |
| TA-FOTO-19 | Videos müssen per HTTP-Range-Request streambar sein. | SOLL | **Nicht umgesetzt** — vollständiger Download in den Backend-Heap |
| TA-FOTO-20 | Der Content-Type ausgelieferter Medien muss dem tatsächlichen Dateiformat entsprechen. | MUSS | **Nicht umgesetzt** — fest `image/jpeg` bzw. `video/mp4` |
| TA-FOTO-21 | Die Anzahl abrufbarer Fotos darf nicht künstlich begrenzt sein bzw. muss paginiert werden. | SOLL | **Nicht umgesetzt** — Frontend fordert fest `limit=500`, `offset` immer 0; Alben stets `limit=100` |

---

## 11. Bekannte Schwächen / offene Punkte

### 11.1 Funktionale Fehler und Inkonsistenzen

| Nr. | Beschreibung | Auswirkung |
|-----|--------------|------------|
| 1 | **Thumbnails existieren nicht.** `getPhotoBytes()` ignoriert die Parameter `cacheKey` und `size` und lädt immer die Originaldatei. `/api/synology/thumbnail/{id}` liefert dasselbe Bild wie `/api/synology/photo/{id}`. | Für jedes angezeigte Bild werden mehrere MB übertragen. Auf einem Raspberry-Pi-Display und über WLAN führt das zu langen Ladezeiten und hoher NAS-Last. |
| 2 | **`thumbnailUrl` nutzt `unit_id`, `fullUrl` nutzt `id`.** Beide Werte werden unverändert als `SYNO.Foto.Download&id=…` weitergereicht. | Bei Medien, deren `unit_id` von der `id` abweicht, würde die `thumbnailUrl` ein falsches Bild liefern. Derzeit unkritisch, weil die `thumbnailUrl` im Frontend nicht verwendet wird. |
| 3 | **Kein Retry beim Binär-Download.** Läuft die Session zwischen Metadatenabruf und Bildabruf ab, schlägt der Download mit HTTP 400 fehl, ohne Re-Login-Versuch. | Nach längeren Pausen können einzelne Bilder schwarz bleiben. |
| 4 | **Kein `onError`-Handler an `<img>`/`<video>`.** Fehlgeschlagene Bilder werden nicht übersprungen. | Die Slideshow zeigt schwarze Kacheln für die volle Anzeigedauer. |
| 5 | **Re-Shuffle alle 5 Minuten.** Der `useMemo`-Shuffle hängt an `cachedPhotos`; jeder Auto-Refresh erzeugt eine neue Array-Instanz. | Sprünge in der Reihenfolge, Wiederholungen, ausgelassene Bilder. |
| 6 | **„Chronologisch“ sortiert nicht.** Der Zweig übernimmt die Serverliste unverändert; `takenAt` wird nicht zum Sortieren genutzt. | Die Option erfüllt ihren Namen nicht. |
| 7 | **`showMetadata` ist wirkungslos.** Setting wird gespeichert, aber in keiner Komponente ausgewertet. | Toter Schalter in der UI. |
| 8 | **Key-Namensschema-Bruch bei Slideshow-Settings.** DB-Seed verwendet `duration_seconds`, `show_clock` usw., Frontend liest `durationSeconds`, `showClock`. | Seed-Defaults greifen nie; nach dem ersten Speichern liegen doppelte Karteileichen in `settings`. |
| 9 | **Widersprüchliche Defaults.** `DEFAULT_CONFIG` in `PhotosViewApi.tsx` (`none`/`0`/`bottom-left`) vs. Parse-Fallbacks (`fade`/`1000`/`top-right`) vs. `SlideshowSettings.tsx` (`fade`/`1000`/`top-right`). | Unterschiedliches Verhalten je nachdem, ob der Settings-Abruf erfolgreich war. |
| 10 | **Harte Obergrenzen.** Maximal 100 Alben, maximal 500 Fotos (`offset` nie ungleich 0). | Größere Alben werden stillschweigend abgeschnitten, ohne Hinweis an den Nutzer. |
| 11 | **Bis zu 500 `<img>`-Elemente gleichzeitig im DOM.** Da alle absolut positioniert im Viewport liegen, greift `loading="lazy"` kaum. | Sehr hoher Speicherverbrauch, potenziell Hunderte MB Downloads unmittelbar nach dem Start der Slideshow. |
| 12 | **`getOrFetchPassphrase()` cacht das Negativergebnis nicht.** Bei persönlichen Alben wird vor **jedem** Bilddownload eine Album-Liste vom NAS geholt. | Verdoppelt die NAS-Requests; zusätzliche Latenz je Bildwechsel. |
| 13 | **`getConnectionStatus()` ruft das NAS auf.** Für `photoCount` wird `listAlbums()` ausgeführt — inklusive potenziellem Login. | `GET /api/synology/status` ist teuer und kann 30 s hängen, obwohl es nur Statusinformation liefern soll. Das Frontend ruft ihn beim Start zweimal auf. |
| 14 | **`synology.api_path` wird geschrieben, aber nie gelesen.** | Irreführendes Setting. |
| 15 | **`SYNO.API.Info` wird nicht genutzt.** Pfade (`photo/webapi`) und Versionen (3 bzw. 1) sind hart kodiert. | Bricht bei DSM-Versionen, die andere Pfade/Versionen erfordern. |
| 16 | **Kein `session`- und kein `format`-Parameter beim Login.** | Verhalten hängt von DSM-Defaults ab; keine saubere Session-Trennung gegenüber anderen DSM-Anwendungen. |
| 17 | **Keine 2FA-Unterstützung.** Fehlercode 403 wird nur gemeldet, es gibt keine OTP-Eingabe. | Sicherheitsbewusste Nutzer können ihr NAS-Konto nicht einbinden. |
| 18 | **Sonderzeichen im Passwort.** `.encode()` maskiert keine in Query-Strings legalen Zeichen wie `&`, `=` oder `+`. | Passwörter mit diesen Zeichen führen zu unerklärlichen Login-Fehlern. |
| 19 | **Nur der Personal Space wird unterstützt.** `SYNO.FotoTeam.*` wird nicht angesprochen. | Fotos im gemeinsamen Bereich der NAS sind nicht nutzbar, sofern kein persönlich geteiltes Album existiert. |
| 20 | **Fehlender Read-Timeout.** Nur Connect- und Connection-Request-Timeout sind gesetzt. | Ein hängendes NAS kann Servlet-Threads dauerhaft blockieren. |
| 21 | **Netzwerkfehler werden HTTP 500.** `ResourceAccessException` wird nirgends gefangen. | Der Nutzer bekommt „Sync fehlgeschlagen“ statt eines klaren Hinweises „NAS nicht erreichbar“. |
| 22 | **Content-Type ist fest verdrahtet.** PNG/HEIC/WebP werden als `image/jpeg` deklariert. | Manche Browser/Bildbetrachter verweigern die Darstellung. |
| 23 | **Videos ohne Streaming.** Vollständiger Puffer im Backend-Heap, keine Range-Requests. | Ein 500-MB-Video kann das Backend zum Absturz bringen (`OutOfMemoryError`). |
| 24 | **Toter Code.** `PhotosView.tsx`, `assets/slideshow/*.jpg`, Entität `Photo`, Tabelle `photos`, `PhotoRepository`, `SlideshowConfigResponse`, `SlideshowPhotoResponse`, `SynoApiInfoData`, DTO-Felder `filesize`, `indexed_time`, `m`, `xl`, `video_codec`, `audio_codec`, `bitrate`, `framerate`, `did`, `cant_migrate_condition`. | Erhöht die Einstiegshürde und suggeriert Funktionen, die es nicht gibt. |
| 25 | **Umlaut-Verlust in deutschen UI-Texten.** In `SynologySettings.tsx` und `SlideshowSettings.tsx` durchgängig „auswahlen“, „Ubergangseffekt“, „Zufallig“, „Anderungen“, „fur“, „Mochtest“, „geloscht“. | Wirkt unfertig; muss in der Neuauflage korrigiert werden. |

### 11.2 Sicherheits- und Datenschutzlücken

Siehe [Kapitel 9.2](#92-risiken). Die drei gravierendsten Punkte:

1. Sämtliche lesenden Foto-Endpoints sind unauthentifiziert und über eine Wildcard-CORS-Policy
   erreichbar.
2. Die Album-Passphrase liegt im Klartext in der Datenbank **und** unmaskiert im INFO-Log.
3. GPS-Koordinaten privater Fotos werden an einen öffentlichen Internet-Geocodingdienst gesendet.

### 11.3 Nicht ermittelbare Punkte

| Frage | Status |
|-------|--------|
| Tatsächliche serverseitige Sortierreihenfolge von `SYNO.Foto.Browse.Album/list` und `SYNO.Foto.Browse.Item/list` ohne `sort_by` | **Im Code nicht ermittelbar** — es werden keine Sortierparameter gesendet; die Reihenfolge ist ein DSM-Default. |
| Tatsächliche Session-Lebensdauer in DSM | **Im Code nicht ermittelbar** — die 15 Minuten sind nur ein Kommentar, DSM liefert dazu kein Feld. |
| Verhalten bei DSM-Versionen < 7.0 | **Im Code nicht ermittelbar** — der Wizard nennt DSM 7.0 als Mindestanforderung, geprüft wird nichts. |
| Ob `SYNO.Foto.Download` mit `id` als Einzelwert (statt `unit_id`-Array) auf allen DSM-Versionen funktioniert | **Im Code nicht ermittelbar** |
| Maximale Pool-Größe der HTTP-Verbindungen | **Im Code nicht ermittelbar** — Defaults des `PoolingHttpClientConnectionManager` werden nicht überschrieben. |

---

## 12. Empfehlungen für die Neuauflage

> Die folgenden Punkte sind **Empfehlungen** und beschreiben ausdrücklich **nicht** den Ist-Zustand.

### 12.1 Authentifizierung und Session

| Nr. | Empfehlung |
|-----|------------|
| E-01 | **Passwort nur einmal verwenden, dann verwerfen.** Beim Verbinden einmal `login` mit `enable_syno_token=yes` durchführen und danach ausschließlich mit `sid` bzw. `SynoToken` arbeiten. Idealerweise DSM-Anwendungsberechtigungen so einschränken, dass der Account nur Synology Photos lesen darf. |
| E-02 | **Login-Parameter vollständig setzen:** `session=FamilyHub`, `format=sid`, optional `enable_device_token=yes` mit `device_id`/`device_name`, damit 2FA-Konten nach einmaliger OTP-Eingabe dauerhaft funktionieren. |
| E-03 | **2FA unterstützen:** Bei Fehlercode 403 ein Eingabefeld für `otp_code` anzeigen und den Login mit `otp_code` wiederholen. |
| E-04 | **Session robuster erneuern:** Ablaufzeitpunkt nicht raten, sondern bei jedem 105/106/107/119 einen Re-Login mit exponentiellem Backoff und maximal n Versuchen durchführen — **auch für Binär-Downloads**. Der Retry gehört in einen zentralen HTTP-Interceptor, nicht in einzelne Methoden. |
| E-05 | **Passwortsonderzeichen sauber kodieren:** Parameter mit expliziter `URLEncoder`-Kodierung setzen oder auf `POST` mit `application/x-www-form-urlencoded` wechseln, damit `&`, `=` und `+` nicht den Query-String zerlegen. |
| E-06 | **Zertifikatsprüfung konfigurierbar machen:** Default „prüfen“; TrustAll nur als bewusst zu aktivierende Option mit deutlicher UI-Warnung. Besser: Import des NAS-Zertifikats in einen anwendungseigenen Truststore. |

### 12.2 Bildabruf und Performance

| Nr. | Empfehlung |
|-----|------------|
| E-07 | **Thumbnails tatsächlich verwenden.** `SYNO.Foto.Thumbnail` mit `id`, `cache_key`, `type=unit` und `size` (`sm`/`m`/`xl`) implementieren und die Größe an die Displayauflösung koppeln. Das reduziert das Übertragungsvolumen typischerweise um Faktor 5–20. |
| E-08 | **Serverseitigen Bild-Cache einführen** (Platte oder Redis), geschlüsselt über `id + cache_key + size`, mit konfigurierbarem Größenlimit und LRU-Eviction. `cache_key` ändert sich bei Bildänderung und eignet sich damit als natürlicher Cache-Key. |
| E-09 | **Korrekte HTTP-Semantik:** `ETag` aus `cache_key` ableiten, `Last-Modified` aus `time`, `304 Not Modified` unterstützen, echten Content-Type aus den Bytes ermitteln (Magic Bytes / `Files.probeContentType`). |
| E-10 | **Videos streamen** statt puffern: `StreamingResponseBody`/`ResourceRegion` mit Range-Request-Unterstützung, damit große Dateien weder Speicher noch Startzeit belasten. |
| E-11 | **Paginierung durchreichen:** Album- und Medienlisten seitenweise laden (`offset`/`limit` in Schleife oder Endless-Loading), statt bei 100 bzw. 500 stumm abzuschneiden. |
| E-12 | **Nur ein Fenster von Bildern im DOM halten** (z. B. aktuelles, vorheriges, nächste zwei) und die nächsten Bilder aktiv per `new Image().src` oder `<link rel="preload">` vorladen. |
| E-13 | **Read-/Response-Timeout setzen** (z. B. 10 s für JSON, 60 s für Downloads) und Verbindungspool explizit dimensionieren. |

### 12.3 Funktionale Erweiterungen

| Nr. | Empfehlung |
|-----|------------|
| E-14 | **Mehrere Alben und Album-Sets** zulassen, inklusive Personal Space **und** Shared Space (`SYNO.FotoTeam.Browse.*`) sowie Ordner- statt Albumauswahl. |
| E-15 | **Filter anbieten:** nach Zeitraum („nur die letzten 12 Monate“), nach Personen (Gesichtserkennung via `SYNO.Foto.Browse.Person`), nach Tags/Geo, sowie „Videos ein-/ausschließen“ als eigener Schalter. |
| E-16 | **Echte chronologische Sortierung** nach `takenAt` implementieren, zusätzlich Modi wie „Rückblick: heute vor N Jahren“. |
| E-17 | **Lokaler Fallback:** Die bereits vorhandenen Bilder unter `assets/slideshow/` einbinden und anzeigen, wenn die NAS unerreichbar ist — mit dezenter Statusanzeige „NAS nicht erreichbar“. |
| E-18 | **Fehlerhafte Bilder überspringen:** `onError` am `<img>` registrieren, das betreffende Element aus der Anzeige-Liste entfernen und sofort weiterschalten. |
| E-19 | **`showMetadata` implementieren** (Dateiname, Aufnahmedatum, Ort) oder den Schalter entfernen. |
| E-20 | **Nächsten Termin einblenden**, wie in `PRODUCT_REQUIREMENTS.md` skizziert. |
| E-21 | **Burn-in-Schutz:** Overlays langsam um wenige Pixel driften lassen (Pixel-Shift), Ken-Burns-Effekt für die Bilder, konfigurierbare Nachtabschaltung/Dimmung nach Zeitplan. |
| E-22 | **Seitenverhältnis pro Bild entscheiden:** Hochformatbilder im Landscape-Modus mit `object-contain` plus unscharfem Hintergrund aus demselben Bild darstellen, statt sie zu beschneiden; oder zwei Hochformatbilder nebeneinander zeigen. |
| E-23 | **Stabile Wiedergabereihenfolge:** Shuffle nur einmal je Durchlauf berechnen (seeded, z. B. `useRef` statt `useMemo`) und beim Hintergrund-Refresh nur neue Elemente anhängen. |

### 12.4 Sicherheit, Datenschutz und Betrieb

| Nr. | Empfehlung |
|-----|------------|
| E-24 | **Alle Foto-Endpoints absichern** — mindestens Session-Cookie oder signierte, kurzlebige Bild-URLs; CORS auf konkrete Origins beschränken statt `*` mit `allowCredentials`. |
| E-25 | **Album-Passphrase verschlüsseln** (gleicher Mechanismus wie das Passwort) und in `sanitizeUrl()` in die Maskierungs-Regex aufnehmen. |
| E-26 | **Schlüsselableitung härten:** PBKDF2/Argon2 statt `padEnd('0')`; Start verweigern, wenn der Default-Schlüssel `defaultKey…` in Produktion aktiv ist. |
| E-27 | **Reverse-Geocoding lokal lösen** — offline-Datenbank (z. B. GeoNames-Cities-Auszug) im Backend, damit keine GPS-Daten das Haus verlassen. Alternativ als Opt-in mit klarem Hinweistext. |
| E-28 | **Struktur der Fehlermeldungen vereinheitlichen:** maschinenlesbare Fehlercodes (`nas_unreachable`, `nas_auth_failed`, `nas_2fa_required`, `album_empty`, `album_missing`) statt freier Texte; das Frontend übersetzt sie in deutsche Meldungen. |
| E-29 | **Netzwerkfehler sauber abbilden:** `ResourceAccessException` fangen und als HTTP 503 mit Code `nas_unreachable` melden, nicht als 500. |
| E-30 | **`GET /status` günstig halten:** Fotoanzahl aus dem letzten Sync-Ergebnis lesen oder mit kurzem TTL cachen, statt bei jedem Aufruf das NAS zu befragen. |
| E-31 | **Konfiguration vereinheitlichen:** ein einziges Namensschema für Settings-Keys (durchgängig camelCase **oder** snake_case), typisierte Settings-Objekte statt `Map<String,String>`, und ein Backend-DTO `SlideshowConfigResponse` mit echten Defaults statt Frontend-Fallbacks an drei Stellen. |
| E-32 | **Toten Code entfernen:** ungenutzte Entitäten, Repositories, DTOs, Komponenten und Assets vor dem Neubau ersatzlos streichen oder bewusst neu einplanen. |
| E-33 | **Verbindungstest als eigenständige Aktion** anbieten („Verbindung testen“ neben „Verbinden“), mit Rückmeldung zu DSM-Version, erreichbarem Photos-Paket und Anzahl sichtbarer Alben. |
