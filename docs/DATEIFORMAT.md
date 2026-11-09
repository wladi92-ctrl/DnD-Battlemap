# Dateiformat `.dndmap`

Eine Karte wird als **ZIP-Archiv** mit der Endung `.dndmap` gespeichert:

| Eintrag         | Inhalt                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------- |
| `map.json`      | Kartendokument (UTF-8, JSON) – Pflicht                                                        |
| `assets/…`      | eingebettete Dateien: `custom/<id>.png` (eigene Elemente), `background/<id>.jpg` (Kartenbild) |
| `recovery.json` | nur in Autosave-Dateien: `{ "savedAt": ISO-Zeit, "filePath": Pfad/null }`                     |

Bilder in `assets/` werden unkomprimiert abgelegt (sie sind bereits komprimiert), `map.json`
mit Deflate. Unbekannte Einträge werden beim Laden ignoriert.

## `map.json` – Version 3 (aktuell)

JSON-Schema: [`schema/map.v3.schema.json`](schema/map.v3.schema.json)
(ältere Versionen: [`v2`](schema/map.v2.schema.json), [`v1`](schema/map.v1.schema.json) –
werden beim Laden migriert). Version 3 ergänzt gegenüber Version 2 das optionale
`background.image` und die Liste `walls` (siehe unten).

```json
{
  "format": "dndmap",
  "version": 3,
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

### Hintergrundbild (`background.image`, optional)

```json
"background": {
  "color": "#d9cfb8",
  "image": {
    "asset": "background/3fa1….jpg",
    "width": 3000, "height": 2400, "rotation": 0,
    "cellPx": 60, "originX": 22, "originY": 22,
    "crop": { "x": 0, "y": 0, "w": 3000, "h": 2400 },
    "brightness": 1, "contrast": 0
  }
}
```

| Feld              | Bedeutung                                                                         |
| ----------------- | --------------------------------------------------------------------------------- |
| `asset`           | Bilddatei unter `assets/` (Original, unverändert)                                 |
| `width/height`    | Größe des Originalbilds in px (ungedreht), je ≤ 16 384                            |
| `rotation`        | 0/90/180/270; alle folgenden Pixelangaben beziehen sich auf das **gedrehte** Bild |
| `cellPx`          | Pixel pro Feld (2–4000)                                                           |
| `originX/originY` | Bildposition der linken oberen Ecke von Feld (1, 1)                               |
| `crop`            | sichtbarer Ausschnitt in px                                                       |
| `brightness`      | 0,2–3 (1 = unverändert); `contrast` −1…1 (0 = unverändert)                        |

Darstellung: Bildpixel `p` liegt bei Feldkoordinate `(p − origin) / cellPx`. Sichtbar ist der
Schnitt aus Zuschnitt und Kartenfläche.

### Kantenwände (`walls`)

```json
"walls": [
  { "id": "w1", "x1": 4, "y1": 3, "x2": 9, "y2": 3, "kind": "wall" },
  { "id": "w2", "x1": 9, "y1": 3, "x2": 10, "y2": 3, "kind": "door", "state": "locked" }
]
```

Koordinaten in Feldern (ganzzahlig = Rasterlinie; frei platzierte Wände auch gebrochen),
0…cols bzw. 0…rows. `kind`: `wall` (blockiert Bewegung und Sicht), `window` (blockiert nur
Bewegung), `door`/`secret` mit `state` `closed`/`open`/`locked` (offen = blockiert nichts).
`state` ist nur bei Türen erlaubt.

## Versionierung und Migration

- Jede inkompatible Änderung erhöht `version`.
- Für jede alte Version gibt es eine Migration `n → n+1` in `src/storage/migrations.ts`;
  beim Laden werden sie nacheinander angewendet, danach wird streng geprüft.
- Dateien mit **höherer** Version als die App werden mit einer verständlichen Meldung abgelehnt
  (nicht stillschweigend beschädigt).
- Beim Laden werden unbekannte Felder verworfen; gespeichert wird immer die aktuelle Version.
- **v1 → v2**: ergänzt Ebenen (alle sichtbar, entsperrt), leere Bodenkacheln, keine Objekte,
  kein Gelände, keine Notizen, keine eigenen Elemente.
- **v2 → v3**: ergänzt eine leere Wandliste; ältere Karten haben kein Hintergrundbild.

## Speichern und Wiederherstellung

- Gespeichert wird **atomar**: erst in `<datei>.tmp`, dann Umbenennen. Ein Absturz während des
  Speicherns hinterlässt nie eine halbe Datei.
- **Autosave** (Standard alle 60 s, einstellbar 30 s–5 min) schreibt nur bei ungespeicherten
  Änderungen nach `%APPDATA%\de.dndbattlemap.app\autosave\wiederherstellung.dndmap`
  (macOS/Linux: entsprechender App-Datenordner). Nach erfolgreichem Speichern oder sauberem
  Beenden wird die Datei gelöscht.
- Findet die App beim Start eine Autosave-Datei, bietet sie **Wiederherstellen** oder
  **Verwerfen** an.
