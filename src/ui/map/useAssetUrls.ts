import { useEffect, useMemo } from 'react';
import { mimeForAsset } from '../../storage/assets';
import { useMapStore } from '../state/mapStore';

/** Blob-URLs der eingebetteten Bilder (für Vorschaubilder eigener Elemente). */
export function useAssetUrls(): ReadonlyMap<string, string> {
  const assets = useMapStore((s) => s.assets);
  const urls = useMemo(() => {
    const map = new Map<string, string>();
    for (const [path, bytes] of assets) {
      map.set(path, URL.createObjectURL(new Blob([bytes], { type: mimeForAsset(path) })));
    }
    return map;
  }, [assets]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}
