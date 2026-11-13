/**
 * Zugriff auf den Renderer der Kartenansicht für Funktionen außerhalb von MapCanvas (Export).
 * `refresh` stellt nach einem Export den angezeigten Zustand wieder her.
 */
import type { MapRenderer } from '../../render/MapRenderer';

let active: MapRenderer | null = null;
let refresh: (() => void) | null = null;

export function setActiveRenderer(r: MapRenderer | null): void {
  active = r;
}

export function getActiveRenderer(): MapRenderer | null {
  return active;
}

export function setRendererRefresh(fn: (() => void) | null): void {
  refresh = fn;
}

/** Ansicht neu aufbauen (Dokument, Effekte, Nebel, Lichter, Overlay). */
export function refreshRenderer(): void {
  refresh?.();
}
