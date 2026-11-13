/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Dieselbe CSP wie in der Desktop-App, damit `vite preview` sie im Browser prüfbar macht.
const tauriConf = JSON.parse(
  readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as { app: { security: { csp: Record<string, string> } } };
const csp = Object.entries(tauriConf.app.security.csp)
  .map(([directive, sources]) => `${directive} ${sources}`)
  .join('; ');

// Node ≥ 25 bringt ein eigenes localStorage mit, das in Tests nur Warnungen erzeugt.
const nodeMajor = Number(process.versions.node.split('.')[0]);
const testExecArgv = nodeMajor >= 25 ? ['--no-experimental-webstorage'] : [];

// Tauri erwartet einen festen Port im Dev-Modus und baut gegen moderne WebViews.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  preview: {
    port: 1420,
    strictPort: true,
    headers: { 'Content-Security-Policy': csp },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  // Mitgelieferte Beispiele werden als ?inline-Daten eingebunden (kein fetch nötig, CSP bleibt streng).
  assetsInclude: ['**/*.dndmap', '**/*.dndcampaign'],
  build: {
    // WebView2 (Chromium) bzw. WebKit auf macOS/Linux
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari15',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Keine Inline-Assets als data:-URLs, damit die CSP schlank bleibt.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    poolOptions: { forks: { execArgv: testExecArgv } },
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    // UI-Abläufe mit vielen Klicks brauchen auf langsamen CI-Runnern deutlich länger als lokal.
    testTimeout: 30_000,
  },
});
