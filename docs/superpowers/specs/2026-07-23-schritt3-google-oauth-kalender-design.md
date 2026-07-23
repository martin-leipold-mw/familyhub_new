# Design: Schritt 3 — Google-Anbindung (OAuth + Kalender-Sync)

**Datum:** 2026-07-23
**Status:** Genehmigt
**Build-Order-Stufe:** 3 von 10

## Kontext

Stufe 1 (Scaffold, CI, DB, Security-Modell) und Stufe 2 (Familienmitglieder, Settings, PIN, 3-Schritt-Setup-Wizard) sind abgeschlossen. Bestehende Konventionen im Neubau: UUID-Primärschlüssel, ein einziger `FAMILYHUB_ENCRYPTION_KEY` mit Fail-Fast-`StartupValidator`, Feature-Packages, OpenAPI-first mit Orval-Client-Generierung, PIN-Session per `HandlerInterceptor`, RFC-9457-Problem-Details über einen zentralen `GlobalExceptionHandler`.

Stufe 3 fügt die Google-Anbindung hinzu: OAuth-2.0-Flow, Credentials-Verwaltung und den vollständigen Kalender-Sync (Events lesen **und** schreiben, lokaler Spiegel). Die fachliche Grundlage steht in `docs/concept/06-google-integration.md`; Kapitel 16 dort enthält die Empfehlungen für den Neubau, deren MUSS-Punkte hier umgesetzt werden.

Das Konzept beschreibt zu großen Teilen das **Altsystem** (mit dokumentierten Defekten). Diese Spec beschreibt den **Neubau** und weicht dort bewusst ab, wo das Altsystem Fehler hatte.

### Getroffene Grundsatzentscheidungen

| Thema | Entscheidung |
|-------|-------------|
| Zuschnitt | OAuth-Flow + voller Kalender-Sync (Event lesen/schreiben, lokaler Spiegel); **ohne** Wochen-/Tagesansicht (Stufe 4), **ohne** Tasks (Stufe 5) |
| API-Client | Offizielle Google-Client-Library (bringt Token-Refresh, Backoff, Pagination, Fehlerklassifikation mit) |
| Multi-Account | Voll: mehrere OAuth-Client-Credentials (mit Primary) **und** mehrere verbundene Google-Konten (je Mitglied eines) |
| OAuth-Security | State-Nonce (TTL, Einmalgebrauch) **und** PKCE (S256) |
| Callback | Frontend-Route `/oauth/callback`, die Code+State ans Backend weiterreicht |
| Kalender-Ausleihe | verschoben auf Stufe 4 |
| Sync-Auslöser | Scheduler (Default 15 min, verpasste Läufe protokolliert) **und** manueller Trigger |
| Schreibrichtung | Sofort an Google pushen; bei Sync-Divergenz „Google gewinnt" (kein Konflikt-UI) |

---

## 1. Datenmodell & DB-Migrationen

Neue Flyway-Migrationen ab `V4`. Alle Tabellen UUID-PK, konsistent zum bestehenden Schema. Bewusste Verbesserungen gegenüber dem Altsystem: eigene Tabelle für Kalenderauswahl + Sync-Token (statt komma-separierter String im Settings-Store), Unique-Constraints gegen Duplikate, `status`-Feld für Verbindungen, `last_synced_at` wird tatsächlich geschrieben.

### V4 — `google_credentials.sql`

OAuth-Client-Credentials; ein Datensatz = ein Google-Cloud-Projekt / OAuth-Client.

| Spalte | Typ | Null | Bemerkung |
|--------|-----|------|-----------|
| `id` | UUID PK | nein | `gen_random_uuid()` |
| `client_id` | TEXT | nein | AES-GCM-verschlüsselt, Base64 |
| `client_secret` | TEXT | nein | AES-GCM-verschlüsselt, Base64 |
| `redirect_uri` | VARCHAR(512) | nein | Klartext, normalisiert |
| `nickname` | VARCHAR(100) | nein | Anzeigename, z. B. „Familie" |
| `is_primary` | BOOLEAN | nein | Default `false`; genau einer `true` |
| `is_active` | BOOLEAN | nein | Default `true` |
| `created_at` | TIMESTAMPTZ | nein | Default `NOW()` |
| `updated_at` | TIMESTAMPTZ | nein | Default `NOW()` |

Partieller Unique-Index `WHERE is_primary = true` erzwingt max. einen Primary auf DB-Ebene.

### V5 — `google_connections.sql`

Verbundenes Google-Konto je Familienmitglied.

| Spalte | Typ | Null | Bemerkung |
|--------|-----|------|-----------|
| `id` | UUID PK | nein | |
| `family_member_id` | UUID FK → `family_members(id)` ON DELETE CASCADE | nein | Besitzer |
| `credentials_id` | UUID FK → `google_credentials(id)` ON DELETE SET NULL | ja | verwendete Client-Credentials |
| `google_account_id` | VARCHAR(255) | nein | UserInfo `sub` |
| `email` | VARCHAR(320) | nein | Kontokennung |
| `access_token` | TEXT | ja | AES-GCM-verschlüsselt |
| `refresh_token` | TEXT | nein | AES-GCM-verschlüsselt |
| `token_expires_at` | TIMESTAMPTZ | ja | |
| `scopes` | JSONB | nein | erteilte Scope-URLs |
| `status` | VARCHAR(20) | nein | `active` \| `revoked` (bei `invalid_grant`) |
| `connected_at` | TIMESTAMPTZ | nein | Default `NOW()` |
| `last_synced_at` | TIMESTAMPTZ | ja | **wird** nach jedem Sync geschrieben |

Unique: `(google_account_id)`. Indizes auf `family_member_id`, `credentials_id`.

### V6 — `calendar_subscriptions.sql`

Pro Verbindung die verfügbaren Kalender inkl. Auswahl-Flag und inkrementellem Sync-Token (ersetzt den Settings-String des Altsystems, Konzept-Empfehlung 14).

| Spalte | Typ | Null | Bemerkung |
|--------|-----|------|-----------|
| `id` | UUID PK | nein | |
| `connection_id` | UUID FK → `google_connections(id)` ON DELETE CASCADE | nein | |
| `google_calendar_id` | VARCHAR(255) | nein | |
| `summary` | VARCHAR(512) | nein | Kalendername |
| `background_color` | VARCHAR(9) | ja | von Google |
| `is_primary` | BOOLEAN | nein | Google-Primärkalender |
| `is_selected` | BOOLEAN | nein | Default `false`; vom Nutzer zum Sync gewählt |
| `sync_token` | TEXT | ja | Google incremental sync token, je Kalender |
| `created_at` | TIMESTAMPTZ | nein | Default `NOW()` |
| `updated_at` | TIMESTAMPTZ | nein | Default `NOW()` |

Unique: `(connection_id, google_calendar_id)`.

### V7 — `events.sql`

Lokaler Event-Spiegel.

| Spalte | Typ | Null | Bemerkung |
|--------|-----|------|-----------|
| `id` | UUID PK | nein | |
| `subscription_id` | UUID FK → `calendar_subscriptions(id)` ON DELETE CASCADE | nein | Herkunftskalender |
| `google_event_id` | VARCHAR(1024) | nein | |
| `google_calendar_id` | VARCHAR(255) | nein | |
| `owner_member_id` | UUID FK → `family_members(id)` | nein | Besitzer (= verbundenes Mitglied) |
| `title` | VARCHAR(1024) | nein | Fallback „Ohne Titel" (deutsch) |
| `description` | TEXT | ja | |
| `location` | VARCHAR(1024) | ja | |
| `start_time` | TIMESTAMPTZ | ja | UTC; nur bei Zeitpunkt-Terminen |
| `end_time` | TIMESTAMPTZ | ja | UTC; nur bei Zeitpunkt-Terminen |
| `is_all_day` | BOOLEAN | nein | Default `false` |
| `all_day_start` | DATE | ja | für Ganztagstermine |
| `all_day_end` | DATE | ja | inklusiv gespeichert (Googles exklusives `end.date` beim Lesen −1 Tag) |
| `recurrence_id` | VARCHAR(255) | ja | Instanz-Kennung (nur `singleEvents=true`) |
| `etag` | VARCHAR(255) | ja | für „Google gewinnt"-Vergleich |
| `google_updated` | TIMESTAMPTZ | ja | Googles `updated` |
| `sync_status` | VARCHAR(20) | nein | `synced` \| `pending` \| `error` |
| `created_at` | TIMESTAMPTZ | nein | Default `NOW()` |
| `updated_at` | TIMESTAMPTZ | nein | Default `NOW()` |

Unique: `(google_event_id, google_calendar_id)` (Konzept-Empfehlung 16, verhindert Duplikate). Index auf `(start_time, end_time)` und `owner_member_id`.

### Settings-Keys (kein neuer Table)

| Key | Default | Bemerkung |
|-----|---------|-----------|
| `google.sync.interval.minutes` | `15` | Scheduler-Intervall |
| `family.timezone` | `Europe/Berlin` | anwendungsweite Zeitzone (Konzept-Empfehlung 22) |
| `google.connected` | `false` | wird beim ersten verbundenen Konto `true` |

Migration `V8__google_settings_keys.sql` fügt die drei Keys mit Defaultwerten ein.

### In-Memory-State (analog PIN-Sessions)

`OAuthStateStore` — `ConcurrentHashMap<String, OAuthStateEntry>`, Key = State-Nonce, Wert = `{credentialsId, returnUrl, pkceVerifier, createdAt}`. TTL 10 Minuten, Einmalverbrauch beim Callback (`consume` entfernt den Eintrag). Verlust bei Backend-Neustart ist akzeptabel (ein laufender OAuth-Vorgang bricht dann ab und wird neu gestartet).

---

## 2. Backend-Architektur

Neues Feature-Package `com.familyhub.google`, in Sub-Packages gegliedert; jede Einheit hat einen klaren Zweck und ist unabhängig testbar.

```
com.familyhub.google
  credentials/   GoogleCredentials (entity/repo), CredentialsService, CredentialsController
  connection/    GoogleConnection (entity/repo), ConnectionService, GoogleAuthController
  oauth/         OAuthStateStore, PkceGenerator, GoogleOAuthFlow, RedirectUriNormalizer
  token/         GoogleTokenProvider, TokenRefreshService
  calendar/      CalendarSubscription + Event (entities/repos), GoogleCalendarClient,
                 CalendarSyncService, EventMapper, EventService,
                 CalendarController, EventController
  sync/          CalendarSyncScheduler, SyncRunLogger
  crypto/        EncryptionService
```

### Schlüsselkomponenten

- **`EncryptionService`** — AES-256-GCM, zufälliger 12-Byte-IV je Datensatz, GCM-Tag 128 Bit, Ausgabe `Base64(IV ‖ Ciphertext ‖ Tag)`. Schlüssel aus `FAMILYHUB_ENCRYPTION_KEY` per SHA-256 auf exakt 32 Byte abgeleitet (statt pad/truncate wie im Altsystem, das bei Nicht-ASCII brach). Verschlüsselt Tokens **und** Credentials mit demselben Schlüssel (kein zweiter Schlüssel wie im Altsystem). Nutzt den bestehenden `StartupValidator`.
- **`GoogleTokenProvider`** (Konzept-Empfehlung 25) — *die einzige* Stelle, die einen gültigen Access-Token liefert. Prüft Ablauf mit 60-Sekunden-Puffer, refresht bei Bedarf über die Library, persistiert den neuen Token verschlüsselt und liefert einen fertig konfigurierten Calendar-Client. Beseitigt die duplizierte `getValidAccessToken()`-Logik des Altsystems. Bei `invalid_grant` → Connection `status = revoked`.
- **`GoogleCalendarClient`** — dünner Wrapper um `google-api-services-calendar`; die Library übernimmt Pagination, Backoff, Timeouts.
- **`GoogleOAuthFlow`** — baut die Authorization-URL (client_id aus DB, `access_type=offline`, `prompt=consent`, PKCE-Challenge, State-Nonce) und tauscht den Code gegen Tokens (mit `code_verifier` und client_secret).
- **`RedirectUriNormalizer`** — normalisiert (Schema/Host lowercase, Fragment und Userinfo entfernen) und erzwingt `https` für Nicht-localhost-Hosts (Konzept-Empfehlung 7).

### Gradle-Abhängigkeiten (neu)

`com.google.apis:google-api-services-calendar`, `com.google.api-client:google-api-client`, `com.google.oauth-client:google-oauth-client` (mit PKCE-Unterstützung), `com.google.auth:google-auth-library-oauth2-http`, `com.google.http-client:google-http-client-jackson2`.

---

## 3. OAuth-2.0-Flow (State-Nonce + PKCE)

Ablauf beim Verbinden eines Kontos:

```
1. FE: GET /api/v1/google/auth/authorize?credentialsId={id}&returnUrl=/setup
2. BE: - Credentials laden, client_id entschlüsseln
       - PKCE: code_verifier (zufällig) + code_challenge (S256) erzeugen
       - state = zufälliger Nonce (>=128 Bit, base64url)
       - OAuthStateStore.put(state -> {credentialsId, returnUrl, verifier}, TTL 10min)
       - authUrl bauen (scope, access_type=offline, prompt=consent,
         code_challenge, code_challenge_method=S256, state)
       -> 200 {"authUrl": "..."}
3. FE: window.location.href = authUrl
4. Google: Kontoauswahl + Einwilligung -> 302 auf {redirectUri}?code=&state=
5. FE (/oauth/callback-Seite): liest code, state, error
       -> bei error: Meldung "Google-Authentifizierung wurde abgebrochen."
       -> sonst: POST /api/v1/google/auth/callback {code, state}
6. BE: - OAuthStateStore.consume(state) -> {credentialsId, returnUrl, verifier}
         · fehlt/abgelaufen -> 400 "Ungültiger oder abgelaufener Anmeldevorgang." (CSRF-Schutz)
       - Code->Token tauschen (mit code_verifier, client_secret)
       - kein refresh_token? -> 400 fachlich (nicht 500, behebt TA-GOO-07)
       - UserInfo holen (sub, email, name, picture)
       - google_connections nach google_account_id (sub) suchen:
         · gefunden -> zugehöriges FamilyMember aktualisieren (name), isNewMember=false
         · nicht gefunden -> neues FamilyMember anlegen (name aus UserInfo,
           role='parent' Default, zufällige Farbe aus der Palette, Default-Avatar),
           isNewMember=true
       - Tokens verschlüsselt in google_connections speichern (status=active);
         bei Re-Auth neues refresh_token UND scopes übernehmen (behebt TA-GOO-08)
       - settings google.connected = true
       -> 200 {memberId, memberName, isNewMember, returnUrl}
7. FE: "Erfolgreich verbunden!" -> Rücksprung auf returnUrl (Wizard "Kalender wählen")
```

**Callback als POST mit JSON-Body** (statt GET wie Altsystem): kein Code in Query-Logs; das Frontend ruft ihn über den regulären API-Client auf, nicht hartkodiert. Der State-Nonce macht Account-Injection unmöglich (behebt Altsystem-Schwäche 15.1).

**Fehlendes Refresh-Token:** Liefert Google kein `refresh_token`, antwortet der Callback mit **HTTP 400** und der fachlichen Meldung „Google hat kein Refresh-Token geliefert. Bitte den Zugriff in den Google-Kontoeinstellungen entfernen und erneut verbinden." — nie HTTP 500.

**Redirect-URI — eine einzige Wahrheit:** `<origin>/oauth/callback`. Identisch ausgegeben im Wizard-Guide-Text, in der Vorbelegung des Credentials-Formulars und in der `INSTALLATION.md`. `RedirectUriNormalizer` erzwingt `https` für Nicht-localhost-Hosts.

### Scopes

`https://www.googleapis.com/auth/calendar`, `.../auth/userinfo.profile`, `.../auth/userinfo.email`. (Kein `tasks`-Scope in Stufe 3 — kommt mit Stufe 5.) Die tatsächlich erteilten Scopes werden in `google_connections.scopes` persistiert und vor Kalender-Aufrufen geprüft.

---

## 4. Credentials-Verwaltung (echter Verbindungstest)

`CredentialsService`: CRUD + Primary-Verwaltung. Beim Setzen eines neuen Primary wird der bisherige atomar (in einer Transaktion) auf `false` gesetzt. Client-ID und Client-Secret werden **nie** im Klartext über die API zurückgegeben.

**„Verbindung testen"** (`POST /validate`) macht einen **echten** Aufruf (behebt Altsystem-Schwäche 15.3): `POST https://oauth2.googleapis.com/token` mit `grant_type=authorization_code` und absichtlich ungültigem Code. Auswertung:

| Google-Antwort | Bedeutung | Rückgabe |
|----------------|-----------|----------|
| `invalid_client` | Client-ID/Secret falsch | `{isValid:false, "Client-ID oder Secret ist ungültig."}` |
| `invalid_grant` | Credentials gültig (nur der Code ist erwartbar ungültig) | `{isValid:true, "Verbindung erfolgreich!"}` |
| Netzwerk-/sonstiger Fehler | — | `{isValid:false, <passende Meldung>}` |

---

## 5. Kalender-Sync

**Auslöser:** `CalendarSyncScheduler` (`@Scheduled`, Intervall aus `google.sync.interval.minutes`) **plus** manueller Trigger-Endpoint. Überlappungsschutz via In-Memory-Lock je Connection; verpasste Läufe werden protokolliert (`SyncRunLogger` → Log + `last_synced_at`).

**Pro Lauf, je aktiver Connection (`status=active`), je `is_selected`-Subscription:**

1. **Kalenderliste aktualisieren** (`calendarList.list`, Library-Pagination) → `calendar_subscriptions` upserten (neu entdeckte Kalender: `is_selected=false`).
2. **Events inkrementell holen**: `events.list(calendarId, syncToken=…, singleEvents=true)`.
   - Kein/abgelaufener `syncToken` (HTTP 410) → **Vollsync** des Zeitfensters **−1 Monat … +12 Monate** relativ zu heute, danach frischen `syncToken` speichern.
   - Die Library durchläuft **alle** Seiten (behebt Datenverlust-Schwäche 15.4).
3. **Mapping** (`EventMapper`) Google-Event → lokales `Event`:
   - Ganztag: `start.date`/`end.date`, exklusives Enddatum beim Lesen −1 Tag → `all_day_start`/`all_day_end` (inklusiv), `is_all_day=true` (Konzept-Empfehlung 23).
   - Zeitpunkt: `start.dateTime`/`end.dateTime` → UTC in `start_time`/`end_time`.
   - `status == "cancelled"` → **lokal löschen** (nur bei bestätigter Löschung; nie „fehlt in Antwort → löschen").
   - Upsert per `(google_event_id, google_calendar_id)`; `etag`/`google_updated` mitschreiben; `sync_status=synced`.
4. `last_synced_at` der Connection setzen.

**Serientermine:** ausschließlich über `singleEvents=true` (jede Instanz als eigener Datensatz). Keine lokale RRULE-Expansion in Stufe 3.

**Schreiben (FamilyHub → Google), „sofort pushen":**

- `POST /events` (create) / `PUT /events/{id}` (update) / `DELETE /events/{id}`:
  1. Aufruf an Google (Library) auf dem Zielkalender.
  2. Bei Erfolg: lokalen Spiegel aus der Google-Antwort aktualisieren (`etag`, `google_updated`), `sync_status=synced`.
  3. Löschen: erst bei Google, dann lokal.
- **„Google gewinnt":** Der nächste Sync überschreibt lokale Divergenzen mit dem Google-Stand (`etag`-Vergleich). Kein Konflikt-UI in Stufe 3.
- Schreibziel-Kalender: Standard ist der Primärkalender der Connection; optional `calendarId` im Request.

### Fehler- & Robustheit

- **Timeouts** am HTTP-Transport der Library (Connect 5 s / Read 30 s) — Konzept-Empfehlung 11.
- **Retry/Backoff** für 429/5xx über die Library; `Retry-After` respektiert.
- **`invalid_grant`** (widerrufenes Refresh-Token): Connection `status=revoked`, Sync setzt dieses Konto aus, `google.connected` bleibt bestehen; die UI zeigt „Verbindung abgelaufen — bitte neu verbinden" (behebt TA-GOO-13).
- Fachfehler → RFC-9457-Problem-Details über den bestehenden `GlobalExceptionHandler`; **nie HTTP 500 auf Nutzereingabe**.
- Health-Indicator „google": Anzahl aktiver/abgelaufener Verbindungen, Alter des letzten erfolgreichen Syncs.

---

## 6. REST-API

Alle Endpunkte unter `/api/v1/`, in `api/openapi.yml` ergänzt; Orval generiert daraus den TypeScript-Client.

**Auth-Regel:** Kalender-**Anzeige und Event-CRUD sind öffentlich** (normale Familienaktion, via `memberId` zugeschrieben — analog CLAUDE.md). **Konfiguration** (Credentials, Verbindungen verwalten) ist **PIN-geschützt**, mit der etablierten Ausnahme: *während* des Setups (`setup.completed = false`) offen, da der Wizard vor der PIN-Vergabe läuft. Diese Regel implementiert ein kleiner Guard (`PIN-Session ODER Setup nicht abgeschlossen`), konsistent zum bestehenden `set-pin`-Muster aus Stufe 2.

### Credentials — `/api/v1/google/credentials` (Konfiguration · PIN/Setup)

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET | `/` | Liste (Secret/Client-ID **nie** im Klartext) |
| POST | `/` | Anlegen → 201 |
| GET | `/{id}` | Lesen / 404 |
| PUT | `/{id}` | Ändern / 404 |
| DELETE | `/{id}` | Löschen → 204 |
| PUT | `/{id}/primary` | Primary setzen |
| POST | `/validate` | echter Verbindungstest (Abschnitt 4) |

### OAuth & Verbindungen — `/api/v1/google/auth` und `/api/v1/google/connections`

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET | `/auth/authorize?credentialsId=&returnUrl=` | `{authUrl}` |
| POST | `/auth/callback` `{code,state}` | Code-Tausch, Mitglied + Tokens speichern |
| GET | `/connections` | Status `[{memberId,email,name,status,lastSyncedAt,scopes}]` |
| POST | `/connections/{id}/disconnect` | Google-`revoke` **+** lokal löschen (Konfig · PIN) |
| POST | `/connections/{id}/refresh` | Token-Refresh erzwingen (Konfig · PIN) |

`disconnect` löscht — anders als das Altsystem — **nur die eine** Verbindung, nicht alle (behebt FA-GOO-10), und ruft `POST https://oauth2.googleapis.com/revoke` auf (behebt FA-GOO-09).

### Kalender — `/api/v1/google/calendars`

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET | `/?memberId=` | Kalender der Verbindung `[{calendarId,summary,backgroundColor,isPrimary,isSelected}]` |
| PUT | `/selected` `{memberId,calendarIds[]}` | Auswahl speichern |
| POST | `/sync?memberId=` | manueller Sync → `{created,updated,deleted}` |

### Events — `/api/v1/events` (Anzeige öffentlich, CRUD öffentlich)

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET | `/?start=&end=&memberId=&calendarId=` | aus lokalem Spiegel |
| GET | `/{id}` | Einzeltermin / 404 |
| POST | `/` | anlegen (sofort push zu Google) |
| PUT | `/{id}` | ändern (sofort push) |
| DELETE | `/{id}` | löschen (Google + lokal) |

`start`/`end` werden als ISO-8601 geparst (`Instant` bzw. `LocalDate` → Tagesbeginn in `family.timezone`).

---

## 7. Frontend & Setup-Wizard

### Wizard von 3 auf 7 Schritte erweitert

```
1 Willkommen -> 2 Mitglieder -> 3 Google-Guide -> 4 Credentials
-> 5 Mit Google verbinden -> 6 Kalender wählen -> 7 PIN (schließt Setup ab)
```

- `SettingsService.updateSetupStep` Range `1..7`; `getSetupStatus` liefert zusätzlich `hasCredentials`, `hasConnection`, `hasSelectedCalendars` und berechnet `currentStep` konsistent als **Int** — der Resume springt korrekt an die zuletzt erreichte Stelle (behebt Altsystem-Schwäche 15.8).

**Resume-Logik (`currentStep`), in dieser Reihenfolge:**

| Bedingung | Schritt |
|-----------|---------|
| keine Familienmitglieder | 2 |
| keine Credentials | 3 |
| keine aktive Verbindung | 5 |
| kein Mitglied hat ausgewählte Kalender | 6 |
| keine PIN | 7 |
| sonst (Setup abgeschlossen) | — (Wizard nicht mehr erreichbar) |

### Neue Frontend-Bausteine

- Wizard-Steps: `GoogleGuideStep` (4 Accordion-Checkboxen — Projekt, APIs, Consent-Screen, Client-ID — mit Scope-Liste, Testnutzer-Hinweis und **einer** Redirect-URI), `CredentialsStep` (4 Felder: Nickname, Client-ID, Client-Secret, Redirect-URI mit Vorbelegung `${origin}/oauth/callback` + „Verbindung testen"), `ConnectStep` („Mit Google verbinden", listet die angeforderten Berechtigungen), `CalendarSelectStep` (Primärkalender vorausgewählt, ≥1 Kalender erzwungen).
- Route/Seite `/oauth/callback` (`OAuthCallback.tsx`): liest `code`/`state`/`error`, ruft `POST /api/v1/google/auth/callback` über den **regulären API-Client** auf (nicht hartkodiert), zeigt Erfolg/Fehler und leitet auf `returnUrl` weiter.
- `src/features/google/`: Hooks `useGoogleCredentials`, `useGoogleConnections`, `useCalendars`, `useSyncCalendars`; Komponenten `CredentialsForm`, `ConnectionStatusList`.
- **Settings** erhält Bereich „Google-Konten" (Verbindungsstatus, weiteres Konto verbinden, trennen, Credentials verwalten) und „Kalender verwalten" (Auswahl je Konto) — PIN-geschützt; Aktionen ohne PIN-Session deaktiviert mit Hinweis „Melde dich mit PIN an, um Kalender zu verwalten."
- **Keine Kalenderansicht** (Wochen/Tag) — das ist Stufe 4. Die synchronisierten Events sind in Stufe 3 über `GET /api/v1/events` und den Settings-/Verbindungsstatus nachweisbar erreichbar, aber noch nicht als Kalenderraster dargestellt.

---

## 8. Konfiguration & Dokumentation

- `FAMILYHUB_ENCRYPTION_KEY` (bestehend) wird für Tokens **und** Credentials genutzt; der `StartupValidator` deckt Anwesenheit/Länge/Placeholder bereits ab.
- Settings-Keys aus Abschnitt 1 (Sync-Intervall, Zeitzone, `google.connected`).
- **`INSTALLATION.md`** wird um die Google-Cloud-Einrichtung ergänzt: Projekt anlegen, Google Calendar API aktivieren, OAuth-Consent-Screen (Scopes, Testnutzer-Hinweis inkl. 7-Tage-Refresh-Token-Ablauf im Testing-Status), OAuth-Client-ID mit **einer** Redirect-URI `<origin>/oauth/callback`.

---

## 9. Testing (Definition of Done: über UI erreichbar, Tests grün, CI grün)

- **Backend:** Unit-Tests für `EncryptionService` (Round-Trip, Nicht-ASCII-Schlüssel), `EventMapper` (Ganztag/Zeitzone/„cancelled"), `OAuthStateStore` (TTL, Einmalgebrauch), `GoogleTokenProvider` (Refresh, Ablaufpuffer, `invalid_grant`→`revoked`), `RedirectUriNormalizer`. Integrationstests mit Testcontainers-Postgres und **MockWebServer/WireMock** als Google-Stub: Token-Endpoint, UserInfo, `calendarList`, `events.list` inkl. Pagination und `410`-Vollsync-Pfad, `invalid_grant`, echter Credentials-Validierungspfad. JaCoCo-Coverage-Gate wie bisher.
- **Frontend:** Vitest + MSW für Hooks und Wizard-Steps; Playwright-E2E für den Google-Wizard-Pfad gegen ein gemocktes Backend (Authorize → Callback → Kalenderauswahl → PIN).
- CI (GitHub Actions) muss grün durchlaufen.

---

## 10. Bewusst **nicht** in Stufe 3

- Wochen-/Tagesansicht des Kalenders → **Stufe 4**
- Kalender-Ausleihe / `calendar_assignments` (1:n, Farben/Sichtbarkeit) → **Stufe 4**
- Tasks + Google-Tasks-Sync (inkl. `tasks`-Scope) → **Stufe 5**
- Konflikt-UI, lokale RRULE-Expansion von Serienterminen, SSE-Multi-Device-Aktualisierung
- Schlüsselrotation/-versionierung (späteres Härtungs-Thema)
- Google Photos (Fotos kommen von Synology, Stufe 8)

---

## 11. Referenz: adressierte Konzept-Anforderungen

| ID | Anforderung | Umsetzung in Stufe 3 |
|----|-------------|----------------------|
| FA-GOO-01/02 | Mehrere Credentials, genau ein Primary | V4 + `CredentialsService`, partieller Unique-Index |
| FA-GOO-03 | Mehrere verbundene Konten | V5, ein Konto je Mitglied |
| FA-GOO-04 | Client-ID/Secret nur verschlüsselt, nie via API | `EncryptionService`, Response ohne Klartext |
| FA-GOO-05 | Google-Konfiguration vollständig über UI | Wizard-Steps 3–6 + Settings |
| TA-GOO-03 | Offline-Access + `prompt=consent` | `GoogleOAuthFlow` |
| TA-GOO-04 | State gegen CSRF (Nonce, Einmalgebrauch) | `OAuthStateStore` |
| TA-GOO-05 | Rücksprung-URL nur relativ | `returnUrl`-Sanitisierung |
| TA-GOO-06 | PKCE (S256) | `PkceGenerator` |
| TA-GOO-07 | Fehlendes Refresh-Token → fachlicher Fehler statt 500 | Callback-Handling |
| TA-GOO-08 | Re-Auth übernimmt neues Refresh-Token + Scopes | `ConnectionService` |
| TA-GOO-10 | Tokens AES-256-GCM verschlüsselt | `EncryptionService` |
| TA-GOO-11 | Schlüssel aus Env, Fail-Fast ohne Wert | bestehender `StartupValidator` |
| TA-GOO-12 | Auto-Refresh mit 60-s-Puffer | `GoogleTokenProvider` |
| TA-GOO-13 | `invalid_grant` → Verbindung ungültig, Neuverbindung anfordern | `status=revoked` + UI |
| FA-GOO-09 | Beim Trennen bei Google `revoke` | `disconnect`-Endpoint |
| FA-GOO-10 | Einzelne Konten trennen | `disconnect/{id}` |
| FA-GOO-25/26/27/28 | Mehrstufiger Wizard, Resume, Primärkalender vorausgewählt | Abschnitt 7 |
| Empf. 8 | Pagination vor jeder Löschlogik | Google-Library |
| Empf. 14 | Auswahl + Sync-Token in eigener Tabelle | V6 |
| Empf. 16 | Unique-Constraint gegen Event-Duplikate | V7 |
| Empf. 22/23 | Anwendungsweite Zeitzone, Ganztag als Datumsbereich | `family.timezone`, `all_day_*` |
| Empf. 25 | Zentrale Token-Beschaffung | `GoogleTokenProvider` |
| Empf. 29 | Setup-Status vereinheitlicht (ein Typ, Resume getestet) | Abschnitt 7 |
