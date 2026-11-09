fn main() {
    let mut attributes = tauri_build::Attributes::new();
    #[cfg(windows)]
    {
        // Manifest selbst einbetten, damit es auch für `cargo test` gilt
        // (sonst startet das Test-Binary mit STATUS_ENTRYPOINT_NOT_FOUND).
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        embed_windows_manifest();
    }
    tauri_build::try_build(attributes).expect("tauri-build fehlgeschlagen");
}

#[cfg(windows)]
fn embed_windows_manifest() {
    let manifest = std::env::current_dir()
        .expect("Arbeitsverzeichnis")
        .join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    // Nur der MSVC-Linker kennt diese Optionen.
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        println!("cargo:rustc-link-arg=/WX");
    }
}
