/**
 * Silhouetten für Kreaturen-Porträts (selbst gezeichnet, 100×100 Einheiten, Mitte 50/50).
 * `P` ist der helle Grundton der Figur, `I` die Tinte für Details; Umriss, Schattierung und
 * Schlagschatten ergänzt der gemeinsame Zeichenstil (svgDoc 'object').
 */
import { circle, ellipse, path, poly } from '../elements/svg';

export interface GlyphColors {
  /** Grundton der Figur. */
  P: string;
  /** Tinte (Details, Augen). */
  I: string;
  /** Akzent (Augenglühen, Flammen-Kern, Früchte …). */
  A: string;
}

export type GlyphId =
  | 'canine'
  | 'bear'
  | 'feline'
  | 'lion'
  | 'horse'
  | 'unicorn'
  | 'deer'
  | 'bull'
  | 'boar'
  | 'bird'
  | 'owl'
  | 'bat'
  | 'snake'
  | 'hydra'
  | 'spider'
  | 'insect'
  | 'scorpion'
  | 'fish'
  | 'octopus'
  | 'crab'
  | 'rodent'
  | 'lizard'
  | 'frog'
  | 'ape'
  | 'elephant'
  | 'dragon'
  | 'skull'
  | 'lich'
  | 'ghost'
  | 'claw'
  | 'vampire'
  | 'demon'
  | 'angel'
  | 'flame'
  | 'wave'
  | 'whirl'
  | 'boulder'
  | 'golem'
  | 'armor'
  | 'sword'
  | 'ooze'
  | 'mushroom'
  | 'tree'
  | 'plant'
  | 'eye'
  | 'fairy'
  | 'giant'
  | 'worm'
  | 'chest'
  | 'hood'
  | 'helm'
  | 'wizard'
  | 'priest'
  | 'noble'
  | 'goblin'
  | 'orc'
  | 'reptile'
  | 'fishfolk'
  | 'elf'
  | 'dwarf'
  | 'person';

const eye = (x: number, y: number, r: number, c: GlyphColors) => circle(x, y, r, c.I);
const glow = (x: number, y: number, r: number, c: GlyphColors) =>
  circle(x, y, r, c.A) + circle(x - r * 0.3, y - r * 0.3, r * 0.35, '#fff8e0');
const st = (c: string, w: number) =>
  `stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

/** Büste (Kopf + Schultern) als Grundlage der humanoiden Varianten. */
function bust(c: GlyphColors, skin = c.P, garb = c.P): string {
  return (
    path('M16 100 Q18 74 36 68 Q50 64 64 68 Q82 74 84 100 Z', garb) +
    path('M44 62 L56 62 L57 70 L43 70 Z', skin) +
    ellipse(50, 46, 15, 18, skin)
  );
}
const face = (c: GlyphColors, y = 46) =>
  eye(44, y, 1.8, c) +
  eye(56, y, 1.8, c) +
  path(`M46 ${y + 9} Q50 ${y + 11} 54 ${y + 9}`, 'none', st(c.I, 1.4));

const GLYPHS: Record<GlyphId, (c: GlyphColors) => string> = {
  canine: (c) =>
    path(
      'M10 62 L26 53 L34 45 L38 22 L48 37 L58 35 L68 20 L71 40 L81 50 L86 64 L78 79 L61 88 L46 85 L35 75 L22 73 L10 68 Z',
      c.P,
    ) +
    path('M38 22 L44 33 L48 37 Z M68 20 L66 34 L71 40 Z', c.I, 'opacity="0.35"') +
    path('M10 66 L24 69 L32 72', 'none', st(c.I, 1.6)) +
    eye(46, 52, 2.6, c) +
    circle(12, 64, 3.6, c.I),
  bear: (c) =>
    circle(28, 30, 10, c.P) +
    circle(72, 30, 10, c.P) +
    circle(28, 30, 4.5, c.I, 'opacity="0.35"') +
    circle(72, 30, 4.5, c.I, 'opacity="0.35"') +
    circle(50, 54, 30, c.P) +
    ellipse(50, 68, 14, 10, c.A) +
    ellipse(50, 63, 6, 4, c.I) +
    path('M50 67 L50 72 M44 74 Q50 78 56 74', 'none', st(c.I, 1.6)) +
    eye(39, 50, 2.8, c) +
    eye(61, 50, 2.8, c),
  feline: (c) =>
    path(
      'M22 42 L28 14 L42 30 Q50 28 58 30 L72 14 L78 42 Q86 58 76 72 Q66 86 50 86 Q34 86 24 72 Q14 58 22 42 Z',
      c.P,
    ) +
    path('M29 21 L38 31 L31 36 Z M71 21 L62 31 L69 36 Z', c.I, 'opacity="0.35"') +
    path('M35 52 Q40 47 45 52 Q40 55 35 52 Z M55 52 Q60 47 65 52 Q60 55 55 52 Z', c.A) +
    path('M39 50 L40 54 M61 50 L60 54', 'none', st(c.I, 1.5)) +
    path('M46 62 L54 62 L50 67 Z', c.I) +
    path(
      'M50 67 L50 72 M43 74 Q50 78 57 74 M30 66 L14 62 M30 70 L14 72 M70 66 L86 62 M70 70 L86 72',
      'none',
      st(c.I, 1.1),
    ),
  lion: (c) =>
    poly(
      Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2;
        const r = i % 2 ? 38 : 46;
        return [50 + Math.cos(a) * r, 54 + Math.sin(a) * r];
      }).flat(),
      c.A,
    ) + GLYPHS.feline(c),
  horse: (c) =>
    path(
      'M16 70 Q12 58 22 50 L38 32 Q42 20 50 16 L54 6 L59 17 Q72 22 78 38 Q84 58 80 92 L56 92 Q54 76 46 72 Q36 74 28 78 Q18 78 16 70 Z',
      c.P,
    ) +
    path('M58 17 Q76 26 80 50 Q84 70 82 92 L90 92 Q92 60 84 36 Q76 18 60 14 Z', c.A) +
    eye(44, 40, 2.6, c) +
    circle(21, 66, 2.2, c.I) +
    path('M18 72 Q26 74 30 70', 'none', st(c.I, 1.4)),
  unicorn: (c) =>
    GLYPHS.horse(c) +
    poly([46, 26, 30, 2, 40, 28], c.A) +
    path('M34 12 L42 14 M37 19 L44 21', 'none', st(c.I, 1)),
  deer: (c) =>
    path(
      'M40 24 L32 6 M36 14 L26 10 M34 12 L40 4 M60 24 L68 6 M64 14 L74 10 M66 12 L60 4',
      'none',
      st(c.P, 4.5),
    ) +
    path(
      'M30 30 L42 34 Q50 30 58 34 L70 30 L64 42 Q66 60 58 78 Q54 88 50 88 Q46 88 42 78 Q34 60 36 42 Z',
      c.P,
    ) +
    eye(43, 50, 2.4, c) +
    eye(57, 50, 2.4, c) +
    ellipse(50, 84, 4, 3, c.I),
  bull: (c) =>
    path('M28 36 Q8 34 6 14 Q16 28 34 28 Z M72 36 Q92 34 94 14 Q84 28 66 28 Z', c.A) +
    path('M28 30 Q50 22 72 30 Q78 50 68 70 Q62 86 50 86 Q38 86 32 70 Q22 50 28 30 Z', c.P) +
    ellipse(50, 74, 13, 9, c.A) +
    eye(41, 48, 2.6, c) +
    eye(59, 48, 2.6, c) +
    ellipse(45, 74, 2.2, 3, c.I) +
    ellipse(55, 74, 2.2, 3, c.I),
  boar: (c) =>
    path(
      'M12 58 Q18 42 36 40 L42 26 L52 38 Q70 36 84 48 Q90 62 82 76 Q68 86 44 80 Q28 78 20 72 L12 70 Z',
      c.P,
    ) +
    path('M38 40 L48 30 L58 40 L66 32 L74 44', 'none', st(c.I, 2)) +
    ellipse(13, 64, 4, 7, c.A) +
    path('M24 72 Q20 60 30 58', 'none', st('#f6efe0', 4)) +
    eye(40, 52, 2.4, c),
  bird: (c) =>
    path(
      'M50 40 Q30 18 4 24 Q18 32 16 40 Q28 40 30 46 Q38 46 42 54 L45 72 L38 88 L50 80 L62 88 L55 72 L58 54 Q62 46 70 46 Q72 40 84 40 Q82 32 96 24 Q70 18 50 40 Z',
      c.P,
    ) +
    path(
      'M14 30 Q26 32 32 40 M86 30 Q74 32 68 40 M20 38 Q30 40 34 46 M80 38 Q70 40 66 46',
      'none',
      st(c.I, 1.2),
    ) +
    circle(50, 34, 8, c.P) +
    poly([46, 36, 54, 36, 50, 46], c.A) +
    eye(46.5, 32, 1.6, c) +
    eye(53.5, 32, 1.6, c),
  owl: (c) =>
    path(
      'M28 30 L34 12 L44 24 Q50 22 56 24 L66 12 L72 30 Q84 50 76 74 Q66 92 50 92 Q34 92 24 74 Q16 50 28 30 Z',
      c.P,
    ) +
    circle(40, 44, 10, c.A) +
    circle(60, 44, 10, c.A) +
    eye(40, 44, 4.5, c) +
    eye(60, 44, 4.5, c) +
    poly([46, 54, 54, 54, 50, 63], c.I) +
    path('M36 70 L40 74 L44 70 M48 76 L52 80 L56 76 M56 70 L60 74 L64 70', 'none', st(c.I, 1.2)),
  bat: (c) =>
    path(
      'M50 46 Q40 28 24 32 Q22 40 12 40 Q14 48 4 52 Q20 52 26 62 Q32 56 40 60 L50 70 L60 60 Q68 56 74 62 Q80 52 96 52 Q86 48 88 40 Q78 40 76 32 Q60 28 50 46 Z',
      c.P,
    ) +
    path('M43 40 L42 28 L48 36 Z M57 40 L58 28 L52 36 Z', c.P) +
    path('M24 34 L26 60 M76 34 L74 60 M14 44 L28 58 M86 44 L72 58', 'none', st(c.I, 1)) +
    glow(46, 46, 1.8, c) +
    glow(54, 46, 1.8, c),
  snake: (c) =>
    path('M24 84 Q74 90 74 70 Q74 52 50 52 Q28 52 30 36 Q32 20 56 20 L70 24', 'none', st(c.P, 13)) +
    path(
      'M24 84 Q74 90 74 70 Q74 52 50 52 Q28 52 30 36 Q32 20 56 20',
      'none',
      `stroke="${c.I}" stroke-width="1.2" stroke-dasharray="3 5"`,
    ) +
    ellipse(74, 24, 11, 8, c.P) +
    eye(77, 21, 1.8, c) +
    path('M84 26 L92 26 M92 26 L96 23 M92 26 L96 29', 'none', st(c.A, 1.5)),
  hydra: (c) =>
    [26, 50, 74]
      .map(
        (x, i) =>
          path(`M50 92 Q${x} 70 ${x} ${30 + (i % 2) * -8}`, 'none', st(c.P, 10)) +
          ellipse(x, 26 + (i % 2) * -8, 8, 6, c.P) +
          eye(x + 3, 24 + (i % 2) * -8, 1.5, c),
      )
      .join('') + ellipse(50, 90, 22, 10, c.P),
  spider: (c) =>
    [
      [-1, 40, 18, 20],
      [-1, 48, 10, 40],
      [-1, 58, 10, 62],
      [-1, 64, 18, 86],
      [1, 40, 82, 20],
      [1, 48, 90, 40],
      [1, 58, 90, 62],
      [1, 64, 82, 86],
    ]
      .map(([s = 1, y = 0, ex = 0, ey = 0]) =>
        path(`M50 ${y} Q${50 + s * 22} ${y - 16} ${ex} ${ey}`, 'none', st(c.P, 4)),
      )
      .join('') +
    ellipse(50, 64, 15, 18, c.P) +
    circle(50, 40, 10, c.P) +
    path('M46 58 L50 66 L54 58 M44 70 L56 70', 'none', st(c.A, 2)) +
    glow(46, 38, 1.8, c) +
    glow(54, 38, 1.8, c) +
    eye(48, 44, 1, c) +
    eye(52, 44, 1, c),
  insect: (c) =>
    path('M40 26 Q36 12 28 10 M60 26 Q64 12 72 10', 'none', st(c.P, 2.5)) +
    [34, 50, 66]
      .map((y) =>
        path(
          `M40 ${y} L22 ${y - 6} L16 ${y + 4} M60 ${y} L78 ${y - 6} L84 ${y + 4}`,
          'none',
          st(c.P, 3),
        ),
      )
      .join('') +
    ellipse(50, 30, 10, 8, c.P) +
    ellipse(50, 60, 16, 26, c.P) +
    path('M50 36 L50 86', 'none', st(c.I, 1.6)) +
    path('M36 46 Q50 52 64 46 M36 60 Q50 66 64 60 M38 74 Q50 80 62 74', 'none', st(c.I, 1)) +
    eye(45, 28, 2.2, c) +
    eye(55, 28, 2.2, c),
  scorpion: (c) =>
    path('M50 70 Q50 92 70 90 Q90 86 86 64 Q84 50 74 52', 'none', st(c.P, 7)) +
    poly([72, 44, 80, 50, 70, 56], c.A) +
    path('M40 46 L22 28 M60 46 L42 26', 'none', st(c.P, 5)) +
    ellipse(20, 24, 8, 6, c.P) +
    ellipse(40, 22, 8, 6, c.P) +
    ellipse(50, 58, 13, 18, c.P) +
    [50, 58, 66]
      .map((y) => path(`M38 ${y} L24 ${y + 6} M62 ${y} L76 ${y + 6}`, 'none', st(c.P, 3)))
      .join('') +
    eye(46, 46, 1.6, c) +
    eye(54, 46, 1.6, c),
  fish: (c) =>
    path('M8 52 Q30 24 64 34 L84 18 L80 50 L92 80 L66 64 Q34 78 8 52 Z', c.P) +
    poly([40, 34, 50, 16, 56, 34], c.P) +
    path('M58 38 Q54 50 58 62 M20 56 L32 56 L28 60', 'none', st(c.I, 1.4)) +
    eye(22, 48, 2.6, c),
  octopus: (c) =>
    [16, 28, 40, 60, 72, 84]
      .map((x, i) =>
        path(`M${40 + i * 4} 56 Q${x} 76 ${x + (i < 3 ? -6 : 6)} 90`, 'none', st(c.P, 7)),
      )
      .join('') +
    path('M24 50 Q22 14 50 12 Q78 14 76 50 Q74 64 50 64 Q26 64 24 50 Z', c.P) +
    circle(40, 44, 5, c.A) +
    circle(60, 44, 5, c.A) +
    eye(40, 45, 2.4, c) +
    eye(60, 45, 2.4, c),
  crab: (c) =>
    [44, 54, 62]
      .map((y) => path(`M36 ${y} L16 ${y + 10} M64 ${y} L84 ${y + 10}`, 'none', st(c.P, 4)))
      .join('') +
    path('M32 44 L20 30 M68 44 L80 30', 'none', st(c.P, 5)) +
    path('M12 22 Q20 10 30 20 L22 28 Z M88 22 Q80 10 70 20 L78 28 Z', c.P) +
    ellipse(50, 54, 24, 16, c.P) +
    path('M44 40 L42 32 M56 40 L58 32', 'none', st(c.P, 2.5)) +
    eye(42, 31, 2.2, c) +
    eye(58, 31, 2.2, c) +
    path('M38 58 Q50 64 62 58', 'none', st(c.I, 1.2)),
  rodent: (c) =>
    path('M62 70 Q86 76 92 92', 'none', st(c.A, 3)) +
    path('M12 58 Q16 46 30 42 Q46 36 62 44 Q78 52 74 70 Q66 82 44 78 Q28 76 20 66 Z', c.P) +
    circle(40, 36, 9, c.P) +
    circle(40, 36, 4.5, c.A) +
    eye(28, 50, 2.2, c) +
    circle(13, 58, 2.6, c.I) +
    path('M18 60 L6 56 M18 62 L6 64', 'none', st(c.I, 0.9)),
  lizard: (c) =>
    path('M50 70 Q54 88 72 92 Q84 94 90 86', 'none', st(c.P, 6)) +
    path('M38 36 L22 26 M62 36 L78 26 M40 64 L24 76 M60 64 L76 76', 'none', st(c.P, 5)) +
    ellipse(50, 50, 13, 22, c.P) +
    ellipse(50, 22, 9, 11, c.P) +
    path('M50 34 L50 66', 'none', `stroke="${c.I}" stroke-width="1.2" stroke-dasharray="2 4"`) +
    eye(45, 18, 1.8, c) +
    eye(55, 18, 1.8, c),
  frog: (c) =>
    path('M24 70 Q10 74 12 88 L28 84 M76 70 Q90 74 88 88 L72 84', 'none', st(c.P, 6)) +
    ellipse(50, 60, 28, 22, c.P) +
    circle(36, 40, 10, c.P) +
    circle(64, 40, 10, c.P) +
    circle(36, 40, 5, c.A) +
    circle(64, 40, 5, c.A) +
    eye(36, 40, 2.6, c) +
    eye(64, 40, 2.6, c) +
    path('M34 64 Q50 72 66 64', 'none', st(c.I, 1.6)),
  ape: (c) =>
    circle(22, 48, 8, c.P) +
    circle(78, 48, 8, c.P) +
    path('M24 40 Q26 14 50 14 Q74 14 76 40 Q80 70 66 82 Q50 92 34 82 Q20 70 24 40 Z', c.P) +
    path('M32 52 Q32 38 50 38 Q68 38 68 52 Q72 72 50 78 Q28 72 32 52 Z', c.A) +
    path('M34 40 Q50 32 66 40', 'none', st(c.I, 2.4)) +
    eye(42, 46, 2.4, c) +
    eye(58, 46, 2.4, c) +
    ellipse(46, 60, 2, 1.6, c.I) +
    ellipse(54, 60, 2, 1.6, c.I) +
    path('M42 70 Q50 74 58 70', 'none', st(c.I, 1.4)),
  elephant: (c) =>
    path('M30 34 Q6 30 8 56 Q10 74 30 68 Z M70 34 Q94 30 92 56 Q90 74 70 68 Z', c.A) +
    path(
      'M30 30 Q50 18 70 30 Q76 50 64 62 L58 66 L58 88 Q50 96 44 86 L42 66 L36 62 Q24 50 30 30 Z',
      c.P,
    ) +
    path('M40 66 Q34 76 38 80 M60 66 Q66 76 62 80', 'none', st('#f6efe0', 3)) +
    eye(40, 44, 2.2, c) +
    eye(60, 44, 2.2, c),
  dragon: (c) =>
    path('M54 30 L64 4 L66 28 Z M68 36 L88 16 L80 40 Z', c.A) +
    path(
      'M6 58 L22 50 Q34 40 48 34 Q66 28 78 40 Q90 52 86 70 L74 90 L56 82 Q46 74 36 74 L28 72 L20 76 L8 68 Z',
      c.P,
    ) +
    path('M28 64 L48 68 L36 74', 'none', st(c.I, 1.6)) +
    path('M14 58 L16 62 L20 58 M24 60 L26 64 L30 60', 'none', st('#f6efe0', 1.8)) +
    path('M76 46 L90 50 L82 56 L94 62 L84 66 L92 74', 'none', st(c.I, 1.2)) +
    path('M42 46 Q50 40 58 46 Q50 50 42 46 Z', c.A) +
    eye(50, 45.5, 1.8, c) +
    circle(10, 60, 1.8, c.I),
  skull: (c) =>
    path('M22 46 Q20 14 50 14 Q80 14 78 46 Q78 60 68 64 L66 78 L34 78 L32 64 Q22 60 22 46 Z', c.P) +
    path(
      'M30 46 Q32 36 42 38 Q46 46 40 54 Q30 56 30 46 Z M70 46 Q68 36 58 38 Q54 46 60 54 Q70 56 70 46 Z',
      c.I,
    ) +
    poly([50, 54, 45, 64, 55, 64], c.I) +
    path(
      'M38 70 L38 78 M44 70 L44 78 M50 70 L50 78 M56 70 L56 78 M62 70 L62 78',
      'none',
      st(c.I, 1.4),
    ) +
    glow(37, 46, 1.6, c) +
    glow(63, 46, 1.6, c),
  lich: (c) =>
    poly([24, 26, 30, 4, 40, 18, 50, 2, 60, 18, 70, 4, 76, 26], c.A) +
    circle(50, 12, 3, '#9b2bd6') +
    GLYPHS.skull(c),
  ghost: (c) =>
    path(
      'M22 92 L22 44 Q22 10 50 10 Q78 10 78 44 L78 92 L69 82 L60 92 L50 82 L40 92 L31 82 Z',
      c.P,
      'opacity="0.92"',
    ) +
    path('M10 54 Q18 46 24 52 M90 54 Q82 46 76 52', 'none', st(c.P, 5)) +
    ellipse(40, 40, 6, 9, c.I) +
    ellipse(60, 40, 6, 9, c.I) +
    ellipse(50, 62, 6, 9, c.I) +
    glow(40, 40, 1.8, c) +
    glow(60, 40, 1.8, c),
  claw: (c) =>
    path(
      'M30 96 L34 62 L24 40 Q22 32 30 34 L38 50 L36 24 Q36 16 43 18 L46 44 L48 14 Q50 8 56 12 L56 44 L60 20 Q64 14 68 20 L64 50 L72 38 Q78 34 78 42 L68 66 L66 96 Z',
      c.P,
    ) +
    path(
      'M24 40 L20 34 M36 24 L34 16 M48 14 L48 6 M60 20 L62 12 M78 42 L84 38',
      'none',
      st(c.I, 2.2),
    ) +
    path('M40 70 L60 72 M38 80 L62 84', 'none', st(c.I, 1.2)) +
    path('M44 56 L50 62 L56 56', 'none', st(c.A, 2)),
  vampire: (c) =>
    path('M10 100 L18 56 L34 66 L50 92 L66 66 L82 56 L90 100 Z', c.A) +
    bust(c, c.P, c.I) +
    path('M35 40 Q38 22 50 24 Q62 22 65 40 L50 32 Z', c.I) +
    path('M38 44 L46 46 M62 44 L54 46', 'none', st(c.I, 1.8)) +
    glow(42, 48, 1.6, c) +
    glow(58, 48, 1.6, c) +
    path('M44 56 Q50 60 56 56', 'none', st(c.I, 1.4)) +
    poly([45, 57, 47, 57, 46, 61], '#fff') +
    poly([53, 57, 55, 57, 54, 61], '#fff'),
  demon: (c) =>
    path('M30 36 Q12 30 14 6 Q24 24 38 28 Z M70 36 Q88 30 86 6 Q76 24 62 28 Z', c.A) +
    path('M28 32 Q50 20 72 32 Q80 54 68 74 Q60 88 50 88 Q40 88 32 74 Q20 54 28 32 Z', c.P) +
    path('M34 44 L46 50 M66 44 L54 50', 'none', st(c.I, 2.4)) +
    glow(41, 52, 2.4, c) +
    glow(59, 52, 2.4, c) +
    path('M38 70 Q50 64 62 70 Q50 78 38 70 Z', c.I) +
    poly([42, 68, 45, 68, 43.5, 74], '#fff') +
    poly([55, 68, 58, 68, 56.5, 74], '#fff'),
  angel: (c) =>
    path(
      'M44 50 Q20 30 6 40 Q14 46 10 54 Q22 52 22 62 Q32 58 40 64 Z M56 50 Q80 30 94 40 Q86 46 90 54 Q78 52 78 62 Q68 58 60 64 Z',
      c.P,
    ) +
    path('M12 44 Q24 44 36 54 M88 44 Q76 44 64 54', 'none', st(c.I, 1)) +
    ellipse(50, 14, 14, 4.5, 'none', st(c.A, 3)) +
    path('M38 96 Q40 62 50 56 Q60 62 62 96 Z', c.P) +
    circle(50, 38, 11, c.P) +
    eye(46, 38, 1.4, c) +
    eye(54, 38, 1.4, c),
  flame: (c) =>
    path(
      'M50 96 Q16 92 20 62 Q22 44 36 30 Q34 46 42 50 Q38 26 56 6 Q56 30 68 40 Q72 32 70 24 Q88 44 82 70 Q78 94 50 96 Z',
      c.P,
    ) +
    path(
      'M50 92 Q30 88 34 68 Q36 56 46 48 Q46 62 52 64 Q54 52 62 46 Q72 64 66 80 Q62 92 50 92 Z',
      c.A,
    ) +
    eye(44, 74, 2.2, c) +
    eye(58, 74, 2.2, c),
  wave: (c) =>
    path(
      'M6 86 Q8 50 40 40 Q62 34 66 52 Q66 62 56 62 Q48 62 50 54 Q40 56 40 68 Q42 82 62 82 Q86 80 94 56 Q96 86 70 94 L10 94 Z',
      c.P,
    ) +
    path('M14 80 Q20 60 40 52 M70 88 Q86 82 90 70', 'none', st(c.A, 2.2)) +
    glow(58, 52, 2.2, c),
  whirl: (c) =>
    [0, 1, 2, 3]
      .map((i) =>
        path(
          `M${30 - i * 3} ${20 + i * 18} Q50 ${10 + i * 18} ${78 - i * 6} ${22 + i * 18}`,
          'none',
          st(i % 2 ? c.A : c.P, 9 - i),
        ),
      )
      .join('') +
    path('M50 74 Q46 86 54 94', 'none', st(c.P, 4)) +
    glow(44, 34, 2, c) +
    glow(58, 34, 2, c),
  boulder: (c) =>
    poly([18, 70, 14, 42, 30, 20, 56, 14, 78, 26, 88, 52, 80, 78, 54, 90, 30, 86], c.P) +
    path(
      'M30 20 L40 44 L14 42 M56 14 L60 40 L88 52 M40 44 L60 40 L66 66 L80 78 M40 44 L36 70 L18 70 M36 70 L54 90 M66 66 L54 90',
      'none',
      st(c.I, 1.4),
    ) +
    glow(46, 54, 2.2, c) +
    glow(58, 52, 2.2, c),
  golem: (c) =>
    path('M24 96 L24 70 Q24 62 34 62 L66 62 Q76 62 76 70 L76 96 Z', c.P) +
    path('M30 20 L70 20 L74 56 L26 56 Z', c.P) +
    path('M24 70 L76 70 M50 62 L50 96 M30 20 L26 56 M70 20 L74 56', 'none', st(c.I, 1.2)) +
    path('M34 34 L46 34 L46 40 L34 40 Z M54 34 L66 34 L66 40 L54 40 Z', c.A) +
    path('M38 48 L62 48', 'none', st(c.I, 2.4)) +
    circle(30, 26, 1.6, c.I) +
    circle(70, 26, 1.6, c.I) +
    circle(30, 51, 1.6, c.I) +
    circle(70, 51, 1.6, c.I),
  armor: (c) =>
    path('M14 98 Q14 72 32 66 L68 66 Q86 72 86 98 Z', c.P) +
    path('M30 52 Q28 16 50 12 Q72 16 70 52 Q60 62 50 62 Q40 62 30 52 Z', c.P) +
    path('M50 12 L50 62 M34 40 L66 40', 'none', st(c.I, 1.6)) +
    path('M36 34 L64 34 L64 38 L36 38 Z', c.I) +
    glow(44, 36, 1.4, c) +
    glow(56, 36, 1.4, c) +
    path('M32 66 Q50 76 68 66 M50 70 L50 98', 'none', st(c.I, 1.4)),
  sword: (c) =>
    poly([46, 70, 46, 14, 50, 4, 54, 14, 54, 70], c.P) +
    path('M50 10 L50 66', 'none', st(c.I, 1)) +
    path('M30 70 L70 70 L70 76 L30 76 Z', c.A) +
    path('M46 76 L54 76 L54 90 L46 90 Z', c.I) +
    circle(50, 94, 4, c.A) +
    path('M24 30 Q30 34 28 40 M76 50 Q70 54 72 60', 'none', st(c.A, 1.6)),
  ooze: (c) =>
    path(
      'M10 86 Q10 64 22 56 Q24 30 46 28 Q56 12 70 26 Q90 34 86 60 Q94 72 90 86 Z',
      c.P,
      'opacity="0.95"',
    ) +
    circle(36, 50, 5, c.A, 'opacity="0.7"') +
    circle(64, 44, 3.5, c.A, 'opacity="0.7"') +
    circle(58, 66, 6, c.A, 'opacity="0.6"') +
    circle(28, 72, 3, c.A, 'opacity="0.6"') +
    path('M24 86 L24 94 M54 86 Q54 96 58 96', 'none', st(c.P, 4)) +
    eye(44, 56, 2.4, c) +
    eye(58, 54, 2.4, c),
  mushroom: (c) =>
    path('M40 54 L36 92 L64 92 L60 54 Z', c.P) +
    path('M8 56 Q10 16 50 12 Q90 16 92 56 Q70 50 50 52 Q30 50 8 56 Z', c.A) +
    circle(30, 34, 5, c.P) +
    circle(52, 24, 6, c.P) +
    circle(70, 38, 4, c.P) +
    path('M40 62 Q50 66 60 62', 'none', st(c.I, 1.2)),
  tree: (c) =>
    path('M40 96 L44 60 L30 44 M56 96 L54 60 L70 42', 'none', st(c.A, 9)) +
    circle(30, 38, 18, c.P) +
    circle(52, 24, 20, c.P) +
    circle(72, 40, 17, c.P) +
    circle(50, 46, 16, c.P) +
    path('M44 66 Q48 62 52 66', 'none', st(c.I, 1.6)) +
    glow(44, 58, 1.8, c) +
    glow(54, 58, 1.8, c),
  plant: (c) =>
    path('M50 96 Q48 70 50 50', 'none', st(c.A, 5)) +
    path('M50 70 Q20 76 12 50 Q36 44 50 66 Z M50 62 Q80 68 88 42 Q64 36 50 58 Z', c.P) +
    path('M50 50 Q30 40 34 14 Q52 22 50 50 Z M50 50 Q70 40 66 14 Q48 22 50 50 Z', c.P) +
    path('M20 52 Q34 56 46 64 M80 44 Q66 48 54 58', 'none', st(c.I, 1.2)) +
    circle(50, 46, 6, c.A),
  eye: (c) =>
    [0, 1, 2, 3, 4, 5]
      .map((i) => {
        const a = Math.PI * (1.1 + i * 0.16);
        return path(
          `M50 50 Q${50 + Math.cos(a) * 30} ${50 + Math.sin(a) * 30} ${50 + Math.cos(a) * 44} ${50 + Math.sin(a) * 44}`,
          'none',
          st(c.P, 4),
        );
      })
      .join('') +
    path('M14 72 Q24 92 40 84 M86 72 Q76 92 60 84', 'none', st(c.P, 5)) +
    circle(50, 56, 26, c.P) +
    ellipse(50, 56, 18, 13, '#f6efe0') +
    circle(50, 56, 9, c.A) +
    circle(50, 56, 4.5, c.I) +
    circle(47, 53, 2, '#fff'),
  fairy: (c) =>
    path(
      'M48 50 Q22 18 12 36 Q14 52 46 56 Z M52 50 Q78 18 88 36 Q86 52 54 56 Z',
      c.A,
      'opacity="0.85"',
    ) +
    path(
      'M46 58 Q24 64 22 82 Q36 84 48 62 Z M54 58 Q76 64 78 82 Q64 84 52 62 Z',
      c.A,
      'opacity="0.75"',
    ) +
    path('M24 32 Q34 40 46 52 M76 32 Q66 40 54 52', 'none', st(c.I, 0.9)) +
    path('M44 92 Q44 64 50 58 Q56 64 56 92 Z', c.P) +
    circle(50, 46, 8, c.P) +
    path('M42 44 Q50 34 58 44', 'none', st('#5e8d3a', 3)) +
    eye(47, 47, 1.2, c) +
    eye(53, 47, 1.2, c) +
    circle(30, 20, 1.6, c.A) +
    circle(72, 16, 1.4, c.A) +
    circle(80, 70, 1.6, c.A),
  giant: (c) =>
    path('M14 100 Q14 70 34 66 L66 66 Q86 70 86 100 Z', c.A) +
    path('M24 40 Q24 10 50 10 Q76 10 76 40 Q78 58 70 66 L30 66 Q22 58 24 40 Z', c.P) +
    path('M30 54 Q36 86 50 92 Q64 86 70 54 Q60 62 50 60 Q40 62 30 54 Z', c.A) +
    path('M32 34 L44 38 M68 34 L56 38', 'none', st(c.I, 3)) +
    eye(39, 42, 2.4, c) +
    eye(61, 42, 2.4, c) +
    path('M46 50 L50 44 L54 50', 'none', st(c.I, 1.6)) +
    path('M42 64 Q50 60 58 64', 'none', st(c.I, 1.8)),
  worm: (c) =>
    path('M80 96 Q86 70 70 58 Q56 48 58 30', 'none', st(c.P, 26)) +
    [70, 62, 52, 42]
      .map((y, i) =>
        path(
          `M${56 + i * 4} ${y + 18} Q${68 + i * 2} ${y + 12} ${82 - i * 4} ${y + 22}`,
          'none',
          st(c.I, 1.2),
        ),
      )
      .join('') +
    ellipse(56, 26, 18, 14, c.A) +
    ellipse(56, 26, 11, 8, c.I) +
    [0, 1, 2, 3, 4, 5, 6, 7]
      .map((i) => {
        const a = (i / 8) * Math.PI * 2;
        return poly(
          [
            56 + Math.cos(a) * 11,
            26 + Math.sin(a) * 8,
            56 + Math.cos(a + 0.25) * 6,
            26 + Math.sin(a + 0.25) * 4,
            56 + Math.cos(a - 0.25) * 6,
            26 + Math.sin(a - 0.25) * 4,
          ],
          '#fff',
        );
      })
      .join(''),
  chest: (c) =>
    path('M14 50 L86 50 L86 88 L14 88 Z', c.P) +
    path(
      'M14 50 Q14 22 50 22 Q86 22 86 50 L82 44 L74 52 L66 44 L58 52 L50 44 L42 52 L34 44 L26 52 L18 44 Z',
      c.P,
    ) +
    path(
      'M18 50 L26 58 L34 50 L42 58 L50 50 L58 58 L66 50 L74 58 L82 50',
      'none',
      st('#f6efe0', 2.2),
    ) +
    path('M14 66 L86 66 M30 50 L30 88 M70 50 L70 88', 'none', st(c.I, 1.4)) +
    path('M46 70 L54 70 L54 80 L46 80 Z', c.A) +
    glow(38, 36, 2.2, c) +
    glow(62, 36, 2.2, c),
  hood: (c) =>
    path('M14 100 Q16 70 32 62 L68 62 Q84 70 86 100 Z', c.P) +
    path('M24 70 Q22 26 50 14 Q78 26 76 70 Q64 60 50 60 Q36 60 24 70 Z', c.P) +
    path('M34 60 Q34 34 50 30 Q66 34 66 60 Q58 66 50 66 Q42 66 34 60 Z', c.I) +
    glow(44, 48, 1.6, c) +
    glow(56, 48, 1.6, c) +
    path('M50 66 L50 100', 'none', st(c.I, 1.2)),
  helm: (c) =>
    bust(c, c.P, c.A) +
    path('M33 46 Q32 22 50 20 Q68 22 67 46 L67 52 L33 52 Z', c.A) +
    path('M38 40 L62 40 L62 44 L38 44 Z', c.I) +
    path('M50 20 L50 40 M50 20 Q50 10 58 6', 'none', st(c.I, 1.6)) +
    path('M28 74 Q50 82 72 74', 'none', st(c.I, 1.4)),
  wizard: (c) =>
    bust(c, c.P, c.A) +
    path('M24 36 L76 36 Q66 30 60 26 L44 2 L40 26 Q32 30 24 36 Z', c.A) +
    path('M38 30 L62 30', 'none', st(c.I, 2)) +
    circle(46, 16, 1.6, '#fff4c2') +
    circle(52, 24, 1.2, '#fff4c2') +
    face(c, 46) +
    path('M38 56 Q50 80 62 56 Q56 62 50 62 Q44 62 38 56 Z', '#e9e4dc'),
  priest: (c) =>
    bust(c, c.P, c.A) +
    path('M38 32 L50 10 L62 32 Z', c.A) +
    path('M47 16 L53 16 M50 13 L50 26', 'none', st(c.I, 1.6)) +
    face(c, 46) +
    path('M44 74 L56 74 M50 70 L50 88', 'none', st('#f6d76a', 3)),
  noble: (c) =>
    bust(c, c.P, c.A) +
    poly([34, 32, 36, 18, 42, 26, 50, 14, 58, 26, 64, 18, 66, 32], '#e3b832') +
    circle(50, 22, 2, '#c2283c') +
    face(c, 46) +
    path('M36 70 Q50 64 64 70 L60 76 Q50 72 40 76 Z', '#f6efe0'),
  goblin: (c) =>
    bust(c, c.P, c.A) +
    path('M36 42 L8 30 L34 52 Z M64 42 L92 30 L66 52 Z', c.P) +
    path('M38 40 L46 44 M62 40 L54 44', 'none', st(c.I, 2)) +
    glow(43, 47, 1.8, c) +
    glow(57, 47, 1.8, c) +
    path('M42 58 Q50 54 58 58', 'none', st(c.I, 1.6)) +
    poly([44, 57, 46, 57, 45, 60], '#fff') +
    poly([54, 57, 56, 57, 55, 60], '#fff'),
  orc: (c) =>
    bust(c, c.P, c.A) +
    path('M35 40 L26 30 L36 46 Z M65 40 L74 30 L64 46 Z', c.P) +
    path('M37 40 L47 45 M63 40 L53 45', 'none', st(c.I, 2.6)) +
    eye(43, 47, 1.8, c) +
    eye(57, 47, 1.8, c) +
    path('M40 58 Q50 54 60 58', 'none', st(c.I, 1.8)) +
    poly([41, 59, 45, 59, 42, 50], '#f6efe0') +
    poly([55, 59, 59, 59, 58, 50], '#f6efe0'),
  reptile: (c) =>
    path('M16 100 Q18 74 36 68 Q50 64 64 68 Q82 74 84 100 Z', c.A) +
    path('M30 40 Q32 24 50 24 Q66 26 68 40 L86 50 Q86 60 70 62 L52 66 Q36 66 30 56 Z', c.P) +
    path('M36 24 L40 14 L46 24 M48 22 L52 12 L56 22', 'none', st(c.P, 3)) +
    path('M68 56 L84 54', 'none', st(c.I, 1.4)) +
    glow(52, 38, 2, c) +
    circle(82, 50, 1.4, c.I),
  fishfolk: (c) =>
    bust(c, c.P, c.A) +
    path('M38 30 L44 12 L50 26 L56 10 L62 30 Z', c.A) +
    path('M34 46 L22 40 L26 52 Z M66 46 L78 40 L74 52 Z', c.A) +
    glow(43, 46, 2, c) +
    glow(57, 46, 2, c) +
    path('M42 58 Q50 62 58 58', 'none', st(c.I, 1.4)) +
    path('M38 62 L42 64 M62 62 L58 64', 'none', st(c.I, 1)),
  elf: (c) =>
    bust(c, c.P, c.A) +
    path('M36 44 L20 30 L36 52 Z M64 44 L80 30 L64 52 Z', c.P) +
    path('M34 44 Q34 26 50 26 Q66 26 66 44 Q60 32 50 32 Q40 32 34 44 Z', '#f2f2f2') +
    face(c, 46),
  dwarf: (c) =>
    bust(c, c.P, c.A) +
    path('M34 38 Q34 24 50 24 Q66 24 66 38 Z', c.A) +
    path('M34 50 Q32 82 50 90 Q68 82 66 50 Q58 58 50 56 Q42 58 34 50 Z', c.A) +
    path('M42 64 L42 80 M50 62 L50 86 M58 64 L58 80', 'none', st(c.I, 1)) +
    eye(43, 44, 1.8, c) +
    eye(57, 44, 1.8, c),
  person: (c) =>
    bust(c, c.P, c.A) +
    path('M35 42 Q36 28 50 28 Q64 28 65 42 Q58 34 50 34 Q42 34 35 42 Z', c.I) +
    face(c, 46),
};

export function drawGlyph(id: GlyphId, colors: GlyphColors): string {
  return GLYPHS[id](colors);
}

export const GLYPH_IDS = Object.keys(GLYPHS) as GlyphId[];

/** Verkleinerte Kopie einer Silhouette (für Schwärme). */
export function miniGlyph(id: GlyphId, colors: GlyphColors, x: number, y: number, s: number) {
  return `<g transform="translate(${x} ${y}) scale(${s}) translate(-50 -50)">${GLYPHS[id](colors)}</g>`;
}
