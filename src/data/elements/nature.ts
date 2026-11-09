/** Natur (Bäume, Büsche, Felsen …) und Verschiedenes (Knochen, Zelte, Schätze …). */
import type { ElementLayerId, TerrainProps } from '../../storage/mapDocument';
import type { CategoryId } from './categories';
import {
  blob,
  circle,
  ellipse,
  line,
  path,
  poly,
  rect,
  rngFrom,
  rrect,
  scatter,
  shade,
  stroke,
  svgDoc,
} from './svg';
import type { ElementDef } from './types';

function item(
  id: string,
  category: CategoryId,
  color: string,
  body: () => string,
  opts: {
    w?: number;
    h?: number;
    props?: TerrainProps;
    layer?: ElementLayerId;
    tags?: string[];
  } = {},
): ElementDef {
  const w = opts.w ?? 1;
  const h = opts.h ?? 1;
  return {
    id,
    category,
    layer: opts.layer ?? 'decor',
    w,
    h,
    color,
    ...(opts.props ? { props: opts.props } : {}),
    ...(opts.tags ? { tags: opts.tags } : {}),
    draw: () => svgDoc(w, h, body()),
  };
}

/** Ein Blattbüschel: Grundton, Lichtkappe oben links, dunkle Kerbe unten rechts. */
function lobe(cx: number, cy: number, r: number, base: string, rng: () => number): string {
  return (
    circle(cx, cy, r, base) +
    circle(cx - r * 0.22, cy - r * 0.24, r * 0.62, shade(base, 0.16 + rng() * 0.06)) +
    circle(cx - r * 0.34, cy - r * 0.36, r * 0.28, shade(base, 0.32), 'opacity="0.85"')
  );
}

/**
 * Laubkrone im Stil gedruckter Abenteuerkarten: dichter Kranz aus Blattbüscheln (blumenkohl-
 * artiger Rand), innere Büschel, Licht von oben links; optional Früchte.
 */
function canopy(
  seed: string,
  cx: number,
  cy: number,
  r: number,
  base: string,
  fruit?: string,
): string {
  const rng = rngFrom(seed);
  const dark = shade(base, -0.32);
  let out = poly(blob(rng, cx, cy, r * 0.9, 0.12, 18), dark);
  const ring = Math.max(9, Math.round(r / 6.5));
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + rng() * 0.2;
    const d = r * (0.7 + rng() * 0.06);
    out += lobe(
      cx + Math.cos(a) * d,
      cy + Math.sin(a) * d,
      r * (0.27 + rng() * 0.06),
      shade(base, (rng() - 0.6) * 0.16),
      rng,
    );
  }
  const inner = Math.max(4, Math.round(ring / 2));
  for (let i = 0; i < inner; i++) {
    const a = (i / inner) * Math.PI * 2 + 0.4;
    const d = r * (0.32 + rng() * 0.08);
    out += lobe(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.3, shade(base, 0.04), rng);
  }
  out += lobe(cx - r * 0.06, cy - r * 0.06, r * 0.32, shade(base, 0.1), rng);
  // Blattstruktur: feine dunkle Kerben
  for (let i = 0; i < r * 0.9; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * r * 0.82;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    out += path(`M${x - 2} ${y + 1} q2 -3 4 0`, 'none', stroke(dark, 1.2));
  }
  if (fruit) {
    const count = Math.max(3, Math.round(r / 9));
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const d = r * (0.25 + rng() * 0.55);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      const fr = Math.max(3.5, r * 0.075);
      out +=
        circle(x, y, fr, fruit, stroke('#3a1c08', 1.4)) +
        circle(x - fr * 0.3, y - fr * 0.35, fr * 0.35, shade(fruit, 0.45));
    }
  }
  return out;
}

function rock(seed: string, cx: number, cy: number, r: number, base: string): string {
  const rng = rngFrom(seed);
  return (
    poly(blob(rng, cx, cy, r, 0.35, 9), base, stroke(shade(base, -0.45), 2)) +
    poly(blob(rng, cx - r * 0.2, cy - r * 0.2, r * 0.45, 0.4, 7), shade(base, 0.18))
  );
}

const nat = (
  id: string,
  color: string,
  body: () => string,
  opts: Parameters<typeof item>[4] = {},
) => item(`nature.${id}`, 'nature', color, body, opts);

const TREE: TerrainProps = { blocksMovement: true, cover: 'threeQuarters' };

export const natureElements: ElementDef[] = [
  nat('tree_oak', '#3f6e2c', () => canopy('oak', 100, 100, 88, '#3f7a35'), {
    w: 2,
    h: 2,
    layer: 'walls',
    props: TREE,
    tags: ['baum', 'eiche'],
  }),
  nat('tree_fruit', '#4a8a3a', () => canopy('fruit', 100, 100, 84, '#4a8a3a', '#e8762a'), {
    w: 2,
    h: 2,
    layer: 'walls',
    props: TREE,
    tags: ['baum', 'obst', 'orange', 'apfel', 'garten'],
  }),
  nat(
    'tree_pine',
    '#2a5236',
    () => {
      let out = '';
      for (let i = 0; i < 4; i++) {
        const r = 86 - i * 20;
        const pts: number[] = [];
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const rr = k % 2 ? r * 0.72 : r;
          pts.push(100 + Math.cos(a + i * 0.2) * rr, 100 + Math.sin(a + i * 0.2) * rr);
        }
        out += poly(pts, shade('#2a5236', i * 0.12));
      }
      return out + circle(100, 100, 6, '#5b3b20');
    },
    { w: 2, h: 2, layer: 'walls', props: TREE, tags: ['baum', 'tanne', 'kiefer'] },
  ),
  nat(
    'tree_dead',
    '#5b4630',
    () =>
      path(
        'M100 100 L40 40 M100 100 L170 50 M100 100 L150 170 M100 100 L30 150 M70 70 L60 30 M140 70 L180 90 M125 135 L170 140',
        'none',
        stroke('#5b4630', 9),
      ) + circle(100, 100, 18, '#5b4630'),
    {
      w: 2,
      h: 2,
      layer: 'walls',
      props: { blocksMovement: true, cover: 'half' },
      tags: ['baum', 'tot', 'kahl'],
    },
  ),
  nat(
    'tree_birch',
    '#7fa64a',
    () => canopy('birch', 50, 50, 42, '#8bb357') + circle(50, 50, 5, '#efe9dc'),
    { layer: 'walls', props: TREE, tags: ['baum', 'birke'] },
  ),
  nat(
    'tree_palm',
    '#5f9a3a',
    () =>
      [0, 60, 120, 180, 240, 300]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          const x = 100 + Math.cos(r) * 85;
          const y = 100 + Math.sin(r) * 85;
          return (
            path(
              `M100 100 Q${100 + Math.cos(r + 0.4) * 50} ${100 + Math.sin(r + 0.4) * 50} ${x} ${y}`,
              'none',
              stroke('#5f9a3a', 16),
            ) +
            path(
              `M100 100 Q${100 + Math.cos(r + 0.4) * 50} ${100 + Math.sin(r + 0.4) * 50} ${x} ${y}`,
              'none',
              stroke('#7fbf52', 4),
            )
          );
        })
        .join('') + circle(100, 100, 12, '#7a5a3a'),
    {
      w: 2,
      h: 2,
      layer: 'walls',
      props: { blocksMovement: true, cover: 'half' },
      tags: ['baum', 'palme'],
    },
  ),
  nat('bush', '#4b7f33', () => canopy('bush', 50, 50, 42, '#4f8a3a'), {
    props: { difficult: true, cover: 'half' },
    tags: ['busch', 'strauch'],
  }),
  nat('bush_berry', '#4b7f33', () => canopy('berry', 50, 50, 40, '#4f8436', '#b5263f'), {
    props: { difficult: true, cover: 'half' },
    tags: ['beeren', 'busch'],
  }),
  nat('bush_fruit', '#4a8a3a', () => canopy('orange', 50, 50, 42, '#4a8a3a', '#e8762a'), {
    props: { difficult: true, cover: 'half' },
    tags: ['obst', 'orange', 'busch', 'hecke', 'garten'],
  }),
  nat('rock_small', '#8a857c', () => rock('rock-s', 50, 52, 24, '#8a857c'), {
    props: { difficult: true },
    tags: ['stein', 'fels'],
  }),
  nat('rock_large', '#7a756c', () => rock('rock-l', 100, 100, 82, '#7a756c'), {
    w: 2,
    h: 2,
    layer: 'walls',
    props: { blocksMovement: true, blocksSight: true },
    tags: ['fels', 'felsen'],
  }),
  nat('boulder', '#7f7a70', () => rock('boulder', 50, 50, 42, '#7f7a70'), {
    layer: 'walls',
    props: { blocksMovement: true, cover: 'threeQuarters' },
    tags: ['findling', 'fels'],
  }),
  nat(
    'stump',
    '#7a5532',
    () =>
      circle(50, 50, 26, '#7a5532', stroke('#4a2f15', 3)) +
      circle(50, 50, 18, '#c2a874') +
      circle(50, 50, 11, 'none', stroke('#a3804f', 1.5)) +
      circle(50, 50, 5, 'none', stroke('#a3804f', 1.5)),
    { props: { cover: 'half' }, tags: ['baumstumpf'] },
  ),
  nat(
    'log',
    '#7a5532',
    () =>
      rrect(8, 34, 184, 32, 16, '#7a5532', stroke('#4a2f15', 3)) +
      ellipse(176, 50, 12, 16, '#c2a874', stroke('#4a2f15', 2)) +
      line(30, 44, 150, 44, '#5b3b20', 1.5) +
      line(40, 56, 140, 56, '#5b3b20', 1.5),
    { w: 2, props: { cover: 'half', difficult: true }, tags: ['baumstamm'] },
  ),
  nat(
    'flowers',
    '#d27aa8',
    () =>
      scatter('flowers', 9, 70, 70, (x, y, rng) => {
        const c = ['#d27aa8', '#f2d23a', '#ffffff', '#8a6fd0'][Math.floor(rng() * 4)] ?? '#fff';
        return (
          [0, 72, 144, 216, 288]
            .map((a) => {
              const r = (a * Math.PI) / 180;
              return circle(x + 15 + Math.cos(r) * 4, y + 15 + Math.sin(r) * 4, 3, c);
            })
            .join('') + circle(x + 15, y + 15, 2, '#e3a020')
        );
      }),
    { tags: ['blumen'] },
  ),
  nat(
    'mushrooms',
    '#b3261e',
    () =>
      scatter(
        'shrooms',
        5,
        60,
        60,
        (x, y, rng) =>
          ellipse(
            x + 20,
            y + 22,
            10 + rng() * 4,
            8,
            rng() > 0.5 ? '#b3261e' : '#c9a05a',
            stroke('#5e1a1f', 1),
          ) +
          circle(x + 17, y + 20, 2, '#efe9dc') +
          circle(x + 23, y + 23, 1.6, '#efe9dc'),
      ),
    { tags: ['pilze'] },
  ),
  nat(
    'tall_grass',
    '#7a9a3a',
    () =>
      scatter('tallgrass', 26, 90, 90, (x, y, rng) =>
        path(
          `M${x + 5} ${y + 5} q${(rng() - 0.5) * 10} -12 ${(rng() - 0.5) * 6} -18`,
          'none',
          stroke(rng() > 0.5 ? '#7a9a3a' : '#5f7f2c', 2.5),
        ),
      ),
    { props: { blocksSight: true }, tags: ['hohes gras', 'gras'] },
  ),
  nat(
    'reeds',
    '#8a8a3a',
    () =>
      scatter(
        'reeds',
        14,
        80,
        80,
        (x, y, rng) =>
          line(x + 10, y + 10, x + 10 + (rng() - 0.5) * 6, y - 12, '#7a7a30', 2) +
          ellipse(x + 10, y - 12, 2.5, 6, '#6b4627'),
      ),
    { props: { difficult: true }, tags: ['schilf'] },
  ),
  nat(
    'cactus',
    '#4f8a4a',
    () =>
      circle(50, 50, 22, '#4f8a4a', stroke('#2f5e3a', 2)) +
      [0, 45, 90, 135, 180, 225, 270, 315]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          return line(
            50 + Math.cos(r) * 22,
            50 + Math.sin(r) * 22,
            50 + Math.cos(r) * 30,
            50 + Math.sin(r) * 30,
            '#efe9dc',
            1.2,
          );
        })
        .join(''),
    { props: { blocksMovement: true, damage: 'piercing' }, tags: ['kaktus', 'wüste'] },
  ),
  nat(
    'fern',
    '#4f8a3a',
    () =>
      [0, 60, 120, 180, 240, 300]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          return path(
            `M50 50 Q${50 + Math.cos(r + 0.5) * 22} ${50 + Math.sin(r + 0.5) * 22} ${50 + Math.cos(r) * 40} ${50 + Math.sin(r) * 40}`,
            'none',
            `${stroke('#4f8a3a', 7)} stroke-linecap="round"`,
          );
        })
        .join(''),
    { tags: ['farn'] },
  ),
  nat(
    'pond',
    '#3f87a8',
    () =>
      poly(blob(rngFrom('pond'), 100, 100, 86, 0.3, 12), '#6b5a3a') +
      poly(blob(rngFrom('pond'), 100, 100, 78, 0.3, 12), '#3f87a8') +
      path('M60 90 q15 -6 30 0 M100 120 q15 -6 30 0', 'none', stroke('#8cc6d8', 2.5)) +
      ellipse(140, 70, 10, 7, '#4f8a3a'),
    { w: 2, h: 2, props: { difficult: true }, tags: ['teich', 'wasser'] },
  ),
  nat(
    'thorns',
    '#5b5a2a',
    () =>
      scatter('thorns', 10, 80, 80, (x, y, rng) =>
        path(
          `M${x + 10} ${y + 10} q${(rng() - 0.5) * 30} ${(rng() - 0.5) * 30} ${(rng() - 0.5) * 30} ${(rng() - 0.5) * 30}`,
          'none',
          stroke('#5b4630', 2.5),
        ),
      ) +
      scatter('thorns-p', 20, 80, 80, (x, y) =>
        poly([x + 10, y + 10, x + 13, y + 6, x + 14, y + 11], '#3a2a1a'),
      ),
    { props: { difficult: true, damage: 'piercing' }, tags: ['dornen', 'gestrüpp'] },
  ),
];

// ------------------------------------------------------------------ Verschiedenes

const misc = (
  id: string,
  color: string,
  body: () => string,
  opts: Parameters<typeof item>[4] = {},
) => item(`misc.${id}`, 'misc', color, body, opts);

const bone = (x1: number, y1: number, x2: number, y2: number) =>
  line(x1, y1, x2, y2, '#e8e0cc', 4) +
  circle(x1, y1, 3.5, '#e8e0cc') +
  circle(x2, y2, 3.5, '#e8e0cc');

const skull = (cx: number, cy: number, s: number) =>
  circle(cx, cy, 12 * s, '#e8e0cc', stroke('#7a7468', 1)) +
  rect(cx - 7 * s, cy + 6 * s, 14 * s, 8 * s, '#e8e0cc') +
  circle(cx - 4.5 * s, cy, 3 * s, '#1d1b19') +
  circle(cx + 4.5 * s, cy, 3 * s, '#1d1b19');

export const miscElements: ElementDef[] = [
  misc(
    'bones',
    '#e8e0cc',
    () => bone(20, 30, 60, 50) + bone(40, 75, 80, 60) + bone(30, 60, 25, 85),
    { tags: ['knochen'] },
  ),
  misc('skulls', '#e8e0cc', () => skull(36, 44, 1.2) + skull(64, 56, 1) + skull(46, 70, 0.9), {
    tags: ['schädel', 'totenkopf'],
  }),
  misc(
    'debris',
    '#8a8072',
    () =>
      scatter('debris', 9, 80, 80, (x, y, rng) =>
        poly(
          blob(rng, x + 10, y + 10, 4 + rng() * 6, 0.6, 6),
          shade('#8a8072', (rng() - 0.5) * 0.4),
          stroke('#4f483f', 1),
        ),
      ) + line(20, 70, 50, 62, '#7a5532', 4),
    { props: { difficult: true }, tags: ['trümmer', 'schutt'] },
  ),
  misc(
    'blood',
    '#7a1010',
    () =>
      poly(blob(rngFrom('blood'), 50, 50, 26, 0.6, 12), '#7a1010', 'opacity="0.85"') +
      circle(82, 30, 5, '#7a1010', 'opacity="0.85"') +
      circle(20, 76, 4, '#7a1010', 'opacity="0.85"'),
    { tags: ['blut'] },
  ),
  misc(
    'puddle',
    '#6fb3c9',
    () => poly(blob(rngFrom('puddle'), 50, 50, 32, 0.4, 12), '#6fb3c9', 'opacity="0.75"'),
    { tags: ['pfütze', 'wasser'] },
  ),
  misc(
    'web',
    '#e8e8e8',
    () =>
      [0, 45, 90, 135]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          return line(
            50 - Math.cos(r) * 48,
            50 - Math.sin(r) * 48,
            50 + Math.cos(r) * 48,
            50 + Math.sin(r) * 48,
            '#e8e8e8',
            1.2,
          );
        })
        .join('') +
      [12, 24, 36, 46].map((r) => circle(50, 50, r, 'none', stroke('#e8e8e8', 1))).join(''),
    { props: { difficult: true }, tags: ['spinnennetz', 'netz'] },
  ),
  misc(
    'crystals',
    '#7fd0e8',
    () =>
      poly([30, 80, 38, 30, 46, 80], '#7fd0e8', stroke('#2f6e85', 1.5)) +
      poly([44, 82, 56, 18, 66, 82], '#a8e6f5', stroke('#2f6e85', 1.5)) +
      poly([62, 80, 70, 44, 78, 80], '#5fb8d6', stroke('#2f6e85', 1.5)),
    { tags: ['kristalle', 'edelsteine'] },
  ),
  misc(
    'banner',
    '#8e2a2a',
    () =>
      line(10, 20, 90, 20, '#5b3b20', 5) +
      path('M25 20 h50 v55 l-25 -12 -25 12z', '#8e2a2a', stroke('#d8b14a', 2)) +
      circle(50, 42, 8, '#d8b14a'),
    { tags: ['banner', 'flagge', 'wappen'] },
  ),
  misc(
    'tent',
    '#c2a874',
    () =>
      poly([10, 10, 190, 10, 100, 100], '#c9b07a', stroke('#7a6440', 2)) +
      poly([190, 10, 190, 190, 100, 100], '#b39a6b', stroke('#7a6440', 2)) +
      poly([10, 190, 190, 190, 100, 100], '#c9b07a', stroke('#7a6440', 2)) +
      poly([10, 10, 10, 190, 100, 100], '#b39a6b', stroke('#7a6440', 2)) +
      circle(100, 100, 5, '#5b3b20'),
    {
      w: 2,
      h: 2,
      layer: 'walls',
      props: { blocksMovement: true, blocksSight: true },
      tags: ['zelt', 'lager'],
    },
  ),
  misc(
    'cart',
    '#8a5a2e',
    () =>
      rect(30, 22, 150, 56, '#8a5a2e', stroke('#4a2f15', 3)) +
      [56, 84, 112, 140].map((x) => line(x, 22, x, 78, '#5b3b20', 2)).join('') +
      rect(50, 12, 26, 10, '#2f3235') +
      rect(130, 12, 26, 10, '#2f3235') +
      rect(50, 78, 26, 10, '#2f3235') +
      rect(130, 78, 26, 10, '#2f3235') +
      line(30, 50, 4, 50, '#5b3b20', 5),
    {
      w: 2,
      layer: 'walls',
      props: { blocksMovement: true, cover: 'half' },
      tags: ['karren', 'wagen'],
    },
  ),
  misc(
    'rowboat',
    '#8a5a2e',
    () =>
      path('M50 6 C84 40 84 160 70 194 H30 C16 160 16 40 50 6z', '#8a5a2e', stroke('#4a2f15', 3)) +
      [60, 110, 160].map((y) => rect(26, y, 48, 8, '#5b3b20')).join('') +
      line(10, 100, 90, 120, '#c2a874', 3),
    { h: 2, layer: 'walls', tags: ['boot', 'ruderboot'] },
  ),
  misc(
    'rope',
    '#c2a874',
    () =>
      [30, 22, 14].map((r) => circle(50, 50, r, 'none', stroke('#c2a874', 6))).join('') +
      line(80, 50, 96, 80, '#c2a874', 6),
    { tags: ['seil'] },
  ),
  misc(
    'books',
    '#283e7a',
    () =>
      rrect(22, 30, 40, 28, 2, '#283e7a', stroke('#141c3a', 1.5)) +
      rrect(34, 44, 40, 28, 2, '#8e2a2a', stroke('#4a1414', 1.5)) +
      rrect(30, 22, 30, 22, 2, '#2f5e3a', stroke('#14301c', 1.5)),
    { tags: ['bücher', 'buch'] },
  ),
  misc(
    'treasure',
    '#e3b832',
    () =>
      poly(blob(rngFrom('gold'), 50, 56, 34, 0.3, 10), '#d4a830', stroke('#8a6a10', 2)) +
      scatter('gold-c', 14, 50, 40, (x, y) =>
        circle(x + 25, y + 34, 4, '#f2d25a', stroke('#8a6a10', 0.8)),
      ) +
      circle(40, 44, 6, '#3d6b8a') +
      circle(62, 48, 5, '#b3261e'),
    { tags: ['schatz', 'gold', 'hort'] },
  ),
  misc(
    'coins',
    '#e3b832',
    () =>
      scatter('coins', 9, 70, 70, (x, y) =>
        circle(x + 15, y + 15, 5, '#f2d25a', stroke('#8a6a10', 1)),
      ),
    { tags: ['münzen', 'gold'] },
  ),
  misc(
    'crate_stack',
    '#a3804f',
    () =>
      rect(8, 8, 52, 52, '#a3804f', stroke('#5e4626', 2.5)) +
      line(8, 8, 60, 60, '#7a5e36', 4) +
      rect(40, 40, 52, 52, '#b38f5c', stroke('#5e4626', 2.5)) +
      line(40, 40, 92, 92, '#7a5e36', 4),
    {
      layer: 'walls',
      props: { blocksMovement: true, blocksSight: true },
      tags: ['kisten', 'lager'],
    },
  ),
  misc(
    'firewood',
    '#7a5532',
    () =>
      [30, 44, 58, 72]
        .map(
          (y, i) =>
            rrect(14 + (i % 2) * 6, y - 6, 66, 12, 6, '#7a5532', stroke('#4a2f15', 1.5)) +
            circle(80 + (i % 2) * 6, y, 6, '#c2a874', stroke('#4a2f15', 1)),
        )
        .join(''),
    { tags: ['feuerholz', 'brennholz'] },
  ),
  misc(
    'haystack',
    '#d6b85c',
    () =>
      circle(50, 50, 40, '#d6b85c', stroke('#a88a3a', 2)) +
      scatter('haystack', 30, 70, 70, (x, y, rng) =>
        line(
          x + 15,
          y + 15,
          x + 15 + (rng() - 0.5) * 12,
          y + 15 + (rng() - 0.5) * 6,
          '#b8973c',
          1.5,
        ),
      ),
    {
      layer: 'walls',
      props: { blocksMovement: true, cover: 'threeQuarters' },
      tags: ['heuhaufen', 'stroh'],
    },
  ),
  misc(
    'hole',
    '#141210',
    () =>
      poly(blob(rngFrom('hole'), 50, 50, 38, 0.3, 11), '#4a4038') +
      poly(blob(rngFrom('hole2'), 50, 50, 30, 0.3, 11), '#0d0c0b'),
    { tags: ['loch', 'grube', 'schacht'] },
  ),
  misc(
    'footprints',
    '#5a4632',
    () =>
      [
        [30, 80],
        [55, 62],
        [36, 44],
        [60, 26],
      ]
        .map(([x, y]) => ellipse(x ?? 0, y ?? 0, 5, 8, '#5a4632', 'opacity="0.6"'))
        .join(''),
    { tags: ['spuren', 'fußspuren'] },
  ),
  misc(
    'scroll',
    '#efe2b8',
    () =>
      rect(26, 34, 48, 32, '#efe2b8', stroke('#a88a3a', 1.5)) +
      rrect(20, 30, 10, 40, 5, '#d8c690', stroke('#a88a3a', 1.5)) +
      rrect(70, 30, 10, 40, 5, '#d8c690', stroke('#a88a3a', 1.5)) +
      [42, 50, 58].map((y) => line(34, y, 66, y, '#7a6440', 1)).join(''),
    { tags: ['schriftrolle', 'karte'] },
  ),
  misc(
    'potions',
    '#7a4fd0',
    () =>
      circle(34, 58, 12, '#b3261e', stroke('#2a2a2a', 1.5)) +
      rect(30, 38, 8, 10, '#e8e0cc') +
      circle(62, 52, 14, '#3d6b8a', stroke('#2a2a2a', 1.5)) +
      rect(58, 30, 8, 10, '#e8e0cc') +
      circle(50, 74, 9, '#5fb84a', stroke('#2a2a2a', 1.5)),
    { tags: ['tränke', 'trank', 'alchemie'] },
  ),
  misc(
    'pottery',
    '#b8693a',
    () =>
      circle(34, 46, 16, '#b8693a', stroke('#6b3a1a', 2)) +
      circle(34, 46, 6, '#4a2410') +
      circle(64, 60, 20, '#c47a48', stroke('#6b3a1a', 2)) +
      circle(64, 60, 8, '#4a2410'),
    { tags: ['krüge', 'tonkrug', 'vasen'] },
  ),
  misc(
    'wheel',
    '#5b3b20',
    () =>
      circle(50, 50, 36, 'none', stroke('#5b3b20', 6)) +
      circle(50, 50, 8, '#5b3b20') +
      [0, 45, 90, 135]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          return line(
            50 - Math.cos(r) * 34,
            50 - Math.sin(r) * 34,
            50 + Math.cos(r) * 34,
            50 + Math.sin(r) * 34,
            '#5b3b20',
            3,
          );
        })
        .join(''),
    { tags: ['wagenrad', 'rad'] },
  ),
  misc(
    'signpost',
    '#7a5532',
    () =>
      circle(50, 50, 6, '#5b3b20') +
      path('M50 50 h34 l8 -8 -8 -8 h-34z', '#a3804f', stroke('#5b3b20', 2)) +
      path('M50 56 h-34 l-8 8 8 8 h34z', '#a3804f', stroke('#5b3b20', 2)),
    { tags: ['wegweiser', 'schild'] },
  ),
];
