/** Browser-Hilfen für Kartenbilder: dekodieren, gedreht zeichnen, Probe für die Rastererkennung. */
import { detectGrid } from '../../core/gridDetect';
import { guessToCalibration } from '../../editor/calibration';
import { extensionOf, looksLikeImage, mimeForAsset } from '../../storage/assets';
import { MAP_IMAGE_EXTENSIONS, MAP_IMAGE_MAX_BYTES } from '../../storage/fileAccess';
import { IMAGE_MAX_SIDE, type CropRect, type ImageRotation } from '../../storage/mapDocument';
import { ProjectFileError } from '../../storage/errors';

export interface ImageSourceFile {
  name: string;
  ext: string;
  bytes: Uint8Array;
  bitmap: ImageBitmap;
}

export type ImageCheck = 'badType' | 'tooLarge' | 'badContent' | 'tooManyPixels' | 'decodeFailed';

export class ImageImportError extends Error {
  constructor(readonly code: ImageCheck) {
    super(code);
  }
}

/** Prüft und dekodiert eine Bilddatei (GIF: erstes Bild). */
export async function loadMapImage(name: string, bytes: Uint8Array): Promise<ImageSourceFile> {
  const ext = extensionOf(name);
  if (!(MAP_IMAGE_EXTENSIONS as readonly string[]).includes(ext))
    throw new ImageImportError('badType');
  if (bytes.length > MAP_IMAGE_MAX_BYTES) throw new ImageImportError('tooLarge');
  if (!looksLikeImage(bytes, ext)) throw new ImageImportError('badContent');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: mimeForAsset(name) }));
  } catch {
    throw new ImageImportError('decodeFailed');
  }
  if (bitmap.width > IMAGE_MAX_SIDE || bitmap.height > IMAGE_MAX_SIDE) {
    bitmap.close();
    throw new ImageImportError('tooManyPixels');
  }
  return { name, ext: ext === 'jpeg' ? 'jpg' : ext, bytes, bitmap };
}

/** Zeichnet das Bild gedreht so, dass es bei (0,0) beginnt. */
export function drawRotated(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  rotation: ImageRotation,
): void {
  ctx.save();
  const { width: w, height: h } = bitmap;
  if (rotation === 90) ctx.translate(h, 0);
  else if (rotation === 180) ctx.translate(w, h);
  else if (rotation === 270) ctx.translate(0, w);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();
}

/**
 * Verkleinerte Graustufenprobe des (gedrehten, zugeschnittenen) Bildes und automatische
 * Rastererkennung. Liefert Feldgröße und Ursprung in Pixeln des gedrehten Bildes.
 */
export function autoDetectGrid(
  bitmap: ImageBitmap,
  rotation: ImageRotation,
  crop: CropRect,
  maxSide = 1200,
) {
  const scale = Math.min(1, maxSide / Math.max(crop.w, crop.h));
  const w = Math.max(1, Math.round(crop.w * scale));
  const h = Math.max(1, Math.round(crop.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.translate(-crop.x, -crop.y);
  drawRotated(ctx, bitmap, rotation);
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    gray[i] =
      0.299 * (data[i * 4] ?? 0) + 0.587 * (data[i * 4 + 1] ?? 0) + 0.114 * (data[i * 4 + 2] ?? 0);
  }
  const guess = detectGrid(gray, w, h, { minCell: 6, maxCell: Math.min(w, h) / 3 });
  return guess ? { ...guessToCalibration(guess, scale, crop), confidence: guess.confidence } : null;
}

/** Fehler beim Bildimport in einen i18n-Schlüssel übersetzen. */
export function imageErrorKey(e: unknown) {
  if (e instanceof ImageImportError) return `imageImport.${e.code}` as const;
  if (e instanceof ProjectFileError) return `error.${e.code}` as const;
  return 'error.unknown' as const;
}
