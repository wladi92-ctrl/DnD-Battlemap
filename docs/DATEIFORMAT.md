# Dateiformat `.dndmap`

Eine Karte wird als **ZIP-Archiv** mit der Endung `.dndmap` gespeichert:

| Eintrag         | Inhalt                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| `map.json`      | Kartendokument (UTF-8, JSON) – Pflicht                                    |
| `assets/…`      | eingebettete Dateien (ab Phase 3/4: Hintergrundbilder, eigene Elemente)   |
| `recovery.json` | nur in Autosave-Dateien: `{ "savedAt": ISO-Zeit, "filePath": Pfad/null }` |

Bilder in `assets/` werden unkomprimiert abgelegt (sie sind bereits komprimiert), `map.json`
mit Deflate. Unbekannte Einträge werden beim Laden ignoriert.

## `map.json` – Version 1

JSON-Schema: [`schema/map.v1.schema.json`](schema/map.v1.schema.json)

```json
{
  "format": "dndmap",
  "version": 1,
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
  "background": { "color": "#d9cfb8" }
}
```

| Feld                   | Bedeutung                                       | Grenzen            |
| ---------------------- | ----------------------------------------------- | ------------------ |
| `format`               | Kennung, immer `"dndmap"`                       |                    |
| `version`              | Formatversion                                   | ganze Zahl ≥ 1     |
| `id`                   | eindeutige ID (UUID)                            | 1–100 Zeichen      |
| `name`                 | Anzeigename                                     | 1–120 Zeichen      |
| `createdAt/modifiedAt` | Zeitpunkte in UTC (ISO 8601)                    |                    |
| `grid.cols/rows`       | Rastergröße in Feldern                          | 10–200, ganzzahlig |
| `grid.feetPerCell`     | Fuß pro Feld (Standard 5; Anzeige 5 ft = 1,5 m) | 1–100, ganzzahlig  |
| `grid.visible`         | Rasterlinien anzeigen                           |                    |
| `grid.color`           | Linienfarbe `#rrggbb`                           |                    |
| `grid.opacity`         | Deckkraft der Linien                            | 0–1                |
| `background.color`     | Grundfarbe der Kartenfläche `#rrggbb`           |                    |

## Versionierung und Migration

- Jede inkompatible Änderung erhöht `version`.
- Für jede alte Version gibt es eine Migration `n → n+1` in `src/storage/migrations.ts`;
  beim Laden werden sie nacheinander angewendet, danach wird streng geprüft.
- Dateien mit **höherer** Version als die App werden mit einer verständlichen Meldung abgelehnt
  (nicht stillschweigend beschädigt).
- Beim Laden werden unbekannte Felder verworfen; gespeichert wird immer die aktuelle Version.

## Speichern und Wiederherstellung

- Gespeichert wird **atomar**: erst in `<datei>.tmp`, dann Umbenennen. Ein Absturz während des
  Speicherns hinterlässt nie eine halbe Datei.
- **Autosave** (Standard alle 60 s, einstellbar 30 s–5 min) schreibt nur bei ungespeicherten
  Änderungen nach `%APPDATA%\de.dndbattlemap.app\autosave\wiederherstellung.dndmap`
  (macOS/Linux: entsprechender App-Datenordner). Nach erfolgreichem Speichern oder sauberem
  Beenden wird die Datei gelöscht.
- Findet die App beim Start eine Autosave-Datei, bietet sie **Wiederherstellen** oder
  **Verwerfen** an.
