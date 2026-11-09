/** Wände, Türen, Fenster, Treppen/Leitern und Fallen-Symbole. */
import type { ElementLayerId, TerrainProps } from '../../storage/mapDocument';
import type { CategoryId } from './categories';
import {
  blob,
  circle,
  g,
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
  INK,
  type SvgStyle,
} from './svg';
import type { ElementDef } from './types';

const SOLID: TerrainProps = { blocksMovement: true, blocksSight: true };

function el(
  id: string,
  category: CategoryId,
  layer: ElementLayerId,
  color: string,
  body: () => string,
  opts: { w?: number; h?: number; props?: TerrainProps; tags?: string[]; style?: SvgStyle } = {},
): ElementDef {
  const w = opts.w ?? 1;
  const h = opts.h ?? 1;
  return {
    id,
    category,
    layer,
    w,
    h,
    color,
    ...(opts.props ? { props: opts.props } : {}),
    ...(opts.tags ? { tags: opts.tags } : {}),
    draw: () => svgDoc(w, h, body(), opts.style),
  };
}

function blocks(seed: string, base: string, mortar: string, rows: number, cols: number) {
  const rng = rngFrom(seed);
  let out = rect(0, 0, 100, 100, mortar);
  const h = 100 / rows;
  const w = 100 / cols;
  for (let y = 0; y < rows; y++) {
    const off = y % 2 ? w / 2 : 0;
    for (let x = -1; x < cols; x++) {
      out += rect(
        x * w + off + 1,
        y * h + 1,
        w - 2,
        h - 2,
        shade(base, (rng() - 0.5) * 0.3),
        'rx="1.5"',
      );
    }
  }
  return out;
}

// ------------------------------------------------------------------ Wände

const wall = (
  id: string,
  color: string,
  body: () => string,
  props: TerrainProps = SOLID,
  tags?: string[],
) =>
  el(`wall.${id}`, 'walls', 'walls', color, body, {
    props,
    style: 'tile',
    ...(tags ? { tags } : {}),
  });

export const wallElements: ElementDef[] = [
  wall('stone', '#5a544c', () => blocks('wall-stone', '#625c54', INK, 3, 2), SOLID, ['mauer']),
  wall('brick', '#7a3b2a', () => blocks('wall-brick', '#8e4632', '#c8b9a3', 6, 3), SOLID, [
    'ziegel',
  ]),
  wall('wood', '#5b3b20', () =>
    [0, 1, 2, 3]
      .map((i) =>
        rrect(0, i * 25 + 1, 100, 23, 8, i % 2 ? '#6b4627' : '#5b3b20', stroke('#3b2512', 1.5)),
      )
      .join(''),
  ),
  wall(
    'cave',
    '#3d3833',
    () => {
      const rng = rngFrom('wall-cave');
      return (
        rect(0, 0, 100, 100, '#3a352f') +
        scatter('wall-cave-b', 8, 100, 100, (x, y, r) =>
          poly(blob(r, x, y, 14 + r() * 12, 0.5, 8), shade('#4a443d', (rng() - 0.5) * 0.3)),
        )
      );
    },
    SOLID,
    ['fels', 'rock'],
  ),
  wall(
    'hedge',
    '#2f5a28',
    () =>
      rect(0, 0, 100, 100, '#25481f') +
      scatter('hedge', 14, 100, 100, (x, y, r) =>
        circle(x, y, 10 + r() * 8, r() > 0.5 ? '#3a6e31' : '#2f5a28'),
      ),
  ),
  wall('palisade', '#6e4a2a', () =>
    [10, 30, 50, 70, 90]
      .map(
        (x) => circle(x, 50, 10.5, '#7d5531', stroke('#3e2914', 2)) + circle(x, 50, 4, '#5a3c20'),
      )
      .join(''),
  ),
  wall(
    'iron_bars',
    '#555b62',
    () =>
      rect(0, 44, 100, 12, '#3d4248') +
      [8, 24, 40, 56, 72, 88].map((x) => line(x, 2, x, 98, '#7a828c', 4)).join(''),
    { blocksMovement: true },
    ['gitter', 'bars'],
  ),
  wall(
    'low',
    '#6d6a64',
    () =>
      g(blocks('wall-low', '#7c7872', '#45423d', 1, 3), 'transform="translate(0 30) scale(1 0.4)"'),
    { cover: 'half' },
    ['mauerrest', 'brüstung'],
  ),
  wall(
    'ice',
    '#9ed3e3',
    () =>
      rect(0, 0, 100, 100, '#8cc6d8') +
      path('M10 0 L30 40 L20 100 M60 0 L55 50 L80 100 M30 40 L55 50', 'none', stroke('#e9f7fb', 2)),
  ),
  wall(
    'crystal',
    '#7a4fa0',
    () =>
      rect(0, 0, 100, 100, '#4b2e66') +
      poly([10, 100, 25, 10, 40, 100], '#9b6bc8') +
      poly([35, 100, 55, 0, 75, 100], '#b98ae0') +
      poly([65, 100, 85, 25, 100, 100], '#8a5ab8'),
  ),
];

// ------------------------------------------------------------------ Türen

const frame = (color: string) => rect(0, 36, 8, 28, color) + rect(92, 36, 8, 28, color);

function doorLeaf(color: string, x = 8, w = 84) {
  return (
    rect(x, 40, w, 20, color, stroke(shade(color, -0.45), 1.5)) +
    line(x + w / 3, 40, x + w / 3, 60, shade(color, -0.3), 1) +
    line(x + (2 * w) / 3, 40, x + (2 * w) / 3, 60, shade(color, -0.3), 1)
  );
}

const padlock = () =>
  path('M44 46 v-6 a6 6 0 0 1 12 0 v6', 'none', stroke('#2b2b2b', 2.5)) +
  rrect(41, 45, 18, 14, 2, '#e3b832', stroke('#6b5110', 1.5));

const swing = (fromX: number, dir: 1 | -1) =>
  path(
    `M${fromX} 50 A42 42 0 0 ${dir > 0 ? 1 : 0} ${fromX + dir * 42} 92`,
    'none',
    `${stroke('#ffffff', 1.5)} stroke-dasharray="4 3" opacity="0.8"`,
  );

const door = (
  id: string,
  color: string,
  body: () => string,
  props: TerrainProps,
  w = 1,
  tags?: string[],
) => el(`door.${id}`, 'doors', 'walls', color, body, { w, props, ...(tags ? { tags } : {}) });

const WOOD = '#8a5a2e';
const IRON = '#6b7178';

export const doorElements: ElementDef[] = [
  door('wood_closed', WOOD, () => frame('#3e3a35') + doorLeaf(WOOD), SOLID, 1, [
    'tür',
    'geschlossen',
  ]),
  door(
    'wood_open',
    WOOD,
    () => frame('#3e3a35') + rect(8, 50, 8, 42, WOOD, stroke('#4a2f15', 1.5)) + swing(16, 1),
    {},
    1,
    ['tür', 'offen'],
  ),
  door('wood_locked', WOOD, () => frame('#3e3a35') + doorLeaf(WOOD) + padlock(), SOLID, 1, [
    'tür',
    'verschlossen',
  ]),
  door(
    'secret',
    '#4a4845',
    () =>
      g(blocks('door-secret', '#5d5a56', '#2e2c2a', 3, 2)) +
      rect(
        14,
        38,
        72,
        24,
        'none',
        `${stroke('#e3c35a', 1.5)} stroke-dasharray="3 3" opacity="0.8"`,
      ) +
      path('M50 44 l3 5 h-6z', '#e3c35a', 'opacity="0.8"'),
    SOLID,
    1,
    ['geheimtür', 'versteckt'],
  ),
  door(
    'iron_closed',
    IRON,
    () =>
      frame('#2f3235') +
      doorLeaf(IRON) +
      [20, 50, 80].map((x) => circle(x, 50, 2, '#2f3337')).join(''),
    SOLID,
  ),
  door(
    'iron_open',
    IRON,
    () => frame('#2f3235') + rect(8, 50, 8, 42, IRON, stroke('#2f3337', 1.5)) + swing(16, 1),
    {},
  ),
  door('iron_locked', IRON, () => frame('#2f3235') + doorLeaf(IRON) + padlock(), SOLID),
  door(
    'double_closed',
    WOOD,
    () =>
      rect(0, 36, 8, 28, '#3e3a35') +
      rect(192, 36, 8, 28, '#3e3a35') +
      doorLeaf(WOOD, 8, 92) +
      doorLeaf(WOOD, 100, 92),
    SOLID,
    2,
    ['flügeltür'],
  ),
  door(
    'double_open',
    WOOD,
    () =>
      rect(0, 36, 8, 28, '#3e3a35') +
      rect(192, 36, 8, 28, '#3e3a35') +
      rect(8, 50, 8, 40, WOOD, stroke('#4a2f15', 1.5)) +
      rect(184, 50, 8, 40, WOOD, stroke('#4a2f15', 1.5)) +
      swing(16, 1) +
      path(
        'M184 50 A42 42 0 0 0 142 92',
        'none',
        `${stroke('#ffffff', 1.5)} stroke-dasharray="4 3" opacity="0.8"`,
      ),
    {},
    2,
    ['flügeltür'],
  ),
  door(
    'portcullis_closed',
    '#4d5359',
    () =>
      frame('#2f3235') +
      [16, 30, 44, 58, 72, 86].map((x) => line(x, 42, x, 58, '#8a929b', 3)).join('') +
      line(8, 46, 92, 46, '#8a929b', 2.5) +
      line(8, 54, 92, 54, '#8a929b', 2.5),
    { blocksMovement: true },
    1,
    ['fallgitter'],
  ),
  door(
    'portcullis_open',
    '#4d5359',
    () => frame('#2f3235') + line(8, 50, 92, 50, '#8a929b', 1.5, 'stroke-dasharray="4 4"'),
    {},
    1,
    ['fallgitter'],
  ),
  door(
    'curtain',
    '#8e2a2a',
    () =>
      frame('#3e3a35') +
      path(
        'M8 44 q7 8 14 0 t14 0 t14 0 t14 0 t14 0 t14 0 v12 q-7 -8 -14 0 t-14 0 t-14 0 t-14 0 t-14 0 t-14 0z',
        '#a8323a',
        stroke('#5e1a1f', 1),
      ),
    { blocksSight: true },
    1,
    ['vorhang'],
  ),
];

// ------------------------------------------------------------------ Fenster

const windowFrame = (body: string) =>
  rect(0, 38, 100, 24, '#4a4845') + body + rect(0, 38, 100, 24, 'none', stroke('#2e2c2a', 1.5));

export const windowElements: ElementDef[] = [
  el(
    'window.glass',
    'windows',
    'walls',
    '#9fd2e6',
    () =>
      windowFrame(
        rect(12, 44, 76, 12, '#bfe6f2', stroke('#5b3b20', 2)) + line(50, 44, 50, 56, '#5b3b20', 2),
      ),
    { props: { blocksMovement: true }, tags: ['fenster', 'glas'] },
  ),
  el(
    'window.shutters',
    'windows',
    'walls',
    '#6b4627',
    () =>
      windowFrame(
        rect(12, 44, 38, 12, '#7a5230', stroke('#3e2914', 1.5)) +
          rect(50, 44, 38, 12, '#7a5230', stroke('#3e2914', 1.5)),
      ),
    { props: SOLID, tags: ['fensterladen'] },
  ),
  el(
    'window.arrowslit',
    'windows',
    'walls',
    '#4a4845',
    () => windowFrame(rect(46, 38, 8, 24, '#1d1c1b') + rect(40, 47, 20, 6, '#1d1c1b')),
    { props: { blocksMovement: true, cover: 'threeQuarters' }, tags: ['schießscharte'] },
  ),
  el(
    'window.broken',
    'windows',
    'walls',
    '#9fd2e6',
    () =>
      windowFrame(
        rect(12, 44, 76, 12, '#2a2928') +
          poly([12, 44, 30, 44, 20, 56, 12, 56], '#bfe6f2') +
          poly([88, 44, 70, 44, 80, 50, 88, 56], '#bfe6f2'),
      ),
    { props: { cover: 'half' }, tags: ['zerbrochen'] },
  ),
];

// ------------------------------------------------------------------ Treppen & Leitern

const stairSteps = (dark: boolean) =>
  [0, 1, 2, 3, 4, 5, 6]
    .map((i) => {
      const t = i / 6;
      const c = dark ? shade('#8d8a84', -t * 0.6) : shade('#6e6b65', t * 0.45);
      return rect(6, 6 + i * 12.6, 88, 12.6, c, stroke('#3a3835', 0.8));
    })
    .join('');

const arrow = (up: boolean) =>
  up
    ? path('M50 14 l12 14 h-7 v18 h-10 v-18 h-7z', '#f2e6c4', stroke('#3a3835', 1))
    : path('M50 86 l12 -14 h-7 v-18 h-10 v18 h-7z', '#f2e6c4', stroke('#3a3835', 1));

export const stairElements: ElementDef[] = [
  el('stairs.up', 'stairs', 'walls', '#8d8a84', () => stairSteps(false) + arrow(true), {
    tags: ['treppe', 'hoch'],
  }),
  el('stairs.down', 'stairs', 'walls', '#5b5955', () => stairSteps(true) + arrow(false), {
    tags: ['treppe', 'runter'],
  }),
  el(
    'stairs.spiral',
    'stairs',
    'walls',
    '#7c7973',
    () =>
      circle(50, 50, 46, '#7c7973', stroke('#3a3835', 2)) +
      [0, 45, 90, 135, 180, 225, 270, 315]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          return line(50, 50, 50 + Math.cos(r) * 46, 50 + Math.sin(r) * 46, '#3a3835', 1.5);
        })
        .join('') +
      circle(50, 50, 9, '#5b5955', stroke('#3a3835', 1.5)),
    { tags: ['wendeltreppe'] },
  ),
  el(
    'stairs.ladder',
    'stairs',
    'walls',
    '#8a6239',
    () =>
      line(30, 4, 30, 96, '#6b4627', 5) +
      line(70, 4, 70, 96, '#6b4627', 5) +
      [14, 32, 50, 68, 86].map((y) => line(30, y, 70, y, '#9b7243', 4)).join(''),
    { tags: ['leiter'] },
  ),
  el(
    'stairs.rope_ladder',
    'stairs',
    'walls',
    '#b39a6b',
    () =>
      path('M32 4 Q28 50 32 96 M68 4 Q72 50 68 96', 'none', stroke('#c2a874', 3)) +
      [16, 34, 52, 70, 88].map((y) => line(30, y, 70, y, '#8a6239', 4)).join(''),
    { tags: ['strickleiter'] },
  ),
  el(
    'stairs.trapdoor_closed',
    'stairs',
    'walls',
    '#7d5531',
    () =>
      rect(12, 12, 76, 76, '#7d5531', stroke('#3e2914', 3)) +
      [31, 50, 69].map((x) => line(x, 12, x, 88, '#5a3c20', 1.5)).join('') +
      rect(18, 24, 10, 8, '#2f3337') +
      rect(18, 68, 10, 8, '#2f3337') +
      circle(76, 50, 4, '#2f3337'),
    { tags: ['falltür', 'luke'] },
  ),
  el(
    'stairs.trapdoor_open',
    'stairs',
    'walls',
    '#1d1b19',
    () =>
      rect(12, 12, 76, 76, '#141210', stroke('#3e2914', 3)) +
      rect(12, 2, 76, 10, '#7d5531', stroke('#3e2914', 1.5)) +
      [26, 42, 58, 74].map((y) => line(30, y, 70, y, '#5a3c20', 3)).join(''),
    { tags: ['falltür', 'luke'] },
  ),
];

// ------------------------------------------------------------------ Fallen (Symbole)

const trapBase = (inner: string) =>
  circle(50, 50, 44, '#b3261e', 'opacity="0.25"') +
  circle(50, 50, 44, 'none', `${stroke('#b3261e', 3)} stroke-dasharray="7 4"`) +
  inner;

const trap = (id: string, inner: () => string, props?: TerrainProps, tags?: string[]) =>
  el(`trap.${id}`, 'traps', 'decor', '#b3261e', () => trapBase(inner()), {
    ...(props ? { props } : {}),
    tags: ['falle', 'trap', ...(tags ?? [])],
  });

export const trapElements: ElementDef[] = [
  trap(
    'pit',
    () =>
      rect(26, 26, 48, 48, '#141210', stroke('#3a3835', 2)) +
      line(26, 26, 74, 74, '#3a3835', 1) +
      line(74, 26, 26, 74, '#3a3835', 1),
    undefined,
    ['grube'],
  ),
  trap(
    'spikes',
    () =>
      [28, 44, 60]
        .map((x) => poly([x, 70, x + 6, 36, x + 12, 70], '#cfd4d9', stroke('#4a4f55', 1.5)))
        .join(''),
    { difficult: true, damage: 'piercing' },
    ['stacheln'],
  ),
  trap(
    'pressure_plate',
    () => rect(28, 28, 44, 44, '#8a857c', stroke('#3a3835', 2)) + rect(34, 34, 32, 32, '#9a948a'),
  ),
  trap(
    'dart',
    () =>
      line(24, 76, 72, 28, '#3a3835', 4) +
      poly([72, 28, 60, 32, 68, 40], '#3a3835') +
      path('M24 76 l8 -2 -6 -6z', '#c2a874'),
    undefined,
    ['pfeil'],
  ),
  trap(
    'fire',
    () =>
      path(
        'M50 22 C64 38 70 48 64 62 C60 72 40 74 36 62 C32 50 44 46 42 34 C48 40 50 44 50 22z',
        '#ff8a1f',
        stroke('#b3261e', 2),
      ) + path('M50 46 C56 54 56 62 50 66 C44 62 44 54 50 46z', '#ffd23a'),
    { damage: 'fire' },
    ['feuer'],
  ),
  trap(
    'net',
    () =>
      [30, 42, 54, 66]
        .map((v) => line(v, 26, v, 74, '#c2a874', 2) + line(26, v, 74, v, '#c2a874', 2))
        .join(''),
    undefined,
    ['netz'],
  ),
  trap(
    'glyph',
    () =>
      circle(50, 50, 24, 'none', stroke('#7a4fd0', 2.5)) +
      poly([50, 30, 67, 60, 33, 60], 'none', stroke('#7a4fd0', 2.5)) +
      circle(50, 50, 4, '#7a4fd0'),
    undefined,
    ['rune', 'glyphe', 'magie'],
  ),
  trap(
    'beartrap',
    () =>
      circle(50, 50, 20, 'none', stroke('#5d6268', 4)) +
      [0, 60, 120, 180, 240, 300]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          return line(
            50 + Math.cos(r) * 20,
            50 + Math.sin(r) * 20,
            50 + Math.cos(r) * 12,
            50 + Math.sin(r) * 12,
            '#5d6268',
            3,
          );
        })
        .join(''),
    { damage: 'piercing' },
    ['bärenfalle'],
  ),
  trap(
    'ceiling',
    () =>
      path('M30 30 L42 44 L36 52 L50 66 M60 28 L56 40 L68 50', 'none', stroke('#3a3835', 2.5)) +
      path('M50 66 l-6 -8 h12z', '#3a3835'),
    { damage: 'bludgeoning' },
    ['decke', 'einsturz'],
  ),
  trap(
    'poison_needle',
    () =>
      line(30, 70, 66, 34, '#9aa1a8', 3) +
      path('M66 34 l6 -6', 'none', stroke('#9aa1a8', 1.5)) +
      path('M62 56 C66 62 68 66 64 70 C60 72 56 68 58 62z', '#5fb84a'),
    { damage: 'poison' },
    ['gift', 'nadel'],
  ),
];
