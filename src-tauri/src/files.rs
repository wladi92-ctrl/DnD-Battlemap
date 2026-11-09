//! Lokale Datei-I/O für Projektdateien und Autosave.
//!
//! Binärdaten werden als rohe IPC-Bodies übertragen (kein JSON-Array), damit auch
//! große Karten mit eingebetteten Bildern schnell gespeichert werden. Schreiben erfolgt
//! atomar über eine temporäre Datei, damit ein Absturz nie eine halbe Datei hinterlässt.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, Runtime};

const AUTOSAVE_DIR: &str = "autosave";
const AUTOSAVE_FILE: &str = "wiederherstellung.dndmap";

/// Dekodiert Prozent-Kodierung (encodeURIComponent) aus einem HTTP-Header.
pub fn percent_decode(input: &str) -> Result<String, String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = input
                .get(i + 1..i + 3)
                .ok_or_else(|| "Ungültige Pfadkodierung".to_string())?;
            let value = u8::from_str_radix(hex, 16).map_err(|_| "Ungültige Pfadkodierung")?;
            out.push(value);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "Pfad ist kein gültiges UTF-8".to_string())
}

/// Schreibt `data` atomar: erst in `<ziel>.tmp`, dann Umbenennen auf das Ziel.
pub fn write_atomic(path: &Path, data: &[u8]) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(data)?;
        file.sync_all()?;
    }
    fs::rename(&tmp, path).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })
}

fn raw_body<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        InvokeBody::Json(_) => Err("Binärdaten erwartet".into()),
    }
}

fn header_path(request: &Request<'_>) -> Result<PathBuf, String> {
    let value = request
        .headers()
        .get("x-path")
        .ok_or("Kein Zielpfad angegeben")?
        .to_str()
        .map_err(|_| "Ungültiger Zielpfad")?;
    let path = PathBuf::from(percent_decode(value)?);
    if !path.is_absolute() {
        return Err("Zielpfad muss absolut sein".into());
    }
    Ok(path)
}

fn io_message(action: &str, path: &Path, err: io::Error) -> String {
    format!("{action} von „{}“ fehlgeschlagen: {err}", path.display())
}

fn autosave_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Datenordner nicht gefunden: {e}"))?;
    Ok(dir.join(AUTOSAVE_DIR).join(AUTOSAVE_FILE))
}

/// Liest eine vom Nutzer per Dialog gewählte Datei.
#[tauri::command]
pub fn read_file(path: String) -> Result<Response, String> {
    let path = PathBuf::from(path);
    fs::read(&path)
        .map(Response::new)
        .map_err(|e| io_message("Lesen", &path, e))
}

/// Schreibt eine Datei atomar. Pfad im Header `x-path`, Inhalt als roher Body.
#[tauri::command]
pub fn write_file(request: Request<'_>) -> Result<(), String> {
    let path = header_path(&request)?;
    let data = raw_body(&request)?;
    write_atomic(&path, data).map_err(|e| io_message("Speichern", &path, e))
}

#[tauri::command]
pub fn autosave_write<R: Runtime>(app: AppHandle<R>, request: Request<'_>) -> Result<(), String> {
    let path = autosave_path(&app)?;
    write_atomic(&path, raw_body(&request)?).map_err(|e| io_message("Autosave", &path, e))
}

/// Liefert die Autosave-Datei oder leere Daten, wenn keine existiert.
#[tauri::command]
pub fn autosave_read<R: Runtime>(app: AppHandle<R>) -> Result<Response, String> {
    let path = autosave_path(&app)?;
    match fs::read(&path) {
        Ok(data) => Ok(Response::new(data)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Response::new(Vec::new())),
        Err(e) => Err(io_message("Lesen", &path, e)),
    }
}

#[tauri::command]
pub fn autosave_clear<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let path = autosave_path(&app)?;
    match fs::remove_file(&path) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(io_message("Löschen", &path, e)),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_encoding() {
        assert_eq!(
            percent_decode("C%3A%5CKarten%5CH%C3%B6hle%201.dndmap").unwrap(),
            "C:\\Karten\\Höhle 1.dndmap"
        );
        assert_eq!(percent_decode("ohne").unwrap(), "ohne");
        assert!(percent_decode("%4").is_err());
        assert!(percent_decode("%zz").is_err());
        assert!(percent_decode("%ff").is_err());
    }

    #[test]
    fn writes_atomically_and_replaces() {
        let dir = std::env::temp_dir().join(format!("dndmap-test-{}", std::process::id()));
        let target = dir.join("unter").join("karte.dndmap");
        write_atomic(&target, b"eins").unwrap();
        write_atomic(&target, b"zwei").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"zwei");
        let mut tmp = target.as_os_str().to_owned();
        tmp.push(".tmp");
        assert!(!PathBuf::from(tmp).exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Ende-zu-Ende über die echte IPC-Schicht (Mock-Runtime): roher Body + Pfad-Header.
    #[test]
    fn ipc_roundtrip_with_raw_bytes() {
        use tauri::http::{HeaderMap, HeaderValue};
        use tauri::ipc::{CallbackFn, InvokeResponseBody};
        use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
        use tauri::webview::InvokeRequest;

        let app = mock_builder()
            .invoke_handler(tauri::generate_handler![read_file, write_file])
            .build(mock_context(noop_assets()))
            .unwrap();
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();

        let dir = std::env::temp_dir().join(format!("dndmap-ipc-{}", std::process::id()));
        let target = dir.join("Höhle 1.dndmap");
        let encoded: String = target
            .to_string_lossy()
            .bytes()
            .map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
                _ => format!("%{b:02X}"),
            })
            .collect();
        let payload: Vec<u8> = (0..=255u8).cycle().take(100_000).collect();

        // Herkunft der App-Seite: unter Windows http://tauri.localhost, sonst tauri://localhost.
        let origin = if cfg!(windows) {
            "http://tauri.localhost"
        } else {
            "tauri://localhost"
        };
        let request = |cmd: &str, body: InvokeBody, headers: HeaderMap| InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: origin.parse().unwrap(),
            body,
            headers,
            invoke_key: INVOKE_KEY.to_string(),
        };

        let mut headers = HeaderMap::new();
        headers.insert("x-path", HeaderValue::from_str(&encoded).unwrap());
        get_ipc_response(
            &webview,
            request("write_file", InvokeBody::Raw(payload.clone()), headers),
        )
        .expect("write_file fehlgeschlagen");
        assert_eq!(fs::read(&target).unwrap(), payload);

        let read = get_ipc_response(
            &webview,
            request(
                "read_file",
                InvokeBody::Json(serde_json::json!({ "path": target })),
                HeaderMap::new(),
            ),
        )
        .expect("read_file fehlgeschlagen");
        match read {
            InvokeResponseBody::Raw(bytes) => assert_eq!(bytes, payload),
            InvokeResponseBody::Json(json) => panic!("Rohdaten erwartet, erhalten: {json}"),
        }

        // Ohne Pfad-Header wird abgelehnt.
        let err = get_ipc_response(
            &webview,
            request("write_file", InvokeBody::Raw(vec![1]), HeaderMap::new()),
        );
        assert!(err.is_err());
        fs::remove_dir_all(&dir).unwrap();
    }
}
