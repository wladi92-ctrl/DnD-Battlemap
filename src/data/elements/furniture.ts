/** Möbel, Einrichtung und Licht/Feuer (Ebene "Wände/Objekte" bzw. "Dekoration"). */
import type { ElementLayerId, TerrainProps } from '../../storage/mapDocument';
import type { CategoryId } from './categories';
import { circle, g, line, path, poly, rect, rrect, shade, stroke, svgDoc } from './svg';
import type { ElementDef } from './types';

const SOLID: TerrainProps = { blocksMovement: true, blocksSight: true };
const BLOCK: TerrainProps = { blocksMovement: true };
const HALF: TerrainProps = { cover: 'half' };

function item(
  id: string,
  color: string,
  body: () => string,
  opts: {
    w?: number;
    h?: number;
    props?: TerrainProps;
    layer?: ElementLayerId;
    category?: CategoryId;
    tags?: string[];
  } = {},
): ElementDef {
  const w = opts.w ?? 1;
  const h = opts.h ?? 1;
  return {
    id,
    category: opts.category ?? 'furniture',
    layer: opts.layer ?? 'walls',
    w,
    h,
    color,
    ...(opts.props ? { props: opts.props } : {}),
    ...(opts.tags ? { tags: opts.tags } : {}),
    draw: () => svgDoc(w, h, body()),
  };
}

const WOOD = '#8a5a2e';
const WOOD_L = '#a8733f';
const WOOD_D = '#5b3b20';
const OUT = (c = WOOD_D, w = 2) => stroke(c, w);

const chairShape = (cx: number, cy: number, rot = 0) =>
  g(
    rrect(-12, -12, 24, 24, 3, WOOD_L, OUT()) + rect(-12, -16, 24, 6, WOOD_D),
    `transform="translate(${cx} ${cy}) rotate(${rot})"`,
  );

const tableTop = (x: number, y: number, w: number, h: number) =>
  rrect(x, y, w, h, 4, WOOD_L, OUT()) +
  line(x + 4, y + h / 2, x + w - 4, y + h / 2, shade(WOOD_L, -0.15), 1);

const book = (x: number, y: number, h: number, c: string) =>
  rect(x, y, 6, h, c, stroke('#1d1b19', 0.6));

export const furnitureElements: ElementDef[] = [
  item('furniture.table_square', WOOD_L, () => tableTop(14, 14, 72, 72), {
    props: HALF,
    tags: ['tisch'],
  }),
  item(
    'furniture.table_round',
    WOOD_L,
    () =>
      circle(50, 50, 38, WOOD_L, OUT()) +
      circle(50, 50, 28, 'none', stroke(shade(WOOD_L, -0.15), 1)),
    { props: HALF, tags: ['tisch', 'rund'] },
  ),
  item('furniture.table_long', WOOD_L, () => tableTop(8, 20, 184, 60), {
    w: 2,
    props: HALF,
    tags: ['tafel', 'tisch'],
  }),
  item('furniture.chair', WOOD_L, () => chairShape(50, 52), { tags: ['stuhl'] }),
  item('furniture.stool', WOOD_L, () => circle(50, 50, 18, WOOD_L, OUT()), { tags: ['hocker'] }),
  item(
    'furniture.bench',
    WOOD_L,
    () => rrect(8, 34, 184, 32, 4, WOOD_L, OUT()) + line(12, 50, 188, 50, shade(WOOD_L, -0.2), 1),
    { w: 2, tags: ['bank'] },
  ),
  item(
    'furniture.bed_single',
    '#b8b0a0',
    () =>
      rrect(14, 6, 72, 188, 5, WOOD, OUT()) +
      rrect(18, 50, 64, 140, 4, '#7a2e2e') +
      rrect(22, 12, 56, 34, 8, '#efe9dc', OUT('#b8b0a0', 1.5)),
    { h: 2, tags: ['bett'] },
  ),
  item(
    'furniture.bed_double',
    '#b8b0a0',
    () =>
      rrect(10, 6, 180, 188, 6, WOOD, OUT()) +
      rrect(14, 52, 172, 138, 4, '#2e4a7a') +
      rrect(20, 12, 74, 34, 8, '#efe9dc', OUT('#b8b0a0', 1.5)) +
      rrect(106, 12, 74, 34, 8, '#efe9dc', OUT('#b8b0a0', 1.5)),
    { w: 2, h: 2, tags: ['bett', 'doppelbett'] },
  ),
  item(
    'furniture.bed_bunk',
    '#b8b0a0',
    () =>
      rrect(14, 6, 72, 188, 3, WOOD_D, OUT('#3a2512')) +
      rrect(18, 50, 64, 140, 3, '#5a6b3a') +
      rrect(22, 12, 56, 30, 6, '#efe9dc') +
      line(14, 6, 86, 194, WOOD_D, 3) +
      line(86, 6, 14, 194, WOOD_D, 3),
    { h: 2, tags: ['etagenbett', 'stockbett'] },
  ),
  item(
    'furniture.chest',
    WOOD,
    () =>
      rrect(16, 26, 68, 48, 4, WOOD, OUT()) +
      rect(16, 44, 68, 6, '#3a3f45') +
      rect(30, 26, 6, 48, '#3a3f45') +
      rect(64, 26, 6, 48, '#3a3f45') +
      rect(46, 42, 8, 10, '#e3b832', stroke('#6b5110', 1)),
    { layer: 'decor', tags: ['truhe', 'schatz'] },
  ),
  item(
    'furniture.crate',
    '#a3804f',
    () =>
      rect(14, 14, 72, 72, '#a3804f', OUT('#5e4626', 2.5)) +
      line(14, 14, 86, 86, '#7a5e36', 5) +
      rect(20, 20, 60, 60, 'none', stroke('#7a5e36', 3)),
    { props: HALF, tags: ['kiste'] },
  ),
  item(
    'furniture.barrel',
    '#8a5a2e',
    () =>
      circle(50, 50, 34, '#8a5a2e', stroke('#3a3f45', 4)) +
      circle(50, 50, 24, 'none', stroke('#3a3f45', 2.5)) +
      circle(50, 50, 4, WOOD_D),
    { props: HALF, tags: ['fass', 'tonne'] },
  ),
  item(
    'furniture.sack',
    '#c2a874',
    () =>
      path(
        'M30 40 C26 70 36 84 50 84 C64 84 74 70 70 40 C66 30 34 30 30 40z',
        '#c2a874',
        OUT('#7a6440', 2),
      ) + path('M40 32 C44 24 56 24 60 32', 'none', stroke('#7a6440', 3)),
    { layer: 'decor', tags: ['sack'] },
  ),
  item(
    'furniture.shelf',
    WOOD,
    () =>
      rect(4, 26, 192, 48, WOOD, OUT()) +
      [20, 55, 95, 130, 165]
        .map((x, i) =>
          circle(
            x,
            50,
            9,
            ['#c2a874', '#7a8f9f', '#a3573a', '#e8e0cc', '#5f8a4a'][i] ?? '#fff',
            stroke('#3a2512', 1),
          ),
        )
        .join(''),
    { w: 2, props: BLOCK, tags: ['regal'] },
  ),
  item(
    'furniture.bookshelf',
    WOOD_D,
    () => {
      const colors = ['#8e2a2a', '#283e7a', '#2f5e3a', '#c2a874', '#5b2a6e', '#a3573a'];
      let books = '';
      for (let i = 0; i < 26; i++)
        books += book(8 + i * 7, 32, 34 - (i % 3) * 4, colors[i % colors.length] ?? '#000');
      return rect(4, 24, 192, 52, WOOD_D, OUT('#2a1a0c')) + books;
    },
    { w: 2, props: SOLID, tags: ['bücherregal', 'bibliothek'] },
  ),
  item(
    'furniture.cabinet',
    WOOD,
    () =>
      rect(14, 20, 72, 60, WOOD, OUT()) +
      line(50, 20, 50, 80, WOOD_D, 2) +
      circle(44, 50, 3, '#e3b832') +
      circle(56, 50, 3, '#e3b832'),
    { props: BLOCK, tags: ['schrank', 'kommode'] },
  ),
  item(
    'furniture.wardrobe',
    WOOD_D,
    () =>
      rect(8, 14, 84, 72, WOOD_D, OUT('#2a1a0c')) +
      rect(14, 20, 34, 60, WOOD, OUT()) +
      rect(52, 20, 34, 60, WOOD, OUT()),
    { props: SOLID, tags: ['kleiderschrank'] },
  ),
  item(
    'furniture.desk',
    WOOD,
    () =>
      tableTop(8, 18, 184, 56) +
      rect(30, 30, 30, 22, '#efe9dc', stroke('#b8b0a0', 1)) +
      circle(150, 40, 7, '#1d1b19') +
      line(150, 40, 165, 28, '#e8e0cc', 2) +
      chairShape(100, 86, 180),
    { w: 2, props: HALF, tags: ['schreibtisch'] },
  ),
  item(
    'furniture.throne',
    '#d4a830',
    () =>
      rrect(18, 14, 64, 72, 6, '#8e2a2a', OUT('#6b5110', 3)) +
      rrect(18, 10, 64, 18, 4, '#d4a830', OUT('#6b5110', 2)) +
      rrect(28, 34, 44, 44, 4, '#a8323a') +
      circle(50, 18, 4, '#3d6b8a'),
    { tags: ['thron'] },
  ),
  item(
    'furniture.altar',
    '#d8d2c4',
    () =>
      rrect(10, 20, 180, 60, 3, '#cfc8bc', OUT('#7a7468', 2)) +
      rect(30, 30, 140, 40, '#e8e3d8', OUT('#9a948a', 1)) +
      circle(100, 50, 10, '#b3261e', 'opacity="0.7"') +
      rect(60, 44, 4, 12, '#efe9dc') +
      rect(136, 44, 4, 12, '#efe9dc'),
    { w: 2, props: HALF, tags: ['altar', 'tempel'] },
  ),
  item(
    'furniture.statue',
    '#a8a49c',
    () =>
      rect(10, 10, 80, 80, '#7a7672', OUT('#4a4845', 2)) +
      circle(50, 36, 12, '#c8c4bc', OUT('#6e6a64', 1.5)) +
      path('M28 78 C30 54 70 54 72 78z', '#c8c4bc', OUT('#6e6a64', 1.5)),
    { props: { blocksMovement: true, cover: 'threeQuarters' }, tags: ['statue', 'skulptur'] },
  ),
  item(
    'furniture.pillar_round',
    '#9a968e',
    () =>
      circle(50, 50, 40, '#a8a49c', OUT('#55524c', 3)) +
      circle(50, 50, 30, 'none', stroke('#7a7672', 1.5)),
    { props: SOLID, tags: ['säule'] },
  ),
  item(
    'furniture.pillar_square',
    '#9a968e',
    () =>
      rect(10, 10, 80, 80, '#a8a49c', OUT('#55524c', 3)) +
      rect(20, 20, 60, 60, 'none', stroke('#7a7672', 1.5)),
    { props: SOLID, tags: ['säule', 'pfeiler'] },
  ),
  item(
    'furniture.bar_counter',
    WOOD_D,
    () =>
      rrect(4, 30, 292, 40, 3, WOOD_D, OUT('#2a1a0c')) +
      rect(8, 34, 284, 8, shade(WOOD_D, 0.2)) +
      [40, 70, 160, 250].map((x) => circle(x, 55, 6, '#c9a05a', stroke('#6b5110', 1))).join(''),
    { w: 3, props: HALF, tags: ['theke', 'tresen', 'taverne'] },
  ),
  item(
    'furniture.workbench',
    WOOD,
    () =>
      tableTop(8, 22, 184, 56) +
      rect(30, 34, 40, 8, '#6b7178') +
      rect(120, 30, 6, 30, '#6b7178') +
      rect(110, 30, 26, 8, '#6b7178'),
    { w: 2, props: HALF, tags: ['werkbank'] },
  ),
  item(
    'furniture.anvil',
    '#4d5359',
    () =>
      rect(36, 56, 28, 26, WOOD_D) +
      path('M16 34 h56 c10 0 16 6 18 12 h-26 v12 h-24 v-12 h-24z', '#5d636a', OUT('#25282c', 2)),
    { tags: ['amboss', 'schmiede'] },
  ),
  item(
    'furniture.forge',
    '#5d5a56',
    () =>
      rrect(10, 10, 180, 180, 4, '#5d5a56', OUT('#2e2c2a', 3)) +
      rrect(40, 40, 120, 120, 6, '#2a1a12') +
      circle(100, 100, 40, '#ff6a12', 'opacity="0.9"') +
      circle(100, 100, 22, '#ffd23a'),
    { w: 2, h: 2, props: { blocksMovement: true, damage: 'fire' }, tags: ['esse', 'schmiede'] },
  ),
  item(
    'furniture.cauldron',
    '#2f3235',
    () =>
      circle(50, 50, 36, '#2f3235', OUT('#141516', 3)) +
      circle(50, 50, 28, '#4f8f3a') +
      circle(42, 44, 5, '#7cc95a') +
      circle(58, 56, 4, '#7cc95a'),
    { props: BLOCK, tags: ['kessel', 'hexe'] },
  ),
  item(
    'furniture.well',
    '#8a857c',
    () =>
      circle(50, 50, 42, '#8a857c', OUT('#4a4640', 3)) +
      circle(50, 50, 30, '#1f3f5a') +
      line(8, 50, 92, 50, WOOD_D, 6) +
      rect(44, 44, 12, 12, WOOD, OUT()),
    { props: BLOCK, tags: ['brunnen'] },
  ),
  item(
    'furniture.fountain',
    '#a8a49c',
    () =>
      circle(100, 100, 92, '#a8a49c', OUT('#55524c', 4)) +
      circle(100, 100, 80, '#6fb3c9') +
      circle(100, 100, 24, '#a8a49c', OUT('#55524c', 2)) +
      circle(100, 100, 10, '#bfe3ee'),
    { w: 2, h: 2, props: BLOCK, tags: ['springbrunnen'] },
  ),
  item(
    'furniture.coffin',
    WOOD_D,
    () =>
      poly([38, 8, 62, 8, 76, 50, 66, 192, 34, 192, 24, 50], WOOD_D, OUT('#2a1a0c')) +
      line(50, 40, 50, 90, '#c8b9a3', 3) +
      line(38, 56, 62, 56, '#c8b9a3', 3),
    { h: 2, layer: 'decor', tags: ['sarg'] },
  ),
  item(
    'furniture.sarcophagus',
    '#a8a49c',
    () =>
      rrect(16, 8, 68, 184, 8, '#a8a49c', OUT('#55524c', 3)) +
      circle(50, 40, 14, '#c8c4bc', OUT('#7a7672', 1.5)) +
      path('M30 70 C30 140 70 140 70 70', 'none', stroke('#7a7672', 2)),
    { h: 2, props: HALF, tags: ['sarkophag', 'gruft'] },
  ),
  item(
    'furniture.cage',
    '#5d636a',
    () =>
      rect(8, 8, 84, 84, 'none', stroke('#5d636a', 4)) +
      [22, 36, 50, 64, 78].map((x) => line(x, 8, x, 92, '#7a828c', 2.5)).join(''),
    { props: BLOCK, tags: ['käfig', 'gefängnis'] },
  ),
  item(
    'furniture.weapon_rack',
    WOOD,
    () =>
      rect(6, 40, 188, 14, WOOD, OUT()) +
      [30, 70, 110, 150]
        .map(
          (x, i) =>
            line(x, 18, x + (i % 2 ? 8 : -8), 82, '#9aa1a8', 4) + rect(x - 6, 44, 12, 6, '#3a2512'),
        )
        .join(''),
    { w: 2, props: BLOCK, tags: ['waffenständer', 'waffen'] },
  ),
  item(
    'furniture.armor_stand',
    '#6b7178',
    () =>
      circle(50, 30, 12, '#8a929b', OUT('#3a3f45', 2)) +
      rrect(28, 42, 44, 40, 10, '#8a929b', OUT('#3a3f45', 2)) +
      line(28, 50, 18, 72, '#8a929b', 6) +
      line(72, 50, 82, 72, '#8a929b', 6),
    { props: BLOCK, tags: ['rüstung', 'rüstungsständer'] },
  ),
  item(
    'furniture.target_dummy',
    '#c2a874',
    () =>
      line(50, 10, 50, 90, WOOD_D, 6) +
      line(22, 40, 78, 40, WOOD_D, 5) +
      circle(50, 52, 24, '#c2a874', OUT('#7a6440', 2)) +
      circle(50, 52, 14, '#b3261e') +
      circle(50, 52, 6, '#efe9dc'),
    { tags: ['übungspuppe', 'zielscheibe'] },
  ),
  item(
    'furniture.lectern',
    WOOD,
    () =>
      rect(40, 50, 20, 40, WOOD_D) +
      poly([20, 26, 80, 26, 86, 54, 14, 54], WOOD, OUT()) +
      rect(28, 30, 44, 18, '#efe9dc', stroke('#b8b0a0', 1)) +
      line(50, 30, 50, 48, '#b8b0a0', 1),
    { tags: ['lesepult', 'pult'] },
  ),
  item(
    'furniture.rug',
    '#8e2a2a',
    () =>
      rect(6, 6, 188, 288, '#8e2a2a', OUT('#d8b14a', 5)) +
      rect(22, 22, 156, 256, 'none', stroke('#d8b14a', 2)) +
      poly([100, 60, 150, 150, 100, 240, 50, 150], '#a8323a', stroke('#d8b14a', 3)) +
      [6, 194]
        .map((y) =>
          [20, 50, 80, 110, 140, 170]
            .map((x) => line(x, y, x, y + (y < 100 ? -6 : 6), '#d8b14a', 2))
            .join(''),
        )
        .join(''),
    { w: 2, h: 3, layer: 'decor', tags: ['teppich', 'läufer'] },
  ),
  item(
    'furniture.spinning_wheel',
    WOOD,
    () =>
      circle(40, 50, 30, 'none', stroke(WOOD, 4)) +
      [0, 45, 90, 135]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          return line(
            40 - Math.cos(r) * 30,
            50 - Math.sin(r) * 30,
            40 + Math.cos(r) * 30,
            50 + Math.sin(r) * 30,
            WOOD,
            2,
          );
        })
        .join('') +
      rect(68, 40, 20, 20, WOOD_D, OUT()),
    { layer: 'decor', tags: ['spinnrad'] },
  ),
];

// ------------------------------------------------------------------ Licht & Feuer

const flame = (cx: number, cy: number, s: number) =>
  path(
    `M${cx} ${cy - 18 * s} C${cx + 12 * s} ${cy - 4 * s} ${cx + 12 * s} ${cy + 10 * s} ${cx} ${cy + 12 * s} C${cx - 12 * s} ${cy + 10 * s} ${cx - 12 * s} ${cy - 4 * s} ${cx} ${cy - 18 * s}z`,
    '#ff8a1f',
  ) +
  path(
    `M${cx} ${cy - 6 * s} C${cx + 6 * s} ${cy + 2 * s} ${cx + 5 * s} ${cy + 9 * s} ${cx} ${cy + 10 * s} C${cx - 5 * s} ${cy + 9 * s} ${cx - 6 * s} ${cy + 2 * s} ${cx} ${cy - 6 * s}z`,
    '#ffd23a',
  );

const glow = (cx: number, cy: number, r: number) =>
  circle(cx, cy, r, '#ffcf6a', 'opacity="0.25"') +
  circle(cx, cy, r * 0.6, '#ffcf6a', 'opacity="0.25"');

const light = (
  id: string,
  body: () => string,
  opts: { w?: number; props?: TerrainProps; tags?: string[]; layer?: ElementLayerId } = {},
) =>
  item(`light.${id}`, '#ff8a1f', body, {
    category: 'light',
    layer: opts.layer ?? 'decor',
    ...opts,
  });

export const lightElements: ElementDef[] = [
  light(
    'fireplace',
    () =>
      rect(4, 10, 192, 50, '#6d6a64', OUT('#2e2c2a', 3)) +
      rect(40, 10, 120, 36, '#1d1b19') +
      glow(100, 46, 50) +
      flame(80, 32, 0.9) +
      flame(110, 30, 1.1) +
      flame(130, 34, 0.8),
    { w: 2, layer: 'walls', props: { blocksMovement: true }, tags: ['kamin', 'feuer'] },
  ),
  light(
    'campfire',
    () =>
      glow(50, 50, 48) +
      [0, 72, 144, 216, 288]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          return circle(
            50 + Math.cos(r) * 26,
            50 + Math.sin(r) * 26,
            7,
            '#7a7672',
            stroke('#3a3835', 1.5),
          );
        })
        .join('') +
      line(36, 60, 64, 40, WOOD_D, 6) +
      line(36, 40, 64, 60, WOOD, 6) +
      flame(50, 50, 1),
    { props: { damage: 'fire' }, tags: ['lagerfeuer', 'feuer'] },
  ),
  light(
    'brazier',
    () =>
      glow(50, 50, 46) +
      circle(50, 50, 26, '#3a3f45', OUT('#141516', 3)) +
      circle(50, 50, 18, '#5a1a0c') +
      flame(50, 50, 0.9),
    {
      layer: 'walls',
      props: { blocksMovement: true, damage: 'fire' },
      tags: ['feuerschale', 'kohlebecken'],
    },
  ),
  light(
    'torch',
    () =>
      glow(50, 30, 34) +
      rect(46, 8, 8, 12, '#3a3f45') +
      line(50, 20, 50, 86, WOOD, 7) +
      flame(50, 26, 0.7),
    { tags: ['fackel', 'wandfackel'] },
  ),
  light(
    'candelabra',
    () =>
      glow(50, 50, 40) +
      circle(50, 50, 10, '#d4a830', OUT('#6b5110', 1.5)) +
      [0, 120, 240]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          const x = 50 + Math.cos(r) * 26;
          const y = 50 + Math.sin(r) * 26;
          return (
            line(50, 50, x, y, '#d4a830', 3) + circle(x, y, 6, '#efe9dc') + flame(x, y - 2, 0.35)
          );
        })
        .join(''),
    { tags: ['kerzenleuchter', 'kandelaber'] },
  ),
  light(
    'lantern',
    () =>
      glow(50, 50, 38) +
      rrect(36, 30, 28, 40, 4, '#ffd98a', OUT('#3a3f45', 3)) +
      line(36, 50, 64, 50, '#3a3f45', 2) +
      path('M42 30 Q50 18 58 30', 'none', stroke('#3a3f45', 3)),
    { tags: ['laterne'] },
  ),
  light(
    'candle',
    () =>
      glow(50, 50, 26) + circle(50, 54, 9, '#efe9dc', stroke('#b8b0a0', 1)) + flame(50, 46, 0.4),
    { tags: ['kerze'] },
  ),
];
