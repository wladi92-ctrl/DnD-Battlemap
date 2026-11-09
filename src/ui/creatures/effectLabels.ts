/** Beschriftungen für Effekte (Name, Restdauer, Konzentration). */
import type { MessageKey } from '../../i18n';

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

/** "Cloudkill · 97 Rd. · K" für die Karte. */
export function effectLabel(
  t: T,
  e: { name: string; rounds: number | null; concentration: boolean },
): string {
  const parts = [e.name];
  if (e.rounds !== null && e.rounds > 0) parts.push(t('effect.roundsShort', { n: e.rounds }));
  if (e.concentration) parts.push(t('effect.concShort'));
  return parts.join(' · ');
}
