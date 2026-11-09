# Testprotokoll

## Phase 1 – Projekt-Setup (2026-11-09)

Umgebung: Windows 11 Home 10.0.26200, Node 26.13.0, npm 11.20.0, Rust stable (MSVC),
cargo 1.99.1, VS 2022 Build Tools, WebView2 157.

### Automatisch (`npm run verify`)

| Prüfung                                                                            | Ergebnis                                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| ESLint (TypeScript strict, Netzwerk-Globals verboten)                              | ✅ keine Befunde                                                |
| Prettier                                                                           | ✅                                                              |
| TypeScript `tsc -b` (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes) | ✅                                                              |
| Vitest: 16 Tests in 4 Dateien                                                      | ✅ alle grün                                                    |
| Vite-Produktionsbuild                                                              | ✅                                                              |
| Offline-Prüfung (`check:offline`)                                                  | ✅ CSP lokal, keine Netzwerk-Plugins, keine externen Ressourcen |

Abgedeckte Unit-Tests:

- `src/i18n/i18n.test.ts` – Schlüssel-/Platzhaltergleichheit DE/EN, keine leeren Texte, Formatierung
- `src/ui/state/settingsStore.test.ts` – Validierung, Skalierungsraster, Persistenz
- `src/ui/AppShell.test.tsx` – Start auf Deutsch, Navigation per Maus und `Alt+1…3`,
  SRD-Attribution, Lizenzliste mit Filter, Theme/Sprache/Skalierung auf `<html>`
- `scripts/check-offline.test.mjs` – Projektkonfiguration besteht; unsichere CSP, Netzwerk-Plugins,
  Berechtigungen und externe Ressourcen werden erkannt

### Manuell

| Prüfung                                                                                | Ergebnis                                                                                                        |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Gebautes Frontend mit Produktions-CSP (`vite preview`, Chromium): PixiJS initialisiert | ✅ „WebGL 2“, keine CSP-Verstöße in der Konsole                                                                 |
| Netzwerkanfragen beim Öffnen aller Seiten                                              | ✅ ausschließlich `localhost` (eigene Assets)                                                                   |
| Hell-/Dunkel-Theme, Einstellungen                                                      | ✅                                                                                                              |
| `cargo build` (Debug)                                                                  | ✅                                                                                                              |
| `npm run tauri:build` (Release)                                                        | ✅ `DnD Battlemap_0.1.0_x64_de-DE.msi` / `_en-US.msi` (je 2,2 MB), `DnD Battlemap_0.1.0_x64-setup.exe` (1,6 MB) |
| Start der Release-Exe                                                                  | ✅ Fenster „DnD Battlemap“ öffnet, reagiert                                                                     |
| macOS-/Linux-Bundles                                                                   | ⏳ nicht lokal baubar; im CI-Workflow `.github/workflows/ci.yml` konfiguriert, noch nicht ausgeführt            |

## Phase 2 – Raster & Map-Basis (2026-11-09)

### Automatisch

| Prüfung                                                                  | Ergebnis                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `npm run verify` (Lint, Prettier, `tsc`, Vitest, Build, Offline-Prüfung) | ✅ 64 Tests in 12 Dateien                                           |
| `npm run test:rust`                                                      | ✅ 3 Tests (Prozent-Dekodierung, atomares Schreiben, IPC-Roundtrip) |

Neue Tests:

- `src/core/distance.test.ts` – Standard, Variante 5/10/5 (inkl. Fortzählen über Wegpunkte),
  euklidisch, Symmetrie, Feldgröße, leere Wege
- `src/core/camera.test.ts` – Welt↔Bildschirm, Zoom um Mauspunkt, Zoomgrenzen, Einpassen
  (auch 200×200), Karte bleibt sichtbar, minimales Nachscrollen
- `src/core/grid-units.test.ts` – Feldberechnung, Grenzen, ft/m-Formatierung (de/en)
- `src/storage/storage.test.ts` – Round-Trip Speichern→Laden identisch, Assets, Autosave-Infos,
  kaputte Dateien (kein ZIP, fehlende map.json, ungültiges JSON), Validierungsfehler, neuere
  Version, **JSON-Schema = Validator** (per ajv), Migrationskette, Autosave nur bei Änderung
- `src/ui/map/MapWorkspace.test.tsx` – Ablauf in der UI: neue Karte → Raster per `G` → `Strg+S`
  → schließen → `Strg+O` → **identisches Dokument**; Speichern ohne Dialog an denselben Pfad;
  Rückfrage bei ungespeicherten Änderungen; Fehlermeldung bei beschädigter Datei;
  Absturz-Wiederherstellung; Lineal per Tastatur mit 5/10/5-Regel
- `src-tauri/src/files.rs` – IPC-Roundtrip über die Tauri-Mock-Runtime: 100 KB Binärdaten mit
  Pfad „Höhle 1.dndmap“ schreiben und lesen, Ablehnung ohne Pfad

### Manuell

| Prüfung                                                        | Ergebnis                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Produktions-Build mit Produktions-CSP im Browser (Chromium)    | ✅ keine CSP-Verstöße, keine Konsolenfehler                                                       |
| 200×200-Karte anlegen                                          | ✅ wird auf 5 % eingepasst, Raster bei kleinem Zoom ausgeblendet                                  |
| Mausrad-Zoom am Zeiger, Raster wird beim Hineinzoomen sichtbar | ✅                                                                                                |
| Lineal per Ziehen                                              | ✅ Live-Anzeige „100 ft“ am Linienende, Statusleiste „Lineal: 100 ft“, Hover-Feld                 |
| Erster Start: Grafik-Initialisierung kann >1 s dauern          | ✅ Hinweis „Grafik wird geladen …“ ergänzt                                                        |
| `npm run tauri:build`                                          | ✅ MSI de/en (je 2,3 MB), NSIS-Setup (1,7 MB)                                                     |
| Start der Release-Exe                                          | ✅ Fenster öffnet, reagiert                                                                       |
| Native Datei-Dialoge in der Desktop-App                        | ⏳ nicht automatisiert bedienbar – Kommandos per IPC-Test abgedeckt, Dialoge bitte manuell prüfen |
| 60-FPS-Messung 100×100 + 150 Tokens                            | ⏳ Tokens folgen in Phase 5, Messung in Phase 10                                                  |

## Phase 3 – Karteneditor (2026-11-09)

### Automatisch

| Prüfung                                                                  | Ergebnis                   |
| ------------------------------------------------------------------------ | -------------------------- |
| `npm run verify` (Lint, Prettier, `tsc`, Vitest, Build, Offline-Prüfung) | ✅ 110 Tests in 16 Dateien |
| `npm run test:rust`                                                      | ✅ 3 Tests (unverändert)   |

Neue Tests:

- `src/data/elements/elements.test.ts` – ≥ 150 Elemente (165), eindeutige IDs, jede Kategorie
  belegt, Namen de/en vollständig, **alle 165 SVGs gültig** mit passender Größe und ohne externe
  URLs, Böden auf Boden-Ebene, Wand-/Türvorgaben, Suche (Name/Tags/Kategorie), eigene Elemente
- `src/editor/editor.test.ts` – Linie/Rechteck/Flutfüllung (auch 200×200), Patch anwenden/umkehren,
  Striche zusammenfassen, **250 Undo-Schritte** mit Zustandsvergleich, Redo, Merge-Fenster,
  Tür ersetzt Wand, gesperrte Ebene, Radierer je Ebene, Füllen, wirksames Gelände (inkl.
  ausgeblendeter Ebene), Gelände-Gitter = Einzelfeldberechnung, Platzbedarf/Drehen/Spiegeln/
  Verschieben am Rand, oberstes Objekt, Kopieren/Einfügen/Ausrichten/Löschen, Notizen,
  Größe ändern (umkehrbar), alle 5 Vorlagen, **Zufallsverlies deterministisch und vollständig
  verbunden**, Vorlage mit einem Schritt rückgängig
- `src/storage/storage.test.ts` – Round-Trip mit allen Inhaltsarten und Bild-Asset,
  **Migration v1 → v2**, JSON-Schema v2 = Validator in 25 Fällen
- `src/ui/state/stores.test.ts` – Undo/Redo im Store, Strich = ein Schritt, nur referenzierte Assets
- `src/ui/map/EditorWorkflow.test.tsx` – in der Oberfläche: Bibliothek suchen/wählen, per
  Tastatur malen, `Strg+Z`/`Strg+Y`; Rechteck-Umriss per Tastatur (10 Wände, 1 Undo-Schritt);
  gesperrte Ebene mit Hinweis; Taverne einfügen + rückgängig; Zufallsverlies zu groß → Hinweis;
  GM-Notiz anlegen + Statusleiste; Auswahl per Tastatur verschieben/drehen/löschen; eigenes
  PNG importieren, malen, **mit Bild speichern**; falscher Dateiinhalt wird abgelehnt

### Manuell (Produktions-Build, Produktions-CSP, Chromium)

| Prüfung                                                                     | Ergebnis                                                                                            |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Autosave einer Phase-2-Karte (Format v1, 200×200) wiederherstellen          | ✅ migriert und angezeigt                                                                           |
| Taverne einfügen, Vorschau im Dialog                                        | ✅ Wände, Böden, Teppich, Kamin, Theke, Tische, Stühle, Fenster, Flügeltür, Treppe sichtbar         |
| Gelände-Overlay                                                             | ❌→✅ Fehler gefunden (Pixi `removeChildren(1)` wirft bei leerer Ebene) und behoben; danach korrekt |
| Malen per Maus (Lava-Streifen), Lücken bei schneller Bewegung               | ✅ durchgehend                                                                                      |
| Ziehen auf Objekt verschiebt, `Strg+Z`                                      | ✅ „Rückgängig: Verschieben“                                                                        |
| Auswahlrahmen über Tische                                                   | ✅ 10 Objekte, Ausrichten-Knöpfe erscheinen                                                         |
| Autosave mit Inhalten nach Neuladen wiederherstellen                        | ✅                                                                                                  |
| Konsole                                                                     | ✅ nach Fix keine Fehler; CSP-konform (SVG-Texturen über `data:`)                                   |
| `npm run tauri:build`                                                       | ✅ MSI de/en (je 2,3 MB), NSIS-Setup (1,6 MB)                                                       |
| Start der Release-Exe                                                       | ✅ Fenster öffnet, reagiert                                                                         |
| Native Datei-Dialoge (Öffnen/Speichern/Bild importieren) in der Desktop-App | ⏳ bitte manuell prüfen                                                                             |
| SVG-Texturen unter WebKit (macOS/Linux)                                     | ⏳ nicht geprüft (nur Chromium/WebView2)                                                            |
| FPS-Messung großer Karten                                                   | ⏳ Phase 10                                                                                         |

## Phase 4 – Bildimport & Kalibrierung (2026-11-09)

### Automatisch

| Prüfung                                                                  | Ergebnis                   |
| ------------------------------------------------------------------------ | -------------------------- |
| `npm run verify` (Lint, Prettier, `tsc`, Vitest, Build, Offline-Prüfung) | ✅ 140 Tests in 20 Dateien |
| `npm run test:rust`                                                      | ✅ 3 Tests                 |

Neue Tests:

- `src/core/gridDetect.test.ts` – synthetische Karten (Rauschen, „Möbel“, Rasterlinien) mit
  Feldgrößen 23 / 37,5 / 50 / 70 px und verschiedenen Versätzen: Feldgröße ±0,5 px, Versatz
  ±1,5 px, Deutlichkeit > 0,4; ohne Raster bzw. einfarbig → kein Vorschlag
- `src/core/walls.test.ts` – Streckenschnitt, Abstand, Wand zwischen Feldern blockiert,
  kein Durchquetschen an Wandecken, Tür offen/geschlossen/verschlossen, Fenster, Geheimtür,
  Sichtlinie
- `src/editor/wallOps.test.ts` – Wände anlegen (Begrenzung, Duplikate, Länge 0), Treffertest,
  Rahmenauswahl, Art/Zustand, gemeinsames Verschieben/Löschen mit Objekten, gesperrte Ebene,
  Größe ändern/Vorlage entfernen Wände, Hintergrundbild setzen inkl. Rasteranpassung als
  **ein** Undo-Schritt, ändern, entfernen
- `src/editor/calibration.test.ts` – Ursprung normalisieren, Zwei-Punkte-Messung, Rückrechnung
  der Erkennung, Standardwerte, Drehung, Zuschnitt, Kartengröße (10–200)
- `src/storage/storage.test.ts` – Round-Trip mit Hintergrundbild und Wänden, **Migration v2 → v3**
  und v1 → v3, JSON-Schema v3 = Validator in 36 Fällen
- `src/ui/map/ImportAndWalls.test.tsx` – Bild wählen → Kalibrierung → Feldgröße 50 →
  20 × 16 Felder → Karte erstellen → **mit Bild speichern**; Drehen; falscher Inhalt abgelehnt;
  **Drag & Drop**; Wandkette per Tastatur + Undo; Tür zeichnen, auswählen, `D` öffnen,
  Zustand/Art ändern, löschen

### Manuell (Produktions-Build, Produktions-CSP, Chromium)

Testbild: per Canvas erzeugtes Verlies 3000 × 2400 px, Raster alle 60 px ab 23 px (2 px Linien).

| Prüfung                                         | Ergebnis                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Drag & Drop ins Fenster öffnet Kalibrierung     | ✅                                                                                                                                                           |
| Automatisch erkennen                            | ✅ 60 px, Deutlichkeit 100 %; Versatz 20,4 statt 22–24 px (Probe auf 40 % verkleinert) → per Eingabe korrigiert                                              |
| Karte erstellen                                 | ✅ 49 × 39 Felder (rechnerisch korrekt)                                                                                                                      |
| Pixi-Hintergrund bei 25 %, 83 %, 274 %, 400 %   | ✅ Bildraster deckt sich mit App-Raster; bei 400 % scharf (Kacheln)                                                                                          |
| Wand + Tür per Maus zeichnen                    | ✅ auf Rasterlinie eingerastet                                                                                                                               |
| Tür auswählen, `D`                              | ✅ Zustand „Offen“, Panel zeigt Art/Zustand                                                                                                                  |
| Helligkeit 40 %                                 | ✅ nur Bild abgedunkelt, Wände/Raster unverändert                                                                                                            |
| Konsole                                         | ✅ keine Fehler                                                                                                                                              |
| Gefunden und behoben                            | Hintergrundbild fehlte beim Speichern (Test); Feldgrößen-Eingabe sprang beim Tippen auf Mindestwert (Test); Auswahlzähler zählte Wände als Objekte (Browser) |
| `npm run tauri:build`                           | ✅ MSI de/en (je 2,3 MB), NSIS-Setup (1,7 MB)                                                                                                                |
| Start der Release-Exe                           | ✅                                                                                                                                                           |
| Drag & Drop und Dateidialoge in der Desktop-App | ⏳ bitte manuell prüfen (Tauri-Drop auf HTML5 umgestellt)                                                                                                    |
| Echte 8000×8000-Bilder, WebKit (macOS/Linux)    | ⏳ nicht geprüft                                                                                                                                             |
