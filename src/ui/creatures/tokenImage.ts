/** Token-Bild wählen (PNG/JPEG/WebP, ≤ 3 MB) und als Data-URL für die Bibliothek liefern. */
import { extensionOf, looksLikeImage } from '../../storage/assets';
import { getFileAccess } from '../../storage/fileAccess';
import { LIBRARY_IMAGE_MAX } from '../../storage/library';
import type { MessageKey } from '../../i18n';

const TYPES: Record<string, string> = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp' };

export function bytesToDataUrl(bytes: Uint8Array, ext: string): string | null {
  const type = TYPES[ext];
  if (!type) return null;
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:image/${type};base64,${btoa(bin)}`;
}

/**
 * Öffnet den Bilddialog. Liefert die Data-URL, null bei Abbruch, oder wirft einen
 * Übersetzungsschlüssel als Fehlergrund.
 */
export async function pickTokenImage(title: string, filterName: string): Promise<string | null> {
  const file = await getFileAccess().openFile(title, filterName, ['png', 'jpg', 'jpeg', 'webp']);
  if (!file) return null;
  const ext = extensionOf(file.name);
  if (!TYPES[ext]) throw new ImageError('pc.imageBadType');
  // Base64 wächst um ein Drittel; Grenze gilt für die gespeicherte Data-URL.
  if (file.bytes.length * 1.34 > LIBRARY_IMAGE_MAX) throw new ImageError('pc.imageTooLarge');
  if (!looksLikeImage(file.bytes, ext)) throw new ImageError('pc.imageBadType');
  const url = bytesToDataUrl(file.bytes, ext);
  if (!url) throw new ImageError('pc.imageBadType');
  return url;
}

export class ImageError extends Error {
  constructor(readonly key: MessageKey) {
    super(key);
  }
}
