/**
 * Einheiten-Umrechnung. Konvention aus dem deutschen Regelwerk: 5 ft entsprechen 1,5 m,
 * also 1 ft = 0,3 m (nicht die exakte Umrechnung 0,3048).
 */
export const METERS_PER_FOOT = 0.3;

export function feetToMeters(feet: number): number {
  return Math.round(feet * METERS_PER_FOOT * 100) / 100;
}

export interface DistanceFormatOptions {
  locale: string;
  showMeters: boolean;
}

export function formatNumber(value: number, locale: string, maxFractionDigits = 1): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value);
}

/** z. B. "30 ft" oder "30 ft (9 m)"; euklidische Werte mit max. einer Nachkommastelle. */
export function formatDistance(
  feet: number,
  { locale, showMeters }: DistanceFormatOptions,
): string {
  const ft = `${formatNumber(feet, locale)} ft`;
  return showMeters ? `${ft} (${formatNumber(feetToMeters(feet), locale)} m)` : ft;
}
