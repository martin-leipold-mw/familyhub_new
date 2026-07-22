# Design: Schritt 2 — Familienmitglieder, Settings, PIN, Setup-Wizard

**Datum:** 2026-07-22  
**Status:** Genehmigt  
**Build-Order-Stufe:** 2 von 10

## Kontext

Der Scaffold (Stufe 1) ist abgeschlossen: Backend mit Health-Endpoint, Flyway V1 (`settings` + `family_members`), Frontend mit TanStack Query und generiertem Orval-Client, Docker-Setup und GitHub Actions CI.

Stufe 2 fügt die ersten echten Domänen-Features hinzu: Familienmitglieder-CRUD, Settings-API, PIN-Schutz und einen schlanken Setup-Wizard. Google-OAuth-Schritte werden in Stufe 3 ergänzt.

---

## 1. Datenmodell & DB-Migrationen

### V2 — `family_members` erweitern

Bestehende Tabelle: `id`, `name`, `avatar_url`, `color`, `created_at`, `updated_at`

Neue Spalten:

| Spalte | Typ | Default | Bemerkung |
|--------|-----|---------|-----------|
| `role` | `VARCHAR(10)` | `'child'` | Wert `parent` oder `child` |
| `date_of_birth` | `DATE` | NULL | Optional |
| `is_active` | `BOOLEAN` | `TRUE` | Soft-delete-Flag |
| `avatar_data` | `BYTEA` | NULL | Komprimiertes JPEG, client-seitig verarbeitet |

`avatar_url` bleibt nullable (für spätere Nutzung, z. B. Synology-Fallback), wird in Stufe 2 nicht befüllt.

Avatar-Auslieferung über `GET /api/v1/members/{id}/avatar` (Content-Type: `image/jpeg`).

**Abweichung vom Konzept:** Das Konzept sieht ein persistentes Dateisystem-Volume vor. In dieser Implementierung werden Avatare als `BYTEA` in der DB gespeichert, um das Deployment zu vereinfachen (kein Volume-Management).

### V3 — Settings-Schlüssel

Kein neuer DB-Table. Die bestehende `settings`-Tabelle erhält folgende Keys:

| Key | Wert | Bemerkung |
|-----|------|-----------|
| `pin` | 4–6-stellige Ziffernfolge | Plaintext (PIN ist Kindersicherung, kein Sicherheitsmerkmal); wird **nie** per API zurückgegeben |
| `setup.completed` | `"true"` / `"false"` | Steuert den SetupGuard |
| `setup.step` | `"1"`, `"2"`, `"3"` | Aktueller Wizard-Schritt für Resume |

Migration V3 fügt `setup.completed = 'false'` und `setup.step = '1'` als Initialwerte ein.

### PIN-Sessions

Kein DB-Table. Sessions werden **in-memory** in einer Spring-`@Service`-Bean als `ConcurrentHashMap<UUID, Instant>` gehalten (UUID → last-accessed Zeitstempel). Session-Verlust bei Backend-Neustart ist akzeptabel (PIN ist Kindersicherung). Inaktivitäts-Timeout: **15 Minuten** (fest verdrahtet, nicht konfigurierbar).

---

## 2. Backend-API

### Family Members

Basis-Pfad: `/api/v1/members`

| Method | Pfad | Auth | Beschreibung |
|--------|------|------|--------------|
| GET | `/api/v1/members` | öffentlich | Alle aktiven Mitglieder (is_active = true) |
| POST | `/api/v1/members` | PIN-Session | Mitglied anlegen |
| PUT | `/api/v1/members/{id}` | PIN-Session | Mitglied bearbeiten |
| DELETE | `/api/v1/members/{id}` | PIN-Session | Soft-delete (is_active = false) |
| GET | `/api/v1/members/{id}/avatar` | öffentlich | Avatar-JPEG ausliefern |
| PUT | `/api/v1/members/{id}/avatar` | PIN-Session | Avatar-Bytes hochladen (bereits client-seitig komprimiert) |

**Request-Felder (Create/Update):**
- `name` — String, Pflichtfeld, ≥ 2 Zeichen nach Trimmen
- `role` — Enum `parent` | `child`, Pflichtfeld
- `color` — Enum `blue` | `pink` | `green` | `purple` | `orange` | `teal`, Pflichtfeld
- `dateOfBirth` — ISO-Date `YYYY-MM-DD`, optional

**Response-Felder (Member):**
- `id`, `name`, `role`, `color`, `dateOfBirth`, `isActive`, `createdAt`, `updatedAt`
- `avatarUrl` — `"/api/v1/members/{id}/avatar"` wenn Avatar vorhanden, sonst `null`

### Settings & PIN

| Method | Pfad | Auth | Beschreibung |
|--------|------|------|--------------|
| GET | `/api/v1/settings/setup-status` | öffentlich | Setup-Zustand abfragen |
| POST | `/api/v1/settings/set-pin` | öffentlich* | PIN erstmalig setzen |
| POST | `/api/v1/settings/verify-pin` | öffentlich | PIN prüfen → Session-Token |
| POST | `/api/v1/settings/change-pin` | PIN-Session | PIN nachträglich ändern |
| POST | `/api/v1/settings/complete-setup` | PIN-Session | Setup als abgeschlossen markieren |

*`set-pin` ist serverseitig nur erlaubt solange `setup.completed = "false"` — sonst HTTP 403.

**Setup-Status Response:**
```json
{
  "setupCompleted": false,
  "currentStep": 1,
  "hasFamilyMembers": false,
  "hasPin": false
}
```

**verify-pin Response:**
```json
{ "sessionToken": "550e8400-e29b-41d4-a716-446655440000" }
```

### PIN-Session-Validierung

Ein Spring `HandlerInterceptor` prüft den Header `X-Pin-Session` auf allen geschützten Endpunkten:
1. Header fehlt → HTTP 401
2. Token nicht in der In-Memory-Map → HTTP 401
3. Letzter Zugriff ≥ 15 Minuten zurück → HTTP 401, Token entfernen
4. Gültig → last-accessed auf `Instant.now()` aktualisieren, Request durchlassen

### OpenAPI-Spec

Alle neuen Endpunkte werden in `api/openapi.yml` ergänzt. Orval generiert daraus den TypeScript-Client automatisch.

---

## 3. Frontend-Architektur

### Routing

```
/         → App (geschützt durch SetupGuard)
/setup    → SetupWizard (vom Guard ausgenommen)
*         → 404-Seite (bestehend)
```

**SetupGuard:** Komponente, die beim Mount `GET /api/v1/settings/setup-status` aufruft. Bei `setupCompleted = false` → Redirect zu `/setup`. Netzwerkfehler führen **nicht** in den Wizard — stattdessen zeigt die bestehende Backend-Fehlerseite (behebt bekanntes Altsystem-Problem FA-SETUP-Bekannte-Schwäche Nr. 15).

### Feature-Ordnerstruktur

```
src/features/
  members/
    MemberGrid.tsx          — Kachelraster, 2–6 Spalten (responsive)
    MemberCard.tsx          — Einzelkachel: Avatar + Farbring + Name + Rolle
    AddMemberDialog.tsx     — Anlegen-Dialog
    EditMemberDialog.tsx    — Bearbeiten-Dialog
    AvatarUpload.tsx        — Dateiauswahl → Canvas-Komprimierung → Upload
    useMembersQuery.ts      — TanStack Query hooks (list, create, update, delete, avatar)
  settings/
    SettingsView.tsx        — Settings-Haupt-UI mit MemberGrid-Einbindung
    ChangePinDialog.tsx     — PIN nachträglich ändern
  setup/
    SetupWizard.tsx         — Schritt-Container mit Fortschrittsbalken
    WelcomeStep.tsx         — Schritt 1: Willkommen
    MembersStep.tsx         — Schritt 2: Familienmitglieder anlegen
    PinStep.tsx             — Schritt 3: PIN vergeben
  pin/
    PinInputDialog.tsx      — Numerische Tastatur (4×3-Grid), verdeckte Eingabe
    PinSessionContext.tsx   — React Context: Token-Verwaltung
```

### PIN-Session-State

`PinSessionContext` speichert das Session-Token in `sessionStorage` (überlebt Page-Reload, wird beim Tab-Schließen gelöscht). Der Context stellt bereit:
- `sessionToken: string | null`
- `hasPinSession: boolean`
- `setSession(token: string): void`
- `clearSession(): void`

Client-seitiger Ablauf-Timer: Nach 15 Minuten ohne Request wird `clearSession()` aufgerufen. Der Timer wird bei jedem ausgehenden Request zurückgesetzt.

`customFetch.ts` liest das Token aus dem Context und setzt `X-Pin-Session` automatisch auf alle Requests.

### Avatar-Komprimierung (client-seitig, in `AvatarUpload.tsx`)

1. Datei über `<input type="file" accept="image/*">` auswählen
2. Größencheck: > 20 MB → Fehlermeldung
3. In `<canvas>` zeichnen, längste Kante auf max 512 px skalieren
4. Als `image/jpeg` mit Qualität 0.85 exportieren (`.toBlob()`)
5. Ergebnis > 500 KB → Fehlermeldung
6. Sofortige Vorschau aus dem komprimierten Blob
7. Upload via `PUT /api/v1/members/{id}/avatar`

Fehlertext-Tabelle (aus Konzept):
| Situation | Text |
|-----------|------|
| Kein Bild-MIME | „Bitte wähle eine Bilddatei aus." |
| > 20 MB | „Das Bild ist zu groß. Bitte wähle ein kleineres Bild." |
| > 500 KB nach Komprimierung | „Das Bild konnte nicht ausreichend komprimiert werden." |
| Canvas-Fehler | „Fehler beim Verarbeiten des Bildes." |
| HTTP 413 | „Das Bild ist zu groß für den Server." |

---

## 4. Setup-Wizard

### Schritt-Ablauf

**Schritt 1 — Willkommen**
- Titel: „Willkommen bei FamilyHub"
- Text: kurze Beschreibung + „Deine Daten bleiben auf deinem eigenen Server."
- Schaltfläche: „Los geht's →"
- Aktion: `PUT setup.step = 2` → weiter zu Schritt 2

**Schritt 2 — Familienmitglieder**
- Zeigt bestehende Mitglieder als MemberGrid
- Schaltfläche „Mitglied hinzufügen" öffnet AddMemberDialog
- „Weiter →" erst aktiv wenn ≥ 1 Mitglied angelegt
- Aktion: `PUT setup.step = 3` → weiter zu Schritt 3

**Schritt 3 — PIN vergeben**
- Zwei verdeckte numerische Eingabefelder (4–6 Ziffern)
- Bestätigung muss übereinstimmen
- „Fertig"-Schaltfläche:
  1. `POST /api/v1/settings/set-pin`
  2. `POST /api/v1/settings/complete-setup`
  3. Hard-Redirect auf `/`

**Fortschrittsanzeige:** „Schritt {n} von 3" + Prozentbalken (33 % / 66 % / 100 %)

**Resume:** Beim Laden von `/setup` wird `currentStep` aus `GET /api/v1/settings/setup-status` gelesen; der Wizard springt direkt zum gespeicherten Schritt.

### Kein PIN-Schutz im Wizard

Der Wizard läuft vor der PIN-Vergabe — alle Wizard-Calls (inkl. Member-Create in Schritt 2) laufen ohne `X-Pin-Session`. Die Settings-Methode `set-pin` ist serverseitig auf `setup.completed = false` beschränkt.

---

## 5. Farbpalette (Referenz)

| Wert | HSL |
|------|-----|
| `blue` | 210 80% 70% |
| `pink` | 340 75% 75% |
| `green` | 140 60% 65% |
| `purple` | 270 60% 70% |
| `orange` | 30 85% 65% |
| `teal` | 180 55% 60% |

---

## 6. Nicht in Stufe 2 enthalten

- Google-Konto-Verknüpfung pro Mitglied (FA-FAM-08) → Stufe 3
- Wizard-Schritte für Google-OAuth → Stufe 3
- Bildschirmtastatur im Wizard (FA-SETUP-12) → Stufe 9
- PIN-Timeout konfigurierbar (FA-PIN-14 SOLL) → bleibt 15 min fest
- Geburtstage im Kalender (FA-FAM-13) → Stufe 4
- Mitglieder deaktivieren über UI (FA-FAM-14) → spätere Stufe
