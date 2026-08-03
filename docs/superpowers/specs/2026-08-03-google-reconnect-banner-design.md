# Design: Globaler „Verbindung abgelaufen"-Banner mit Ein-Klick-Reconnect

Datum: 2026-08-03
Status: Approved (brainstorming)

## Problem

Wenn eine Google-Verbindung ungültig wird, liefert das Backend
`GOOGLE_CONNECTION_REVOKED` („Google-Verbindung abgelaufen. Bitte neu verbinden.")
und markiert die Verbindung als `revoked`. Der Kalender wird dann nicht mehr
synchronisiert.

Ein **Reconnect-Flow existiert bereits**, ist aber nur in
*Settings → Google-Konten* sichtbar: eine `revoked`-Verbindung zeigt dort einen
„Neu verbinden"-Button, der die OAuth-Runde neu startet (kein Trennen +
Neu-Hinzufügen nötig; das Backend matcht beim Callback über die Google-Konto-ID
und aktualisiert die bestehende Verbindung).

**Lücke:** Es gibt **keine proaktive Meldung** auf dem Haupt-/Kalenderbildschirm.
Man muss aktiv in die Settings navigieren, um überhaupt zu bemerken, dass eine
Neu-Anmeldung nötig ist. Auf dem passiv angezeigten Wanddisplay fällt das gar
nicht auf.

### Kontext (warum das jetzt relevant ist)

Die Google-App ist bereits auf „In Produktion" veröffentlicht (kein 7-Tage-Ablauf
mehr). Der Server läuft aktuell nur lokal und ist nicht immer an. Statt der
Ursache seltener Disconnects nachzujagen, soll der **Reconnect einfach und
sichtbar** gemacht werden.

## Ziel

Sobald irgendeine Verbindung `revoked` ist, erscheint auf *jedem* Screen oben ein
auffälliger Banner mit „Neu verbinden" — derselbe OAuth-Flow, der heute nur in den
Settings versteckt ist. Der Banner verschwindet automatisch, sobald wieder alle
Verbindungen `active` sind.

## Entscheidungen (aus dem Brainstorming)

- **Auslöser & Ort:** Globaler, **status-basierter** Banner in der App-Shell
  (nicht rein reaktiv auf einen fehlgeschlagenen API-Call). Quelle ist die
  Connections-Liste, regelmäßig aktualisiert.
- **PIN:** **Keine PIN-Sperre** für den Reconnect. Der Google-Consent ist die
  Absicherung; Backend-Endpoints `authorize`/`callback` sind ohnehin nicht
  PIN-geschützt (`security: []`).

## Architektur

Reines Frontend für das Kernfeature. Kein API-Vertrag ändert sich, keine
Backend-Änderung für den Banner nötig.

### Komponenten

1. **`ConnectionRevokedBanner`** — neu, `frontend/src/features/google/`
   - Nutzt `useGoogleConnections`.
   - Rendert `null`, wenn keine Verbindung `status.toLowerCase() === 'revoked'`.
   - Sonst: hochkontrastiger Banner oben, Text
     *„Google-Verbindung abgelaufen. Kalender wird nicht mehr aktualisiert."*
     + Button **„Neu verbinden"** (Touch-Ziel ≥ 44 px).
   - Klick → `startAuth.mutateAsync({ returnUrl: <aktueller Pfad> })` →
     `window.location.href = authUrl`. **Keine `hasPinSession`-Sperre.**
   - `returnUrl` = aktueller Pfad (`window.location.pathname` bzw. Router-Location),
     damit man nach der Google-Runde auf demselben Screen landet.

2. **Auto-Refetch** der Connections-Query
   - `useListConnections` (orval-generiert) erhält ein `refetchInterval`
     (~60 s), damit der Banner **von selbst** erscheint/verschwindet, ohne Reload.
   - Umsetzung: Option am Query-Hook in `useGoogleConnections` (oder eine
     schlanke Banner-spezifische Hook-Variante), damit bestehende Aufrufer nicht
     ungewollt zusätzliches Polling bekommen, falls das unerwünscht ist.
     Entscheidung im Plan: bevorzugt `refetchInterval` zentral in
     `useGoogleConnections`, da die Liste ohnehin günstig ist.

3. **Einhängen in `AppShell`** (`frontend/src/routing/AppShell.tsx`)
   - Banner oberhalb von `{children}` rendern → auf allen Screens sichtbar.

### Datenfluss

`useListConnections` (Polling ~60 s) → `ConnectionRevokedBanner` prüft auf
`revoked` → Button startet `authorizeGoogle` (`GET /v1/google/auth/authorize`)
→ Redirect zu Google → Google-Callback → `POST /v1/google/auth/callback`
aktualisiert bestehende Verbindung auf `active` → nächstes Polling entfernt den
Banner.

### Fehlerbehandlung

- Schlägt `startAuth` fehl (z. B. Backend offline), bleibt der Banner stehen; der
  Button darf sich kurz im „lädt"-Zustand befinden und danach wieder klickbar sein.
  Kein harter Fehlerdialog nötig.
- Banner ist idempotent gegenüber mehreren revoked Verbindungen (siehe Grenzen).

## Bewusste Grenzen (YAGNI)

- Der Banner startet einen **generischen** Authorize mit Kontoauswahl
  (`prompt=select_account consent`). Bei mehreren gleichzeitig revoked Konten:
  pro Konto einmal reconnecten; der Banner bleibt sichtbar, bis **alle** wieder
  `active` sind. Kein Multi-Account-Feintuning, kein gezieltes Vorauswählen der
  betroffenen `credentialsId` (ist in `ConnectionResponse` nicht exponiert).
- **Keine** Kiosk-/QR-Handoff-Logik (Tastatur am Wanddisplay für die
  Google-Anmeldung). Gehört zu Sprint 9 und ist hier nicht erforderlich.
- **Kein** globaler API-Fehler-Interceptor auf `GOOGLE_CONNECTION_REVOKED` — der
  status-basierte Banner deckt den Bedarf ab.

## Tests

Frontend (vitest, nach Muster `GoogleAccountsSettings.test.tsx`):

- Banner ist **versteckt**, wenn alle Verbindungen `active` sind.
- Banner ist **sichtbar**, wenn mindestens eine Verbindung `revoked` ist.
- Klick auf „Neu verbinden" löst `authorizeGoogle` aus und setzt
  `window.location.href` auf die zurückgegebene URL (mit `returnUrl` = aktueller
  Pfad).
- Kein PIN-Gate: Button ist auch ohne `hasPinSession` aktiv.

## Optional — Backend-Härtung (sekundär, mit eingeplant)

Unabhängig vom Banner, reduziert seltene unnötige Disconnects:

- In `GoogleTokenProvider.validAccessToken` beim Refresh einen **rotierten**
  Refresh-Token persistieren, falls Google einen zurückgibt
  (`newTokens.refreshToken != null`): verschlüsseln und `connection.refreshToken`
  aktualisieren, bevor `connections.save(connection)`.
- Test: Refresh liefert neuen Refresh-Token → wird verschlüsselt gespeichert;
  Refresh liefert `null` → bestehender Refresh-Token bleibt unverändert.

## Betroffene Dateien (Orientierung, nicht bindend)

- `frontend/src/features/google/ConnectionRevokedBanner.tsx` (neu)
- `frontend/src/features/google/ConnectionRevokedBanner.test.tsx` (neu)
- `frontend/src/features/google/useGoogleConnections.ts` (Refetch-Intervall)
- `frontend/src/routing/AppShell.tsx` (Banner einhängen)
- `frontend/src/routing/AppShell.test.tsx` (ggf. Anpassung)
- `backend/.../google/token/GoogleTokenProvider.kt` (optionale Härtung)
- `backend/.../google/token/GoogleTokenProviderTest…` (Test der Härtung)

## Definition of Done

- Banner erscheint proaktiv auf jedem Screen, sobald eine Verbindung `revoked`
  ist, und verschwindet nach erfolgreichem Reconnect automatisch.
- Reconnect ohne PIN möglich, Rückkehr auf denselben Screen.
- `npm run check` grün; falls Backend-Härtung umgesetzt: `./gradlew check` grün.
