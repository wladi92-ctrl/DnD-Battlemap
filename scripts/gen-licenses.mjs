#!/usr/bin/env node
/**
 * Erzeugt src/data/licenses/third-party.json mit allen ausgelieferten
 * Drittanbieter-Paketen (npm-Produktionsabhängigkeiten + Rust-Crates) samt Lizenztext.
 * Identische Lizenztexte werden nur einmal gespeichert (Schlüssel = SHA-1).
 *
 * Aufruf: npm run licenses   (benötigt Node und Cargo; liest nur lokale Dateien)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'src', 'data', 'licenses', 'third-party.json');
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([-_.].*)?$/i;

const texts = {};

/** Liest alle Lizenzdateien eines Paketordners und liefert die Text-ID. */
function collectText(dir) {
  if (!dir || !existsSync(dir)) return undefined;
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && LICENSE_FILE.test(e.name))
    .map((e) => e.name)
    .sort();
  if (files.length === 0) return undefined;
  const text = files
    .map((f) => {
      const body = readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim();
      return files.length > 1 ? `── ${f} ──\n${body}` : body;
    })
    .join('\n\n');
  const id = createHash('sha1').update(text).digest('hex').slice(0, 12);
  texts[id] = text;
  return id;
}

function repoUrl(repository) {
  const url = typeof repository === 'string' ? repository : repository?.url;
  return url ? url.replace(/^git\+/, '').replace(/\.git$/, '') : undefined;
}

function npmPackages() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  // Über "npm run" gestartet ist npm_execpath gesetzt – so ohne Shell auch unter Windows.
  const npmCli = process.env.npm_execpath;
  const [cmd, args] = npmCli
    ? [process.execPath, [npmCli, 'query', '.prod']]
    : ['npm', ['query', '.prod']];
  const out = execFileSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out)
    .filter((p) => p.name !== pkg.name && p.path)
    .map((p) => ({
      name: p.name,
      version: p.version,
      license: typeof p.license === 'string' ? p.license : (p.license?.type ?? 'UNKNOWN'),
      ecosystem: 'npm',
      repository: repoUrl(p.repository),
      textId: collectText(p.path),
    }));
}

function cargoPackages() {
  const out = execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--manifest-path', join(root, 'src-tauri', 'Cargo.toml')],
    { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  const meta = JSON.parse(out);
  const own = new Set(meta.workspace_members);
  return meta.packages
    .filter((p) => !own.has(p.id))
    .map((p) => {
      const dir = dirname(p.manifest_path);
      return {
        name: p.name,
        version: p.version,
        license: p.license ?? (p.license_file ? 'Siehe Lizenzdatei' : 'UNKNOWN'),
        ecosystem: 'cargo',
        repository: p.repository ?? undefined,
        textId: collectText(dir),
      };
    });
}

const dedupe = (list) => {
  const seen = new Map();
  for (const p of list) seen.set(`${p.ecosystem}:${p.name}@${p.version}`, p);
  return [...seen.values()];
};

const packages = dedupe([...npmPackages(), ...cargoPackages()]).sort(
  (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
);

// Nur tatsächlich referenzierte Texte behalten.
const used = new Set(packages.map((p) => p.textId).filter(Boolean));
const usedTexts = Object.fromEntries(Object.entries(texts).filter(([id]) => used.has(id)));

writeFileSync(outFile, JSON.stringify({ packages, texts: usedTexts }) + '\n');
console.log(`${packages.length} Pakete, ${Object.keys(usedTexts).length} Lizenztexte → ${outFile}`);
