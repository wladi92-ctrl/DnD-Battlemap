/**
 * Mitgelieferte Beispiele (erzeugt mit `npm run examples`). Sie werden erst beim Öffnen
 * nachgeladen (eigener Chunk) und als Data-URL eingebunden – ohne Netzwerkzugriff.
 */
import type { MessageKey } from '../i18n';

export interface ExampleInfo {
  id: string;
  file: string;
  title: MessageKey;
  description: MessageKey;
  load: () => Promise<{ default: string }>;
}

export const EXAMPLES: readonly ExampleInfo[] = [
  {
    id: 'taverne',
    file: 'Taverne zum Grünen Drachen.dndmap',
    title: 'examples.taverne',
    description: 'examples.taverneDesc',
    load: () => import('../data/examples/taverne.dndmap?inline'),
  },
  {
    id: 'gruft',
    file: 'Gruft der Schatten.dndmap',
    title: 'examples.gruft',
    description: 'examples.gruftDesc',
    load: () => import('../data/examples/gruft.dndmap?inline'),
  },
  {
    id: 'kampagne',
    file: 'Die Gruft unter der Taverne.dndcampaign',
    title: 'examples.kampagne',
    description: 'examples.kampagneDesc',
    load: () => import('../data/examples/kampagne.dndcampaign?inline'),
  },
  {
    id: 'leistungstest',
    file: 'Leistungstest 100 × 100.dndmap',
    title: 'examples.leistungstest',
    description: 'examples.leistungstestDesc',
    load: () => import('../data/examples/leistungstest.dndmap?inline'),
  },
];

/** Data-URL → Bytes. */
export function dataUrlBytes(url: string): Uint8Array {
  const base64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function loadExample(e: ExampleInfo): Promise<Uint8Array> {
  return dataUrlBytes((await e.load()).default);
}
