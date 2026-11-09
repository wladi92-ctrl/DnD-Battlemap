#!/usr/bin/env node
/**
 * Prüft, dass die App keine Netzwerkzugriffe zur Laufzeit erlaubt oder auslöst:
 *  1. CSP in tauri.conf.json: default-src 'self', keine Remote-Hosts, kein Wildcard.
 *  2. Keine Netzwerk-Plugins in Cargo.toml / package.json / Capabilities, kein Updater.
 *  3. Gebauter Frontend-Code (dist/) lädt keine externen Ressourcen.
 *
 * Aufruf: npm run check:offline   (nach npm run build)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Lokale Tauri-Schemata, die in der CSP erlaubt sind. */
const LOCAL_SOURCES = new Set([
  "'self'",
  "'none'",
  "'unsafe-inline'",
  'asset:',
  'ipc:',
  'blob:',
  'data:',
  'http://asset.localhost',
  'http://ipc.localhost',
]);

const FORBIDDEN_CRATES = [
  'tauri-plugin-http',
  'tauri-plugin-updater',
  'tauri-plugin-websocket',
  'tauri-plugin-upload',
  'tauri-plugin-shell',
  'tauri-plugin-opener',
  'reqwest',
  'hyper',
];
const FORBIDDEN_NPM = [
  '@tauri-apps/plugin-http',
  '@tauri-apps/plugin-updater',
  '@tauri-apps/plugin-websocket',
  '@tauri-apps/plugin-upload',
  '@tauri-apps/plugin-shell',
  '@tauri-apps/plugin-opener',
];
const FORBIDDEN_PERMISSION_PREFIXES = [
  'http:',
  'updater:',
  'websocket:',
  'upload:',
  'shell:',
  'opener:',
];

/** Zerlegt eine CSP (String oder Objekt) in { direktive: [quellen] }. */
export function parseCsp(csp) {
  if (typeof csp === 'string') {
    return Object.fromEntries(
      csp
        .split(';')
        .map((d) => d.trim().split(/\s+/))
        .filter((parts) => parts[0])
        .map(([name, ...sources]) => [name, sources]),
    );
  }
  return Object.fromEntries(
    Object.entries(csp ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v : String(v).split(/\s+/)]),
  );
}

export function checkCsp(csp) {
  const errors = [];
  if (!csp) return ['Keine CSP gesetzt (app.security.csp).'];
  const parsed = parseCsp(csp);
  if (parsed['default-src']?.join(' ') !== "'self'") {
    errors.push(`default-src muss genau 'self' sein, ist: ${parsed['default-src']?.join(' ')}`);
  }
  for (const [directive, sources] of Object.entries(parsed)) {
    for (const s of sources) {
      if (!LOCAL_SOURCES.has(s)) errors.push(`CSP ${directive}: nicht-lokale Quelle "${s}"`);
    }
  }
  if (parsed['script-src']?.some((s) => s.includes('unsafe'))) {
    errors.push('script-src darf kein unsafe-inline/unsafe-eval enthalten.');
  }
  return errors;
}

export function checkTauriConfig(conf) {
  const errors = checkCsp(conf.app?.security?.csp);
  if (conf.app?.security?.dangerousDisableAssetCspModification) {
    errors.push('dangerousDisableAssetCspModification ist aktiv.');
  }
  if (conf.bundle?.createUpdaterArtifacts) errors.push('Updater-Artefakte sind aktiviert.');
  if (conf.plugins?.updater) errors.push('Updater-Plugin ist konfiguriert.');
  const remoteWindows = (conf.app?.windows ?? []).filter((w) => /^https?:/.test(w.url ?? ''));
  if (remoteWindows.length) errors.push('Fenster lädt eine Remote-URL.');
  return errors;
}

export function checkCargoToml(text) {
  return FORBIDDEN_CRATES.filter((c) => new RegExp(`^\\s*${c}\\s*=`, 'm').test(text)).map(
    (c) => `Verbotene Rust-Abhängigkeit: ${c}`,
  );
}

export function checkPackageJson(pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return FORBIDDEN_NPM.filter((d) => d in deps).map((d) => `Verbotenes npm-Paket: ${d}`);
}

export function checkCapability(cap) {
  return (cap.permissions ?? [])
    .map((p) => (typeof p === 'string' ? p : p.identifier))
    .filter((id) => FORBIDDEN_PERMISSION_PREFIXES.some((pre) => id.startsWith(pre)))
    .map((id) => `Verbotene Berechtigung: ${id} (${cap.identifier})`);
}

const EXTERNAL_HTML =
  /\b(?:src|href|srcset|action|poster)\s*=\s*["']?\s*(?:https?:)?\/\/[^"'\s>]+/gi;
const EXTERNAL_CSS = /(?:url\(\s*["']?|@import\s+["']?)(?:https?:)?\/\/[^"')\s]+/gi;
const EXTERNAL_JS = [
  /\bfetch\(\s*["'`](?:https?:|wss?:)?\/\//g,
  /\bnew\s+WebSocket\(/g,
  /\bnew\s+EventSource\(/g,
  /\bimportScripts\(\s*["'`]https?:/g,
  /\bimport\(\s*["'`]https?:/g,
];

/** Sucht in einer gebauten Datei nach Ladevorgängen externer Ressourcen. */
export function scanBuiltFile(name, content) {
  const ext = extname(name).toLowerCase();
  const hits = [];
  if (ext === '.html') hits.push(...(content.match(EXTERNAL_HTML) ?? []));
  if (ext === '.css' || ext === '.html') hits.push(...(content.match(EXTERNAL_CSS) ?? []));
  if (ext === '.js' || ext === '.mjs') {
    for (const re of EXTERNAL_JS) hits.push(...(content.match(re) ?? []));
  }
  return hits.map((h) => `${name}: externe Ressource "${h.slice(0, 120)}"`);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

export function runAll(root) {
  const errors = [];
  const tauriDir = join(root, 'src-tauri');
  errors.push(
    ...checkTauriConfig(JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'))),
  );
  errors.push(...checkCargoToml(readFileSync(join(tauriDir, 'Cargo.toml'), 'utf8')));
  errors.push(...checkPackageJson(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))));
  const capDir = join(tauriDir, 'capabilities');
  for (const f of readdirSync(capDir).filter((f) => f.endsWith('.json'))) {
    errors.push(...checkCapability(JSON.parse(readFileSync(join(capDir, f), 'utf8'))));
  }
  const dist = join(root, 'dist');
  if (!existsSync(dist)) {
    errors.push('dist/ fehlt – zuerst "npm run build" ausführen.');
  } else {
    for (const file of walk(dist)) {
      if (!['.html', '.css', '.js', '.mjs'].includes(extname(file).toLowerCase())) continue;
      errors.push(...scanBuiltFile(file.slice(dist.length + 1), readFileSync(file, 'utf8')));
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = runAll(root);
  if (errors.length) {
    console.error('Offline-Prüfung fehlgeschlagen:\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  console.log(
    'Offline-Prüfung bestanden: CSP lokal, keine Netzwerk-Plugins, keine externen Ressourcen.',
  );
}
