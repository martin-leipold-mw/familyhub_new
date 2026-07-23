# 09 – Nichtfunktionale Anforderungen

## Zweck & Geltungsbereich

Dieses Dokument sammelt alle qualitativen Anforderungen an FamilyHub: Leistung, Verfügbarkeit,
Sicherheit, Bedienbarkeit, Barrierefreiheit, Wartbarkeit und Betrieb. Für jede Anforderung ist
angegeben, ob sie im Altsystem erfüllt wurde. Anforderungen, die im ursprünglichen
Anforderungsdokument standen, aber nie umgesetzt wurden, sind als solche gekennzeichnet – sie
sind für die Neuauflage bewusst zu entscheiden, nicht stillschweigend zu übernehmen.

ID-Präfixe dieses Dokuments: `NFA-PERF-`, `NFA-VERF-`, `NFA-SICH-`, `NFA-DSGVO-`,
`NFA-USE-`, `NFA-A11Y-`, `NFA-KOMP-`, `NFA-WART-`, `NFA-BETR-`, `NFA-SKAL-`, `NFA-I18N-`.

## Inhalt

- [1. Mengengerüst und Skalierung](#1-mengengerüst-und-skalierung)
- [2. Leistung und Antwortzeiten](#2-leistung-und-antwortzeiten)
- [3. Verfügbarkeit und Fehlertoleranz](#3-verfügbarkeit-und-fehlertoleranz)
- [4. Sicherheit](#4-sicherheit)
- [5. Datenschutz](#5-datenschutz)
- [6. Bedienbarkeit](#6-bedienbarkeit)
- [7. Barrierefreiheit](#7-barrierefreiheit)
- [8. Kompatibilität](#8-kompatibilität)
- [9. Internationalisierung](#9-internationalisierung)
- [10. Wartbarkeit und Qualitätssicherung](#10-wartbarkeit-und-qualitätssicherung)
- [11. Betrieb, Logging, Monitoring](#11-betrieb-logging-monitoring)
- [12. Zusammenfassung der Lücken](#12-zusammenfassung-der-lücken)

---

## 1. Mengengerüst und Skalierung

Das System ist für einen Haushalt ausgelegt. Alle Grenzwerte sind großzügig bemessen; die
Neuauflage muss keine Architektur für Wachstum darüber hinaus vorsehen.

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-SKAL-01 | Das System muss bis zu 10 Familienmitglieder verwalten können. | MUSS | Erfüllt |
| NFA-SKAL-02 | Das System muss bis zu 10.000 zwischengespeicherte Fotos verwalten können. | SOLL | Nicht belastungsgetestet |
| NFA-SKAL-03 | Das System muss bis zu 1.000 Kalendertermine gleichzeitig vorhalten können. | MUSS | Erfüllt, nicht belastungsgetestet |
| NFA-SKAL-04 | Das System muss bis zu 500 Aufgaben (Google-Aufgaben und Haushaltsaufgaben zusammen) vorhalten können. | MUSS | Erfüllt, nicht belastungsgetestet |
| NFA-SKAL-05 | Das System muss den gleichzeitigen Zugriff von mindestens 5 Endgeräten verkraften. | MUSS | Erfüllt, nicht belastungsgetestet |
| NFA-SKAL-06 | Datenbankabfragen müssen durch geeignete Indizes unterstützt sein. | MUSS | Teilweise – siehe [05 – Datenmodell](05-datenmodell.md) |
| NFA-SKAL-07 | Das System muss **nicht** mehrere Familien/Mandanten trennen können. | – | Bewusste Abgrenzung |

> **Für die Neuauflage:** Die genannten Zahlen wurden nie durch Lasttests verifiziert. Vor der
> Übernahme sollte mindestens ein Testlauf mit vollem Mengengerüst stattfinden, insbesondere für
> die Wochenansicht des Kalenders und die Foto-Slideshow.

## 2. Leistung und Antwortzeiten

| ID | Anforderung | Zielwert | Priorität | Ist-Zustand |
|----|-------------|----------|-----------|-------------|
| NFA-PERF-01 | Erstladezeit der Anwendung im Heimnetz | < 2 s | MUSS | Nicht gemessen |
| NFA-PERF-02 | Reaktionszeit der Oberfläche auf eine Touch-Eingabe | < 100 ms | MUSS | Subjektiv erfüllt, nicht gemessen |
| NFA-PERF-03 | Bildwechsel in der Slideshow flüssig, ohne Ruckeln | 60 fps | SOLL | Nicht gemessen |
| NFA-PERF-04 | Bildwechsel ohne sichtbare Ladewartezeit | 0 ms wahrnehmbar | MUSS | **Gefährdet** – zwischengespeichert werden nur Metadaten, nicht die Bilddaten. Da zudem stets die Originaldatei statt eines Vorschaubilds geladen wird (3–8 MB je Bild), hängt die Flüssigkeit allein am Browser-Cache. Siehe [07](07-synology-fotos.md). |
| NFA-PERF-05 | Vollständiger inkrementeller Google-Sync | < 30 s | SOLL | Nicht gemessen |
| NFA-PERF-06 | Speicherverbrauch des Browser-Tabs im Dauerbetrieb | < 500 MB | SOLL | Nicht gemessen; Risiko durch Foto-Cache |
| NFA-PERF-07 | Bilder werden verzögert und progressiv geladen | – | SOLL | Teilweise |
| NFA-PERF-08 | Echtzeit-Aktualisierung zwischen mehreren Geräten | < 500 ms | KANN | **Nicht umgesetzt** – im Anforderungsdokument war eine WebSocket-Schnittstelle vorgesehen, im Code existiert keine. Aktualisierung erfolgt ausschließlich durch Polling bzw. Neuladen. |

> **Für die Neuauflage:** Entweder die Echtzeit-Anforderung streichen oder von Anfang an
> einplanen (Server-Sent Events reichen für den Anwendungsfall und sind deutlich einfacher als
> WebSockets). Der Zwischenzustand „im Konzept vorgesehen, nie gebaut" ist die schlechteste
> Variante.

## 3. Verfügbarkeit und Fehlertoleranz

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-VERF-01 | Das System muss im Heimnetz eine Verfügbarkeit von 99 % erreichen (ohne Strom-/Netzausfälle). | MUSS | Plausibel erfüllt |
| NFA-VERF-02 | Bei Nichterreichbarkeit der Google-APIs muss das System den zuletzt synchronisierten Datenstand weiter anzeigen. | MUSS | Erfüllt durch lokale Spiegelung |
| NFA-VERF-03 | Bei Nichterreichbarkeit der NAS-Foto-API muss die Slideshow einen definierten Ersatzzustand zeigen statt abzustürzen. | MUSS | **Nicht erfüllt** – die API antwortet mit HTTP 500 („Sync fehlgeschlagen"); die vorhandenen Fallback-Bilder werden nirgends verwendet. Siehe [07](07-synology-fotos.md). |
| NFA-VERF-04 | Bei Nichterreichbarkeit des Backends muss das Frontend eine verständliche deutsche Meldung anzeigen und selbstständig weiter versuchen. | MUSS | Erfüllt (eigene Komponente für den Zustand „Backend nicht erreichbar") |
| NFA-VERF-05 | Container müssen nach einem Absturz oder Neustart der NAS automatisch wieder starten. | MUSS | **Nicht erfüllt** – im `docker-compose.yml` ist keine `restart`-Policy gesetzt. Nach einem Stromausfall läuft nichts von allein wieder an. Siehe [08](08-betrieb-und-deployment.md). |
| NFA-VERF-06 | Schreibende Operationen müssen transaktional erfolgen und bei Fehlern vollständig zurückgerollt werden. | MUSS | Erfüllt (Spring-Transaktionen) |
| NFA-VERF-07 | Referenzielle Integrität muss durch Fremdschlüssel in der Datenbank erzwungen werden. | MUSS | Erfüllt |
| NFA-VERF-08 | Ein fehlgeschlagener Hintergrund-Sync darf den nächsten Sync-Lauf nicht verhindern. | MUSS | Siehe [06](06-google-integration.md) |
| NFA-VERF-09 | Verpasste Läufe der Aufgabengenerierung (z. B. nach Ausfall) müssen nachgeholt werden. | SOLL | Siehe [03](03-haushalt-gamification.md) |

## 4. Sicherheit

Das Sicherheitsmodell beruht auf einer einzigen Annahme: **Das System ist nur aus dem
vertrauenswürdigen Heimnetz erreichbar.** Alle weiteren Maßnahmen bauen darauf auf. Wird diese
Annahme verletzt (Portfreigabe, VPN-loser Fernzugriff), ist das System ungeschützt.

> **Produktentscheidung zum Schutzbedarf der PIN (verbindlich):** Die PIN ist eine
> **Kindersicherung**, kein Sicherheitsmerkmal. Ihr einziger Zweck ist zu verhindern, dass
> Kinder am Wanddisplay Einstellungen verändern. Sie muss **keinen** Angreifer mit
> Netzwerkzugriff abwehren. Anforderungen an Hashing und Brute-Force-Schutz sind deshalb auf
> `KANN` herabgestuft.
>
> Zwei Punkte bleiben trotzdem `MUSS` – nicht aus Sicherheitsgründen, sondern weil die
> Kindersicherung sonst ihren eigenen Zweck verfehlt: Die PIN darf nicht über einen Endpunkt
> abrufbar sein, und die Prüfung der PIN-Sitzung muss serverseitig erfolgen. Andernfalls
> genügt ein Browseraufruf, um sie zu umgehen.
>
> Von dieser Entscheidung **nicht** berührt sind fremde Zugangsdaten: Google-Tokens,
> Client-Secrets und das NAS-Passwort bleiben uneingeschränkt schutzbedürftig.

### 4.1 Zugriffskontrolle

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-SICH-01 | Das System darf keine eigenen Benutzerkonten mit Benutzername/Passwort führen. | MUSS | Bewusste Entscheidung, erfüllt |
| NFA-SICH-02 | Die Einstellungen müssen durch eine 4- bis 6-stellige PIN geschützt sein. | MUSS | Erfüllt |
| NFA-SICH-03 | Die PIN kann gehasht gespeichert werden. | KANN | Nicht erfüllt (Klartext in `setup.pin`). **Herabgestuft** aufgrund der Produktentscheidung oben – als Kindersicherung ausreichend. |
| NFA-SICH-03a | Die PIN darf über keinen Endpunkt abrufbar sein. | MUSS | **Nicht erfüllt** – `GET /api/settings` liefert sie unauthentifiziert mit aus. Damit ist die Kindersicherung durch einen einzigen Browseraufruf umgehbar. |
| NFA-SICH-04 | Der PIN-Zugang muss nach konfigurierbarer Inaktivität automatisch verfallen. | MUSS | Erfüllt |
| NFA-SICH-05 | Alltagsfunktionen (Kalender, Aufgaben, Fotos, Haushalt) müssen ohne PIN nutzbar sein. | MUSS | Erfüllt |
| NFA-SICH-06 | Wiederholte Fehleingaben der PIN sollen verzögert oder gesperrt werden. | KANN | Nicht erfüllt. **Herabgestuft** – bei einer Kindersicherung im Heimnetz kein relevantes Szenario. |
| NFA-SICH-07 | Die REST-API muss serverseitig durchsetzen, was die Oberfläche per PIN schützt. | MUSS | **Nicht erfüllt** – die PIN-Prüfung ist praktisch eine reine Frontend-Maßnahme; nur ein einziger Endpunkt prüft die Sitzung wirklich (siehe [04](04-api-referenz.md)). Wer die API direkt aufruft, umgeht die Kindersicherung vollständig. |

### 4.2 Vertraulichkeit gespeicherter Daten

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-SICH-10 | Google-Refresh- und Access-Tokens müssen verschlüsselt gespeichert werden. | MUSS | Erfüllt, Verfahren siehe [06](06-google-integration.md) |
| NFA-SICH-11 | Google-Client-Secret muss verschlüsselt gespeichert werden. | MUSS | Erfüllt |
| NFA-SICH-12 | NAS-Zugangsdaten müssen verschlüsselt gespeichert werden. | MUSS | Siehe [07](07-synology-fotos.md) |
| NFA-SICH-13 | Der Verschlüsselungsschlüssel darf nicht im Quellcode oder im Image liegen, sondern muss zur Laufzeit bereitgestellt werden. | MUSS | **Nicht erfüllt** – die `.env` wird von `docker-compose.yml` nicht eingebunden, deshalb greifen produktiv immer die im Quellcode hinterlegten Default-Schlüssel. Siehe [08](08-betrieb-und-deployment.md). |
| NFA-SICH-14 | Es muss ein dokumentiertes Verfahren zum Schlüsselwechsel geben. | SOLL | **Nicht vorhanden** |
| NFA-SICH-15 | Secrets dürfen nicht in Logausgaben erscheinen. | MUSS | Zu prüfen |

### 4.3 Transportsicherheit und API-Härtung

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-SICH-20 | Die Kommunikation zwischen Browser und Server soll über TLS erfolgen. | SOLL | **Nicht standardmäßig** – im Standard-Setup läuft die Anwendung unverschlüsselt über HTTP im LAN. TLS ist nur über einen vorgelagerten Reverse Proxy möglich. |
| NFA-SICH-21 | Die API muss gegen Überlastung durch Ratenbegrenzung geschützt sein. | MUSS | Teilweise – Umfang und betroffene Endpunkte siehe [04](04-api-referenz.md) |
| NFA-SICH-22 | Alle Eingaben müssen serverseitig validiert werden. | MUSS | Teilweise |
| NFA-SICH-23 | SQL-Injection muss durch parametrisierte Abfragen ausgeschlossen sein. | MUSS | Erfüllt (JPA/JPQL) |
| NFA-SICH-24 | Cross-Site-Scripting muss verhindert werden. | MUSS | Weitgehend durch React-Escaping; **keine Content-Security-Policy gesetzt** |
| NFA-SICH-25 | CORS muss auf die tatsächlich benötigten Ursprünge beschränkt sein. | MUSS | **Nicht erfüllt** – die CORS-Konfiguration wurde bewusst geöffnet („allow every frontend to connect to backend"); Details in [04](04-api-referenz.md) |
| NFA-SICH-26 | Der OAuth-Flow soll PKCE verwenden. | SOLL | **Nicht umgesetzt** – im Anforderungsdokument gefordert, im Code nicht vorhanden. Für einen vertraulichen Server-Client ist das vertretbar, muss aber bewusst entschieden werden. |
| NFA-SICH-27 | Der OAuth-`state`-Parameter muss gegen CSRF absichern. | MUSS | Siehe [06](06-google-integration.md) |
| NFA-SICH-28 | Die Redirect-URI muss serverseitig gegen eine Positivliste geprüft werden. | MUSS | Erfüllt (eigener Validator) |
| NFA-SICH-29 | Es muss ein Änderungsprotokoll für Einstellungsänderungen geben. | KANN | **Nicht umgesetzt** |

> **Für die Neuauflage – die drei wichtigsten Sicherheitsentscheidungen:**
> 1. Serverseitige Durchsetzung des PIN-Schutzes für alle schreibenden und konfigurierenden
>    Endpunkte, nicht nur im UI.
> 2. CORS auf die tatsächlichen Ursprünge einschränken und TLS zum Standard machen.
> 3. Ein klares Schlüsselmanagement mit dokumentiertem Rotationsverfahren.

## 5. Datenschutz

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-DSGVO-01 | Es dürfen keine Daten an Dritte übertragen werden, außer an die vom Nutzer bewusst verbundenen Dienste (Google) und den Wetterdienst. | MUSS | Erfüllt |
| NFA-DSGVO-02 | Es darf keine Telemetrie oder Nutzungsanalyse stattfinden. | MUSS | Erfüllt |
| NFA-DSGVO-03 | Fotos dürfen das Heimnetz nicht verlassen. | MUSS | Erfüllt (NAS-interne Übertragung) |
| NFA-DSGVO-04 | Der Nutzer muss eine Google-Verbindung jederzeit vollständig trennen können, inklusive Löschung der Tokens. | MUSS | Siehe [06](06-google-integration.md) |
| NFA-DSGVO-05 | Beim Löschen eines Familienmitglieds müssen dessen personenbezogene Daten entfernt werden. | MUSS | Verhalten siehe [05](05-datenmodell.md) |
| NFA-DSGVO-06 | Es muss dokumentiert sein, welche personenbezogenen Daten wo und wie lange gespeichert werden. | SOLL | Durch dieses Lastenheft erfüllt |
| NFA-DSGVO-07 | Der Standort für die Wetterabfrage soll nur so grob wie nötig übertragen werden. | SOLL | Zu bewerten, siehe [08](08-betrieb-und-deployment.md) |

Besonders zu beachten: Das System verarbeitet **Daten von Kindern** (Namen, Fotos, Aufgaben,
Leistungsstatistiken). Auch wenn es rein privat betrieben wird, ist das ein Argument für
Datensparsamkeit – insbesondere gegen jede Form von Cloud-Anbindung oder Fernzugriff, die nicht
zwingend nötig ist.

## 6. Bedienbarkeit

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-USE-01 | Alle interaktiven Elemente müssen mindestens 44 × 44 px groß sein. | MUSS | Weitgehend erfüllt |
| NFA-USE-02 | Es darf keine Funktion geben, die nur per Hover erreichbar ist. | MUSS | Weitgehend erfüllt |
| NFA-USE-03 | Jedes Texteingabefeld muss über eine Bildschirmtastatur bedienbar sein. | MUSS | Erfüllt (QWERTZ + numerisch) |
| NFA-USE-04 | Einstellungen mit festem Wertebereich müssen über Schaltflächen statt Texteingabe erfolgen. | SOLL | Weitgehend erfüllt |
| NFA-USE-05 | Die Oberfläche muss aus 1–3 m Entfernung lesbar sein. | MUSS | Erfüllt |
| NFA-USE-06 | Fehlermeldungen müssen deutsch, verständlich und handlungsleitend sein. | MUSS | Teilweise – teils technische Meldungen |
| NFA-USE-07 | Die Ersteinrichtung muss ohne Kommandozeilen- oder Dateizugriff auf den Server möglich sein. | MUSS | Erfüllt (Setup-Assistent) |
| NFA-USE-08 | Es soll eine Einführungstour für Erstnutzer geben. | KANN | **Nicht umgesetzt** |
| NFA-USE-09 | Es soll Tastaturkürzel für erfahrene Nutzer geben. | KANN | **Nicht umgesetzt** |
| NFA-USE-10 | Die Anwendung muss auf verschiedenen Bildschirmgrößen nutzbar bleiben. | SOLL | Erfüllt (responsives Layout) |
| NFA-USE-11 | Die Anwendung muss als PWA installierbar sein. | SOLL | Erfüllt (Manifest, Service Worker, Icons) |

## 7. Barrierefreiheit

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-A11Y-01 | Die Anwendung soll WCAG 2.1 Level AA erfüllen. | SOLL | **Nie geprüft** |
| NFA-A11Y-02 | Bedienung per Tastatur muss vollständig möglich sein (Fokusreihenfolge, sichtbarer Fokus). | SOLL | Teilweise (Basis durch die verwendete UI-Bibliothek) |
| NFA-A11Y-03 | Screenreader-Unterstützung durch ARIA-Attribute. | SOLL | Teilweise |
| NFA-A11Y-04 | Es muss einen Modus mit hohem Kontrast geben. | KANN | **Nicht umgesetzt** (nur Dark Mode) |
| NFA-A11Y-05 | Schriftgrößen müssen skalierbar sein. | KANN | **Nicht umgesetzt** |
| NFA-A11Y-06 | Farbkodierungen (z. B. Mitgliederfarben im Kalender) dürfen nicht die einzige Informationsquelle sein. | SOLL | **Nicht erfüllt** – Zuordnung erfolgt primär über Farbe |
| NFA-A11Y-07 | Alle Bilder benötigen Alternativtexte. | SOLL | Teilweise |

> Barrierefreiheit war im Altsystem ein reines Papierziel. Für die Neuauflage empfiehlt sich,
> mindestens NFA-A11Y-02, -06 und -07 verbindlich zu setzen – sie kosten wenig und wirken direkt
> auf die Bedienqualität am Wanddisplay.

## 8. Kompatibilität

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-KOMP-01 | Unterstützung der jeweils zwei letzten Versionen von Chrome/Edge, Firefox und Safari. | MUSS | Angenommen erfüllt, nicht systematisch getestet |
| NFA-KOMP-02 | Unterstützung von Mobile Safari ab iOS 14 und Chrome ab Android 10. | SOLL | Nicht systematisch getestet |
| NFA-KOMP-03 | Erforderliche Browser-Funktionen: ES2020+, IndexedDB, Service Worker, Fullscreen API, Wake Lock API, Video-Wiedergabe. | MUSS | Erfüllt |
| NFA-KOMP-04 | Das Backend muss auf Java 17 lauffähig sein. | MUSS | Erfüllt |
| NFA-KOMP-05 | Das System muss auf der ARM- bzw. x86-Architektur gängiger Synology-NAS-Modelle laufen. | MUSS | Zu prüfen – Image-Architektur siehe [08](08-betrieb-und-deployment.md) |

## 9. Internationalisierung

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-I18N-01 | Die Oberfläche ist deutschsprachig. | MUSS | Erfüllt |
| NFA-I18N-02 | Datums-, Zeit- und Zahlenformate folgen der deutschen Locale. | MUSS | Erfüllt |
| NFA-I18N-03 | UI-Texte sollen übersetzbar sein (Mehrsprachigkeit Deutsch/Englisch). | KANN | **Nicht umgesetzt** – es gibt keine Internationalisierungs-Bibliothek; sämtliche deutschen Texte sind fest im Code verdrahtet. |
| NFA-I18N-04 | Zeitzonenbehandlung muss korrekt und einheitlich sein. | MUSS | **Nicht erfüllt** – die Container laufen in UTC, wodurch die als „Mitternacht" gedachten Hintergrundläufe tatsächlich um 01:00 bzw. 02:00 Ortszeit starten. Siehe [05](05-datenmodell.md) und [08](08-betrieb-und-deployment.md). |

> **Für die Neuauflage:** Die Entscheidung für Mehrsprachigkeit ist zu Projektbeginn zu treffen.
> Nachträglich hunderte fest verdrahtete Strings zu extrahieren, ist teuer. Wenn Mehrsprachigkeit
> nicht gewollt ist, sollte das explizit festgehalten werden.

## 10. Wartbarkeit und Qualitätssicherung

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-WART-01 | Klare Schichtentrennung zwischen Controller, Service, Repository und Modell. | MUSS | Erfüllt |
| NFA-WART-02 | Geschäftslogik ausschließlich in der Service-Schicht. | MUSS | Weitgehend erfüllt |
| NFA-WART-03 | Automatisierte Unit-Tests für die Geschäftslogik. | MUSS | **Teilweise** – umfangreich vorhanden, aber der letzte dokumentierte Backend-Testlauf war mit 260 Fehlschlägen bei 714 Tests nicht grün. Eine rote Testsuite ohne CI wird erfahrungsgemäß ignoriert. |
| NFA-WART-04 | Automatisierte Integrationstests gegen eine echte Datenbank. | SOLL | Erfüllt (Testcontainers) |
| NFA-WART-05 | Automatisierte End-to-End-Tests. | SOLL | **Nicht umgesetzt** |
| NFA-WART-06 | Frontend-Tests für Komponenten und Fachlogik. | SOLL | Teilweise – deutlich schwächer als das Backend |
| NFA-WART-07 | Kontinuierliche Integration (Build und Tests bei jeder Änderung). | SOLL | **Nicht vorhanden** – Stand siehe [08](08-betrieb-und-deployment.md) |
| NFA-WART-08 | Statische Codeanalyse und Linting. | SOLL | Teilweise (ESLint; Sonar-Findings wurden manuell behoben) |
| NFA-WART-09 | Versionierung des Quellcodes mit nachvollziehbaren Commits. | MUSS | Formal erfüllt, inhaltlich schwach (Commit-Nachrichten wie „fix issues") |
| NFA-WART-10 | Änderungsprotokoll/Release Notes je Version. | SOLL | **Nicht vorhanden** |
| NFA-WART-11 | Umgebungsabhängige Konfiguration (Entwicklung/Produktion) ohne Codeänderung. | MUSS | Teilweise |
| NFA-WART-12 | Schemaänderungen ausschließlich über versionierte Migrationen. | MUSS | Erfüllt (Flyway) |
| NFA-WART-13 | Die API muss versioniert sein, damit Frontend und Backend unabhängig aktualisiert werden können. | SOLL | **Nicht umgesetzt** – kein Versionspräfix im Pfad |

## 11. Betrieb, Logging, Monitoring

| ID | Anforderung | Priorität | Ist-Zustand |
|----|-------------|-----------|-------------|
| NFA-BETR-01 | Es muss einen Health-Endpunkt geben, den Docker und Betreiber abfragen können. | MUSS | Erfüllt |
| NFA-BETR-02 | Anwendungslogs mit den Stufen INFO, WARN, ERROR. | MUSS | Erfüllt |
| NFA-BETR-03 | Der Zustand der letzten Synchronisation muss sichtbar sein (Zeitpunkt, Erfolg, Fehlerursache). | SOLL | Teilweise |
| NFA-BETR-04 | Die Ausnutzung der Google-API-Kontingente soll überwacht werden. | KANN | **Nicht umgesetzt** |
| NFA-BETR-05 | Leistungskennzahlen (Antwortzeiten, Speicher) sollen erfasst werden. | KANN | **Nicht umgesetzt** |
| NFA-BETR-06 | Logaufbewahrung muss begrenzt sein (Vorgabe: 7 Tage). | SOLL | Über Docker-Standard, nicht explizit konfiguriert |
| NFA-BETR-07 | Es muss ein dokumentiertes Backup- und Restore-Verfahren geben. | MUSS | Erfüllt (eigene Betriebsdokumentation) |
| NFA-BETR-08 | Es muss ein dokumentierter Update-Prozess geben, der Migrationen einschließt. | MUSS | Erfüllt |
| NFA-BETR-09 | Ein Update darf keine Daten verlieren; Migrationen müssen vorwärtskompatibel sein. | MUSS | Erfüllt, aber ohne Rollback-Konzept |
| NFA-BETR-10 | Fehler dürfen dem Endnutzer am Display keine technischen Details zeigen. | SOLL | Teilweise |

## 12. Zusammenfassung der Lücken

Die folgenden nichtfunktionalen Anforderungen wurden im ursprünglichen Anforderungsdokument
formuliert, aber **nie umgesetzt**. Für jede ist in der Neuauflage bewusst zu entscheiden:
umsetzen oder streichen.

| Bereich | Lücke | Empfehlung |
|---------|-------|------------|
| Bedienschutz | Einstellungs-API prüft die PIN-Sitzung nicht serverseitig, PIN ist abrufbar | **Umsetzen** – sonst ist die Kindersicherung wirkungslos |
| Sicherheit | PIN gehasht speichern, Brute-Force-Schutz | **Gestrichen** – Produktentscheidung: PIN ist Kindersicherung, kein Sicherheitsmerkmal |
| Betrieb | `.env` wird vom Deployment nicht eingebunden, Default-Schlüssel bleiben aktiv | **Umsetzen** – ausdrücklich bestätigt |
| Betrieb | Avatare ohne persistentes Volume, gehen bei jedem Rebuild verloren | **Umsetzen** – ausdrücklich bestätigt |
| Dokumentation | Installationsanleitung auf vier Dateien verteilt und inhaltlich falsch | **Umsetzen** – eine `INSTALLATION.md`, verlinkt aus der `README.md` |
| Sicherheit | CORS bewusst vollständig geöffnet | **Umsetzen** – einschränken |
| Sicherheit | Kein TLS im Standardbetrieb | **Umsetzen** – Reverse Proxy mit Zertifikat vorsehen |
| Sicherheit | Keine Content-Security-Policy | **Umsetzen** – geringer Aufwand |
| Sicherheit | Kein Schlüsselwechsel-Verfahren | **Umsetzen** – Betriebsrisiko |
| Sicherheit | Kein PKCE im OAuth-Flow | Bewusst entscheiden (bei Server-Client vertretbar) |
| Sicherheit | Kein Audit-Log für Einstellungsänderungen | Streichen, wenn kein konkreter Bedarf |
| Echtzeit | Keine Push-Aktualisierung zwischen Geräten | Bewusst entscheiden; SSE statt WebSocket empfohlen |
| Qualität | Keine CI-Pipeline | **Umsetzen** – höchster Hebel für die Neuauflage |
| Qualität | Keine E2E-Tests | **Umsetzen** – mindestens für Setup, Kalender, Aufgabenerledigung |
| Qualität | Keine API-Versionierung | **Umsetzen** – geringer Aufwand zu Projektbeginn |
| Qualität | Schwache Frontend-Testabdeckung | **Umsetzen** |
| Barrierefreiheit | Nie geprüft, Farbe als einziger Bedeutungsträger | Teilweise umsetzen |
| Mehrsprachigkeit | Alle Texte fest im Code | Zu Projektbeginn entscheiden |
| Betrieb | Keine Sync-/Quota-Überwachung | Mindestens Sync-Status sichtbar machen |
| Leistung | Keine Lasttests gegen das Mengengerüst | **Umsetzen** – einmaliger Testlauf genügt |

### 12.1 Kritische Befunde aus der Codeanalyse

Über die Papierlücken hinaus haben die Fachanalysen konkrete Defekte im Altsystem zutage
gefördert, die in der Neuauflage nicht wiederholt werden dürfen. Sie sind hier gesammelt,
damit sie beim Entwurf präsent sind; die Herleitung steht jeweils im Fachdokument.

| Schwere | Befund | Dokument |
|---------|--------|----------|
| Mittel | Die PIN wird über einen ungeschützten Endpunkt ausgeliefert und die Sitzung serverseitig nicht geprüft – die Kindersicherung ist damit wirkungslos. Die Klartextspeicherung an sich ist laut Produktentscheidung akzeptabel. | [08](08-betrieb-und-deployment.md) |
| Hoch | Verschlüsselungsschlüssel laufen produktiv auf den Quellcode-Defaults, weil die `.env` nicht eingebunden ist | [08](08-betrieb-und-deployment.md) |
| Hoch | Der Aufgaben-Sync wertet die Seitennavigation nicht aus und löscht anschließend alle lokalen Aufgaben, die nicht auf der ersten Seite standen – auch rein lokal angelegte | [06](06-google-integration.md) |
| Hoch | Avatare liegen ohne Volume im Container und gehen bei jedem Rebuild verloren, während die Datenbank weiter auf sie verweist | [08](08-betrieb-und-deployment.md) |
| Hoch | Keine Restart-Policy: nach einem Stromausfall startet die Anwendung nicht von selbst | [08](08-betrieb-und-deployment.md) |
| Mittel | Punkte lassen sich fremd gutschreiben, da die erledigende Person nicht gegen die Zuweisung geprüft wird | [03](03-haushalt-gamification.md) |
| Mittel | Es werden nie Vorschaubilder erzeugt; die Slideshow lädt durchgehend Originaldateien | [07](07-synology-fotos.md) |
| Mittel | Die Wiederaufnahme der Ersteinrichtung ist wegen abweichender Feldnamen und -typen zwischen Frontend und Backend wirkungslos | [02](02-funktionale-anforderungen.md) |
| Mittel | Hintergrundläufe starten wegen UTC-Zeitzone um 01:00/02:00 Ortszeit statt um Mitternacht | [08](08-betrieb-und-deployment.md) |
| Mittel | Keine HTTP-Timeouts gegenüber Google und dem Wetterdienst | [08](08-betrieb-und-deployment.md) |
| Mittel | Verpasste Läufe der Aufgabengenerierung werden nicht nachgeholt, der Rhythmus verschiebt sich dauerhaft | [03](03-haushalt-gamification.md) |
| Niedrig | GPS-Daten privater Fotos werden an einen externen Geocoding-Dienst gesendet | [07](07-synology-fotos.md) |
| Niedrig | Die Album-Passphrase wird auf Log-Stufe INFO im Klartext protokolliert | [07](07-synology-fotos.md) |

---

*Nächstes Dokument: [10 – Empfehlungen für die Neuauflage](10-neuauflage.md)*
