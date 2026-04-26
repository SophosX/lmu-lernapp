# LMU Lernapp

Erste Webapp-Basis für eine grafische Lernplattform rund um lokale LMU-/Moodle-Inhalte, Tutor-Modus und qualitative Wissensstandsdiagnostik.

## Ziel dieser ersten Version

- ruhige grafische Oberfläche
- Fachkarten für **Anästhesie** und **Kardiologie**
- qualitative Lernfortschrittszustände statt bloßer Prozentbalken
- Themen-/Evidenzsicht als Grundlage für späteren Tutor-Modus
- erste UI-Struktur für **Fach → Themengebiet → Inhalte**
- vorbereitete Upload-Sektion für **PDF, Audio, Notizen und Links**

## Stack

- Vite
- React
- TypeScript

## Starten

### Frontend
```bash
cd apps/lmu-lernapp
npm install
npm run dev
```

Dann im Browser öffnen:

- http://localhost:4173

### Upload-API
```bash
cd apps/lmu-lernapp
npm run api
```

- API: http://localhost:8787

## Build

```bash
npm run build
npm run preview
```

## Aktueller Scope

Diese Version enthält noch kein Backend. Die Daten liegen zunächst statisch in:

- `src/data/learningPlan.ts`

Dort lassen sich Fächer, Themen, qualitative Lernstände und Themengebiets-Inhalte direkt erweitern.

Zusätzlich gibt es bereits:
- eine erste **Frontend-Uploadlogik**
- eine **einfache Upload-API** (`server.js`) für lokale Speicherung
- lokale Persistenz unter `data-store/`
- persistente **Tutor-Verläufe pro Fach/Thema** über die lokale API (`data-store/tutor-sessions.json`)
- eine erste **dynamische Tutor-Diagnostik**, die gespeicherte Antworten heuristisch in Evidenzpunkte übersetzt und damit die Tutor-Einschätzung pro Thema nachschärft
- eine automatische **Quellenkopplung pro Thema**, damit die Tutor-Ansicht nicht nur einen Verlauf zeigt, sondern direkt die wahrscheinlich passendste Bezugsquelle aus der Bibliothek auswählt
- eine fachübergreifende **„Nächste Session“-/Review-Queue**, die aus Evidenzlage, Tutor-Verlauf und Content-Match priorisierte nächste Lernschritte ableitet
- erste **Wiedervorlage-Logik**, die je nach Lernstand/Confidence automatisch den nächsten sinnvollen Review-Zeitpunkt vorschlägt

Aktuell ist die Frontend-Form bereits mit der API verbunden; Tutor-Antworten, Uploads und lokale Korpus-Importe werden persistent gespeichert. Die Tutor-Ansicht kombiniert inzwischen statische Startevidenz mit realen gespeicherten Antworten und übersetzt diese in eine konkrete nächste Session.

## Nächste sinnvolle Schritte

1. **Audio-/Podcast-Modus anbinden**
   - Lektionen als Audioeinheiten verlinken
   - Audiofortschritt und Wiedergabestatus speichern

2. **Tutor-Modus weiter vertiefen**
   - Heuristiken durch echte Antwort-/Transkriptanalyse ersetzen
   - evidenzbasiertes Kompetenzprofil pro Thema weiter validieren
   - Review-Queue mit echten Fortschrittsänderungen statt heuristischem Snapshot füttern

3. **Echten Upload-Flow anbinden**
   - Dateien über die UI auswählen
   - Metadaten erfassen: Fach, Themengebiet, Quelle, Typ
   - Audio automatisch transkribieren und thematisch einsortieren
   - Inhalte persistent speichern statt nur im Frontend-State

4. **Moodle-/LMU-Import anschließen**
   - lokale Kursindizes einlesen
   - Inhalte pro Fach/Thema automatisch mappen
   - später geschützte Kursimporte ergänzen, sobald der Login stabil läuft

5. **Deployment vorbereiten**
   - Hosting-Ziel definieren
   - Umgebungsvariablen / Build-Pipeline ergänzen

## Hinweis zur Entwicklung

Für die eigentliche App-Entwicklung soll der Codex-CLI-OAuth-Weg genutzt werden, nicht ein API-Key-basierter Codingpfad.
