/** Böden und Gelände (Ebene "Boden", je 1×1 Feld, kachelbar). */
import type { TerrainProps } from '../../storage/mapDocument';
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

function floor(
  id: string,
  color: string,
  body: () => string,
  props?: TerrainProps,
  tags?: string[],
): ElementDef {
  return {
    id: `floor.${id}`,
    category: 'floors',
    layer: 'floor',
    w: 1,
    h: 1,
    color,
    ...(props ? { props } : {}),
    ...(tags ? { tags } : {}),
    draw: () => svgDoc(1, 1, rect(0, 0, 100, 100, color) + body(), 'tile'),
  };
}

/** Steinplatten in einem Raster mit Fugen und leicht variierender Helligkeit. */
function slabs(seed: string, base: string, cols: number, rows: number, mortar: string): string {
  const rng = rngFrom(seed);
  const w = 100 / cols;
  const h = 100 / rows;
  let out = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const off = y % 2 && cols > 1 ? w / 2 : 0;
      const fill = shade(base, (rng() - 0.5) * 0.25);
      out += rect(((x * w + off) % 100) + 1.5, y * h + 1.5, w - 3, h - 3, fill, `rx="2"`);
      if (off) out += rect(1.5 - w / 2, y * h + 1.5, w - 3, h - 3, fill, `rx="2"`);
    }
  }
  return rect(0, 0, 100, 100, mortar) + out;
}

function planks(seed: string, base: string, count: number): string {
  const rng = rngFrom(seed);
  const w = 100 / count;
  let out = '';
  for (let i = 0; i < count; i++) {
    out += rect(i * w, 0, w, 100, shade(base, (rng() - 0.5) * 0.2));
    out += line(i * w, 0, i * w, 100, shade(base, -0.45), 1.2);
    const cut = 20 + rng() * 60;
    out += line(i * w, cut, (i + 1) * w, cut, shade(base, -0.4), 1);
    for (let k = 0; k < 3; k++) {
      const gx = i * w + 2 + rng() * (w - 4);
      out += line(gx, rng() * 100, gx + (rng() - 0.5) * 2, rng() * 100, shade(base, -0.15), 0.6);
    }
  }
  return out;
}

function speckle(seed: string, count: number, colors: string[], rMin: number, rMax: number) {
  return scatter(seed, count, 100, 100, (x, y, rng) =>
    circle(x, y, rMin + rng() * (rMax - rMin), colors[Math.floor(rng() * colors.length)] ?? '#000'),
  );
}

function blades(seed: string, count: number, colors: string[]) {
  return scatter(seed, count, 100, 100, (x, y, rng) => {
    const c = colors[Math.floor(rng() * colors.length)] ?? '#000';
    return line(x, y, x + (rng() - 0.5) * 4, y - 3 - rng() * 4, c, 1.1);
  });
}

function waves(seed: string, count: number, color: string, width: number) {
  return scatter(seed, count, 100, 100, (x, y, rng) => {
    const l = 8 + rng() * 10;
    return path(
      `M${x - l} ${y} q${l / 2} -4 ${l} 0 t${l} 0`,
      'none',
      `${stroke(color, width)} stroke-linecap="round" opacity="0.8"`,
    );
  });
}

function carpet(id: string, base: string, trim: string): ElementDef {
  return floor(
    `carpet_${id}`,
    base,
    () =>
      rect(6, 6, 88, 88, 'none', stroke(trim, 4)) +
      rect(14, 14, 72, 72, 'none', stroke(shade(base, 0.25), 2)) +
      poly([50, 26, 74, 50, 50, 74, 26, 50], shade(base, 0.2), stroke(trim, 2)) +
      circle(50, 50, 6, trim),
    undefined,
    ['teppich', 'carpet', 'rug'],
  );
}

export const floorElements: ElementDef[] = [
  floor('stone', '#a29e94', () => slabs('stone', '#aeaa9f', 2, 2, '#6a655c'), undefined, [
    'stein',
    'stone',
  ]),
  floor('flagstone', '#7e7a72', () => {
    const rng = rngFrom('flag');
    const mortar = rect(0, 0, 100, 100, '#56524b');
    const stones = [
      [2, 2, 55, 40],
      [59, 2, 39, 58],
      [2, 44, 30, 54],
      [34, 44, 23, 54],
      [59, 62, 39, 36],
    ]
      .map(([x, y, w, h]) =>
        rrect(x ?? 0, y ?? 0, w ?? 0, h ?? 0, 4, shade('#8a857c', (rng() - 0.5) * 0.25)),
      )
      .join('');
    return mortar + stones;
  }),
  floor('cobblestone', '#7d7368', () => {
    const rng = rngFrom('cobble');
    let out = rect(0, 0, 100, 100, '#4d463e');
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const cx = x * 20 + 10 + (y % 2) * 5 + (rng() - 0.5) * 3;
        const cy = y * 20 + 10 + (rng() - 0.5) * 3;
        out += ellipse(cx, cy, 8.5, 7.5, shade('#8a7f72', (rng() - 0.5) * 0.3));
      }
    }
    return out;
  }),
  floor('marble', '#e7e3dc', () => {
    const rng = rngFrom('marble');
    let out = '';
    for (let i = 0; i < 5; i++) {
      const y = rng() * 100;
      out += path(
        `M0 ${y} C30 ${y + (rng() - 0.5) * 40} 60 ${y + (rng() - 0.5) * 40} 100 ${y + (rng() - 0.5) * 30}`,
        'none',
        stroke('#b8b2a8', 0.8 + rng()),
      );
    }
    return out + rect(0, 0, 100, 100, 'none', stroke('#cfc8bc', 1.5));
  }),
  floor(
    'tiles',
    '#d8d2c4',
    () =>
      [0, 1]
        .map((r) =>
          [0, 1].map((c) => ((r + c) % 2 ? rect(c * 50, r * 50, 50, 50, '#3f3a35') : '')).join(''),
        )
        .join('') + rect(0, 0, 100, 100, 'none', stroke('#8f877b', 1)),
  ),
  floor('sandstone', '#c9a873', () => slabs('sandstone', '#d1b07b', 3, 3, '#9a7a4b')),
  floor(
    'dungeon',
    '#5c5a57',
    () =>
      slabs('dungeon', '#686561', 2, 4, '#363431') + speckle('dungeon-m', 12, ['#3b4a2f'], 0.8, 2),
  ),
  floor('mosaic', '#b9a37c', () => {
    const rng = rngFrom('mosaic');
    const colors = ['#a13d2d', '#d8b65a', '#3d6b8a', '#e8e0cc', '#4d7a43'];
    let out = rect(0, 0, 100, 100, '#6b5a40');
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        out += rect(
          x * 12.5 + 0.8,
          y * 12.5 + 0.8,
          10.9,
          10.9,
          colors[Math.floor(rng() * 5)] ?? '#000',
        );
      }
    }
    return out;
  }),
  floor('wood', '#c49c6c', () => planks('wood', '#c9a171', 4), undefined, ['holz', 'dielen']),
  floor('wood_dark', '#5e3e24', () => planks('wood-dark', '#634127', 5)),
  floor('parquet', '#b07b45', () => {
    let out = '';
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const horiz = (x + y) % 2 === 0;
        const c = horiz ? '#b5804a' : '#9c6a3a';
        out += rect(x * 25, y * 25, 25, 25, c, stroke('#6e4826', 0.8));
        out += horiz
          ? line(x * 25, y * 25 + 12.5, x * 25 + 25, y * 25 + 12.5, '#7a5230', 0.6)
          : line(x * 25 + 12.5, y * 25, x * 25 + 12.5, y * 25 + 25, '#6e4826', 0.6);
      }
    }
    return out;
  }),
  floor('earth', '#7a5a3c', () => speckle('earth', 45, ['#6a4c31', '#8a6847', '#5d432b'], 1, 3)),
  floor(
    'mud',
    '#5a4632',
    () =>
      speckle('mud', 20, ['#4a3828', '#6b5540'], 3, 8) +
      scatter('mud-p', 4, 100, 100, (x, y, rng) =>
        ellipse(x, y, 6 + rng() * 6, 3 + rng() * 3, '#6f6a55', 'opacity="0.6"'),
      ),
    { difficult: true },
    ['schlamm', 'mud'],
  ),
  floor('gravel', '#8f877c', () =>
    speckle('gravel', 90, ['#a39b8f', '#746c62', '#b8b0a3', '#5f584f'], 1, 2.6),
  ),
  floor(
    'road',
    '#cdb68a',
    () =>
      speckle('road', 40, ['#b89f72', '#dccaa2'], 1, 2.5) +
      line(0, 30, 100, 30, '#a68c60', 3, 'opacity="0.5"') +
      line(0, 70, 100, 70, '#a68c60', 3, 'opacity="0.5"'),
  ),
  floor(
    'grass',
    '#8db267',
    () => blades('grass', 120, ['#7aa156', '#a5c67f', '#6b9149']),
    undefined,
    ['gras', 'wiese'],
  ),
  floor('grass_dry', '#a39a52', () => blades('grass-dry', 110, ['#8a8040', '#bdb36a', '#7a6e35'])),
  floor('moss', '#4f6b3a', () => speckle('moss', 60, ['#5f8044', '#3f5a2c', '#6e8f4f'], 2, 5)),
  floor('hay', '#d6b85c', () =>
    scatter('hay', 70, 100, 100, (x, y, rng) =>
      line(
        x,
        y,
        x + (rng() - 0.5) * 16,
        y + (rng() - 0.5) * 6,
        rng() > 0.5 ? '#b8973c' : '#ecd383',
        1.2,
      ),
    ),
  ),
  floor('sand', '#dcc58f', () => speckle('sand', 70, ['#c9b07a', '#eedaa6', '#bfa36a'], 0.6, 1.4)),
  floor('snow', '#eef3f7', () => speckle('snow', 30, ['#dbe5ee', '#ffffff', '#cfdbe6'], 1.5, 4)),
  floor(
    'ice',
    '#bfe3ee',
    () =>
      path(
        'M5 20 L40 35 L55 15 M40 35 L45 70 L85 85 M45 70 L15 90',
        'none',
        stroke('#ffffff', 1.4),
      ) +
      path('M70 10 L80 40 L98 45', 'none', stroke('#9ccbd9', 1.2)) +
      rect(10, 50, 22, 4, '#ffffff', 'opacity="0.5" transform="rotate(-25 21 52)"'),
    { difficult: true },
    ['eis', 'ice', 'glatt'],
  ),
  floor(
    'water_shallow',
    '#6fb3c9',
    () => waves('water-s', 9, '#a6d6e4', 1.6),
    { difficult: true },
    ['wasser', 'water'],
  ),
  floor('water_deep', '#1f5a85', () => waves('water-d', 9, '#3f7fae', 2), { difficult: true }, [
    'wasser',
    'water',
    'tief',
  ]),
  floor(
    'swamp',
    '#4b5634',
    () =>
      scatter('swamp', 5, 100, 100, (x, y, rng) =>
        ellipse(x, y, 7 + rng() * 8, 4 + rng() * 4, '#37502f', 'opacity="0.85"'),
      ) + blades('swamp-r', 40, ['#6b7a3a', '#3e4a24']),
    { difficult: true },
    ['sumpf', 'moor'],
  ),
  floor(
    'lava',
    '#5a1a0c',
    () =>
      path(
        'M0 30 C20 20 35 45 55 35 S85 15 100 28 M0 75 C25 65 40 90 65 78 S90 60 100 72 M30 0 C35 20 25 40 40 55 S50 85 45 100',
        'none',
        `${stroke('#ff9a1f', 4)} opacity="0.95"`,
      ) + speckle('lava', 14, ['#ffcf3a', '#ff6a12'], 1, 3),
    { damage: 'fire' },
    ['lava', 'magma', 'feuer'],
  ),
  carpet('red', '#8e2a2a', '#d8b14a'),
  carpet('blue', '#283e7a', '#d8c58a'),
  carpet('green', '#2f5e3a', '#c9b46a'),
  floor(
    'cave',
    '#6e6458',
    () =>
      scatter('cave', 7, 100, 100, (x, y, rng) =>
        poly(blob(rng, x, y, 8 + rng() * 10, 0.5, 7), shade('#6e6458', (rng() - 0.5) * 0.3)),
      ) + speckle('cave-s', 30, ['#544b41', '#857a6d'], 0.8, 2),
  ),
  floor(
    'rubble',
    '#7a7064',
    () =>
      scatter('rubble', 18, 100, 100, (x, y, rng) =>
        poly(
          blob(rng, x, y, 3 + rng() * 6, 0.6, 6),
          shade('#8a8072', (rng() - 0.5) * 0.4),
          stroke('#4f483f', 0.8),
        ),
      ),
    { difficult: true },
    ['geröll', 'schutt'],
  ),
  floor(
    'bridge',
    '#8a6239',
    () =>
      rect(0, 0, 100, 100, '#4b3420') +
      [0, 1, 2, 3, 4]
        .map((i) => rect(1, i * 20 + 1, 98, 18, i % 2 ? '#94683c' : '#8a6239'))
        .join('') +
      line(0, 3, 100, 3, '#3a2816', 3) +
      line(0, 97, 100, 97, '#3a2816', 3),
    undefined,
    ['brücke', 'steg'],
  ),
];
