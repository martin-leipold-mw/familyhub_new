# Styleguide für die Lastenheft-Dokumente (docs/concept)

> Interne Arbeitsdatei. Gilt verbindlich für alle Dokumente in `docs/concept/`.

## Zweck der Dokumentsammlung

Vollständige Ist-Dokumentation des bestehenden FamilyHub als **Lastenheft für eine Neuauflage**.
Leser ist ein Entwicklungsteam, das FamilyHub von Grund auf neu baut und **den Code des
Altsystems nicht zur Verfügung hat**. Alles, was zum Nachbau nötig ist, muss im Text stehen.

## Sprache & Ton

- **Deutsch**, Fachbegriffe (Endpoint, Token, Payload, Scope …) bleiben englisch.
- Sachlich, präzise, keine Werbesprache, kein „wir haben …“.
- Anforderungen im Lastenheft-Stil: „Das System **muss** …“ / „**soll** …“ / „**kann** …“.

## Anforderungs-IDs

Jede Anforderung bekommt eine stabile ID im Format `<PRÄFIX>-<NN>`, fortlaufend, dreistellig
nicht nötig. Präfixe sind pro Dokument reserviert (siehe `00-README.md`). Beispiel:

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| FA-KAL-01 | Das System muss Termine in einer Wochenansicht darstellen. | MUSS | Umgesetzt |

Prioritäten: `MUSS`, `SOLL`, `KANN`.
Ist-Zustand: `Umgesetzt`, `Teilweise`, `Prototyp`, `Nicht umgesetzt`, `Mock/Dummy`.

**Wichtig:** Wenn eine Funktion im Altsystem nur mit Dummy-/Mock-Daten existiert oder unfertig
ist, muss das explizit als solches gekennzeichnet werden. Nichts beschönigen.

## Formatierung

- Überschriften-Ebenen: `#` Dokumenttitel, `##` Kapitel, `###` Unterkapitel.
- Tabellen für Anforderungen, Felder, Endpoints, Parameter, Settings-Keys.
- Codeblöcke mit Sprachangabe (```json, ```http, ```kotlin, ```sql, ```yaml).
- Mermaid-Diagramme für Abläufe/Architektur (```mermaid, `sequenceDiagram` / `flowchart TD` /
  `erDiagram`). Sparsam und nur wo sie echten Mehrwert bringen.
- Dateiverweise auf das Altsystem als relativer Pfad in Backticks, z. B.
  `familyhub/backend/src/main/kotlin/com/familyhub/service/SynologyPhotosService.kt`.
  Diese Verweise dienen der Nachvollziehbarkeit — der Fließtext muss auch ohne sie verständlich sein.

## Inhaltliche Regeln

1. **Vollständigkeit vor Kürze.** Lieber ein langes, erschöpfendes Kapitel als eine Zusammenfassung.
2. **Konkrete Werte nennen:** Ports, Timeouts, Intervalle, Default-Werte, Feldlängen, Enum-Werte,
   Cron-Ausdrücke, HTTP-Statuscodes, Scope-Strings, Header-Namen.
3. **Keine Geheimnisse abschreiben.** Wenn in `.env` oder Konfigurationsdateien echte Secrets,
   API-Keys, Passwörter, Tokens oder NAS-Zugangsdaten stehen: Namen/Schlüssel der Variable
   dokumentieren, den Wert als `<redacted>` bzw. Beispielwert (`your-client-secret`) darstellen.
   Niemals reale Credentials in die Doku übernehmen.
4. **Ist-Zustand dokumentieren, nicht Wunschzustand.** Bekannte Bugs, Workarounds, Inkonsistenzen
   und offene Punkte gehören in ein Kapitel „Bekannte Schwächen / Lessons Learned“ am Dokumentende.
5. **Empfehlungen für die Neuauflage** kommen ans Ende des jeweiligen Dokuments in ein eigenes
   Kapitel und sind klar als Empfehlung markiert (nicht mit dem Ist-Zustand vermischen).
6. Am Anfang jedes Dokuments ein kurzer Abschnitt „Zweck & Geltungsbereich“ (3–5 Zeilen) und ein
   Inhaltsverzeichnis als Liste mit Anker-Links.

## Deutsche UI-Strings

Die Oberfläche ist deutsch. Wo Beschriftungen, Meldungen oder Fehlertexte relevant sind, im
Original zitieren (in Anführungszeichen), damit die Neuauflage sie übernehmen kann.
