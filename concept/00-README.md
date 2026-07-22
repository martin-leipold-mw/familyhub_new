# FamilyHub – Lastenheft für die Neuauflage

> Vollständige Ist-Dokumentation des bestehenden FamilyHub als Grundlage für eine Neuentwicklung.
> Stand der Analyse: Juli 2026, basierend auf dem Quellstand des Altsystems.

## Wozu dieses Dokument

FamilyHub existiert als lauffähiges System (React-PWA + Kotlin/Spring-Boot-Backend, betrieben
auf einer Synology NAS). Für die Neuauflage soll nicht der Code weitergeschrieben, sondern das
**Produkt neu gebaut** werden. Dafür braucht das Entwicklungsteam eine belastbare Beschreibung
dessen, was das Altsystem fachlich leistet und wie es technisch an externe Systeme angebunden
ist – unabhängig vom vorhandenen Code.

Diese Dokumentsammlung ist so geschrieben, dass **jede Funktion, jede Schnittstelle und jede
Integration ohne Blick in den Altcode nachgebaut werden kann**. Wo eine Funktion im Altsystem
unvollständig, mockbasiert oder fehlerhaft ist, wird das ausdrücklich benannt statt beschönigt.

## Aufbau

| Dokument | Inhalt | Für wen besonders relevant |
|----------|--------|----------------------------|
| [01 – Systemüberblick](01-systemueberblick.md) | Produktidee, Einsatzszenario, Architektur, Umsetzungsstand, Entwicklungsgeschichte | Alle – hier anfangen |
| [02 – Funktionale Anforderungen](02-funktionale-anforderungen.md) | Alle Nutzerfunktionen: Kalender, Aufgaben, Einkaufsliste, Essensplan, Familienmitglieder, Wetter, Einstellungen, Kiosk, PIN, Bildschirmtastatur | Produkt, Frontend |
| [03 – Haushalt & Gamification](03-haushalt-gamification.md) | Ämtli-Vorlagen, Rotationsalgorithmus, Punkte, Streaks, Abzeichen, Leaderboard, Statistiken | Produkt, Backend |
| [04 – API-Referenz](04-api-referenz.md) | Vollständige Beschreibung aller REST-Endpunkte mit Requests, Responses, Fehlerfällen | Backend, Frontend |
| [05 – Datenmodell](05-datenmodell.md) | Alle Tabellen, Felder, Beziehungen, Enums, Migrationshistorie, Stammdaten | Backend, Datenbank |
| [06 – Google-Integration](06-google-integration.md) | OAuth-2.0-Flow, Scopes, Token-Verwaltung, Kalender- und Aufgaben-Synchronisation, Setup-Assistent | Backend |
| [07 – Synology & Fotos](07-synology-fotos.md) | DSM-Web-API-Anbindung, Anmeldung, Album- und Bildabruf, Caching, Slideshow-Verhalten | Backend, Frontend |
| [08 – Betrieb & Deployment](08-betrieb-und-deployment.md) | Technologie-Stack, Konfiguration, Docker, NAS-Deployment, Backup, Update, Wetter, Tests | DevOps, Backend |
| [09 – Nichtfunktionale Anforderungen](09-nichtfunktionale-anforderungen.md) | Leistung, Verfügbarkeit, Sicherheit, Datenschutz, Bedienbarkeit, Barrierefreiheit, Wartbarkeit | Alle |
| [10 – Empfehlungen für die Neuauflage](10-neuauflage.md) | Bewertung des Altsystems, Architekturempfehlungen, Umfangsvorschlag, Risiken | Entscheider, Architektur |

Ergänzend: [`_STYLEGUIDE.md`](_STYLEGUIDE.md) – Schreibkonventionen dieser Dokumentsammlung
(interne Arbeitsdatei).

## Anforderungs-IDs

Anforderungen sind über alle Dokumente hinweg eindeutig nummeriert. Die Präfixe sind pro
Themenbereich reserviert:

| Präfix | Bedeutung | Dokument |
|--------|-----------|----------|
| `FA-ALLG-` | Allgemein, Navigation | 02 |
| `FA-KAL-` | Kalender | 02 |
| `FA-AUF-` | Aufgaben | 02 |
| `FA-EINK-` | Einkaufsliste | 02 |
| `FA-ESSEN-` | Essensplan | 02 |
| `FA-FAM-` | Familienmitglieder | 02 |
| `FA-WETTER-` | Wetter | 02 |
| `FA-KIOSK-` | Kiosk-Modus | 02 |
| `FA-PIN-` | PIN-Schutz | 02 |
| `FA-EINST-` | Einstellungen | 02 |
| `FA-SETUP-` | Ersteinrichtung | 02 |
| `FA-UI-` | Bedienung, Touch, Bildschirmtastatur | 02 |
| `FA-HH-` | Haushaltsaufgaben | 03 |
| `FA-ROT-` | Rotation | 03 |
| `FA-GAM-` | Punkte, Level | 03 |
| `FA-BADGE-` | Abzeichen | 03 |
| `FA-LEAD-` | Leaderboard | 03 |
| `FA-STAT-` | Statistiken | 03 |
| `FA-GOO-` / `TA-GOO-` | Google-Anbindung (fachlich/technisch) | 06 |
| `FA-FOTO-` / `TA-FOTO-` | Fotos und Synology-Anbindung | 07 |
| `TA-BUILD-`, `TA-CONF-`, `TA-DEPLOY-`, `TA-TEST-`, `TA-OPS-` | Technik und Betrieb | 08 |
| `NFA-*` | Nichtfunktionale Anforderungen | 09 |

Prioritäten: **MUSS** (ohne die Funktion ist das Produkt unbrauchbar), **SOLL** (wichtig, aber
verzichtbar für einen ersten Stand), **KANN** (wünschenswert).

Ist-Zustand im Altsystem: `Umgesetzt`, `Teilweise`, `Prototyp`, `Mock/Dummy`,
`Nicht umgesetzt`.

## Lesepfade

**„Ich will verstehen, was das Produkt kann."**
→ 01 → 02 → 03

**„Ich baue das Backend neu."**
→ 01 → 05 → 04 → 06 → 07 → 08

**„Ich baue das Frontend neu."**
→ 01 → 02 → 03 → 04 → 09

**„Ich muss entscheiden, ob und in welchem Umfang wir neu bauen."**
→ 01 → 10 → 09

**„Ich muss nur die Fotoanbindung nachbauen."**
→ 07 (ist eigenständig lesbar)

**„Ich muss nur die Google-Anbindung nachbauen."**
→ 06 (ist eigenständig lesbar)

## Hinweise zur Nutzung

- **Keine Zugangsdaten in dieser Dokumentation.** Wo im Altsystem echte Client-Secrets,
  NAS-Passwörter oder API-Schlüssel konfiguriert sind, stehen hier ausschließlich die Namen der
  Konfigurationsschlüssel und Platzhalterwerte. Die realen Werte sind der bestehenden
  Installation zu entnehmen und gehören nicht in ein Lastenheft.
- **Verweise auf Altcode-Pfade** (z. B. `familyhub/backend/src/main/kotlin/...`) dienen nur der
  Nachvollziehbarkeit. Der Fließtext ist auch ohne sie vollständig.
- **Widersprüche zum alten `PRODUCT_REQUIREMENTS.md`** sind Absicht: Jenes Dokument beschreibt
  den ursprünglich geplanten Zustand, dieses hier den tatsächlich erreichten. Wo beide
  auseinandergehen, ist das in den Kapiteln „Geplant, aber nicht umgesetzt" festgehalten.
