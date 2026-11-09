# DnD Battlemap

Offline-Desktop-Anwendung für interaktive D&D-5e-Kampfkarten: Karten aus Elementen bauen,
Bilder importieren und kalibrieren, Kreaturen als Tokens bewegen, Effektbereiche feldgenau
anzeigen. Regelinhalte ausschließlich aus dem **SRD 5.1 (CC-BY-4.0)**.

> **Entwicklungsstand: Phase 6 von 10 – Flächeneffekte (AoE).**
> Neu: Effekt-Werkzeug mit Kugel, Zylinder, Kegel, Würfel, Linie (mit Breite), Aura um eine
> Kreatur, Quadrat und freier Fläche; Vorschau mit Zähler „N Felder / M Ziele“ und markierten
> Zielen; Flächenregel (halbe Abdeckung oder Feldmitte); Wände/Türen/Fenster und feste
> Hindernisse blockieren (Wirkungslinie), optional Ausbreitung um Ecken; Bibliothek mit 92
> SRD-Zaubern (Grad-Skalierung), 19 Gegenständen, 71 Odemwaffen, Klassenmerkmalen und einer
> Falle; eigene Effekte; Rettungswurf-Assistent (Würfeln/Eintragen, Vorteil/Nachteil, halber
> Schaden, Resistenz/Immunität/Anfälligkeit); dauerhafte Effekte mit Rundendauer, Konzentration,
> Auren, die ihrem Träger folgen, und Hinweisen beim Betreten bzw. zu Rundenbeginn.
> Aus Phase 1–5: Karteneditor, Bildimport, Kantenwände, Tokens mit SRD-Kreaturen,
> Spielercharaktere, Bewegung, `.dndmap`-Dateien, Autosave, Offline-Absicherung, CI, Installer.
> Initiative/Kampf, Sicht/Licht/Nebel und Spieleransicht folgen.

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
             Formen (Linie, Rechteck, Flutfüllung), Zufall, Bewegung (Dijkstra, Gelegenheitsangriffe),
             Flächeneffekte (aoe.ts), Würfel (dice.ts)
  data/      elements/ (Bibliothek: SVG-Generatoren, Namen de/en), srd/ (Kreaturen, Zustände, Effekte),
             licenses/
  editor/    Bearbeitungsoperationen, Undo/Redo-Patches, Platzbedarf/Gelände, Vorlagen, Tokens, Effekte
  i18n/      de.json (Referenz), en.json, typisierte t()-Funktion
  render/    PixiJS-Szene (MapRenderer), Grafikerkennung WebGL/Canvas2D
  storage/   Kartendokument, Validierung, Migrationen, .dndmap (ZIP), Autosave, Dateizugriff,
             Bibliothek (Charaktere, eigene Kreaturen)
  styles/    Theme-Tokens (Hell/Dunkel/Hoher Kontrast)
  ui/        React-Komponenten und UI-State (Zustand); map/ = Karten-Arbeitsbereich,
             creatures/ = Kreaturen, Charaktere, Statblock, Token-Panel; effects/ = Effekte
src-tauri/   Rust-Backend (Datei-I/O, Autosave, SQLite-Bibliothek), Tauri-Konfiguration,
             Capabilities, Icons
docs/        Dateiformat, JSON-Schema, Testprotokoll
scripts/     Build-Hilfsskripte (Offline-Prüfung, Lizenzliste, SRD-Konvertierung)
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

**Bildimport** („Bild importieren …“ oder Datei ins Fenster ziehen; eine `.dndmap` wird dabei
geöffnet): JPG, PNG, WebP, BMP, GIF (erstes Bild), bis 200 MB und 16 384 px pro Seite. Im
Kalibrierungsdialog:

- **Raster ziehen** (Maus) oder mit Pfeiltasten verschieben (Umschalt: 10 px); gelb markiert
  Feld 1, 1. Mausrad/`+`/`−` zoomt, `0` passt ein, rechte Maustaste verschiebt die Ansicht.
- **Feldgröße** in Pixeln eingeben, **Automatisch erkennen** (Autokorrelation der Rasterlinien,
  Ergebnis mit Deutlichkeit) oder **Zwei Punkte …**: zwei Rasterkreuzungen anklicken und die
  Zahl der Felder dazwischen angeben.
- **Drehen** in 90°-Schritten, **Zuschnitt** in Pixeln, **Helligkeit/Kontrast**.
- Ergebnis: Kartengröße in Feldern (auf 10–200 begrenzt, mit Hinweis).

Später unter „Hintergrundbild“: anderes Bild wählen, **Kalibrieren …** (Kartengröße optional
anpassen), entfernen, Helligkeit/Kontrast – alles rückgängig machbar.

**Wand zeichnen** (`W`): Klicks setzen Eckpunkte einer Kette (Einrasten auf Rasterkreuzungen;
ohne „Am Raster einrasten“ auf 1/16 Feld), Doppelklick, rechte Maustaste oder `Esc` beendet.
Art: Wand, Tür, Fenster, Geheimtür. Per Tastatur setzt `Eingabe` einen Punkt an der linken
oberen Ecke des Fokusfeldes. Mit der **Auswahl** lassen sich Wände anklicken oder per Rahmen
wählen, verschieben, löschen und in Art/Türzustand ändern; `D` öffnet bzw. schließt Türen.

**Kreaturen** (linker Reiter „Kreaturen“): Suche (Name oder deutscher Typ), Filter nach Typ,
Größe und Herausforderungsgrad (von–bis). Ein Umgebungsfilter ist sichtbar, aber deaktiviert:
Das SRD 5.1 enthält keine Umgebungsangaben. Kreatur anklicken → „Werte anzeigen“ (Statblock;
auch per Doppelklick) oder Anzahl (1–50) und Seite wählen und „Auf Karte setzen“ – der nächste
Klick auf die Karte (oder `Eingabe` am Fokusfeld) setzt die Tokens nebeneinander auf freie
Felder, durchnummeriert („Goblin 1 … 4“); `Esc` bricht ab. „Eigene Kreatur anlegen …“:
vereinfachter Statblock (Größe, Typ, HG, RK, TP, Bewegungsarten, Reichweite, Attribute, Sinne,
Sprachen, Merkmale/Aktionen als „Name: Beschreibung“ je Zeile, optional Token-Bild).

**Charaktere** (Reiter „Charaktere“): Spielercharaktere mit Name, Klasse, Stufe, Größe, RK,
TP-Maximum, Initiativebonus, passiver Wahrnehmung, Bewegungsrate, Dunkelsicht und Token-Bild
(PNG/JPG/WebP). Charaktere und eigene Kreaturen liegen in einer lokalen Bibliothek (SQLite im
App-Datenordner) und stehen in allen Karten zur Verfügung; beim Setzen wird das Bild in die
Karte eingebettet.

**Tokens** (Auswahl-Werkzeug `V`; Tokens haben beim Klicken Vorrang vor Objekten):

- **Bewegen**: Token ziehen – die Wegvorschau zeigt den kürzesten Weg und die Kosten in ft
  (rot, wenn die Restbewegung nicht reicht). Ein einzeln ausgewähltes Token zeigt seine
  erreichbaren Felder (Restbewegung) und seine Nahkampfreichweite. Pfeiltasten bewegen ein
  ausgewähltes Token feldweise mit Kosten. Beim Loslassen werden die Kosten verbucht; verlässt
  das Token die Reichweite eines Feindes, erscheint ein Hinweis auf Gelegenheitsangriffe.
  Gibt es keinen regulären Weg, wird frei (ohne Kosten) versetzt – die Spielleitung darf alles.
  Mehrere Tokens bzw. Gruppen werden gemeinsam ohne Kosten verschoben.
- **Regeln**: schwieriges Gelände kostet doppelt; Wände, blockierendes Gelände und geschlossene
  Türen versperren den Weg; Feinde blockieren (außer bei mindestens zwei Größenkategorien
  Unterschied), Verbündete sind passierbar, man kann aber nicht auf ihrem Feld enden; große
  Kreaturen brauchen Platz für den ganzen Körper. Diagonalen nach der eingestellten Regel.
- **Token-Panel** (rechts): Name, Seite, Farbe, Größe, TP-Maximum, Blickrichtung; TP mit Wert +
  „Schaden“ (`Eingabe`), „Heilen“ (`Umschalt`+`Eingabe`) oder „Temp. TP“; temporäre TP fangen
  Schaden zuerst ab. Kreaturen sterben bei 0 TP, Spielercharaktere werden bewusstlos und
  erhalten Todesrettungswürfe (Schaden bei 0 TP = Fehlschlag, kritisch = zwei; Restschaden ≥
  TP-Maximum = Tod; 3 Erfolge = stabil; Heilung setzt zurück). Zustände (deutsche Namen,
  englischer SRD-Regeltext als Tooltip), eigene Marker, Aktion/Bonusaktion/Reaktion dieser
  Runde, verbrauchte Bewegung, „Vor Spielern verborgen“, Werte anzeigen, Duplizieren,
  Gruppieren, Löschen, „Neue Runde“ (setzt Bewegung und Aktionen aller Tokens zurück).
  Bei Mehrfachauswahl wirken Schaden/Heilung, Zustände und Sichtbarkeit auf alle.

**Effekte** (Reiter „Effekte“ links, Werkzeug `A`):

- **Bibliothek**: Suche, Filter nach Art (Zauber, Gegenstand, Odemwaffe, Klassenmerkmal, Falle,
  eigener Effekt), Form und Zaubergrad. Eintrag anklicken → Details (SRD-Text englisch),
  Zauberplatz für die Schadensskalierung, SG des Zaubernden; „Platzieren“ (oder Doppelklick,
  `Eingabe`) aktiviert das Effekt-Werkzeug. **Grundformen** (Kugel, Kegel, Würfel, Linie, Aura,
  Quadrat, freie Fläche) für schnelle Ad-hoc-Effekte. „Eigenen Effekt anlegen …“ speichert in
  der lokalen Bibliothek.
- **Platzieren**: Die Vorschau folgt dem Zeiger und zeigt rechts oben „N Felder / M Ziele
  betroffen“; betroffene Tokens sind orange umrandet. Kugel/Zylinder/Quadrat: ein Klick löst aus.
  Kegel, Würfel, Linie: erster Klick setzt den Ursprung, der Zeiger (oder `Q`/`Umschalt+Q`)
  bestimmt die Richtung, zweiter Klick löst aus. Aura: Klick auf ein Token → die Aura folgt ihm.
  Freie Fläche: Felder anklicken/überstreichen, dann „Fläche übernehmen“. Tastatur: Fokusfeld
  mit Pfeiltasten, `Eingabe` setzt Ursprung bzw. löst aus. `Esc` setzt den Ursprung zurück.
- **Optionen** (rechts): Größe, Linienbreite, Schadensart (Farbe + Muster), Schadenswürfel,
  Rettungswurf (Attribut, SG, halber Schaden), Wände (blockieren / um Ecken ausbreiten /
  ignorieren), Dauer (sofort oder dauerhaft mit Runden, unbegrenzt, Konzentration, Hinweis beim
  Betreten und/oder zu Rundenbeginn), Ursprung einrasten (Rasterkreuzung, Kantenmitte, Feldmitte,
  halbe Felder) und Drehschritt (15°, 45°, frei).
- **Rettungswurf-Assistent** (öffnet nach dem Auslösen, wenn Ziele getroffen sind): je Ziel Bonus
  (aus dem Statblock: Rettungswurf-Übung bzw. Attributsmodifikator), Vorteil/Nachteil, Ergebnis
  würfeln oder eintragen; Schaden würfeln oder eintragen; Erfolg/Fehlschlag gegen den SG,
  halber Schaden bei Erfolg, Resistenz/Immunität/Anfälligkeit (aus dem Statblock vorbelegt,
  änderbar); „Schaden anwenden“ = ein Undo-Schritt.
- **Dauerhafte Effekte** liegen auf der Ebene „Effekte“ und stehen rechts unter „Effekte auf
  der Karte“ (mit Legende). Auswählen per Liste oder Klick auf die Ursprungsmarke, verschieben
  durch Ziehen, Eigenschaften ändern, Assistent erneut öffnen, löschen. „Neue Runde“ zählt die
  Dauer herunter, entfernt abgelaufene Effekte und nennt Kreaturen, die zu Rundenbeginn in einer
  Zone stehen; betritt ein Token eine Zone, erscheint ein Hinweis mit Rettungswurf.

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
| `W` / `D`                                     | Wand zeichnen / Tür öffnen-schließen                      |
| `A` / `Q`                                     | Effekt-Werkzeug / Effekt drehen                           |
| `+` / `-` / `0`                               | Vergrößern / Verkleinern / Einpassen                      |
| Mausrad                                       | Zoomen am Mauszeiger                                      |
| Pfeiltasten                                   | Fokusfeld bewegen (Kartenansicht fokussiert)              |
| Pfeiltasten (Token ausgewählt)                | Token feldweise bewegen (mit Bewegungskosten)             |
| `Umschalt`+Pfeiltasten                        | Ansicht verschieben                                       |
| Mittlere/rechte Maustaste, `Leertaste`+Ziehen | Ansicht ziehen                                            |
| `Eingabe` / `Esc`                             | Werkzeug am Fokusfeld / abbrechen, Auswahl aufheben       |
| `Alt`+`1` / `2` / `3`                         | Karte / Einstellungen / Über                              |
| `Tab` / `Umschalt`+`Tab`                      | Fokus wechseln (sichtbarer Fokusrahmen)                   |

**Einstellungen**: Farbschema (System/Hell/Dunkel/Hoher Kontrast), Sprache (Deutsch/Englisch),
UI-Skalierung 75–175 %, Diagonalregel (5e-Standard, Variante 5/10/5, euklidisch), Flächenregel
für Effekte (halbe Abdeckung oder Feldmitte), Anzeige in
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
- **SRD-Daten** (Kreaturen, Zustände, Zauber, magische Gegenstände): maschinenlesbar aus
  [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (MIT-Lizenz), festgeschriebener
  Commit in `src/data/srd/*.json`, umgewandelt mit `scripts/build-srd.mjs` und
  `scripts/build-srd-effects.mjs`. Bild-URLs der
  Quelle werden verworfen (keine Artworks).
- **Grafiken**: selbst erstellt (SVG/prozedural), Teil dieses Projekts.
- **Drittanbieter-Software**: vollständige Liste mit Lizenztexten in der App unter „Über/Lizenzen“
  (erzeugt aus npm- und Cargo-Metadaten).
- **Projektcode**: MIT.

## Annahmen und Entscheidungen

| Thema                     | Entscheidung                                                                                                                                                                                                                                     | Begründung                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Canvas2D-Fallback         | Eingebauter Canvas-Renderer von PixiJS 8 (`preference: ['webgl','canvas']`)                                                                                                                                                                      | Keine zweite Render-Implementierung nötig                                                                                    |
| Einstellungs-Persistenz   | `localStorage` der WebView für reine UI-Einstellungen                                                                                                                                                                                            | Klein, lokal, robust gegen Fehler; Projektdaten kommen in Dateien/SQLite                                                     |
| i18n                      | Eigene schlanke Lösung statt i18next                                                                                                                                                                                                             | Keine Laufzeitabhängigkeit, Schlüssel typisiert                                                                              |
| WebView2                  | Standard: Bootstrapper (nur aktiv, wenn WebView2 fehlt); zusätzlich Offline-Variante mit eingebetteter Runtime                                                                                                                                   | Kleiner Standard-Installer, trotzdem echte Offline-Option                                                                    |
| NSIS-Installer            | Installation pro Benutzer (keine Admin-Rechte nötig)                                                                                                                                                                                             | Einfacher für Spielrunden-Rechner                                                                                            |
| Lizenzliste               | Wird lazy geladen (eigener Chunk)                                                                                                                                                                                                                | ~1,5 MB Text, soll den App-Start nicht verlangsamen                                                                          |
| SRD-Attribution           | Englischer Originalwortlaut                                                                                                                                                                                                                      | Von Wizards of the Coast vorgegebene Formulierung                                                                            |
| Standard-Diagonalregel    | 5e-Standard (jede Diagonale 5 ft), umschaltbar                                                                                                                                                                                                   | PHB-Regel; DMG-Variante und euklidisch als Option                                                                            |
| Messpunkte                | Lineal misst Feldmitte zu Feldmitte                                                                                                                                                                                                              | Entspricht dem Zählen von Feldern bei Bewegung                                                                               |
| Meter-Umrechnung          | 1 ft = 0,3 m (5 ft = 1,5 m)                                                                                                                                                                                                                      | Konvention deutscher Regelwerke statt exakter 0,3048                                                                         |
| Euklidische Distanz       | Anzeige auf eine Nachkommastelle                                                                                                                                                                                                                 | Ungerundete Werte sind am Tisch unpraktisch                                                                                  |
| Koordinaten               | Anzeige 1-basiert („Feld 1, 1“ oben links), intern 0-basiert                                                                                                                                                                                     | Natürlicher für Menschen                                                                                                     |
| Raster bei kleinem Zoom   | Linien werden unter ~14 px Feldgröße ausgeblendet                                                                                                                                                                                                | Bei 200×200 und Zoom 5 % wäre das Raster nur Rauschen                                                                        |
| Rendering                 | Nur bei Änderungen (kein Dauer-Ticker)                                                                                                                                                                                                           | Spart CPU/GPU und Akku im Leerlauf                                                                                           |
| Dateien lesen/schreiben   | Eigene Rust-Commands mit Binär-IPC statt fs-Plugin; atomares Schreiben                                                                                                                                                                           | Schnell bei großen Karten, kein Datenverlust bei Absturz                                                                     |
| JSON-Validierung          | Handgeschriebener Validator, JSON-Schema als Doku; Test hält beide synchron                                                                                                                                                                      | Schema-Compiler (ajv) braucht `eval`, das die CSP verbietet                                                                  |
| Browser-Dev-Modus         | Öffnen per Dateiauswahl, Speichern als Download, Autosave in IndexedDB                                                                                                                                                                           | Frontend bleibt ohne Tauri testbar                                                                                           |
| Undo/Redo                 | Umkehrbare Patches; Bodenkacheln/Gelände zellweise, Rest als Ganzes; 500 Schritte; Schieberegler werden innerhalb 1 s zusammengefasst                                                                                                            | Wenig Speicher auch bei 200×200, ein Strich = ein Schritt                                                                    |
| Ebenen                    | Boden, Wände/Objekte, Dekoration, Tokens, Effekte, GM-Notizen. Nebel kommt mit Phase 8                                                                                                                                                           | Keine leeren Ebenen ohne Funktion                                                                                            |
| Wände im Editor           | Zwei Arten: feldbasierte Wand-Elemente (aus der Bibliothek) und Kantenwände entlang von Rasterlinien (Wand-Werkzeug); beide blockieren Bewegung/Sicht                                                                                            | Für gebaute Karten natürlicher, für importierte Karten genauer                                                               |
| Kantenwände-Logik         | Wand, Fenster (blockiert nur Bewegung), Tür/Geheimtür (blockiert, außer offen); diagonales Durchquetschen an Wandecken ist blockiert                                                                                                             | Wird ab Phase 5 (Bewegung) und 6/8 (Wirkungs-/Sichtlinie) genutzt                                                            |
| Bildgrößen                | Bis 16 384 px pro Seite, 200 MB; Übersicht ≤ 2048 px immer, 2048er-Kacheln mit Mipmaps erst beim Hineinzoomen                                                                                                                                    | Spart Grafikspeicher; auch 8000×8000 bleibt handhabbar                                                                       |
| Rastererkennung           | Läuft auf einer auf ≤ 1200 px verkleinerten Probe; Versatz daher auf ±(Verkleinerung) px genau                                                                                                                                                   | Schnell; Feinjustierung per Pfeiltasten vorgesehen                                                                           |
| Zwei-Punkte-Messung       | Feldgröße = längere Achse ÷ Felderzahl; Punkt A liegt danach auf einer Rasterlinie                                                                                                                                                               | Typischerweise klickt man zwei Kreuzungen in einer Reihe                                                                     |
| Kartengröße aus Bild      | Ganze Felder ab dem Ursprung innerhalb des Zuschnitts, begrenzt auf 10–200                                                                                                                                                                       | Teilfelder am Rand werden ausgeblendet                                                                                       |
| PDF-Import, Wanderkennung | Nicht umgesetzt (in der Vorgabe optional)                                                                                                                                                                                                        | PDF bräuchte pdf.js (~1 MB, eigener Worker); Kantenerkennung wäre unzuverlässig – Nachzeichnen ist schneller als Korrigieren |
| Drag & Drop in Tauri      | Natives Drag & Drop von Tauri ist abgeschaltet (`dragDropEnabled: false`), damit HTML5-Drop mit Dateiinhalt funktioniert                                                                                                                         | Ein Pfad für Desktop und Browser                                                                                             |
| Geländevorgaben           | Elemente bringen Vorschläge mit (Wand blockiert, tiefes Wasser = schwierig, Tisch = halbe Deckung, Lava = Feuerschaden …); gemaltes Gelände ergänzt                                                                                              | Spielleitungs-Heuristik, keine Regeldaten; jederzeit pro Feld ergänzbar                                                      |
| Füllen                    | Nur Böden und Gelände; Region = zusammenhängender gleicher Boden (4er-Nachbarschaft)                                                                                                                                                             | Objekte flächig zu füllen ist selten sinnvoll                                                                                |
| Eigene Elemente           | Pro Karte gespeichert (Bild in der `.dndmap`)                                                                                                                                                                                                    | Karten bleiben eigenständig weitergebbar                                                                                     |
| SRD-Sprache               | Kreaturnamen und Statblock-Texte im englischen Original; Beschriftungen, Typen, Größen und Zustandsnamen deutsch                                                                                                                                 | Keine erfundenen Übersetzungen von Regeltext (so abgestimmt)                                                                 |
| Umgebungsfilter           | Sichtbar, aber deaktiviert mit Hinweis „im SRD 5.1 nicht enthalten“                                                                                                                                                                              | Das SRD enthält keine Umgebungsangaben; nichts erfinden                                                                      |
| Bibliothek                | SQLite (`bibliothek.sqlite` im App-Datenordner, rusqlite mit gebündeltem SQLite) für Charaktere und eigene Kreaturen; Browser-Vorschau: localStorage                                                                                             | Kartenübergreifend; Einträge werden beim Lesen geprüft, kaputte übersprungen                                                 |
| Token-Bilder              | In der Bibliothek als Data-URL (Bild ≤ ~2 MB), beim Setzen als `assets/tokens/…` in die Karte eingebettet                                                                                                                                        | Karten bleiben eigenständig weitergebbar                                                                                     |
| Token-Größe               | Winzig ½ Feld (mittig), Klein/Mittelgroß 1, Groß 2×2, Riesig 3×3, Gigantisch 4×4; Position = linke obere Ecke                                                                                                                                    | SRD-Platzbedarf; Winzig belegt für Wege ein ganzes Feld                                                                      |
| Bewegung                  | Dijkstra mit Diagonal-Parität (5/10/5), Kosten ×2 bei schwierigem Gelände im betretenen Platzbedarf; kein Durchquetschen, wenn beide Seiten blockiert sind                                                                                       | Exakt für alle drei Diagonalregeln; große Kreaturen korrekt                                                                  |
| Gelegenheitsangriff       | Hinweis, wenn der Weg die Nahkampfreichweite eines handlungsfähigen Feindes verlässt; „Rückzug“ (Disengage) wird nicht automatisch berücksichtigt                                                                                                | Entscheidung bleibt am Tisch; die App zeigt die Möglichkeit                                                                  |
| Freies Versetzen          | Ziele ohne regulären Weg werden ohne Kosten versetzt (mit Hinweis)                                                                                                                                                                               | Spielleitung muss jederzeit eingreifen können (Teleport, Sprung, Korrektur)                                                  |
| Tod/Bewusstlosigkeit      | Kreaturen sterben bei 0 TP, Spielercharaktere werden bewusstlos (Todesrettungswürfe)                                                                                                                                                             | SRD-Regel für Monster bzw. Charaktere                                                                                        |
| Verkleinern der Karte     | Tokens außerhalb werden an den Rand geschoben, nicht gelöscht                                                                                                                                                                                    | Figuren gehen nie verloren                                                                                                   |
| Flächenregel              | Standard: Feld betroffen, wenn ≥ 50 % abgedeckt (8×8 Stichproben je Feld); alternativ Feldmitte                                                                                                                                                  | Schablonen-Methode des Spielleiterhandbuchs; als Strategie umschaltbar                                                       |
| AoE-Geometrie             | Echte Formen: Kugel/Zylinder = Kreis, Kegel mit Breite = Abstand (Öffnungswinkel 2·atan ½ ≈ 53°), Würfel ab Seitenmitte, Linie als Rechteck, Aura = Abstand zum Platzbedarf                                                                      | Entspricht den 5e-Definitionen; Feuerball von einer Kreuzung = 52 Felder                                                     |
| Ursprung                  | Kugeln auf Rasterkreuzungen, Kegel auf halben Feldern, Linien/Würfel auf der Kantenmitte quer zur Richtung (100-ft-Linie = 20 Felder), umschaltbar                                                                                               | Typische Ursprünge am Tisch; eine Linie auf der Rasterlinie träfe zwei Reihen je zur Hälfte                                  |
| Wirkungslinie             | Ein Feld ist betroffen, wenn von 5 Prüfpunkten (Mitte, 4 innere) mindestens einer vom Ursprung ohne blockierende Kantenwand/festes Feld erreichbar ist. Blockierend: Wände, Fenster, geschlossene Türen, Felder mit „blockiert Bewegung + Sicht“ | Fenster geben volle Deckung gegen Effekte; Prüfpunkte vermeiden Flackern an Wandkanten                                       |
| Ausbreitung um Ecken      | Zusätzlich Felder, deren Weglänge um Hindernisse (Any-Angle-Suche) ≤ Radius ist; Standard bei SRD-Effekten mit „spreads around corners“ (z. B. Feuerball, Wolke des Todes)                                                                       | Regeltext des SRD; per Auswahl änderbar                                                                                      |
| Rettungswurfbonus         | Aus dem Statblock (Übung) bzw. Attributsmodifikator; Spielercharaktere 0 (im Assistenten eintragen)                                                                                                                                              | Charakterbögen sind nicht Teil der App                                                                                       |
| Resistenzen               | Nur eindeutige Einträge („fire“) werden vorbelegt; bedingte („… from nonmagical attacks“) nicht                                                                                                                                                  | Bedingungen hängen von der Situation ab; im Assistenten änderbar                                                             |
| Effekt-Bibliothek         | Zauber mit strukturierter Bereichsangabe, dazu 4 Zauber mit Bereich nur im Text (Beleg im Skript geprüft); Gegenstände nur mit Rettungswurf oder Schaden; Odemwaffen aus den Statblöcken; Klassenmerkmale/Falle von Hand mit SRD-Werten          | Nur belegte SRD-Werte; weitere Fallen über eigene Effekte                                                                    |
| Dauer in Runden           | 1 Minute = 10 Runden, 10 Minuten = 100, 1 Stunde = 600; „Neue Runde“ zählt herunter (ab Phase 7 über den Initiative-Tracker)                                                                                                                     | SRD: 1 Runde = 6 Sekunden                                                                                                    |
| Effekte über Tokens       | Halbtransparent über den Tokens gezeichnet, mit Muster je Schadensart                                                                                                                                                                            | Bereich bleibt auch über Figuren sichtbar; Farbe + Muster für Farbenblinde                                                   |
| Bibliotheksgrafiken       | 165 selbst erzeugte SVGs, beim Start einmal in Texturen (128 px/Feld) gerastert                                                                                                                                                                  | Keine fremden Assets, scharf bis Zoom 200 %                                                                                  |
| Performance               | Bodenkacheln in 16×16-Blöcken mit Culling, Rendern nur bei Änderungen                                                                                                                                                                            | Ausgelegt für 200×200 (40 000 Kacheln); FPS-Messung folgt in Phase 10                                                        |

## Testprotokoll

Siehe [docs/TESTPROTOKOLL.md](docs/TESTPROTOKOLL.md) (ein Abschnitt pro Phase).
