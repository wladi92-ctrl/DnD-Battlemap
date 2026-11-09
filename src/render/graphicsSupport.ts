/**
 * Ermittelt, welche Grafikausgabe auf diesem Gerät funktioniert.
 * PixiJS wird genauso initialisiert wie später die Kartenansicht:
 * bevorzugt WebGL, sonst der Canvas2D-Renderer von Pixi als Fallback.
 */
import type { RendererPreference } from 'pixi.js';

export const RENDERER_PREFERENCE: RendererPreference[] = ['webgl', 'canvas'];

export type GraphicsSupport =
  { kind: 'webgl'; version: 1 | 2 } | { kind: 'canvas' } | { kind: 'none' };

export async function detectGraphicsSupport(): Promise<GraphicsSupport> {
  try {
    // CSP-konforme Shader-Erzeugung ohne eval/new Function.
    await import('pixi.js/unsafe-eval');
    const { Application } = await import('pixi.js');
    const app = new Application();
    await app.init({ preference: RENDERER_PREFERENCE, width: 4, height: 4, autoStart: false });
    try {
      if (app.renderer.name === 'webgl') {
        const gl = (app.renderer as unknown as { gl: WebGLRenderingContext }).gl;
        const version =
          typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
            ? 2
            : 1;
        return { kind: 'webgl', version };
      }
      return { kind: 'canvas' };
    } finally {
      app.destroy(true);
    }
  } catch {
    return { kind: 'none' };
  }
}
