/**
 * Standard-Porträts für Tokens: Für jede Kreatur (SRD, eigene, Spielercharaktere) entsteht aus
 * Name und Kreaturentyp ein eigenes, selbst erzeugtes Bild im Stil gedruckter Abenteuer-Tokens –
 * farbiger Grund je Typ (Drachen in ihrer Farbe), Silhouette mit Tuschumriss, Rahmenring.
 * Die Bilder entstehen deterministisch zur Laufzeit und werden nicht in Karten gespeichert;
 * ein eigenes Bild (Token oder Bibliothek) hat immer Vorrang.
 */
import { rngFrom } from '../../core/random';
import { shade, svgDoc } from '../elements/svg';
import { drawGlyph, miniGlyph, type GlyphColors, type GlyphId } from './glyphs';

export interface PortraitSubject {
  name: string;
  /** Kreaturentyp laut SRD ("beast", "undead", "swarm of Tiny beasts" …), falls bekannt. */
  type?: string;
  /** Art des Tokens: Spielercharaktere bekommen ein Heldenbild. */
  kind?: 'creature' | 'pc' | 'object';
}

/** Schlüsselwörter im (englischen oder deutschen) Namen → Silhouette. Reihenfolge zählt. */
const NAME_RULES: [RegExp, GlyphId][] = [
  [/\b(bat form)\b/i, 'bat'],
  [
    /\b(mist form|will-o'-wisp|ghost|specter|spectre|wraith|banshee|shadow|geist|gespenst)\b/i,
    'ghost',
  ],
  [/\blich\b/i, 'lich'],
  [/\b(skeleton|skelett|mummy|mumie|wight|dracolich|demilich)\b/i, 'skull'],
  [/\b(zombie|ghoul|ghast)\b/i, 'claw'],
  [/\bvampire?|vampir\b/i, 'vampire'],
  [/\b(werewolf|wererat|werebear|wereboar|weretiger)\b.*\bhuman form\b/i, 'hood'],
  [
    /\bwerewolf|wolf form|wolf|worg|jackal|hyena|gnoll|mastiff|hound|death dog|blink dog|dog|hund\b/i,
    'canine',
  ],
  [/\b(wererat|rat form|rat|ratte|weasel|badger|wiesel|dachs)\b/i, 'rodent'],
  [/\b(werebear|bear form|bear|bär|baer|owlbear)\b/i, 'bear'],
  [/\b(wereboar|boar form|boar|eber)\b/i, 'boar'],
  [/\b(lion|löwe|manticore|chimera|sphinx|lamia)\b/i, 'lion'],
  [/\b(weretiger|tiger form|tiger|panther|cat|katze|rakshasa|displacer)\b/i, 'feline'],
  [/\b(unicorn|einhorn)\b/i, 'unicorn'],
  [/\b(horse|pony|mule|camel|pegasus|nightmare|centaur|pferd|hippocampus|sea horse)\b/i, 'horse'],
  [/\b(deer|elk|hirsch|goat|ziege)\b/i, 'deer'],
  [/\b(minotaur|gorgon|bull|stier|rhinoceros|triceratops)\b/i, 'bull'],
  [/\b(elephant|mammoth|elefant)\b/i, 'elephant'],
  [/\b(owl|eule)\b/i, 'owl'],
  [
    /\b(eagle|hawk|raven|vulture|roc|griffon|hippogriff|harpy|cockatrice|axe beak|bird|vogel|adler|stirge|couatl)\b/i,
    'bird',
  ],
  [/\b(bat|fledermaus)\b/i, 'bat'],
  [/\b(hydra)\b/i, 'hydra'],
  [/\b(snake|naga|medusa|schlange|yuan-ti|serpent)\b/i, 'snake'],
  [/\b(spider|spinne|ettercap|drider)\b/i, 'spider'],
  [/\b(scorpion|skorpion)\b/i, 'scorpion'],
  [
    /\b(centipede|beetle|wasp|insect|ankheg|rust monster|carrion|käfer|wespe|bulette|remorhaz)\b/i,
    'insect',
  ],
  [/\b(octopus|kraken|darkmantle|krake|cloaker)\b/i, 'octopus'],
  [/\b(crab|krabbe|chuul)\b/i, 'crab'],
  [/\b(shark|quipper|whale|plesiosaurus|fish|fisch|hai)\b/i, 'fish'],
  [/\b(frog|toad|frosch|kröte)\b/i, 'frog'],
  [/\b(crocodile|lizard|basilisk|behir|salamander|tyrannosaurus|echse|krokodil)\b/i, 'lizard'],
  [/\b(ape|baboon|affe|yeti|sasquatch)\b/i, 'ape'],
  [/\b(dragon|drache|wyrmling|wyvern|pseudodragon|tarrasque)\b/i, 'dragon'],
  [/\b(purple worm|worm|wurm)\b/i, 'worm'],
  [/\b(mimic|mimik)\b/i, 'chest'],
  [/\b(flying sword|sword|schwert)\b/i, 'sword'],
  [/\b(animated armor|armor|rüstung|helmed horror)\b/i, 'armor'],
  [/\b(golem|shield guardian|homunculus|rug of smothering)\b/i, 'golem'],
  // Riesen vor den Elementen („Fire Giant“), aber nach den Tieren („Giant Ape“)
  [/\b(giant|ogre|troll|ettin|cyclops|riese|oger|oni)\b/i, 'giant'],
  [/\b(fire|flame|magma|magmin|azer|efreeti|feuer)\b/i, 'flame'],
  [/\b(water|steam|ice mephit|wasser)\b/i, 'wave'],
  [/\b(air|djinni|invisible stalker|dust|luft)\b/i, 'whirl'],
  [/\b(earth|xorn|gargoyle|galeb|erde)\b/i, 'boulder'],
  [/\b(ooze|pudding|jelly|cube|schleim)\b/i, 'ooze'],
  [/\b(shrieker|fungus|pilz|myconid)\b/i, 'mushroom'],
  [/\b(treant|tree|baum|blight)\b/i, 'tree'],
  [/\b(shrub|shambling|vine|plant|pflanze)\b/i, 'plant'],
  [/\b(aboleth|beholder|gibbering|otyugh|roper|grick|eye|auge|gazer)\b/i, 'eye'],
  [/\b(sprite|pixie|dryad|fairy|fee|nymph)\b/i, 'fairy'],
  [
    /\b(devil|demon|fiend|imp|quasit|balor|pit fiend|dretch|vrock|hezrou|glabrezu|nalfeshnee|marilith|erinyes|lemure|succubus|incubus|satyr|teufel|dämon|mephit)\b/i,
    'demon',
  ],
  [/\b(deva|planetar|solar|angel|engel)\b/i, 'angel'],
  [
    // (?:in)? – deutsche weibliche Formen („Magierin“, „Kriegerin“)
    /\b(hag|vettel|cultist|assassin|spy|thug|bandit|druid|doppelganger|kultist|meuchel|spion)(?:in)?\b/i,
    'hood',
  ],
  [
    /\b(guard|knight|veteran|gladiator|soldier|berserker|scout|warrior|captain|wache|ritter|krieger|söldner)(?:in)?\b/i,
    'helm',
  ],
  [/\b(mage|archmage|wizard|sorcerer|warlock|magier|zauberer|hexenmeister)(?:in)?\b/i, 'wizard'],
  [/\b(priest|acolyte|fanatic|cleric|priester|akolyth|kleriker)(?:in)?\b/i, 'priest'],
  [/\b(noble|king|queen|prince|adlig|könig|fürst)(?:in)?\b/i, 'noble'],
  [/\b(goblin|hobgoblin|bugbear|grimlock|grottenschrat)\b/i, 'goblin'],
  [/\b(orc|ork|half-orc)\b/i, 'orc'],
  [/\b(kobold|lizardfolk|echsenmensch|dragonborn)\b/i, 'reptile'],
  [/\b(merfolk|merrow|sahuagin|kuo-toa|meermensch)\b/i, 'fishfolk'],
  [/\b(drow|elf|elfe|eladrin)\b/i, 'elf'],
  [/\b(duergar|dwarf|zwerg|gnome|gnom|svirfneblin)\b/i, 'dwarf'],
];

const TYPE_GLYPH: Record<string, GlyphId> = {
  aberration: 'eye',
  beast: 'canine',
  celestial: 'angel',
  construct: 'golem',
  dragon: 'dragon',
  elemental: 'whirl',
  fey: 'fairy',
  fiend: 'demon',
  giant: 'giant',
  humanoid: 'person',
  monstrosity: 'lion',
  ooze: 'ooze',
  plant: 'plant',
  undead: 'skull',
};

/** Grundfarben (innen, außen) je Kreaturentyp. */
const TYPE_PALETTE: Record<string, [string, string]> = {
  aberration: ['#7a4aa0', '#24102f'],
  beast: ['#6f8a3e', '#1f2c12'],
  celestial: ['#e9cf7a', '#7a5a14'],
  construct: ['#8e939b', '#2a2d31'],
  dragon: ['#9a2d22', '#2a0b08'],
  elemental: ['#4f8fb0', '#142a36'],
  fey: ['#4fa58a', '#123329'],
  fiend: ['#a8281e', '#2a0605'],
  giant: ['#8f6c48', '#2c2014'],
  humanoid: ['#b08d62', '#36281a'],
  monstrosity: ['#9a6a34', '#2a1a0a'],
  ooze: ['#86b23e', '#22340e'],
  plant: ['#5a9a3c', '#14300e'],
  undead: ['#6f8476', '#151e19'],
  swarm: ['#7a6a48', '#221a0e'],
  pc: ['#3f6fb0', '#0f1f36'],
};

const DRAGON_COLORS: [RegExp, string][] = [
  [/\bred|rot/i, '#b3261e'],
  [/\bblue|blau/i, '#2a5fb3'],
  [/\bgreen|grün/i, '#2f7d3a'],
  [/\bblack|schwarz/i, '#3a3a46'],
  [/\bwhite|weiß|weiss/i, '#c9d8e6'],
  [/\bgold/i, '#d4a72c'],
  [/\bsilver|silber/i, '#aab6c0'],
  [/\bbronze/i, '#a0682a'],
  [/\bbrass|messing/i, '#c8a24a'],
  [/\bcopper|kupfer/i, '#b0603a'],
];

const ELEMENT_COLORS: Partial<Record<GlyphId, string>> = {
  flame: '#d9622b',
  wave: '#2f78a8',
  whirl: '#8fb3c6',
  boulder: '#7a6248',
};

const SWARM_OF: [RegExp, GlyphId][] = [
  [/bat/i, 'bat'],
  [/rat/i, 'rodent'],
  [/raven|bird/i, 'bird'],
  [/spider/i, 'spider'],
  [/snake/i, 'snake'],
  [/quipper|fish/i, 'fish'],
];

/** Name ohne laufende Nummer („Goblin 3“ → „Goblin“) – gleiche Kreaturen, gleiches Porträt. */
export function baseName(name: string): string {
  return name.replace(/\s+\d+$/, '').trim() || name;
}

const urlCache = new Map<string, string>();

/** Porträt als Data-URL (für <img> in der Oberfläche), zwischengespeichert. */
export function portraitUrl(s: PortraitSubject): string {
  const key = `${s.kind ?? ''}|${s.type ?? ''}|${s.name}`;
  let url = urlCache.get(key);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(portraitSvg(s))}`;
    urlCache.set(key, url);
  }
  return url;
}

/** Normierter Typ ("swarm of Tiny beasts" → "swarm"). */
export function typeKey(type: string | undefined): string {
  const t = (type ?? '').toLowerCase();
  if (t.startsWith('swarm')) return 'swarm';
  return t.split(/[\s(]/)[0] ?? '';
}

/** Welche Silhouette ein Wesen bekommt (für Tests und Vorschau). */
export function glyphFor(s: PortraitSubject): GlyphId {
  if (s.kind === 'pc') {
    for (const [re, g] of NAME_RULES) if (re.test(s.name)) return g;
    return 'helm';
  }
  const type = typeKey(s.type);
  if (type === 'swarm') {
    for (const [re, g] of SWARM_OF) if (re.test(s.name)) return g;
    return 'insect';
  }
  for (const [re, g] of NAME_RULES) if (re.test(s.name)) return g;
  return TYPE_GLYPH[type] ?? (s.kind === 'object' ? 'chest' : 'person');
}

function luminance(hex: string): number {
  const v = Number.parseInt(hex.slice(1), 16);
  return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
}

function paletteFor(s: PortraitSubject, glyph: GlyphId): [string, string] {
  const type = s.kind === 'pc' ? 'pc' : typeKey(s.type);
  if (glyph === 'dragon' || type === 'dragon') {
    const hit = DRAGON_COLORS.find(([re]) => re.test(s.name));
    if (hit) return [hit[1], shade(hit[1], -0.78)];
  }
  const el = ELEMENT_COLORS[glyph];
  if (el && (type === 'elemental' || !type)) return [el, shade(el, -0.78)];
  return TYPE_PALETTE[type] ?? TYPE_PALETTE.humanoid ?? ['#b08d62', '#36281a'];
}

/**
 * SVG des Porträts (quadratisch, 2×2 „Felder“ = 256 px). Der Token-Layer schneidet kreisförmig
 * aus und zeichnet den Teamring darüber.
 */
export function portraitSvg(s: PortraitSubject): string {
  const glyph = glyphFor(s);
  const [inner, outer] = paletteFor(s, glyph);
  const rng = rngFrom(`portrait:${s.name}:${s.type ?? ''}`);
  const light = luminance(inner) > 0.62;
  const colors: GlyphColors = {
    P: light ? '#4a3a26' : '#efe2c4',
    I: light ? '#f4ead2' : '#24170d',
    A: light ? shade(inner, -0.45) : shade(inner, 0.38),
  };
  // Hintergrund: radialer Verlauf, feine Ringe, Sprenkel
  const id = 'pg';
  let bg =
    `<defs><radialGradient id="${id}" cx="42%" cy="38%" r="70%">` +
    `<stop offset="0" stop-color="${shade(inner, 0.12)}"/><stop offset="0.65" stop-color="${inner}"/>` +
    `<stop offset="1" stop-color="${outer}"/></radialGradient></defs>` +
    `<rect width="200" height="200" fill="url(#${id})"/>`;
  for (let r = 30; r < 140; r += 16)
    bg += `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${outer}" stroke-width="1.4" opacity="0.18"/>`;
  for (let i = 0; i < 26; i++)
    bg += `<circle cx="${(rng() * 200).toFixed(1)}" cy="${(rng() * 200).toFixed(1)}" r="${(0.8 + rng() * 1.8).toFixed(1)}" fill="${outer}" opacity="0.25"/>`;

  // Silhouette (Schwärme: mehrere kleine Figuren)
  let figure: string;
  if (typeKey(s.type) === 'swarm') {
    figure = [
      [70, 70, 0.42],
      [130, 64, 0.38],
      [100, 112, 0.46],
      [58, 136, 0.36],
      [142, 134, 0.4],
    ]
      .map(([x = 0, y = 0, k = 0]) => miniGlyph(glyph, colors, x, y, k * 2))
      .join('');
  } else {
    figure = `<g transform="translate(22 20) scale(1.56)">${drawGlyph(glyph, colors)}</g>`;
  }
  const frame =
    `<circle cx="100" cy="100" r="95" fill="none" stroke="${shade(inner, -0.55)}" stroke-width="6" opacity="0.55"/>` +
    `<circle cx="100" cy="100" r="90" fill="none" stroke="${shade(inner, 0.45)}" stroke-width="1.5" opacity="0.5"/>`;
  return svgDoc(2, 2, `${bg}${frame}${svgObject(figure)}`, 'flat');
}

/** Figur mit Tuschumriss, Schattierung und Schatten (Stil 'object' als eingebettete Gruppe). */
function svgObject(body: string): string {
  // svgDoc('object') liefert ein komplettes Dokument; hier wird nur dessen Filter übernommen.
  const doc = svgDoc(2, 2, body, 'object');
  const inner = doc.slice(doc.indexOf('>') + 1, doc.lastIndexOf('</svg>'));
  return inner.replace(/id="st"/g, 'id="pst"').replace(/url\(#st\)/g, 'url(#pst)');
}
