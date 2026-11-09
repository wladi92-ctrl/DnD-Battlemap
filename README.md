# DnD Battlemap

Offline-Desktop-Anwendung für interaktive D&D-5e-Kampfkarten: Karten aus Elementen bauen,
Bilder importieren und kalibrieren, Kreaturen als Tokens bewegen, Effektbereiche feldgenau
anzeigen. Regelinhalte ausschließlich aus dem **SRD 5.1 (CC-BY-4.0)**.

> **Entwicklungsstand: Phase 2 von 10 – Raster & Map-Basis.**
> Enthalten: Karten anlegen (10×10 bis 200×200 Felder), Zoom/Pan, Raster ein/aus mit Farbe und
> Deckkraft, Koordinatenanzeige, Lineal mit Wegpunkten und drei Diagonalregeln, Anzeige in ft
> und optional Metern, Speichern/Laden als `.dndmap`, Autosave mit Absturz-Wiederherstellung.
> Dazu aus Phase 1: Einstellungen, Über/Lizenzen, Offline-Absicherung, CI, Installer.
> Editor-Werkzeuge, Bildimport, Tokens, Effekte usw. folgen in den nächsten Phasen.

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
  core/      reine Logik ohne UI: Raster, Distanzregeln (Strategien), Einheiten, Kamera
  data/      SRD-Daten + Schemata; licenses/ (SRD-Attribution, Drittanbieterlizenzen)
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
„Öffnen …“. Rechts im Panel lassen sich Name, Größe, Fuß pro Feld, Hintergrund- und Rasterfarbe
sowie die Raster-Deckkraft ändern. Die Statusleiste zeigt Feld unter Maus/Fokus (1-basiert),
Linealdistanz, Kartengröße in ft, die aktive Diagonalregel und ungespeicherte Änderungen.

**Lineal** (`R`): Mit gedrückter Maustaste ziehen; `Leertaste` während des Ziehens setzt einen
Wegpunkt. Per Tastatur: Kartenansicht fokussieren, mit Pfeiltasten das Fokusfeld bewegen,
`Eingabe` startet bzw. setzt Wegpunkte, `Esc` beendet; ein zweites `Esc` löscht die Messung.
Gemessen wird von Feldmitte zu Feldmitte; bei der 5/10/5-Variante zählen Diagonalen über
Wegpunkte hinweg weiter (wie bei einer zusammenhängenden Bewegung).

| Taste                                         | Aktion                                        |
| --------------------------------------------- | --------------------------------------------- |
| `Strg`+`N` / `Strg`+`O`                       | Neue Karte / Öffnen                           |
| `Strg`+`S` / `Strg`+`Umschalt`+`S`            | Speichern / Speichern unter                   |
| `H` / `R`                                     | Werkzeug Verschieben / Lineal                 |
| `G`                                           | Raster ein/aus                                |
| `+` / `-` / `0`                               | Vergrößern / Verkleinern / Einpassen          |
| Mausrad                                       | Zoomen am Mauszeiger                          |
| Pfeiltasten                                   | Fokusfeld bewegen (Kartenansicht fokussiert)  |
| `Umschalt`+Pfeiltasten                        | Ansicht verschieben                           |
| Mittlere/rechte Maustaste, `Leertaste`+Ziehen | Ansicht ziehen                                |
| `Eingabe` / `Esc`                             | Lineal: Start/Wegpunkt / beenden bzw. löschen |
| `Alt`+`1` / `2` / `3`                         | Karte / Einstellungen / Über                  |
| `Tab` / `Umschalt`+`Tab`                      | Fokus wechseln (sichtbarer Fokusrahmen)       |

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

| Thema                   | Entscheidung                                                                                                   | Begründung                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Canvas2D-Fallback       | Eingebauter Canvas-Renderer von PixiJS 8 (`preference: ['webgl','canvas']`)                                    | Keine zweite Render-Implementierung nötig                                |
| Einstellungs-Persistenz | `localStorage` der WebView für reine UI-Einstellungen                                                          | Klein, lokal, robust gegen Fehler; Projektdaten kommen in Dateien/SQLite |
| i18n                    | Eigene schlanke Lösung statt i18next                                                                           | Keine Laufzeitabhängigkeit, Schlüssel typisiert                          |
| WebView2                | Standard: Bootstrapper (nur aktiv, wenn WebView2 fehlt); zusätzlich Offline-Variante mit eingebetteter Runtime | Kleiner Standard-Installer, trotzdem echte Offline-Option                |
| NSIS-Installer          | Installation pro Benutzer (keine Admin-Rechte nötig)                                                           | Einfacher für Spielrunden-Rechner                                        |
| Lizenzliste             | Wird lazy geladen (eigener Chunk)                                                                              | ~1,5 MB Text, soll den App-Start nicht verlangsamen                      |
| SRD-Attribution         | Englischer Originalwortlaut                                                                                    | Von Wizards of the Coast vorgegebene Formulierung                        |
| Standard-Diagonalregel  | 5e-Standard (jede Diagonale 5 ft), umschaltbar                                                                 | PHB-Regel; DMG-Variante und euklidisch als Option                        |
| Messpunkte              | Lineal misst Feldmitte zu Feldmitte                                                                            | Entspricht dem Zählen von Feldern bei Bewegung                           |
| Meter-Umrechnung        | 1 ft = 0,3 m (5 ft = 1,5 m)                                                                                    | Konvention deutscher Regelwerke statt exakter 0,3048                     |
| Euklidische Distanz     | Anzeige auf eine Nachkommastelle                                                                               | Ungerundete Werte sind am Tisch unpraktisch                              |
| Koordinaten             | Anzeige 1-basiert („Feld 1, 1“ oben links), intern 0-basiert                                                   | Natürlicher für Menschen                                                 |
| Raster bei kleinem Zoom | Linien werden unter ~14 px Feldgröße ausgeblendet                                                              | Bei 200×200 und Zoom 5 % wäre das Raster nur Rauschen                    |
| Rendering               | Nur bei Änderungen (kein Dauer-Ticker)                                                                         | Spart CPU/GPU und Akku im Leerlauf                                       |
| Dateien lesen/schreiben | Eigene Rust-Commands mit Binär-IPC statt fs-Plugin; atomares Schreiben                                         | Schnell bei großen Karten, kein Datenverlust bei Absturz                 |
| JSON-Validierung        | Handgeschriebener Validator, JSON-Schema als Doku; Test hält beide synchron                                    | Schema-Compiler (ajv) braucht `eval`, das die CSP verbietet              |
| Browser-Dev-Modus       | Öffnen per Dateiauswahl, Speichern als Download, Autosave in IndexedDB                                         | Frontend bleibt ohne Tauri testbar                                       |
| Undo/Redo               | Folgt in Phase 3 (Editor) als Command-Schicht                                                                  | Laut Phasenplan                                                          |

## Testprotokoll

Siehe [docs/TESTPROTOKOLL.md](docs/TESTPROTOKOLL.md) (ein Abschnitt pro Phase).
