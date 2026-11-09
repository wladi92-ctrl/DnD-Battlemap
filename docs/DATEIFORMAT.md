# Dateiformat `.dndmap`

Eine Karte wird als **ZIP-Archiv** mit der Endung `.dndmap` gespeichert:

| Eintrag         | Inhalt                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| `map.json`      | Kartendokument (UTF-8, JSON) – Pflicht                                    |
| `assets/…`      | eingebettete Dateien, z. B. `assets/custom/<id>.png` für eigene Elemente  |
| `recovery.json` | nur in Autosave-Dateien: `{ "savedAt": ISO-Zeit, "filePath": Pfad/null }` |

Bilder in `assets/` werden unkomprimiert abgelegt (sie sind bereits komprimiert), `map.json`
mit Deflate. Unbekannte Einträge werden beim Laden ignoriert.

## `map.json` – Version 2 (aktuell)

JSON-Schema: [`schema/map.v2.schema.json`](schema/map.v2.schema.json)
(Version 1: [`schema/map.v1.schema.json`](schema/map.v1.schema.json), wird beim Laden migriert).

```json
{
  "format": "dndmap",
  "version": 2,
  "id": "0b6f8c1e-…",
  "name": "Taverne zum Grünen Drachen",
  "createdAt": "2026-11-09T10:00:00.000Z",
  "modifiedAt": "2026-11-09T10:42:13.512Z",
  "grid": {
    "cols": 30,
    "rows": 20,
    "feetPerCell": 5,
    "visible": true,
    "color": "#000000",
    "opacity": 0.35
  },
  "background": { "color": "#d9cfb8" },
  "layers": [
    { "id": "floor", "visible": true, "locked": false },
    { "id": "walls", "visible": true, "locked": false },
    { "id": "decor", "visible": true, "locked": false },
    { "id": "gm", "visible": true, "locked": false }
  ],
  "floor": ["floor.wood", "floor.wood", "", "…"],
  "objects": [
    {
      "id": "7c1…",
      "element": "furniture.table_long",
      "layer": "walls",
      "x": 11,
      "y": 7,
      "w": 2,
      "h": 1,
      "rotation": 90,
      "flipX": false,
      "flipY": false
    }
  ],
  "terrain": { "4,7": { "difficult": true, "cover": "half", "elevation": 10 } },
  "notes": [{ "id": "n1", "x": 3, "y": 2, "text": "Geheimgang hinter dem Regal" }],
  "customElements": [
    {
      "id": "custom.3fa1…",
      "name": "Brunnen",
      "category": "furniture",
      "layer": "walls",
      "w": 2,
      "h": 2,
      "asset": "custom/3fa1….png"
    }
  ]
}
```

| Feld                   | Bedeutung                                                                                                                                                            | Grenzen                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `format`               | Kennung, immer `"dndmap"`                                                                                                                                            |                                |
| `version`              | Formatversion                                                                                                                                                        | ganze Zahl ≥ 1                 |
| `id`                   | eindeutige ID (UUID)                                                                                                                                                 | 1–100 Zeichen                  |
| `name`                 | Anzeigename                                                                                                                                                          | 1–120 Zeichen                  |
| `createdAt/modifiedAt` | Zeitpunkte in UTC (ISO 8601)                                                                                                                                         |                                |
| `grid.cols/rows`       | Rastergröße in Feldern                                                                                                                                               | 10–200, ganzzahlig             |
| `grid.feetPerCell`     | Fuß pro Feld (Standard 5; Anzeige 5 ft = 1,5 m)                                                                                                                      | 1–100, ganzzahlig              |
| `grid.visible`         | Rasterlinien anzeigen                                                                                                                                                |                                |
| `grid.color`           | Linienfarbe `#rrggbb`                                                                                                                                                |                                |
| `grid.opacity`         | Deckkraft der Linien                                                                                                                                                 | 0–1                            |
| `background.color`     | Grundfarbe der Kartenfläche `#rrggbb`                                                                                                                                |                                |
| `layers`               | Ebenen mit Sichtbarkeit/Sperre (genau vier)                                                                                                                          | floor, walls, decor, gm        |
| `floor`                | Bodenkachel je Feld, Index `y·cols+x`; `''` = leer                                                                                                                   | genau cols·rows Einträge       |
| `objects`              | platzierte Elemente auf `walls` oder `decor`; `x/y` = linke obere Ecke des (gedrehten) Platzbedarfs in Feldern, mit Raster-Snap ganzzahlig; `w/h` = ungedrehte Größe | w/h 1–10, Drehung 0/90/180/270 |
| `terrain`              | gemaltes Gelände je Feld (`"x,y"`): `difficult`, `blocksSight`, `blocksMovement`, `cover` (half/threeQuarters/full), `elevation` (ft), `damage` (SRD-Schadensart)    | Höhe −1000…1000                |
| `notes`                | GM-Notizen je Feld (nur Spielleitung)                                                                                                                                | Text ≤ 2000 Zeichen            |
| `customElements`       | importierte Elemente; Bild unter `assets/<asset>`                                                                                                                    | Pfad `custom/…`                |

Element-IDs der eingebauten Bibliothek (z. B. `floor.wood`, `wall.stone`, `door.wood_closed`)
sind stabil. Unbekannte IDs (z. B. aus neueren Versionen) bleiben erhalten und werden als
magentafarbener Platzhalter angezeigt.

**Wirksames Gelände** eines Feldes = Vorgaben des Bodens und aller sichtbaren Objekte auf dem
Feld (z. B. Wände blockieren Bewegung und Sicht, tiefes Wasser ist schwieriges Gelände) plus
gemaltes Gelände. Bei der Deckung gilt die stärkste Stufe.

## Versionierung und Migration

- Jede inkompatible Änderung erhöht `version`.
- Für jede alte Version gibt es eine Migration `n → n+1` in `src/storage/migrations.ts`;
  beim Laden werden sie nacheinander angewendet, danach wird streng geprüft.
- Dateien mit **höherer** Version als die App werden mit einer verständlichen Meldung abgelehnt
  (nicht stillschweigend beschädigt).
- Beim Laden werden unbekannte Felder verworfen; gespeichert wird immer die aktuelle Version.
- **v1 → v2**: ergänzt Ebenen (alle sichtbar, entsperrt), leere Bodenkacheln, keine Objekte,
  kein Gelände, keine Notizen, keine eigenen Elemente.

## Speichern und Wiederherstellung

- Gespeichert wird **atomar**: erst in `<datei>.tmp`, dann Umbenennen. Ein Absturz während des
  Speicherns hinterlässt nie eine halbe Datei.
- **Autosave** (Standard alle 60 s, einstellbar 30 s–5 min) schreibt nur bei ungespeicherten
  Änderungen nach `%APPDATA%\de.dndbattlemap.app\autosave\wiederherstellung.dndmap`
  (macOS/Linux: entsprechender App-Datenordner). Nach erfolgreichem Speichern oder sauberem
  Beenden wird die Datei gelöscht.
- Findet die App beim Start eine Autosave-Datei, bietet sie **Wiederherstellen** oder
  **Verwerfen** an.
