/**
 * Leistung (Abnahmekriterium „100×100-Map mit 150 Tokens läuft flüssig“): die rechenintensiven
 * Schritte an der mitgelieferten Leistungstest-Karte. Die Grenzen sind großzügig gewählt
 * (langsame CI-Runner); lokal liegen die Werte weit darunter (siehe Testprotokoll).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aoeCells } from '../core/aoe';
import { effectEnvironment } from '../editor/effects';
import { tokenReach } from '../editor/tokens';
import { computeVision, playerDocument } from '../editor/vision';
import { decodeProject, encodeProject } from './projectFile';

const file = join(__dirname, '..', 'data', 'examples', 'leistungstest.dndmap');

function time<T>(fn: () => T): { value: T; ms: number } {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
}

describe('Leistung: 100 × 100 Felder, 150 Tokens', () => {
  const bytes = readFileSync(file);
  const { value: project, ms: loadMs } = time(() => decodeProject(new Uint8Array(bytes)));
  const doc = project.doc;

  it('Karte hat die erwartete Größe', () => {
    expect(doc.grid).toMatchObject({ cols: 100, rows: 100 });
    expect(doc.tokens).toHaveLength(150);
    expect(doc.lights.length).toBeGreaterThanOrEqual(25);
    expect(loadMs).toBeLessThan(1500);
  });

  it('Speichern', () => {
    const { ms } = time(() => encodeProject(doc));
    expect(ms).toBeLessThan(1500);
  });

  it('Sicht bei Dunkelheit mit 25 Lichtern und 4 Spielerfiguren', () => {
    const dark = { ...doc, lighting: { enabled: true, ambient: 'dark' as const } };
    const first = time(() => computeVision(dark));
    expect(first.value.mask.length).toBe(10_000);
    // Wiederholung (gleiches Dokument) kommt aus dem Zwischenspeicher
    const cached = time(() => computeVision(dark));
    expect(first.ms).toBeLessThan(2000);
    expect(cached.ms).toBeLessThan(5);
    const p = time(() => playerDocument(dark, first.value.mask));
    expect(p.ms).toBeLessThan(200);
  });

  it('Bewegungsreichweite und Feuerball mit Wänden', () => {
    const token = doc.tokens.find((t) => t.kind === 'pc') ?? doc.tokens[0]!;
    const reach = time(() => tokenReach(doc, token, 'standard'));
    expect(reach.value.canEnd.size).toBeGreaterThan(0);
    expect(reach.ms).toBeLessThan(500);
    const env = effectEnvironment(doc);
    const fire = time(() =>
      aoeCells(
        { shape: 'sphere', size: 20 },
        { origin: { x: token.x + 0.5, y: token.y + 0.5 }, angle: 0 },
        env,
        { rule: 'half', wallMode: 'line' },
      ),
    );
    expect(fire.value.size).toBeGreaterThan(0);
    expect(fire.ms).toBeLessThan(500);
  });
});
