# Google-Anbindung einrichten (OAuth-Anmeldedaten erstellen)

Diese Anleitung beschreibt, wie du die einmalige Google-Einrichtung für FamilyHub durchführst. Am Ende hast du eine **Client-ID** und ein **Client-Secret**, die du im FamilyHub-Setup-Wizard einträgst. Danach funktioniert „Mit Google verbinden" für alle Familienmitglieder per Klick — ganz ohne weitere Konfiguration.

> **Warum ist das nötig?** Der „Mit Google anmelden"-Button funktioniert in kommerzieller Software ohne Setup, weil der Hersteller seine App bei Google registriert hat. Bei selbst gehosteter Software bist *du* der Hersteller — deshalb registrierst du FamilyHub einmalig selbst. Das ist kostenlos, dauert ca. 10–15 Minuten und muss nur **einmal pro Installation** gemacht werden (nicht pro Familienmitglied).

**Voraussetzungen:**

- Ein Google-Konto (das Konto, mit dem du die Einrichtung machst — die Kalender können später von beliebigen Konten verbunden werden)
- FamilyHub ist über **HTTPS** erreichbar (z. B. `https://familyhub.deinname.synology.me` über den Synology-Reverse-Proxy). Google akzeptiert `http://` nur für `localhost` — eine reine IP-Adresse wie `http://192.168.1.50` funktioniert **nicht** als Redirect-URI. FamilyHub selbst lehnt solche URIs ebenfalls ab. **Anleitung dazu:** [`synology-https-reverse-proxy.md`](./synology-https-reverse-proxy.md)

---

## Schritt 1: Google-Cloud-Projekt anlegen

1. Öffne die [Google Cloud Console](https://console.cloud.google.com/) und melde dich mit deinem Google-Konto an.
2. Klicke oben links auf die Projektauswahl → **„Neues Projekt"** (oder direkt: [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate)).
3. Projektname z. B. `FamilyHub` — Organisation leer lassen, **„Erstellen"** klicken.
4. Warte kurz und wähle das neue Projekt oben links aus (wichtig — alle folgenden Schritte passieren *in diesem Projekt*).

Eine Abrechnung/Kreditkarte ist **nicht** erforderlich.

## Schritt 2: Calendar API aktivieren

1. Suche oben in der Suchleiste nach **„Google Calendar API"** (oder: Menü → **„APIs und Dienste" → „Bibliothek"**).
2. Öffne die Google Calendar API und klicke **„Aktivieren"**.

> **Später:** Sobald FamilyHub auch Google Tasks synchronisiert, muss hier zusätzlich die **„Google Tasks API"** aktiviert und der Tasks-Scope ergänzt werden. Für die Kalender-Anbindung reicht die Calendar API.

## Schritt 3: OAuth-Zustimmungsbildschirm konfigurieren

Das ist der Bildschirm, den Familienmitglieder beim Verbinden sehen („FamilyHub möchte auf deinen Kalender zugreifen").

1. Menü → **„APIs und Dienste" → „OAuth-Zustimmungsbildschirm"** (in der neuen Console-Oberfläche heißt der Bereich **„Google Auth Platform"**).
2. Klicke **„Jetzt starten"** / „Get started". Es folgt ein kurzer Assistent:
   - **App-Informationen:** App-Name z. B. `FamilyHub`, Support-E-Mail: deine E-Mail-Adresse.
   - **Zielgruppe (Audience):** **„Extern"** wählen. („Intern" gibt es nur für Google-Workspace-Organisationen — für private Konten ist Extern die einzige Option.)
   - **Kontaktinformationen:** deine E-Mail-Adresse.
   - Richtlinie akzeptieren → **„Erstellen"**.

## Schritt 4: Berechtigungen (Scopes) hinterlegen

1. Wechsle im Bereich Google Auth Platform auf den Tab **„Datenzugriff"** (Data access).
2. Klicke **„Bereiche hinzufügen oder entfernen"** und füge diese drei Scopes hinzu (FamilyHub fordert genau diese an):

   ```
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/userinfo.profile
   https://www.googleapis.com/auth/userinfo.email
   ```

   Der Calendar-Scope steht unter „Sensible Bereiche" — das ist in Ordnung und für Lese-/Schreibzugriff auf den Kalender nötig.
3. Speichern.

## Schritt 5: OAuth-Client erstellen (Client-ID + Secret)

1. Wechsle auf den Tab **„Clients"** → **„Client erstellen"**.
2. **Anwendungstyp: „Webanwendung"** — wichtig: *nicht* „Desktop-App", denn nur Web-Clients erlauben eine frei konfigurierbare Redirect-URI auf deinem NAS.
3. Name z. B. `FamilyHub NAS`.
4. Unter **„Autorisierte Weiterleitungs-URIs"** exakt die URI eintragen, die der FamilyHub-Setup-Wizard anzeigt:

   ```
   https://<deine-familyhub-adresse>/oauth/callback
   ```

   Beispiel: `https://familyhub.local/oauth/callback`. Die URI muss **zeichengenau** übereinstimmen (Schema, Host, Port, Pfad — kein Slash am Ende).
5. **„Erstellen"** klicken. Jetzt werden **Client-ID** und **Client-Secret** angezeigt — **sofort kopieren oder als JSON herunterladen**. Das Secret wird danach nicht mehr vollständig angezeigt.

## Schritt 6: App veröffentlichen (wichtig gegen die 7-Tage-Falle!)

Neu erstellte Apps stehen auf Publishing-Status **„Testing"**. Im Testing-Modus **laufen Refresh-Tokens nach 7 Tagen ab** — FamilyHub würde dann jede Woche die Verbindung verlieren und ihr müsstet euch am Display neu anmelden.

1. Wechsle auf den Tab **„Zielgruppe"** (Audience).
2. Klicke **„App veröffentlichen"** / „Publish app" → Status wechselt auf **„In Produktion"**.
3. Google weist darauf hin, dass die App eine Verifizierung durchlaufen könnte. **Die Verifizierung ist für den Privatgebrauch nicht nötig** — einfach bestätigen und *nicht* zur Verifizierung einreichen.

Folgen für euch in der Praxis:

- Beim **ersten** Verbinden eines Google-Kontos erscheint die Warnung **„Google hat diese App nicht überprüft"**. Das ist normal für private, unveröffentlichte Apps. Klicke auf **„Erweitert"** → **„FamilyHub (unsicher) öffnen"**. Diese Warnung kommt pro Konto nur einmal.
- Unverifizierte Apps mit sensiblen Scopes sind auf **100 Nutzer** begrenzt — für eine Familie irrelevant.
- Die Refresh-Tokens bleiben dauerhaft gültig. ✅

## Schritt 7: In FamilyHub eintragen

1. Öffne FamilyHub im Browser → der **Setup-Wizard** führt durch die Google-Einrichtung (die Checkliste dort entspricht den Schritten 1–5 dieser Anleitung).
2. Trage ein: **Nickname** (z. B. „Familien-Google"), **Client-ID**, **Client-Secret** und die **Redirect-URI** (vorausgefüllt mit der Adresse, unter der du FamilyHub gerade geöffnet hast).
3. Klicke **„Verbindung testen"** — FamilyHub validiert die Anmeldedaten — und dann **„Speichern & weiter"**. Die Daten werden **verschlüsselt in der Datenbank** gespeichert und landen nie im Frontend oder in Konfigurationsdateien.
4. Klicke **„Mit Google verbinden"** → Google-Login → einmalig die Unverified-Warnung bestätigen → Zugriff erlauben. Fertig!

Jedes weitere Familienmitglied mit eigenem Google-Kalender wiederholt nur Schritt 7.4 mit seinem eigenen Konto — Schritte 1–6 gelten für die ganze Installation.

---

## Fehlerbehebung

| Problem | Ursache & Lösung |
|---|---|
| `Fehler 400: redirect_uri_mismatch` | Die Redirect-URI in der Google Console stimmt nicht zeichengenau mit der von FamilyHub verwendeten überein. Beide vergleichen: Schema (`https`), Hostname, Port, Pfad `/oauth/callback`, kein abschließender Slash. |
| „Redirect-URI muss https verwenden (außer localhost)" | FamilyHub lehnt `http://`-URIs auf Nicht-localhost-Adressen ab (Google ebenfalls). HTTPS über den Synology-Reverse-Proxy einrichten — Schritt-für-Schritt in [`synology-https-reverse-proxy.md`](./synology-https-reverse-proxy.md). |
| Verbindung fällt nach ~7 Tagen aus (`invalid_grant`) | Die App steht noch auf „Testing". Schritt 6 durchführen und die Verbindung in FamilyHub einmal neu herstellen. |
| „Google hat diese App nicht überprüft" | Erwartet (siehe Schritt 6). „Erweitert" → „öffnen" klicken. |
| „Zugriff blockiert: … entspricht nicht den Richtlinien" | App steht auf „Testing" und das anmeldende Konto ist kein eingetragener Testnutzer. Entweder Konto unter „Zielgruppe" → „Testnutzer" hinzufügen — oder besser gleich Schritt 6 (veröffentlichen). |
| Client-Secret verloren | In der Console unter „Clients" den Client öffnen → neues Secret erzeugen (Reset) und in FamilyHub aktualisieren. |

## Sicherheits-Hinweise

- Client-ID und Secret identifizieren nur *deine App-Registrierung* — der eigentliche Kontozugriff wird pro Google-Konto per OAuth-Zustimmung erteilt und kann jederzeit unter [myaccount.google.com/permissions](https://myaccount.google.com/permissions) widerrufen werden.
- FamilyHub speichert Secret und Tokens verschlüsselt in der Datenbank (`FAMILYHUB_ENCRYPTION_KEY`). Das Frontend bekommt sie nie zu sehen; alle Google-Aufrufe laufen ausschließlich über das Backend.
- Trotzdem gilt: Secret nicht in Git, Chats oder Screenshots teilen.

## Referenzen

- Google: [Get started with the Google Auth Platform](https://support.google.com/cloud/answer/15544987)
- Google: [Manage App Audience (Testing vs. Production, 7-Tage-Regel)](https://support.google.com/cloud/answer/15549945)
- Google: [Manage OAuth Clients](https://support.google.com/cloud/answer/15549257)
- FamilyHub-Konzept: `docs/concept/06-google-integration.md` (OAuth-Flow, Token-Verwaltung, Sync-Logik)
