# Synology NAS: HTTPS einrichten & Reverse Proxy für FamilyHub

Diese Anleitung macht FamilyHub unter einer sauberen HTTPS-Adresse erreichbar, z. B. `https://familyhub.deinname.synology.me` statt `http://192.168.1.100:3080`. Das ist Voraussetzung für die Google-Anbindung (siehe [`google-oauth-setup.md`](./google-oauth-setup.md)) — Google akzeptiert als Redirect-URI kein `http://` auf Nicht-localhost-Adressen, und FamilyHub lehnt solche URIs ebenfalls ab. Nebenbei verschwindet der Port `:3080` aus der Adresse und die PWA lässt sich sauber installieren (Service Worker verlangen HTTPS mit vertrauenswürdigem Zertifikat).

**So fließt der Traffic danach:**

```
Browser / Wanddisplay
   │  https://familyhub.deinname.synology.me   (Port 443, Zertifikat)
   ▼
DSM Reverse Proxy (nginx auf dem NAS)
   │  http://localhost:3080                    (nur NAS-intern)
   ▼
FamilyHub-Frontend-Container → Backend → PostgreSQL
```

Getestet mit DSM 7.x. Menübezeichnungen können je nach DSM-Version leicht abweichen.

---

## Teil A: Die NAS HTTPS-fähig machen (Zertifikat)

Es gibt zwei sinnvolle Wege. **Option 1 ist empfohlen**, weil das Zertifikat auf allen Geräten ohne Warnungen funktioniert.

### Option 1 (empfohlen): Synology-DDNS + Let's Encrypt

Kostenlos, automatisch verlängert, von allen Browsern anerkannt. Einziger Kompromiss: Für die Zertifikats-Ausstellung und -Erneuerung muss **Port 80** vom Router zur NAS weitergeleitet sein.

**A1.1 — DDNS-Adresse anlegen**

1. DSM → **Systemsteuerung → Externer Zugriff → DDNS → Hinzufügen**.
2. Serviceanbieter: **Synology**, Hostname z. B. `deinname.synology.me` — mit deinem Synology-Konto verknüpfen und speichern.

**A1.2 — Portweiterleitung im Router**

1. Im Router (z. B. Fritz!Box: **Internet → Freigaben → Portfreigaben**) eine Weiterleitung von **Port 80 (TCP)** auf die NAS einrichten.
2. Port 80 wird von Let's Encrypt für die Ausstellung **und die automatische Erneuerung** (ca. alle 60 Tage) gebraucht — die Weiterleitung also dauerhaft aktiv lassen.

> **Datenhoheit / „LAN only":** Port 80 dient nur der Zertifikatsprüfung durch Let's Encrypt — DSM leitet HTTP-Anfragen nicht auf FamilyHub. Eine Weiterleitung von **Port 443 ist nicht nötig**, solange ihr FamilyHub nicht von unterwegs erreichen wollt. Ohne 443-Weiterleitung bleibt FamilyHub von außen unerreichbar, genau wie im Konzept vorgesehen. Wer gar keinen Port öffnen will, nimmt Option 2.

**A1.3 — Zertifikat holen**

1. DSM → **Systemsteuerung → Sicherheit → Zertifikat → Hinzufügen**.
2. **„Neues Zertifikat hinzufügen" → „Zertifikat von Let's Encrypt abrufen"**.
3. Domainname: `deinname.synology.me`, E-Mail: deine Adresse. Optional unter „Alternativer Antragstellername" weitere Namen.
4. **Übernehmen** — DSM holt das Zertifikat und **erneuert es automatisch**.

**A1.4 — Damit die Adresse auch im Heimnetz funktioniert**

`deinname.synology.me` zeigt auf eure *öffentliche* IP. Damit der Zugriff aus dem LAN klappt, muss der Router „NAT-Loopback" beherrschen (die meisten tun das) — einfach testen: `https://deinname.synology.me:5001` im Browser öffnen.

Bei einer **Fritz!Box** greift zusätzlich der **DNS-Rebind-Schutz**: Trage die Domain als Ausnahme ein (je nach FritzOS-Version unter **Heimnetz → Netzwerk → Netzwerkeinstellungen → DNS-Rebind-Schutz** bzw. **Internet → Filter → Listen**), Hostname: `deinname.synology.me`.

### Option 2: Selbstsigniertes Zertifikat (keine offenen Ports, rein LAN)

1. DSM → **Systemsteuerung → Sicherheit → Zertifikat → Hinzufügen → „Neues Zertifikat hinzufügen" → „Selbstsigniertes Zertifikat erstellen"**.
2. Als „Allgemeiner Name" (CN) und „Alternativer Antragstellername" den Hostnamen eintragen, unter dem FamilyHub laufen soll (z. B. `familyhub.fritz.box` oder die NAS-IP).

Nachteile, die man kennen sollte:

- Jeder Browser zeigt beim ersten Aufruf eine Zertifikatswarnung. Für die **PWA-Installation und den Offline-Modus (Service Worker)** reicht „Warnung wegklicken" nicht — das Zertifikat muss auf jedem Gerät (auch dem Wanddisplay!) als vertrauenswürdig importiert werden.
- Die Google-OAuth-Anmeldung funktioniert trotzdem: Google ruft die Redirect-URI nicht selbst auf, die Weiterleitung passiert im Browser.

Für ein 24/7-Wanddisplay ist Option 1 in der Praxis deutlich wartungsärmer.

---

## Teil B: Reverse Proxy für FamilyHub anlegen

Der Reverse Proxy nimmt HTTPS-Anfragen auf Port 443 an und reicht sie NAS-intern unverschlüsselt an den FamilyHub-Frontend-Container (Port `3080`, siehe `docker-compose.yml`) weiter.

1. DSM → **Systemsteuerung → Anmeldeportal → Erweitert → Reverse Proxy → Erstellen**.
2. Regel ausfüllen:

   | Feld | Wert |
   |---|---|
   | Name des Reverse Proxy | `FamilyHub` |
   | **Quelle** — Protokoll | `HTTPS` |
   | **Quelle** — Hostname | `familyhub.deinname.synology.me` *(bzw. `deinname.synology.me`, wenn du keine Subdomain willst)* |
   | **Quelle** — Port | `443` |
   | HSTS aktivieren | optional (erst aktivieren, wenn alles läuft) |
   | **Ziel** — Protokoll | `HTTP` |
   | **Ziel** — Hostname | `localhost` |
   | **Ziel** — Port | `3080` |

3. Tab **„Benutzerdefinierte Kopfzeile"** (Custom Header) → **Erstellen → WebSocket**: fügt die Header `Upgrade` und `Connection` hinzu. FamilyHub braucht das aktuell nicht zwingend, es schadet aber nicht und macht die Regel zukunftssicher.
4. **Speichern.**

> **Subdomain-Hinweis:** Nutzt du eine Subdomain wie `familyhub.deinname.synology.me`, muss das Zertifikat diesen Namen abdecken. Beim Let's-Encrypt-Zertifikat die Subdomain unter „Alternativer Antragstellername" mit angeben (Wildcard `*.deinname.synology.me` unterstützt DSM für synology.me-Domains ebenfalls) — oder einfach ohne Subdomain direkt `deinname.synology.me` als Quelle verwenden.

### Zertifikat der Regel zuweisen

1. DSM → **Systemsteuerung → Sicherheit → Zertifikat → Einstellungen**.
2. In der Liste den Eintrag `familyhub.deinname.synology.me` (die neue Reverse-Proxy-Regel) suchen und ihm das Let's-Encrypt- bzw. selbstsignierte Zertifikat zuweisen → **OK**.

### Testen

1. `https://familyhub.deinname.synology.me` im Browser öffnen → FamilyHub lädt, Schloss-Symbol ohne Warnung (Option 1).
2. Ab jetzt gilt als Redirect-URI für Google:

   ```
   https://familyhub.deinname.synology.me/oauth/callback
   ```

   Diese URI in der **Google Cloud Console** (Clients → Autorisierte Weiterleitungs-URIs) **und** im FamilyHub-Setup-Wizard eintragen — beide müssen zeichengenau übereinstimmen. Details: [`google-oauth-setup.md`](./google-oauth-setup.md).

Optional: Den direkten Zugriff über `http://NAS-IP:3080` kann man danach als „Notausgang" bestehen lassen (nur im LAN erreichbar) — für den Alltag und fürs Wanddisplay immer die HTTPS-Adresse verwenden, sonst funktionieren PWA und Google-Login nicht.

---

## Fehlerbehebung

| Problem | Ursache & Lösung |
|---|---|
| Let's Encrypt: „Zertifikat konnte nicht ausgestellt werden" | Port 80 ist nicht bis zur NAS durchgereicht (Router-Portfreigabe prüfen; manche Provider blockieren Port 80 bei DS-Lite-Anschlüssen — dann Option 2 oder eigene Domain mit DNS-Validierung). |
| `https://deinname.synology.me` lädt von unterwegs, aber nicht zu Hause | NAT-Loopback fehlt oder Fritz!Box-DNS-Rebind-Schutz greift → Ausnahme für die Domain eintragen (siehe A1.4). |
| **502 Bad Gateway** | Der FamilyHub-Container läuft nicht oder das Ziel stimmt nicht. Prüfen: `docker-compose ps` (Frontend „healthy"?), Ziel-Port `3080`, Ziel-Hostname `localhost`. |
| Browser zeigt Zertifikat der NAS statt des zugewiesenen | Zuweisung unter **Sicherheit → Zertifikat → Einstellungen** prüfen; danach ggf. Browser-Cache leeren. |
| Google meldet `redirect_uri_mismatch` nach der Umstellung | In der Google Console steht noch die alte URI. Neue HTTPS-URI eintragen und auch in FamilyHub (Einstellungen → Google-Anmeldedaten) aktualisieren. |
| Port 443 „bereits belegt" | Eine andere Anwendung (z. B. Web Station-vHost oder VPN-Paket) nutzt 443. Entweder dort umkonfigurieren oder für FamilyHub einen anderen Quell-Port (z. B. 8443) wählen — die Redirect-URI enthält dann den Port: `https://…:8443/oauth/callback`. |
| PWA lässt sich nicht installieren / kein Offline-Modus | Zertifikat wird vom Gerät nicht als vertrauenswürdig eingestuft (typisch bei Option 2) → Zertifikat auf dem Gerät importieren oder auf Option 1 wechseln. |

## Referenzen

- Synology: [Zertifikat von Let's Encrypt erhalten](https://kb.synology.com/de-de/DSM/tutorial/How_to_enable_HTTPS_and_create_a_certificate_signing_request_on_your_Synology_NAS)
- Synology: [Anmeldeportal → Erweitert (Reverse Proxy)](https://kb.synology.com/de-de/DSM/help/DSM/AdminCenter/system_login_portal_advanced?version=7)
- FamilyHub: [`google-oauth-setup.md`](./google-oauth-setup.md) — Google-Anbindung, die diese HTTPS-Adresse voraussetzt
- FamilyHub: `../INSTALLATION.md` — Docker-Setup, Port `3080`
