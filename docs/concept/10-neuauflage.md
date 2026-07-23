# 10 – Empfehlungen für die Neuauflage

## Zweck & Geltungsbereich

Dieses Dokument fasst die Erkenntnisse aus der Analyse des Altsystems zu einer Empfehlung
zusammen: Was ist tragfähig und sollte übernommen werden, was ist zu ersetzen, in welcher
Reihenfolge sollte gebaut werden und welche Entscheidungen müssen vor Projektbeginn getroffen
werden. Es ist bewusst wertend – im Unterschied zu den Dokumenten 01–09, die den Ist-Zustand
beschreiben.

## Inhalt

- [1. Gesamtbewertung des Altsystems](#1-gesamtbewertung-des-altsystems)
- [2. Was übernommen werden sollte](#2-was-übernommen-werden-sollte)
- [3. Was neu gedacht werden muss](#3-was-neu-gedacht-werden-muss)
- [4. Architekturempfehlungen](#4-architekturempfehlungen)
- [5. Vorschlag für den Funktionsumfang](#5-vorschlag-für-den-funktionsumfang)
- [6. Vorgeschlagene Reihenfolge](#6-vorgeschlagene-reihenfolge)
- [7. Risiken](#7-risiken)
- [8. Offene Entscheidungen](#8-offene-entscheidungen)
- [9. Was aus dem Altprojekt zu lernen ist](#9-was-aus-dem-altprojekt-zu-lernen-ist)

---

## 1. Gesamtbewertung des Altsystems

**Das Produktkonzept trägt. Die Umsetzung trägt nicht.**

Das ist die zentrale Aussage der Analyse. Die fachlichen Ideen von FamilyHub – ein Familien-
kalender aus mehreren Google-Konten, faire Ämtli-Rotation mit spielerischer Motivation, ein
Bilderrahmen aus dem eigenen NAS, alles ohne Cloud-Abhängigkeit – sind stimmig, durchdacht und
im Alltag nützlich. Die Detailkonzepte, insbesondere Rotationslogik und Datenmodell, sind
größtenteils sinnvoll und lassen sich als fachliche Vorlage weiterverwenden.

Der Implementierungsstand hingegen ist deutlich schlechter, als die projekteigene Checkliste mit
„~98 % fertig" suggeriert. Diese Zahl zählt abgehakte Aufgaben, nicht funktionierende Software.
Die Analyse hat ergeben:

| Beobachtung | Bedeutung |
|-------------|-----------|
| 95 von 112 API-Endpunkten sind völlig ungeschützt, 8 weitere täuschen einen Schutz nur vor | Die Kindersicherung ist eine Fassade |
| Die PIN wird über einen offenen Endpunkt ausgeliefert | Ein Kind mit einem Browser hebelt die Sperre in einem Schritt aus |
| Verschlüsselungsschlüssel laufen produktiv auf den Quellcode-Defaults | Die Verschlüsselung der Google-Tokens ist wirkungslos |
| Der Aufgaben-Sync löscht bei jedem Lauf lokale Daten | Aktiver Datenverlust im laufenden Betrieb |
| Ein erheblicher Teil des Frontends ist nicht eingebunden | Der Funktionsumfang ist kleiner als dokumentiert |
| Der letzte Backend-Testlauf zeigte 260 Fehlschläge bei 714 Tests | Die Testsuite ist kein Sicherheitsnetz mehr |
| Es gibt keine CI, Docker-Builds überspringen Tests bewusst | Nichts hat den Verfall bemerkt |

Die letzten beiden Punkte erklären die ersten fünf. Ohne automatisierte Prüfung bei jeder
Änderung driftet ein System dieser Größe zwangsläufig auseinander – sichtbar an der
Commit-Historie, die zum Ende hin fast nur noch aus „fix issue"-Einträgen besteht.

**Empfehlung: Neuentwicklung, nicht Sanierung.** Die Zahl der strukturellen Defekte – fehlendes
Sicherheitskonzept, systematisch falsche Fehlerbehandlung, tote Codepfade, rote Tests – ist so
hoch, dass eine schrittweise Reparatur teurer wäre als ein Neubau auf Basis dieses Lastenhefts.
Der Wert des Altsystems liegt in der Fachlichkeit, die in den Dokumenten 02–08 gesichert ist,
nicht im Code.

## 2. Was übernommen werden sollte

Diese Entscheidungen des Altsystems haben sich bewährt und sollten in der Neuauflage bestehen
bleiben:

| Entscheidung | Begründung |
|--------------|------------|
| **Backend als alleiniger Integrationspunkt** | Zugangsdaten verlassen den Server nie, keine CORS-/Zertifikatsprobleme im Browser, eine Stelle für Fehlerbehandlung und Wiederholungen |
| **Lokale Spiegelung externer Daten** | Die Anzeige funktioniert, wenn Google oder die NAS nicht erreichbar sind – für ein Wanddisplay wesentlich |
| **Konfiguration über einen Setup-Assistenten im Browser** | Die Zielgruppe kann keine Dateien auf einer NAS bearbeiten. Der Weg „alles im Browser einrichten" ist richtig und sollte beibehalten werden |
| **Trennung von Aufgaben-Vorlage und Aufgaben-Instanz** | Sauberes Modell, das Änderungen an Vorlagen ohne Rückwirkung auf Vergangenes erlaubt |
| **Versionierte Datenbank-Migrationen** | Ermöglicht sichere Updates im laufenden Betrieb |
| **Rollenbasierte Zuweisungsgruppen** (`parents`/`children`/`all`) statt fester Personenlisten | Übersteht das Hinzufügen und Entfernen von Familienmitgliedern |
| **PWA statt nativer App** | Läuft auf dem Wanddisplay und nebenbei auf allen Handys der Familie |
| **Deutschsprachige Oberfläche als Standard** | Passend zur Zielgruppe |
| **Kein Mehrmandantensystem** | Vermeidet erheblichen Aufwand ohne Nutzen |

Ebenfalls übernehmenswert ist das **fachliche Konzept der Gamification** (Punkte, Streaks,
Abzeichen, Leaderboard) – es ist gut durchdacht, war im Altsystem nur nie vollständig
angeschlossen.

## 3. Was neu gedacht werden muss

### 3.1 Sicherheitsmodell

Das Altsystem hat kein Sicherheitsmodell, sondern die Annahme „im Heimnetz ist alles in
Ordnung". Das ist auch für ein privates System zu wenig, weil im Heimnetz auch Gastgeräte,
Kindergeräte und Smart-Home-Komponenten hängen.

Empfohlener Ansatz für die Neuauflage:

**Klarstellung zum Schutzziel der PIN (Produktentscheidung):** Die PIN ist ausdrücklich eine
**Kindersicherung**, kein Sicherheitsmerkmal. Sie soll verhindern, dass Kinder am Wanddisplay
Einstellungen verändern – nicht einen Angreifer abwehren. Gehashte Speicherung und
Brute-Force-Schutz sind deshalb **nicht** erforderlich; die Klartextspeicherung ist akzeptabel.

Das entbindet allerdings nicht davon, die Sperre überhaupt wirksam zu machen: Solange die PIN
über die allgemeine Einstellungsabfrage abrufbar ist und die Sitzung nur im Frontend geprüft
wird, genügt ein Browseraufruf, um sie zu umgehen. Beides ist mit geringem Aufwand zu beheben
und bleibt verbindlich.

- **Ein einziger, serverseitig durchgesetzter Schutzbegriff.** Jeder Endpunkt ist entweder
  öffentlich (Anzeigen) oder geschützt (Konfigurieren, Verwalten). Die Entscheidung fällt im
  Backend, nicht im Frontend.
- **Die PIN wird nie zurückgeliefert** – weder über die Einstellungsabfrage noch einzeln. Die
  Prüfung erzeugt ein kurzlebiges Sitzungstoken, das der Server bei jedem geschützten Aufruf
  validiert.
- **Ein Verschlüsselungsschlüssel, der beim ersten Start erzeugt wird**, falls keiner
  bereitgestellt wurde – und ein Startabbruch mit klarer Meldung, wenn ein Default-Schlüssel
  erkannt wird. Nie stillschweigend auf einen im Code hinterlegten Wert zurückfallen.
- **CORS auf die tatsächlichen Ursprünge beschränken**, TLS über einen vorgelagerten Reverse
  Proxy als dokumentierter Standardweg.
- **Zuordnungsprüfung bei Punktevergabe**: Wer eine Aufgabe erledigt meldet, muss die zugewiesene
  Person sein oder ein Elternteil.

### 3.2 Fehlerbehandlung

Im Altsystem liefern fehlende Parameter, ungültiges JSON und fachliche Fehler wie „Mitglied nicht
gefunden" allesamt HTTP 500, verteilt über vier verschiedene Fehlerformate. Das macht sowohl die
Fehlersuche als auch eine vernünftige Fehleranzeige im Frontend unmöglich.

Empfehlung: **Ein einziges Fehlerformat** (z. B. RFC 9457 „Problem Details"), eine zentrale
Zuordnung von Fachfehlern zu Statuscodes, und die Regel, dass ein HTTP 500 immer ein Fehler des
Systems ist, nie eine Reaktion auf eine Nutzereingabe. Zwei Endpunkte des Altsystems verschlucken
Fehler und antworten mit einer leeren Liste – dieses Muster ist grundsätzlich zu vermeiden, weil
es Ausfälle unsichtbar macht.

### 3.3 Synchronisation mit Google

Der bestehende Sync hat einen aktiven Datenverlust-Defekt: Er wertet die Seitennavigation nicht
aus, liest also nur die erste Seite, und löscht anschließend alles lokal Vorhandene, das nicht auf
dieser Seite stand.

Empfehlungen:

- **Seitennavigation vollständig auswerten**, bevor irgendetwas abgeglichen wird.
- **Löschen nur bei bestätigter Löschung.** Ein Datensatz wird lokal nur entfernt, wenn die
  Gegenstelle ihn explizit als gelöscht meldet – nie, weil er in einer Antwort fehlt.
- **Lokal entstandene Daten sind niemals durch einen Abgleich löschbar**, solange sie noch nicht
  übertragen wurden.
- **Der Sync-Zustand gehört sichtbar gemacht**: letzter Lauf, Ergebnis, Fehlerursache – im
  Einstellungsbereich und über den Health-Endpunkt.
- **Zeitüberschreitungen** für alle ausgehenden Aufrufe. Das Altsystem hat keine, wodurch ein
  hängender Aufruf einen Hintergrundlauf dauerhaft blockieren kann.

### 3.4 Fotoanbindung

Die Slideshow lädt für jedes Bild die Originaldatei von der NAS (3–8 MB) und rendert im
schlechtesten Fall hunderte davon gleichzeitig. Vorschaubilder werden nie erzeugt, obwohl die
NAS sie anbietet.

Empfehlungen:

- **Vorschaubilder in Anzeigeauflösung verwenden**, Originaldateien nie vollständig laden.
- **Die Fotoquelle hinter einer Abstraktion kapseln.** Das Altsystem musste bereits einmal
  komplett von Google Photos auf Synology umsteigen; ein weiterer Wechsel ist realistisch.
- **Immer einen definierten Ersatzzustand** bei nicht erreichbarer NAS statt eines Serverfehlers.
- **Videos streamen** statt sie vollständig in den Speicher zu laden.
- Auf das Versenden von GPS-Daten privater Fotos an externe Dienste verzichten oder es zumindest
  abschaltbar machen und im Setup transparent erklären.

### 3.5 Toter Code und Doppelstrukturen

Das Altsystem enthält in erheblichem Umfang Bestandteile, die gebaut, getestet und nie
angeschlossen wurden – darunter die natürlichsprachige Eingabe samt rund 75 Tests, vier
Gamification-Komponenten, mehrere Ansichten, eine ungenutzte Datenbanktabelle und ein
ungenutztes Konfigurationsfeld.

Empfehlung: **Nichts wird gebaut, bevor es angeschlossen wird.** Eine Funktion gilt erst als
fertig, wenn sie über die Oberfläche erreichbar ist. Das verhindert den Zustand „98 % fertig,
aber die Hälfte ist nicht erreichbar".

## 4. Architekturempfehlungen

Die Grobarchitektur des Altsystems ist angemessen und sollte beibehalten werden: getrenntes
Frontend und Backend, relationale Datenbank, Containerbetrieb auf der NAS. Empfohlene
Anpassungen:

| Thema | Empfehlung | Begründung |
|-------|------------|------------|
| **Redis** | Streichen | Wird nachweislich nicht genutzt; reiner Ballast und ein zusätzlich offener Port |
| **API-Versionierung** | `/api/v1/` von Anfang an | Kostet zu Projektbeginn nichts, später viel |
| **API-Beschreibung** | OpenAPI-Spezifikation generieren | Ermöglicht typsichere Client-Erzeugung und macht Frontend/Backend-Abweichungen unmöglich. Das Altsystem hat mehrere solcher Abweichungen (unterschiedliche Feldnamen, ein vom Frontend aufgerufener Endpunkt, den es im Backend nicht gibt) |
| **Eingabevalidierung** | Durchgängig deklarativ am DTO | Der Validierungs-Starter war im Altsystem eingebunden, wurde aber kein einziges Mal verwendet |
| **Zeitzonen** | Ein festgelegtes Konzept: Speicherung in UTC, Anzeige und Zeitsteuerung in der Ortszeit der Familie, Zeitzone als Einstellung | Im Altsystem laufen die „Mitternachts"-Läufe um 01:00/02:00 Ortszeit |
| **Aktualisierung mehrerer Geräte** | Server-Sent Events | Deutlich einfacher als WebSockets und für den Anwendungsfall ausreichend. Alternativ bewusst auf Polling festlegen |
| **Hintergrundläufe** | Ausführungen protokollieren, verpasste Läufe nachholen | Das Altsystem verschiebt den Ämtli-Rhythmus dauerhaft, wenn die NAS ausfällt |
| **Persistenz von Dateien** | Avatare und alle weiteren Uploads auf ein persistentes, per Umgebungsvariable konfigurierbares Volume; Pfad Teil des Backups; beim Start auf Existenz und Schreibrechte prüfen | Im Altsystem gehen sie bei jedem Rebuild verloren, während die Datenbank weiter auf sie verweist. **Ausdrücklich bestätigte Anforderung** |
| **Betriebssicherheit** | `restart: unless-stopped` für alle Container; `.env` über `env_file` verbindlich einbinden; Start abbrechen oder unübersehbar warnen, wenn ein Default-Schlüssel aktiv ist | Beides fehlt im Altsystem vollständig. Die nicht eingebundene `.env` ist **ausdrücklich als zu behebender Defekt bestätigt** |
| **Installationsdokumentation** | Genau eine `INSTALLATION.md` im Wurzelverzeichnis mit allen NAS-Deployment-Anleitungen; die `README.md` verweist darauf und enthält selbst keine Installationsschritte | Im Altsystem auf vier Dateien in zwei Verzeichnissen verteilt und inhaltlich falsch (nennt neun nicht existierende Variablen). **Ausdrücklich bestätigte Anforderung**, siehe `TA-DEPLOY-14` bis `TA-DEPLOY-18` in [08](08-betrieb-und-deployment.md) |
| **CI** | Build, Tests und Linting bei jeder Änderung; rote Tests blockieren | Der wirksamste einzelne Hebel gegen die Wiederholung der Altsystem-Geschichte |

Zur **Technologiewahl**: Der bestehende Stack (Kotlin/Spring Boot, React/TypeScript/Vite,
PostgreSQL) ist für die Aufgabe angemessen und aktuell. Es gibt aus technischer Sicht keinen
zwingenden Grund zu wechseln. Ein Wechsel auf eine einheitliche Sprache für Frontend und Backend
wäre für ein Ein-Personen-Projekt eine Überlegung wert, weil er den Kontextwechsel reduziert –
das ist aber eine Präferenzentscheidung, keine fachliche Notwendigkeit. Wird der Stack
beibehalten, kann ein Teil des Altcodes als Referenz für die Google-Anbindung dienen, deren
handgeschriebene Aufrufe im Kern korrekt sind.

## 5. Vorschlag für den Funktionsumfang

Die folgende Einteilung trennt, was für ein nutzbares System nötig ist, von dem, was Komfort
schafft. Sie ist als Diskussionsgrundlage gedacht.

**Kern – ohne das ist das Produkt nicht nutzbar**

- Familienmitglieder verwalten (mit und ohne Google-Konto), Avatare, Farben, Rollen
- Ersteinrichtung im Browser inklusive Google-Verbindung
- PIN-Kindersicherung, serverseitig durchgesetzt
- Kalender: Wochen- und Tagesansicht, Termine anlegen, ändern, löschen, mehrere Google-Kalender, Zuordnung zu Mitgliedern über Farben
- Aufgaben: Liste, anlegen, erledigen, Zuweisung, Google-Tasks-Abgleich in beide Richtungen
- Haushaltsaufgaben: Vorlagen, automatische Erzeugung, Rotation, Erledigung
- Slideshow aus Synology Photos mit Vorschaubildern und Ersatzzustand
- Kiosk-Modus, Bildschirmtastatur, Dark Mode
- Betrieb: Container mit Restart-Policy, persistente Volumes (inkl. Avatare), korrekt eingebundene `.env`, Backup, Update-Weg
- Dokumentation: `INSTALLATION.md` mit allen NAS-Deployment-Anleitungen, aus der `README.md` verlinkt

**Wichtig – deutlich besseres Produkt, aber nachrüstbar**

- Gamification vollständig angeschlossen: Punkte, Streaks, Abzeichen mit Benachrichtigung, Leaderboard, Mitgliederstatistiken
- Wetter-Widget inklusive Vorhersage
- Natürlichsprachige Eingabe für Termine und Aufgaben, tatsächlich angebunden
- Sichtbarer Synchronisationsstatus und verständliche Fehlermeldungen
- Aktualisierung über mehrere Geräte hinweg

**Optional – bewusst zu entscheiden**

- Einkaufsliste (im Altsystem nie erreichbar; Bedarf ist zu klären)
- Essensplan (war im ursprünglichen Anforderungsdokument ausdrücklich gestrichen worden)
- Terminerinnerungen und Benachrichtigungen
- Anpassbares Dashboard
- Videowiedergabe in der Slideshow
- Mehrsprachigkeit

**Nicht empfohlen**

- Fernzugriff aus dem Internet ohne VPN
- Mehrmandantenfähigkeit
- Eigenes Benutzerkonten- und Rechtesystem über den PIN-Schutz hinaus

## 6. Vorgeschlagene Reihenfolge

Die Reihenfolge ist so gewählt, dass nach jedem Schritt etwas Nutzbares existiert und die
riskantesten Teile früh geklärt sind.

| Schritt | Inhalt | Warum an dieser Stelle |
|---------|--------|------------------------|
| 1 | Projektgerüst, CI, Datenbankschema, Grundgerüst von API und Oberfläche, Sicherheitskonzept | Die CI zuerst – sie ist das, was im Altprojekt gefehlt hat |
| 2 | Familienmitglieder, Einstellungen, PIN-Schutz, Ersteinrichtung | Grundlage für alles Weitere; die Ersteinrichtung wird früh oft benutzt und deshalb früh stabil |
| 3 | Google-Anbindung: OAuth, Kalender lesen und schreiben | Der riskanteste externe Teil, deshalb früh |
| 4 | Kalenderansicht mit Wochen- und Tagesdarstellung | Erster echter Alltagsnutzen |
| 5 | Aufgaben inklusive Google-Tasks-Abgleich | Zweiter Alltagsnutzen, nutzt die Anbindung aus Schritt 3 |
| 6 | Haushaltsaufgaben: Vorlagen, Rotation, Erledigung | Eigenständige Fachlichkeit ohne externe Abhängigkeit |
| 7 | Gamification vollständig, inklusive Anzeige und Benachrichtigung | Setzt auf Schritt 6 auf |
| 8 | Synology-Anbindung und Slideshow mit Vorschaubildern | Riskant, aber isoliert – kann ohne Blockade des Restes reifen |
| 9 | Kiosk-Modus, Bildschirmtastatur, Themes, Wetter | Der „Wanddisplay-Schliff" |
| 10 | Betriebsreife: Backup, Update, Monitoring, Lasttest gegen das Mengengerüst | Vor dem produktiven Einsatz |

Für jeden Schritt gilt: **Er ist erst fertig, wenn die Funktion über die Oberfläche erreichbar
ist, Tests grün sind und die CI durchläuft.**

## 7. Risiken

| Risiko | Auswirkung | Gegenmaßnahme |
|--------|------------|---------------|
| **Google ändert erneut Zugriffsrechte oder Scope-Regeln** | Kernfunktion fällt weg – genau das ist mit Google Photos bereits passiert | Google-Anbindung hinter einer Abstraktion kapseln; das System muss auch ohne Google-Verbindung sinnvoll nutzbar bleiben (lokale Termine und Aufgaben) |
| **Sensible Scopes erfordern eine Google-Überprüfung** | Kalender- und Tasks-Scopes gelten als „sensitive". Ohne Verifizierung bleibt die Anwendung im Testmodus mit begrenzter Nutzerzahl und regelmäßig ablaufenden Tokens | Früh klären, ob der Testnutzer-Modus dauerhaft ausreicht (bei einer Familie meist ja) und die Konsequenzen dokumentieren |
| **Synology ändert die DSM-Web-API** | Die verwendete Schnittstelle ist nicht offiziell als stabile Programmierschnittstelle zugesagt | Fotoquelle abstrahieren, Ersatzzustand vorsehen, Versionsabhängigkeit dokumentieren |
| **Wiederholung des Altprojekt-Musters** | „Fertig" ohne funktionierende Software | CI von Anfang an, Definition of Done mit „über die Oberfläche erreichbar" |
| **Umfang wächst unkontrolliert** | Das Altprojekt hat sieben Funktionsbereiche parallel begonnen und keinen davon zu Ende gebracht | Strikt der Reihenfolge aus Kapitel 6 folgen, optionale Funktionen bewusst zurückstellen |
| **Migration der Bestandsdaten** | Familienmitglieder, Haushaltsvorlagen, Punktestände und Abzeichen aus dem Altsystem gehen verloren | Vor Projektbeginn entscheiden, ob migriert wird (siehe Kapitel 8) |
| **Einzelentwickler-Projekt** | Wissen und Fortschritt hängen an einer Person | Dieses Lastenheft aktuell halten; Entscheidungen im Repository festhalten |

## 8. Offene Entscheidungen

### 8.1 Bereits getroffene Festlegungen

Diese vier Punkte sind entschieden und im Lastenheft verbindlich verankert:

| Festlegung | Konsequenz | Verankert in |
|------------|------------|--------------|
| **Die PIN ist eine Kindersicherung, kein Sicherheitsmerkmal.** Sie soll nur verhindern, dass Kinder Einstellungen verändern. | Hashing und Brute-Force-Schutz entfallen (`KANN`). Verbindlich bleibt: Die PIN darf nicht über einen Endpunkt abrufbar sein und die Sitzung muss serverseitig geprüft werden – sonst ist die Sperre wirkungslos. | `TA-OPS-20` bis `TA-OPS-23`, `NFA-SICH-03/03a/06/07` |
| **Avatare müssen dauerhaft gespeichert werden.** | Persistentes Volume mit konfigurierbarem Pfad, Aufnahme ins Backup, Prüfung beim Start, Rückfall auf die Standarddarstellung bei fehlender Datei. | `TA-OPS-14` bis `TA-OPS-14d` |
| **Die `.env` muss vom Deployment tatsächlich eingebunden werden.** | `env_file` in der Compose-Datei, Nachvollziehbarkeit der wirksamen Konfiguration, Startabbruch bzw. deutliche Warnung bei aktivem Default-Schlüssel. | `TA-CONF-03` bis `TA-CONF-03c` |
| **Eine zentrale `INSTALLATION.md`, verlinkt aus der `README.md`.** | Sämtliche NAS-Deployment-Anleitungen an einer Stelle; die `README.md` enthält selbst keine Installationsschritte, damit beide nicht auseinanderlaufen. | `TA-DEPLOY-14` bis `TA-DEPLOY-18` |

### 8.2 Noch offen

Diese Punkte lassen sich nicht aus dem Altsystem ableiten und sollten vor Projektbeginn
beantwortet werden:

1. **Bestandsdaten übernehmen?** Sollen Familienmitglieder, Haushaltsvorlagen, gesammelte Punkte
   und verdiente Abzeichen aus der laufenden Installation migriert werden, oder startet die
   Neuauflage leer? Das hat spürbare Auswirkungen auf das Datenmodell und den Umstellungsweg.
   Bei Kindern, die schon länger Punkte sammeln, ist ein Verlust erfahrungsgemäß ein Problem.
2. **Einkaufsliste und Essensplan: gewollt oder nicht?** Beide sind im Altsystem nicht nutzbar.
   Wenn sie gebraucht werden, sind sie vollständig neu zu konzipieren – auch die Frage, ob eine
   Einkaufsliste ohne Handy-Zugriff überhaupt Sinn ergibt.
3. **Technologie-Stack beibehalten?** Kotlin/Spring Boot plus React ist fachlich angemessen. Ein
   Wechsel auf eine einheitliche Sprache wäre für ein Solo-Projekt ein Effizienzgewinn, kostet
   aber die Wiederverwendbarkeit der bestehenden Google-Anbindung als Referenz.
4. **Aktualisierung über mehrere Geräte:** Push (Server-Sent Events) oder schlichtes Polling?
   Bei einem Wanddisplay plus gelegentlicher Handynutzung reicht Polling meist aus.
5. **Mehrsprachigkeit von Anfang an?** Nachträglich ist es teuer. Wenn Deutsch dauerhaft genügt,
   sollte das ausdrücklich festgehalten werden.
6. **Zugriff von außerhalb des Heimnetzes?** Falls gewünscht, ändert das die
   Sicherheitsanforderungen grundlegend und sollte von Beginn an eingeplant werden – die
   Empfehlung lautet allerdings, es beim VPN-Zugang zu belassen.
7. **Wetterdienst:** Der bisherige Anbieter erfordert einen API-Schlüssel. Es gibt Alternativen
   ohne Registrierung. Das betrifft die Bedienfreundlichkeit der Ersteinrichtung.

## 9. Was aus dem Altprojekt zu lernen ist

Zum Abschluss die fünf Muster, die im Altprojekt am meisten gekostet haben – sie sind wertvoller
als jede einzelne technische Empfehlung:

1. **Eine Checkliste misst Aktivität, nicht Ergebnis.** „98 % abgehakt" stand neben einer roten
   Testsuite, nicht erreichbaren Ansichten und einem wirkungslosen Zugriffsschutz. Fortschritt
   sollte an lauffähiger, erreichbarer Funktionalität gemessen werden.
2. **Ohne automatische Prüfung verfällt ein System unbemerkt.** Die Testsuite war umfangreich und
   gut gemeint, aber weil nichts sie erzwang, wurde sie rot und blieb rot.
3. **Gebaut und nicht angeschlossen ist verschwendete Arbeit.** Die natürlichsprachige Eingabe hat
   rund 75 Tests und wird von keiner Komponente aufgerufen.
4. **Sicherheit lässt sich nicht nachrüsten.** Der PIN-Schutz wurde im Frontend gebaut, im Backend
   nie durchgesetzt – der zugehörige Interceptor blieb ein Kommentar im Code.
5. **Externe Abhängigkeiten ändern sich.** Der Wegfall des Google-Photos-Zugriffs hat den
   ursprünglich zentralen Baustein des Produkts entwertet. Alles, was von einem fremden Dienst
   abhängt, gehört hinter eine austauschbare Schnittstelle.

---

*Zurück zur [Übersicht](00-README.md)*
