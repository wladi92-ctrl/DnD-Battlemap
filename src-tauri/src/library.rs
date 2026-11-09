//! Lokale Bibliothek (SQLite) für Spielercharaktere, eigene Kreaturen und eigene Effekte (Homebrew).
//!
//! Die Datenbank liegt im App-Datenordner (`bibliothek.sqlite`). Einträge werden als
//! JSON gespeichert; die inhaltliche Prüfung übernimmt das Frontend, hier wird nur
//! auf Art, Länge und gültiges JSON geprüft.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, State};

pub const DB_FILE: &str = "bibliothek.sqlite";
const SCHEMA_VERSION: i32 = 1;
const KINDS: [&str; 3] = ["pc", "creature", "effect"];
const ID_MAX: usize = 100;
const NAME_MAX: usize = 120;
/// Obergrenze je Eintrag (inkl. eingebettetem Token-Bild als Data-URL).
pub const DATA_MAX: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub kind: String,
    pub id: String,
    pub name: String,
    /// JSON-Text des Eintrags.
    pub data: String,
    pub modified_at: String,
}

pub struct Library {
    conn: Connection,
}

impl Library {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Datenordner nicht anlegbar: {e}"))?;
        }
        let conn = Connection::open(path).map_err(|e| format!("Bibliothek nicht lesbar: {e}"))?;
        Self::init(conn)
    }

    pub fn in_memory() -> Result<Self, String> {
        Self::init(Connection::open_in_memory().map_err(|e| e.to_string())?)
    }

    fn init(conn: Connection) -> Result<Self, String> {
        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if version > SCHEMA_VERSION {
            return Err(format!(
                "Die Bibliothek stammt aus einer neueren App-Version (Schema {version})."
            ));
        }
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS entries (
               kind TEXT NOT NULL,
               id TEXT NOT NULL,
               name TEXT NOT NULL,
               data TEXT NOT NULL,
               modified_at TEXT NOT NULL,
               PRIMARY KEY (kind, id)
             );
             PRAGMA user_version = 1;",
        )
        .map_err(|e| format!("Bibliothek nicht initialisierbar: {e}"))?;
        Ok(Self { conn })
    }

    fn check_kind(kind: &str) -> Result<(), String> {
        if KINDS.contains(&kind) {
            Ok(())
        } else {
            Err(format!("Unbekannte Eintragsart „{kind}“"))
        }
    }

    pub fn list(&self, kind: &str) -> Result<Vec<Entry>, String> {
        Self::check_kind(kind)?;
        let mut stmt = self
            .conn
            .prepare(
                "SELECT kind, id, name, data, modified_at FROM entries
                 WHERE kind = ?1 ORDER BY name COLLATE NOCASE, id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([kind], |r| {
                Ok(Entry {
                    kind: r.get(0)?,
                    id: r.get(1)?,
                    name: r.get(2)?,
                    data: r.get(3)?,
                    modified_at: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get(&self, kind: &str, id: &str) -> Result<Option<Entry>, String> {
        Self::check_kind(kind)?;
        self.conn
            .query_row(
                "SELECT kind, id, name, data, modified_at FROM entries WHERE kind = ?1 AND id = ?2",
                params![kind, id],
                |r| {
                    Ok(Entry {
                        kind: r.get(0)?,
                        id: r.get(1)?,
                        name: r.get(2)?,
                        data: r.get(3)?,
                        modified_at: r.get(4)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    /// Legt einen Eintrag an oder ersetzt ihn. Liefert den gespeicherten Eintrag.
    pub fn put(&self, kind: &str, id: &str, name: &str, data: &str) -> Result<Entry, String> {
        Self::check_kind(kind)?;
        if id.is_empty() || id.chars().count() > ID_MAX {
            return Err("Ungültige ID".into());
        }
        let name = name.trim();
        if name.is_empty() || name.chars().count() > NAME_MAX {
            return Err(format!("Name muss 1–{NAME_MAX} Zeichen lang sein"));
        }
        if data.len() > DATA_MAX {
            return Err(format!(
                "Eintrag ist zu groß (höchstens {} MB)",
                DATA_MAX / 1024 / 1024
            ));
        }
        match serde_json::from_str::<serde_json::Value>(data) {
            Ok(serde_json::Value::Object(_)) => {}
            _ => return Err("Eintragsdaten sind kein gültiges JSON-Objekt".into()),
        }
        self.conn
            .execute(
                "INSERT INTO entries (kind, id, name, data, modified_at)
                 VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 ON CONFLICT (kind, id) DO UPDATE SET
                   name = excluded.name, data = excluded.data, modified_at = excluded.modified_at",
                params![kind, id, name, data],
            )
            .map_err(|e| format!("Speichern in der Bibliothek fehlgeschlagen: {e}"))?;
        self.get(kind, id)?
            .ok_or_else(|| "Eintrag nach dem Speichern nicht gefunden".into())
    }

    /// Löscht einen Eintrag; `false`, wenn er nicht existierte.
    pub fn delete(&self, kind: &str, id: &str) -> Result<bool, String> {
        Self::check_kind(kind)?;
        self.conn
            .execute(
                "DELETE FROM entries WHERE kind = ?1 AND id = ?2",
                params![kind, id],
            )
            .map(|n| n > 0)
            .map_err(|e| format!("Löschen fehlgeschlagen: {e}"))
    }
}

/// Wird beim ersten Zugriff geöffnet (Datenordner ist erst zur Laufzeit bekannt).
#[derive(Default)]
pub struct LibraryState(Mutex<Option<Library>>);

fn with_library<R: Runtime, T>(
    app: &AppHandle<R>,
    state: &State<'_, LibraryState>,
    f: impl FnOnce(&Library) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state.0.lock().map_err(|_| "Bibliothek ist blockiert")?;
    if guard.is_none() {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Datenordner nicht gefunden: {e}"))?;
        *guard = Some(Library::open(&dir.join(DB_FILE))?);
    }
    f(guard.as_ref().ok_or("Bibliothek nicht geöffnet")?)
}

#[tauri::command]
pub fn library_list<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, LibraryState>,
    kind: String,
) -> Result<Vec<Entry>, String> {
    with_library(&app, &state, |lib| lib.list(&kind))
}

#[tauri::command]
pub fn library_put<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, LibraryState>,
    kind: String,
    id: String,
    name: String,
    data: String,
) -> Result<Entry, String> {
    with_library(&app, &state, |lib| lib.put(&kind, &id, &name, &data))
}

#[tauri::command]
pub fn library_delete<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, LibraryState>,
    kind: String,
    id: String,
) -> Result<bool, String> {
    with_library(&app, &state, |lib| lib.delete(&kind, &id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn put_list_update_delete() {
        let lib = Library::in_memory().unwrap();
        let a = lib.put("pc", "p1", "  Mira ", r#"{"level":3}"#).unwrap();
        assert_eq!(a.name, "Mira");
        assert!(a.modified_at.ends_with('Z'));
        lib.put("pc", "p2", "anton", r#"{"level":1}"#).unwrap();
        lib.put("creature", "c1", "Sumpfhexe", r#"{"cr":2}"#).unwrap();
        lib.put("effect", "e1", "Säurenebel", r#"{"shape":"sphere"}"#).unwrap();
        assert_eq!(lib.list("effect").unwrap().len(), 1);
        let names: Vec<_> = lib.list("pc").unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["anton", "Mira"]);

        lib.put("pc", "p1", "Mira", r#"{"level":4}"#).unwrap();
        assert_eq!(lib.get("pc", "p1").unwrap().unwrap().data, r#"{"level":4}"#);
        assert_eq!(lib.list("pc").unwrap().len(), 2);

        assert!(lib.delete("pc", "p1").unwrap());
        assert!(!lib.delete("pc", "p1").unwrap());
        assert_eq!(lib.list("creature").unwrap().len(), 1);
    }

    #[test]
    fn rejects_invalid_input() {
        let lib = Library::in_memory().unwrap();
        assert!(lib.list("zauber").is_err());
        assert!(lib.put("pc", "", "x", "{}").is_err());
        assert!(lib.put("pc", "p", "   ", "{}").is_err());
        assert!(lib.put("pc", "p", "x", "[1,2]").is_err());
        assert!(lib.put("pc", "p", "x", "{kaputt").is_err());
        let big = format!(r#"{{"img":"{}"}}"#, "a".repeat(DATA_MAX));
        assert!(lib.put("pc", "p", "x", &big).is_err());
    }

    #[test]
    fn persists_on_disk_and_refuses_newer_schema() {
        let dir = std::env::temp_dir().join(format!("dndmap-lib-{}", std::process::id()));
        let path = dir.join(DB_FILE);
        {
            let lib = Library::open(&path).unwrap();
            lib.put("creature", "c1", "Moorschrat", r#"{"hp":30}"#).unwrap();
        }
        {
            let lib = Library::open(&path).unwrap();
            assert_eq!(lib.list("creature").unwrap()[0].name, "Moorschrat");
            lib.conn.execute_batch("PRAGMA user_version = 99;").unwrap();
        }
        assert!(Library::open(&path).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
