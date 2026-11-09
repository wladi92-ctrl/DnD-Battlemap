# DnD Battlemap

Offline-Desktop-Anwendung für interaktive D&D-5e-Kampfkarten: Karten aus Elementen bauen,
Bilder importieren und kalibrieren, Kreaturen als Tokens bewegen, Effektbereiche feldgenau
anzeigen. Regelinhalte ausschließlich aus dem **SRD 5.1 (CC-BY-4.0)**.

> **Entwicklungsstand: Phase 3 von 10 – Karteneditor.**
> Enthalten: Elementbibliothek mit 165 selbst gezeichneten Elementen in 10 Kategorien (Suche,
> eigene PNG/SVG-Elemente), Werkzeuge Auswahl/Pinsel/Rechteck/Linie/Füllen/Radierer/GM-Notiz,
> Ebenen (Boden, Wände/Objekte, Dekoration, GM-Notizen; sichtbar/sperrbar), Drehen/Spiegeln/
> Kopieren/Ausrichten, Geländeeigenschaften pro Feld, Raumvorlagen und Zufallsverliese per Seed,
> Undo/Redo (500 Schritte).
> Aus Phase 1–2: Raster, Zoom/Pan, Lineal mit drei Diagonalregeln, `.dndmap`-Dateien, Autosave,
> Absturz-Wiederherstellung, Einstellungen, Offline-Absicherung, CI, Installer.
> Bildimport, Tokens, Effekte, Kampf usw. folgen in den nächsten Phasen.

## Voraussetzungen

| Werkzeug | Version                                                               | Hinweis                                       |
| -------- | --------------------------------------------------------------------- | --------------------------------------------- |
| Node.js  | ≥ 20 (getestet mit 26)                                                | inkl. npm                                     |
| Rust     | stable, MSVC-Toolchain unter Windows                                  | über [rustup](https://rustup.rs)              |
| Windows  | Visual Studio 2022 Build Tools, Workload „Desktopentwicklung mit C++“ |                                               |
| Windows  | WebView2-Runtime                                                      | in Windows 10 (aktuell) und 11 vorinstalliert |
| Linux    | `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`    |                                               |
| macOS    | Xcode Command Line Tools                                              |                                               |

Unter Windows per winget:

```bash
winget install OpenJS.NodeJS.LTS Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

## Entwicklung

```bash
npm install
npm run tauri:dev      # Desktop-App mit Hot Reload
npm run dev            # nur Frontend im Browser (http://localhost:1420)
npm run verify         # Lint + Formatprüfung + Tests + Build + Offline-Prüfung
```

Weitere Skripte:

| Skript                            | Zweck                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `npm test`                        | Vitest-Unit-Tests (einmalig), `npm run test:watch` im Watch-Modus               |
| `npm run test:rust`               | Rust-Tests inkl. IPC-Integrationstest (Mock-Runtime)                            |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                               |
| `npm run check:offline`           | Prüft CSP, Capabilities, Abhängigkeiten und `dist/` auf Netzwerkzugriffe        |
| `npm run licenses`                | Erzeugt `src/data/licenses/third-party.json` neu (nach Abhängigkeitsänderungen) |
| `npm run icons`                   | Erzeugt alle App-Icons aus `assets/icon.svg`                                    |

## Installer bauen

```bash
npm run tauri:build
```

Ergebnis unter `src-tauri/target/release/bundle/`:

- Windows: `msi/DnD Battlemap_<version>_x64_de-DE.msi` und `nsis/DnD Battlemap_<version>_x64-setup.exe`
- macOS: `dmg/*.dmg` · Linux: `appimage/*.AppImage`, `deb/*.deb` (jeweils auf dem Zielsystem bzw. per CI)

**Vollständig offline installierbarer Windows-Installer** (bettet die WebView2-Runtime ein, ca. +130 MB,
für Rechner ohne WebView2):

```bash
npm run tauri:build:offline
```

Beim ersten Build lädt Tauri WiX und NSIS herunter – das betrifft nur die Build-Maschine,
nicht die installierte App.

## Offline-Garantie

Die App stellt zur Laufzeit keine Netzwerkverbindungen her. Abgesichert durch:

1. **Strikte CSP** in `src-tauri/tauri.conf.json`: `default-src 'self'`, nur lokale Tauri-Schemata
   (`ipc:`, `asset:`, `blob:`, `data:`), kein `unsafe-eval`.
2. **Keine Netzwerk-Plugins**: kein HTTP-, Updater-, WebSocket-, Upload-, Shell- oder Opener-Plugin.
   Erlaubt sind nur `core:default`, Fenster schließen/Titel setzen und die lokalen Datei-Dialoge
   (`dialog:allow-open/save/ask/message`). Dateien liest/schreibt ein eigener Rust-Command.
3. **Keine externen Assets**: nur Systemschriften, alle Grafiken selbst erstellt (SVG).
4. **ESLint** verbietet `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` im App-Code.
5. **`npm run check:offline`** prüft 1–3 automatisch (auch in CI); Unit-Tests in
   `scripts/check-offline.test.mjs`.
6. PixiJS wird über `pixi.js/unsafe-eval` CSP-konform betrieben (keine `new Function`-Shader).

## Projektstruktur

```
src/
  core/      reine Logik ohne UI: Raster, Distanzregeln (Strategien), Einheiten, Kamera,
             Formen (Linie, Rechteck, Flutfüllung), deterministischer Zufall
  data/      elements/ (Bibliothek: SVG-Generatoren, Namen de/en), licenses/
  editor/    Bearbeitungsoperationen, Undo/Redo-Patches, Platzbedarf/Gelände, Vorlagen
  i18n/      de.json (Referenz), en.json, typisierte t()-Funktion
  render/    PixiJS-Szene (MapRenderer), Grafikerkennung WebGL/Canvas2D
  storage/   Kartendokument, Validierung, Migrationen, .dndmap (ZIP), Autosave, Dateizugriff
  styles/    Theme-Tokens (Hell/Dunkel/Hoher Kontrast)
  ui/        React-Komponenten und UI-State (Zustand); map/ = Karten-Arbeitsbereich
src-tauri/   Rust-Backend (Datei-I/O, Autosave), Tauri-Konfiguration, Capabilities, Icons
docs/        Dateiformat, JSON-Schema, Testprotokoll
scripts/     Build-Hilfsskripte (Offline-Prüfung, Lizenzliste)
assets/      Quellgrafiken (App-Icon)
```

## Bedienung

**Karte**: „Neue Karte“ (Name, Spalten/Zeilen 10–200, Fuß pro Feld, Hintergrundfarbe) oder
„Öffnen …“. Im Abschnitt „Karteneigenschaften“ rechts lassen sich Name, Größe (Inhalte außerhalb
werden entfernt – rückgängig machbar), Fuß pro Feld, Hintergrund- und Rasterfarbe sowie die
Raster-Deckkraft ändern. Die Statusleiste zeigt Feld, Element und GM-Notiz unter Maus/Fokus,
Linealdistanz, Kartengröße, die aktive Diagonalregel und ungespeicherte Änderungen.

**Editor** (Aufbau: links Bibliothek, Mitte Karte, rechts Werkzeugoptionen/Ebenen/Gelände):

- **Bibliothek**: suchen (Name, Stichworte, Kategorie), Kategorie filtern, Element anklicken →
  Pinsel ist aktiv. Pfeiltasten bewegen den Fokus in der Kachelliste. „Eigenes Element
  importieren …“: PNG/SVG/WebP/JPG (≤ 20 MB) mit Name, Kategorie, Ebene und Größe 1–10 Felder;
  das Bild wird in der Karte gespeichert.
- **Pinsel** `B`, **Rechteck** `U` (gefüllt oder Umriss), **Linie** `L`, **Füllen** `F`
  (zusammenhängender gleicher Boden): malen das gewählte Element – oder Gelände, wenn im
  Abschnitt „Gelände“ „Gelände statt Elementen malen“ aktiv ist.
  Auf der Wand-Ebene ersetzt ein neues Element vorhandene 1×1-Objekte (z. B. Tür in Wand).
- **Radierer** `E`: entfernt Inhalte der aktiven Ebene (oder gemaltes Gelände).
- **Auswahl** `V`: klicken, `Umschalt`+Klick ergänzt, Rahmen aufziehen; ausgewählte Objekte
  ziehen oder mit Pfeiltasten verschieben; `Q` dreht (Umschalt: zurück), `Y` spiegelt
  (Umschalt: senkrecht), `Entf` löscht, `Strg+C/V/D/A`; bei mehreren Objekten Ausrichten
  (links, Mitte, rechts, oben, unten). „Am Raster einrasten“ abschalten erlaubt freie
  Positionen (1/16 Feld).
- **GM-Notiz** `N`: Feld anklicken → Notiz schreiben, ändern oder löschen.
- **Ebenen**: aktive Ebene wählen (für Radierer), sichtbar/gesperrt umschalten.
- **Gelände** `T` blendet die Geländeanzeige ein (schraffiert = schwierig, rot = blockiert
  Bewegung, dunkel = blockiert Sicht, blaue Balken = Deckung, Punkt = Schadensgelände, Zahl = Höhe).
- **Vorlage …**: Taverne, Verlies, Höhle, Waldlichtung, Brücke oder Zufallsverlies (Seed, 20–120
  Felder) mit Vorschau, Position und „Inhalte ersetzen“.
- **Tastatur**: Kartenansicht fokussieren, Pfeiltasten bewegen das Fokusfeld, `Eingabe` wendet
  das Werkzeug an (Rechteck/Linie: Eingabe am Start und am Ende).
- **Rückgängig/Wiederholen**: `Strg+Z` / `Strg+Y` (bis 500 Schritte; ein Pinselstrich ist ein Schritt).

**Lineal** (`R`): Mit gedrückter Maustaste ziehen; `Leertaste` während des Ziehens setzt einen
Wegpunkt. Per Tastatur: Kartenansicht fokussieren, mit Pfeiltasten das Fokusfeld bewegen,
`Eingabe` startet bzw. setzt Wegpunkte, `Esc` beendet; ein zweites `Esc` löscht die Messung.
Gemessen wird von Feldmitte zu Feldmitte; bei der 5/10/5-Variante zählen Diagonalen über
Wegpunkte hinweg weiter (wie bei einer zusammenhängenden Bewegung).

| Taste                                         | Aktion                                                    |
| --------------------------------------------- | --------------------------------------------------------- |
| `Strg`+`N` / `Strg`+`O`                       | Neue Karte / Öffnen                                       |
| `Strg`+`S` / `Strg`+`Umschalt`+`S`            | Speichern / Speichern unter                               |
| `Strg`+`Z` / `Strg`+`Y`                       | Rückgängig / Wiederholen                                  |
| `Strg`+`C` / `V` / `D` / `A`                  | Kopieren / Einfügen / Duplizieren / Alles                 |
| `V` `B` `U` `L` `F` `E` `N`                   | Auswahl, Pinsel, Rechteck, Linie, Füllen, Radierer, Notiz |
| `H` / `R`                                     | Werkzeug Verschieben / Lineal                             |
| `Q` / `Y` / `Entf`                            | Drehen / Spiegeln / Löschen                               |
| `G` / `T`                                     | Raster / Gelände ein/aus                                  |
| `+` / `-` / `0`                               | Vergrößern / Verkleinern / Einpassen                      |
| Mausrad                                       | Zoomen am Mauszeiger                                      |
| Pfeiltasten                                   | Fokusfeld bewegen (Kartenansicht fokussiert)              |
| `Umschalt`+Pfeiltasten                        | Ansicht verschieben                                       |
| Mittlere/rechte Maustaste, `Leertaste`+Ziehen | Ansicht ziehen                                            |
| `Eingabe` / `Esc`                             | Werkzeug am Fokusfeld / abbrechen, Auswahl aufheben       |
| `Alt`+`1` / `2` / `3`                         | Karte / Einstellungen / Über                              |
| `Tab` / `Umschalt`+`Tab`                      | Fokus wechseln (sichtbarer Fokusrahmen)                   |

**Einstellungen**: Farbschema (System/Hell/Dunkel/Hoher Kontrast), Sprache (Deutsch/Englisch),
UI-Skalierung 75–175 %, Diagonalregel (5e-Standard, Variante 5/10/5, euklidisch), Anzeige in
Metern, Autosave-Intervall (30 s – 5 min, Standard 60 s).

**Dateiformat**: siehe [docs/DATEIFORMAT.md](docs/DATEIFORMAT.md).

## Internationalisierung

`src/i18n/de.json` ist die Referenz; jede weitere Sprache muss dieselben Schlüssel und Platzhalter
enthalten (per Test erzwungen). Neue Sprache: JSON-Datei anlegen und in `src/i18n/index.ts` in
`locales` eintragen.

## Lizenzen & Attribution

- **Regelinhalte**: This work includes material taken from the System Reference Document 5.1
  (“SRD 5.1”) by Wizards of the Coast LLC and available at
  https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the
  Creative Commons Attribution 4.0 International License available at
  https://creativecommons.org/licenses/by/4.0/legalcode.
- **Grafiken**: selbst erstellt (SVG/prozedural), Teil dieses Projekts.
- **Drittanbieter-Software**: vollständige Liste mit Lizenztexten in der App unter „Über/Lizenzen“
  (erzeugt aus npm- und Cargo-Metadaten).
- **Projektcode**: MIT.

## Annahmen und Entscheidungen

| Thema                   | Entscheidung                                                                                                                                        | Begründung                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Canvas2D-Fallback       | Eingebauter Canvas-Renderer von PixiJS 8 (`preference: ['webgl','canvas']`)                                                                         | Keine zweite Render-Implementierung nötig                                |
| Einstellungs-Persistenz | `localStorage` der WebView für reine UI-Einstellungen                                                                                               | Klein, lokal, robust gegen Fehler; Projektdaten kommen in Dateien/SQLite |
| i18n                    | Eigene schlanke Lösung statt i18next                                                                                                                | Keine Laufzeitabhängigkeit, Schlüssel typisiert                          |
| WebView2                | Standard: Bootstrapper (nur aktiv, wenn WebView2 fehlt); zusätzlich Offline-Variante mit eingebetteter Runtime                                      | Kleiner Standard-Installer, trotzdem echte Offline-Option                |
| NSIS-Installer          | Installation pro Benutzer (keine Admin-Rechte nötig)                                                                                                | Einfacher für Spielrunden-Rechner                                        |
| Lizenzliste             | Wird lazy geladen (eigener Chunk)                                                                                                                   | ~1,5 MB Text, soll den App-Start nicht verlangsamen                      |
| SRD-Attribution         | Englischer Originalwortlaut                                                                                                                         | Von Wizards of the Coast vorgegebene Formulierung                        |
| Standard-Diagonalregel  | 5e-Standard (jede Diagonale 5 ft), umschaltbar                                                                                                      | PHB-Regel; DMG-Variante und euklidisch als Option                        |
| Messpunkte              | Lineal misst Feldmitte zu Feldmitte                                                                                                                 | Entspricht dem Zählen von Feldern bei Bewegung                           |
| Meter-Umrechnung        | 1 ft = 0,3 m (5 ft = 1,5 m)                                                                                                                         | Konvention deutscher Regelwerke statt exakter 0,3048                     |
| Euklidische Distanz     | Anzeige auf eine Nachkommastelle                                                                                                                    | Ungerundete Werte sind am Tisch unpraktisch                              |
| Koordinaten             | Anzeige 1-basiert („Feld 1, 1“ oben links), intern 0-basiert                                                                                        | Natürlicher für Menschen                                                 |
| Raster bei kleinem Zoom | Linien werden unter ~14 px Feldgröße ausgeblendet                                                                                                   | Bei 200×200 und Zoom 5 % wäre das Raster nur Rauschen                    |
| Rendering               | Nur bei Änderungen (kein Dauer-Ticker)                                                                                                              | Spart CPU/GPU und Akku im Leerlauf                                       |
| Dateien lesen/schreiben | Eigene Rust-Commands mit Binär-IPC statt fs-Plugin; atomares Schreiben                                                                              | Schnell bei großen Karten, kein Datenverlust bei Absturz                 |
| JSON-Validierung        | Handgeschriebener Validator, JSON-Schema als Doku; Test hält beide synchron                                                                         | Schema-Compiler (ajv) braucht `eval`, das die CSP verbietet              |
| Browser-Dev-Modus       | Öffnen per Dateiauswahl, Speichern als Download, Autosave in IndexedDB                                                                              | Frontend bleibt ohne Tauri testbar                                       |
| Undo/Redo               | Umkehrbare Patches; Bodenkacheln/Gelände zellweise, Rest als Ganzes; 500 Schritte; Schieberegler werden innerhalb 1 s zusammengefasst               | Wenig Speicher auch bei 200×200, ein Strich = ein Schritt                |
| Ebenen                  | Boden, Wände/Objekte, Dekoration, GM-Notizen. Tokens, Effekte und Nebel kommen mit ihren Phasen hinzu                                               | Keine leeren Ebenen ohne Funktion                                        |
| Wände im Editor         | Feldbasierte Wand-Elemente (blockieren Bewegung + Sicht); Kantenwände zum Nachzeichnen importierter Karten folgen in Phase 4                        | Für gebaute Karten natürlicher, für Bildimport genauer                   |
| Geländevorgaben         | Elemente bringen Vorschläge mit (Wand blockiert, tiefes Wasser = schwierig, Tisch = halbe Deckung, Lava = Feuerschaden …); gemaltes Gelände ergänzt | Spielleitungs-Heuristik, keine Regeldaten; jederzeit pro Feld ergänzbar  |
| Füllen                  | Nur Böden und Gelände; Region = zusammenhängender gleicher Boden (4er-Nachbarschaft)                                                                | Objekte flächig zu füllen ist selten sinnvoll                            |
| Eigene Elemente         | Pro Karte gespeichert (Bild in der `.dndmap`). Eine kartenübergreifende Bibliothek folgt mit SQLite in Phase 5                                      | Karten bleiben eigenständig weitergebbar                                 |
| Bibliotheksgrafiken     | 165 selbst erzeugte SVGs, beim Start einmal in Texturen (128 px/Feld) gerastert                                                                     | Keine fremden Assets, scharf bis Zoom 200 %                              |
| Performance             | Bodenkacheln in 16×16-Blöcken mit Culling, Rendern nur bei Änderungen                                                                               | Ausgelegt für 200×200 (40 000 Kacheln); FPS-Messung folgt in Phase 10    |

## Testprotokoll

Siehe [docs/TESTPROTOKOLL.md](docs/TESTPROTOKOLL.md) (ein Abschnitt pro Phase).
