/** Hilfen für eingebettete Dateien (assets/ in .dndmap). */

export function mimeForAsset(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'svg':
      return 'image/svg+xml';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

/** Dateiendung (klein) oder ''. */
export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m?.[1]?.toLowerCase() ?? '';
}

/** Prüft anhand der ersten Bytes grob, ob die Daten zur Endung passen. */
export function looksLikeImage(bytes: Uint8Array, ext: string): boolean {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  switch (ext) {
    case 'png':
      return starts(0x89, 0x50, 0x4e, 0x47);
    case 'jpg':
    case 'jpeg':
      return starts(0xff, 0xd8, 0xff);
    case 'webp':
      return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45;
    case 'svg': {
      const head = new TextDecoder().decode(bytes.subarray(0, 2048)).toLowerCase();
      return head.includes('<svg');
    }
    default:
      return false;
  }
}
