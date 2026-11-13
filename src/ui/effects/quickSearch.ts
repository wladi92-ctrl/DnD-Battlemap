/**
 * Schnellsuche für Effekte (Strg+F): Treffer nach Name (SRD-Namen sind englisch), deutscher
 * Schadensart und Art („Feuer“, „Zauber“), Form oder Kürzel. Eine Zahl am Ende wählt den
 * Zaubergrad („fireball 5“ → Grad 5).
 */
import { slotLevels, type EffectSource } from '../../data/srd/effects';
import type { MessageKey } from '../../i18n';

export interface QuickQuery {
  text: string;
  /** Gewünschter Grad (falls angegeben). */
  slot: number | null;
}

export function parseQuickQuery(raw: string): QuickQuery {
  const m = /^(.*?)\s+(\d{1,2})$/.exec(raw.trim());
  if (m && m[1]) return { text: m[1].trim(), slot: Number(m[2]) };
  return { text: raw.trim(), slot: null };
}

type T = (key: MessageKey) => string;

/** Suchtext eines Effekts: Name plus übersetzte Art und Schadensart. */
function haystack(e: EffectSource, t: T): string {
  const parts = [e.name, t(`effectKind.${e.kind}` as MessageKey)];
  if (e.damage) parts.push(t(`damage.${e.damage.type}` as MessageKey));
  return parts.join(' ').toLocaleLowerCase('de');
}

/** Bewertete Treffer: Namensanfang vor Wortanfang vor Teiltreffer vor Art/Schadensart. */
export function searchEffects(
  all: readonly EffectSource[],
  raw: string,
  t: T,
  limit = 12,
): EffectSource[] {
  const { text } = parseQuickQuery(raw);
  const q = text.toLocaleLowerCase('de');
  if (!q) return [];
  const scored: { e: EffectSource; score: number }[] = [];
  for (const e of all) {
    const name = e.name.toLocaleLowerCase('de');
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.split(/[\s'-]+/).some((w) => w.startsWith(q))) score = 1;
    else if (name.includes(q)) score = 2;
    else if (haystack(e, t).includes(q)) score = 3;
    if (score >= 0) scored.push({ e, score });
  }
  scored.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name, 'de'));
  return scored.slice(0, limit).map((s) => s.e);
}

/** Grad für den Effekt: angegebener, falls zulässig, sonst der niedrigste. */
export function chooseSlot(e: EffectSource, wanted: number | null): number | undefined {
  const slots = slotLevels(e);
  if (wanted !== null && slots.includes(wanted)) return wanted;
  return slots[0];
}
