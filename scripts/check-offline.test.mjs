import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkCapability,
  checkCargoToml,
  checkCsp,
  checkPackageJson,
  checkTauriConfig,
  scanBuiltFile,
} from './check-offline.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('Offline-Prüfung', () => {
  it('die Projektkonfiguration besteht alle Prüfungen', () => {
    expect(checkTauriConfig(JSON.parse(read('../src-tauri/tauri.conf.json')))).toEqual([]);
    expect(checkCargoToml(read('../src-tauri/Cargo.toml'))).toEqual([]);
    expect(checkPackageJson(JSON.parse(read('../package.json')))).toEqual([]);
    expect(checkCapability(JSON.parse(read('../src-tauri/capabilities/default.json')))).toEqual([]);
  });

  it('erkennt unsichere CSPs', () => {
    expect(checkCsp(undefined)).toHaveLength(1);
    expect(checkCsp('default-src *')).not.toEqual([]);
    expect(checkCsp("default-src 'self'; img-src https://cdn.example.com")).toEqual([
      'CSP img-src: nicht-lokale Quelle "https://cdn.example.com"',
    ]);
    expect(checkCsp("default-src 'self'; script-src 'self' 'unsafe-eval'")).not.toEqual([]);
    expect(checkCsp("default-src 'self'; connect-src ipc: http://ipc.localhost")).toEqual([]);
  });

  it('erkennt Netzwerk-Plugins und Berechtigungen', () => {
    expect(checkCargoToml('tauri-plugin-updater = "2"')).toHaveLength(1);
    expect(checkPackageJson({ dependencies: { '@tauri-apps/plugin-http': '2' } })).toHaveLength(1);
    expect(checkCapability({ identifier: 'x', permissions: ['http:default'] })).toHaveLength(1);
    expect(
      checkTauriConfig({
        app: { security: { csp: "default-src 'self'" } },
        plugins: { updater: {} },
      }),
    ).toHaveLength(1);
  });

  it('findet externe Ressourcen im Build', () => {
    expect(scanBuiltFile('index.html', '<link href="https://fonts.example/x.css">')).toHaveLength(
      1,
    );
    expect(scanBuiltFile('a.css', '@font-face{src:url(https://x/y.woff2)}')).toHaveLength(1);
    expect(scanBuiltFile('a.js', 'fetch("https://telemetry.example")')).toHaveLength(1);
    expect(scanBuiltFile('a.js', 'const s = "https://creativecommons.org/licenses"')).toEqual([]);
    expect(scanBuiltFile('index.html', '<script src="/assets/index.js"></script>')).toEqual([]);
  });
});
