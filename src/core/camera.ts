/**
 * 2D-Kamera: Bildschirm = Welt · zoom + (x, y).
 * Reine Funktionen ohne Zustand, damit Zoom/Pan deterministisch testbar sind.
 */
import type { Point } from './grid';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 4;
/** Mindestanteil der Karte (in Bildschirmpixeln), der beim Verschieben sichtbar bleibt. */
export const KEEP_VISIBLE_PX = 64;

export const identityCamera: Camera = { x: 0, y: 0, zoom: 1 };

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export function worldToScreen(cam: Camera, p: Point): Point {
  return { x: p.x * cam.zoom + cam.x, y: p.y * cam.zoom + cam.y };
}

export function screenToWorld(cam: Camera, p: Point): Point {
  return { x: (p.x - cam.x) / cam.zoom, y: (p.y - cam.y) / cam.zoom };
}

/** Zoomt so, dass der Weltpunkt unter `screen` an derselben Bildschirmstelle bleibt. */
export function zoomAt(cam: Camera, screen: Point, factor: number): Camera {
  const zoom = clampZoom(cam.zoom * factor);
  const world = screenToWorld(cam, screen);
  return { zoom, x: screen.x - world.x * zoom, y: screen.y - world.y * zoom };
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x + dx, y: cam.y + dy };
}

/** Passt die gesamte Welt mit Rand in den Viewport ein und zentriert sie. */
export function fitToView(viewport: Size, world: Size, padding = 24): Camera {
  const availW = Math.max(1, viewport.width - 2 * padding);
  const availH = Math.max(1, viewport.height - 2 * padding);
  const zoom = clampZoom(Math.min(availW / world.width, availH / world.height));
  return {
    zoom,
    x: (viewport.width - world.width * zoom) / 2,
    y: (viewport.height - world.height * zoom) / 2,
  };
}

/** Verhindert, dass die Karte komplett aus dem Sichtbereich geschoben wird. */
export function clampCamera(cam: Camera, viewport: Size, world: Size): Camera {
  const w = world.width * cam.zoom;
  const h = world.height * cam.zoom;
  const keepX = Math.min(KEEP_VISIBLE_PX, w);
  const keepY = Math.min(KEEP_VISIBLE_PX, h);
  return {
    ...cam,
    x: Math.min(viewport.width - keepX, Math.max(keepX - w, cam.x)),
    y: Math.min(viewport.height - keepY, Math.max(keepY - h, cam.y)),
  };
}

/** Verschiebt die Kamera minimal, damit ein Weltrechteck mit Rand sichtbar ist. */
export function ensureVisible(
  cam: Camera,
  viewport: Size,
  rect: { x: number; y: number; width: number; height: number },
  margin = 32,
): Camera {
  const tl = worldToScreen(cam, rect);
  const br = worldToScreen(cam, { x: rect.x + rect.width, y: rect.y + rect.height });
  let dx = 0;
  let dy = 0;
  if (tl.x < margin) dx = margin - tl.x;
  else if (br.x > viewport.width - margin) dx = viewport.width - margin - br.x;
  if (tl.y < margin) dy = margin - tl.y;
  else if (br.y > viewport.height - margin) dy = viewport.height - margin - br.y;
  return dx === 0 && dy === 0 ? cam : panBy(cam, dx, dy);
}
