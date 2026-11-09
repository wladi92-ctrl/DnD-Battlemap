# Dateiformat `.dndmap`

Eine Karte wird als **ZIP-Archiv** mit der Endung `.dndmap` gespeichert:

| Eintrag         | Inhalt                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `map.json`      | Kartendokument (UTF-8, JSON) – Pflicht                                                                                          |
| `assets/…`      | eingebettete Dateien: `custom/<id>.png` (eigene Elemente), `background/<id>.jpg` (Kartenbild), `tokens/<id>.png` (Token-Bilder) |
| `recovery.json` | nur in Autosave-Dateien: `{ "savedAt": ISO-Zeit, "filePath": Pfad/null }`                                                       |

Bilder in `assets/` werden unkomprimiert abgelegt (sie sind bereits komprimiert), `map.json`
mit Deflate. Unbekannte Einträge werden beim Laden ignoriert.

## `map.json` – Version 7 (aktuell)

JSON-Schema: [`schema/map.v7.schema.json`](schema/map.v7.schema.json)
(ältere Versionen: [`v6`](schema/map.v6.schema.json), [`v5`](schema/map.v5.schema.json), [`v4`](schema/map.v4.schema.json), [`v3`](schema/map.v3.schema.json), [`v2`](schema/map.v2.schema.json),
[`v1`](schema/map.v1.schema.json) – werden beim Laden migriert). Version 4 ergänzt gegenüber
Version 3 die Ebene `tokens` und die Liste `tokens` (siehe unten); Version 3 brachte das
optionale `background.image` und die Liste `walls`.

```json
{
  "format": "dndmap",
  "version": 7,
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
    { "id": "tokens", "visible": true, "locked": false },
    { "id": "effects", "visible": true, "locked": false },
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

| Feld                   | Bedeutung                                                                                                                                                            | Grenzen                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `format`               | Kennung, immer `"dndmap"`                                                                                                                                            |                                 |
| `version`              | Formatversion                                                                                                                                                        | ganze Zahl ≥ 1                  |
| `id`                   | eindeutige ID (UUID)                                                                                                                                                 | 1–100 Zeichen                   |
| `name`                 | Anzeigename                                                                                                                                                          | 1–120 Zeichen                   |
| `createdAt/modifiedAt` | Zeitpunkte in UTC (ISO 8601)                                                                                                                                         |                                 |
| `grid.cols/rows`       | Rastergröße in Feldern                                                                                                                                               | 10–200, ganzzahlig              |
| `grid.feetPerCell`     | Fuß pro Feld (Standard 5; Anzeige 5 ft = 1,5 m)                                                                                                                      | 1–100, ganzzahlig               |
| `grid.visible`         | Rasterlinien anzeigen                                                                                                                                                |                                 |
| `grid.color`           | Linienfarbe `#rrggbb`                                                                                                                                                |                                 |
| `grid.opacity`         | Deckkraft der Linien                                                                                                                                                 | 0–1                             |
| `background.color`     | Grundfarbe der Kartenfläche `#rrggbb`                                                                                                                                |                                 |
| `layers`               | Ebenen mit Sichtbarkeit/Sperre (genau fünf, Reihenfolge beliebig)                                                                                                    | floor, walls, decor, tokens, gm |
| `floor`                | Bodenkachel je Feld, Index `y·cols+x`; `''` = leer                                                                                                                   | genau cols·rows Einträge        |
| `objects`              | platzierte Elemente auf `walls` oder `decor`; `x/y` = linke obere Ecke des (gedrehten) Platzbedarfs in Feldern, mit Raster-Snap ganzzahlig; `w/h` = ungedrehte Größe | w/h 1–10, Drehung 0/90/180/270  |
| `terrain`              | gemaltes Gelände je Feld (`"x,y"`): `difficult`, `blocksSight`, `blocksMovement`, `cover` (half/threeQuarters/full), `elevation` (ft), `damage` (SRD-Schadensart)    | Höhe −1000…1000                 |
| `notes`                | GM-Notizen je Feld (nur Spielleitung)                                                                                                                                | Text ≤ 2000 Zeichen             |
| `customElements`       | importierte Elemente; Bild unter `assets/<asset>`                                                                                                                    | Pfad `custom/…`                 |

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

### Tokens (`tokens`)

```json
"tokens": [
  {
    "id": "t1", "name": "Goblin 1", "kind": "creature", "source": "goblin",
    "size": "small", "x": 3, "y": 4, "team": "enemy", "color": "#c0392b",
    "hp": { "current": 4, "max": 7, "temp": 2 },
    "ac": 15, "speed": 30, "reach": 5, "initiativeBonus": 2,
    "passivePerception": 9, "darkvision": 60,
    "conditions": ["prone"], "markers": [{ "label": "Hexenfluch", "color": "#8e44ad" }],
    "deathSaves": { "success": 0, "failure": 0 },
    "hidden": false, "facing": 90, "movementUsed": 15,
    "actionsUsed": { "action": true, "bonus": false, "reaction": false },
    "groupId": "g1"
  },
  {
    "id": "t2", "name": "Mira", "kind": "pc", "size": "medium", "x": 10, "y": 10,
    "team": "player", "color": "#2f7de1", "image": "tokens/5d0e….png",
    "hp": { "current": 0, "max": 24, "temp": 0 }, "…": "…",
    "pc": { "className": "Schurkin", "level": 3 }
  }
]
```

| Feld                         | Bedeutung                                                                                                                      | Grenzen                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `kind`                       | `creature` (SRD oder eigene Kreatur) oder `pc` (Spielercharakter)                                                              |                                |
| `source`                     | optional: ID der Herkunft (SRD-Index wie `goblin`, eigene Kreatur `hb-…`, Charakter-ID) – für „Werte anzeigen“                 | 1–100 Zeichen                  |
| `size`                       | `tiny` (½ Feld, mittig), `small`/`medium` (1), `large` (2×2), `huge` (3×3), `gargantuan` (4×4)                                 |                                |
| `x/y`                        | linke obere Ecke in Feldern                                                                                                    | 0…cols bzw. 0…rows             |
| `team`                       | `player`, `ally`, `enemy`, `neutral` – Spieler und Verbündete sind untereinander freundlich, Neutrale mit niemandem verfeindet |                                |
| `image`                      | optional: Bild unter `assets/tokens/…`                                                                                         | Pfad `tokens/…`                |
| `hp`                         | aktuelle, maximale und temporäre Trefferpunkte                                                                                 | ganzzahlig, max/temp ≥ 0       |
| `ac/speed/reach/darkvision`  | Werte für Anzeige und Bewegung (ft)                                                                                            | ganzzahlig                     |
| `conditions`                 | SRD-Zustände (`blinded` … `unconscious`, `exhaustion`); Duplikate werden beim Laden entfernt                                   |                                |
| `markers`                    | eigene Marker mit Bezeichnung und Farbe                                                                                        | ≤ 20, Bezeichnung 1–40 Zeichen |
| `deathSaves`                 | Erfolge/Fehlschläge der Todesrettungswürfe                                                                                     | je 0–3                         |
| `hidden`                     | vor Spielern verborgen (Spieleransicht ab Phase 9)                                                                             |                                |
| `facing`                     | Blickrichtung in Grad, 0 = oben                                                                                                | 0 ≤ facing < 360               |
| `movementUsed`/`actionsUsed` | in dieser Runde verbrauchte Bewegung (ft) und Aktion/Bonusaktion/Reaktion                                                      |                                |
| `groupId`                    | optional: Tokens mit gleicher `groupId` werden gemeinsam bewegt                                                                |                                |
| `pc`                         | nur Spielercharaktere: Klasse und Stufe                                                                                        | Stufe 1–30                     |

Höchstens 2000 Tokens pro Karte; IDs sind eindeutig.

### Effekte (`effects`)

Dauerhafte Flächeneffekte (Wolken, Zonen, Auren). Die betroffenen Felder werden **nicht**
gespeichert, sondern beim Laden aus Form, Ursprung, Wänden und der Flächenregel berechnet.

```json
"effects": [
  {
    "id": "e1", "name": "Cloudkill", "shape": "sphere", "size": 20,
    "origin": { "x": 10, "y": 8 }, "angle": 0,
    "color": "#2e8b57", "damageType": "poison", "wallMode": "spread",
    "rounds": 97, "concentration": true, "trigger": "both",
    "save": { "ability": "con", "dc": 15, "half": true }, "damage": "5d8",
    "source": "spell.cloudkill", "hidden": false
  },
  {
    "id": "e2", "name": "Spirit Guardians", "shape": "emanation", "size": 15,
    "origin": { "x": 0, "y": 0 }, "angle": 0, "attachedTo": "t2", "…": "…"
  }
]
```

| Feld                        | Bedeutung                                                                                                | Grenzen                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `shape`                     | `sphere`, `cylinder`, `cone`, `cube`, `line`, `emanation` (Aura), `square`, `free`                       |                               |
| `size`                      | ft: Radius (Kugel/Zylinder), Länge (Kegel/Linie), Kante (Würfel/Quadrat), Abstand (Aura)                 | 0–5000                        |
| `width`                     | optional: Linienbreite in ft                                                                             | 1–5000                        |
| `origin`                    | Ursprung in Feldern (ganzzahlig = Rasterkreuzung, .5 = Feldmitte/Kantenmitte); Quadrat: linke obere Ecke | 0…cols bzw. 0…rows            |
| `angle`                     | Richtung in Grad, 0 = Osten, 90 = Süden (Kegel, Würfel, Linie)                                           | 0 ≤ angle < 360               |
| `cells`                     | nur `free`: Felder als `[x, y]`                                                                          | ≤ 40 000, innerhalb der Karte |
| `attachedTo`                | optional: Token-ID; die Aura folgt dem Token (fehlt das Token, bleibt der Effekt am Ursprung)            |                               |
| `color`, `damageType`       | Farbe `#rrggbb`, optionale SRD-Schadensart (bestimmt das Muster)                                         |                               |
| `wallMode`                  | `line` (Wände blockieren), `spread` (zusätzlich um Ecken), `ignore`                                      |                               |
| `rounds`                    | verbleibende Runden; `null` = unbegrenzt                                                                 | ganzzahlig ≥ 0                |
| `concentration`             | Konzentration                                                                                            |                               |
| `trigger`                   | Hinweis `none`, `enter` (Betreten), `turnStart` (Rundenbeginn), `both`                                   |                               |
| `save`                      | optional: Attribut, SG, halber Schaden bei Erfolg                                                        | SG 1–40                       |
| `damage`                    | optional: Würfelausdruck („8d6“, „2d6+3“)                                                                | ≤ 60 Zeichen                  |
| `source`, `notes`, `hidden` | Herkunft in der Effektbibliothek, Notiz, vor Spielern verborgen                                          | Notiz ≤ 2000 Zeichen          |

Höchstens 500 Effekte pro Karte; IDs sind eindeutig.

### Kampf (`combat`) und Kampflog (`combatLog`)

```json
"combat": {
  "started": true, "round": 3, "turn": 1,
  "entries": [
    { "id": "c1", "tokenId": "t2", "name": "Mira", "initiative": 18, "bonus": 3, "tiebreak": 512, "delayed": false },
    { "id": "c3", "name": "Hortaktion", "initiative": 20, "bonus": 0, "tiebreak": 0, "delayed": true }
  ]
},
"combatLog": [
  { "id": "l1", "time": "2026-11-09T10:05:00.000Z", "round": 1, "kind": "combat", "text": "Kampf beginnt" }
]
```

| Feld                          | Bedeutung                                                                                                                  | Grenzen                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `combat`                      | `null` = kein Kampf                                                                                                        |                                     |
| `combat.started`              | `false` = Vorbereitung (Initiative wird gesammelt), `true` = Runde 1 hat begonnen                                          |                                     |
| `combat.round`, `combat.turn` | Runde (ab 1) und Index des aktiven Eintrags in `entries`                                                                   | turn < Anzahl                       |
| `entries[].tokenId`           | optional: Token; fehlt es (gelöscht oder z. B. Hortaktion), bleibt der Name                                                |                                     |
| `entries[].initiative`        | Wert oder `null` (noch offen)                                                                                              | −99…999, ganzzahlig                 |
| `entries[].bonus`, `tiebreak` | Initiativebonus; Zufallswert für Gleichstände                                                                              | −99…99; 0…1000                      |
| `entries[].delayed`           | Zug verzögert                                                                                                              |                                     |
| `combatLog[]`                 | `time` (UTC), `round` oder `null`, `kind` (`combat`, `turn`, `roll`, `attack`, `damage`, `heal`, `effect`, `note`), `text` | ≤ 2000 Einträge, Text ≤ 500 Zeichen |

Die Reihenfolge in `entries` ist die Zugreihenfolge (sie kann manuell von der Sortierung nach
Initiative abweichen, z. B. nach „jetzt handeln“).

### Nebel, Sicht und Licht (`fog`, `explored`, `lighting`, `lights`)

```json
"fog": { "enabled": true, "revealed": [12, 3, 27, 3, 555] },
"explored": [40, 6, 1154],
"lighting": { "enabled": true, "ambient": "dark" },
"lights": [
  { "id": "l1", "name": "Fackel (Mira)", "x": 4.5, "y": 6.5, "bright": 20, "dim": 40,
    "color": "#ffcc66", "darkness": false, "enabled": true, "attachedTo": "t2" }
]
```

| Feld                        | Bedeutung                                                                                                                                   | Grenzen                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `fog.enabled`               | Nebel des Krieges aktiv                                                                                                                     |                                   |
| `fog.revealed`, `explored`  | Feldmasken als Lauflängen (zeilenweise, Index `y·cols + x`): abwechselnd Anzahl verdeckter (0) und aufgedeckter (1) Felder, beginnend mit 0 | Summe ≤ cols·rows, ganzzahlig ≥ 0 |
| `explored`                  | Von Spielerfiguren schon gesehene Felder (automatisch, nicht im Undo-Verlauf)                                                               |                                   |
| `lighting.enabled`          | Dynamische Sicht und Licht aktiv                                                                                                            |                                   |
| `lighting.ambient`          | Grundhelligkeit `bright`, `dim` oder `dark`                                                                                                 |                                   |
| `lights[].x`, `y`           | Position in Feldern (Bruchteile erlaubt); bei `attachedTo` die Mitte des Tokens                                                             | innerhalb der Karte               |
| `lights[].bright`, `dim`    | Radien in ft; `dim` ≥ `bright`; bei `darkness` ist `dim` der Radius der magischen Dunkelheit                                                | 0…1000                            |
| `lights[].color`, `enabled` | Lichtfarbe (Anzeige), ein/aus                                                                                                               | `#rrggbb`                         |
| `lights[].attachedTo`       | optional: Token-ID; fehlt das Token, wird der Verweis beim Laden verworfen                                                                  |                                   |

Höchstens 500 Lichtquellen pro Karte. Masken, deren Länge nicht zur Karte passt, werden beim
Laden abgelehnt; beim Ändern der Kartengröße werden sie umgerechnet.

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
- **v3 → v4**: fügt die Ebene `tokens` vor `gm` ein (sichtbar, entsperrt) und eine leere
  Token-Liste; Sichtbarkeit/Sperre der übrigen Ebenen bleibt erhalten.
- **v4 → v5**: fügt die Ebene `effects` vor `gm` ein und eine leere Effektliste.
- **v5 → v6**: kein laufender Kampf (`combat: null`), leeres Kampflog.
- **v6 → v7**: Nebel aus (nichts aufgedeckt), nichts erkundet, Sicht/Licht aus mit heller
  Grundhelligkeit, keine Lichtquellen – ältere Karten sehen unverändert aus.

## Speichern und Wiederherstellung

- Gespeichert wird **atomar**: erst in `<datei>.tmp`, dann Umbenennen. Ein Absturz während des
  Speicherns hinterlässt nie eine halbe Datei.
- **Autosave** (Standard alle 60 s, einstellbar 30 s–5 min) schreibt nur bei ungespeicherten
  Änderungen nach `%APPDATA%\de.dndbattlemap.app\autosave\wiederherstellung.dndmap`
  (macOS/Linux: entsprechender App-Datenordner). Nach erfolgreichem Speichern oder sauberem
  Beenden wird die Datei gelöscht.
- Findet die App beim Start eine Autosave-Datei, bietet sie **Wiederherstellen** oder
  **Verwerfen** an.

## Lokale Bibliothek (nicht Teil der Karte)

Spielercharaktere, eigene Kreaturen und eigene Effekte liegen in `bibliothek.sqlite` im App-Datenordner
(Tabelle `entries`: `kind` = `pc`/`creature`/`effect`/`portrait`, `id`, `name`, `data` = JSON, `modified_at`;
`PRAGMA user_version` = Schema-Version 1). Eine neuere Schema-Version wird nicht überschrieben,
sondern mit Meldung abgelehnt. Beim Setzen eines Tokens werden alle nötigen Werte (und das
Bild) in die Karte kopiert – Karten bleiben ohne Bibliothek vollständig.

`portrait`-Einträge enthalten ein eigenes Bild für eine SRD-Kreatur (`id` = Kreatur-ID,
`data` = `{ "image": "data:image/png;base64,…" }`). Tokens ohne eigenes Bild (`image` fehlt)
zeigen ein zur Laufzeit erzeugtes Porträt – es wird nicht in der Karte gespeichert, das
Dateiformat bleibt unverändert (Version 7).
