/**
 * Bilder von Tokens und Kreaturen: Vorschau (eigenes Bild oder erzeugtes Standard-Porträt),
 * „Bild ändern …“ und „Standardbild“.
 * - Token: das Bild wird in die Karte eingebettet (assets/tokens/…) und gilt für alle
 *   ausgewählten Tokens.
 * - Kreatur der Bibliothek: SRD-Kreaturen speichern ein eigenes Bild in der lokalen Bibliothek,
 *   eigene Kreaturen im Eintrag selbst; neu gesetzte Tokens übernehmen es.
 */
import { useEffect, useMemo, useState } from 'react';
import { baseName, portraitUrl } from '../../data/portraits/portrait';
import { creatureTypeOf, type Creature } from '../../data/srd/creatures';
import { mimeForAsset } from '../../storage/assets';
import { dataUrlToBytes, type HomebrewCreature } from '../../storage/library';
import type { Token } from '../../storage/mapDocument';
import { useLibraryStore } from '../state/libraryStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';
import { ImageError, pickTokenImage } from './tokenImage';

/** Kreaturentyp einer SRD-Kreatur (asynchron geladen) – für das passende Standard-Porträt. */
function useSrdType(source: string | undefined): string | undefined {
  const [type, setType] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setType(undefined);
    if (source && !source.includes(':'))
      void creatureTypeOf(source)
        .then((t) => alive && setType(t))
        .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [source]);
  return type;
}

/** Bild eines Tokens als URL: eingebettetes Bild (Blob) oder Standard-Porträt. */
function useTokenImageUrl(token: Token): string {
  const assets = useMapStore((s) => s.assets);
  const type = useSrdType(token.kind === 'creature' ? token.source : undefined);
  const bytes = token.image ? assets.get(token.image) : undefined;
  const blobUrl = useMemo(
    () =>
      bytes && token.image
        ? URL.createObjectURL(new Blob([bytes], { type: mimeForAsset(token.image) }))
        : null,
    [bytes, token.image],
  );
  useEffect(() => () => void (blobUrl && URL.revokeObjectURL(blobUrl)), [blobUrl]);
  return (
    blobUrl ??
    portraitUrl({
      name: baseName(token.name),
      ...(type ? { type } : {}),
      kind: token.kind === 'pc' ? 'pc' : 'creature',
    })
  );
}

function usePick() {
  const t = useT();
  return async (): Promise<string | null> => {
    try {
      return await pickTokenImage(t('portrait.choose'), t('pc.imageFilter'));
    } catch (e) {
      useNoticeStore.getState().push('error', t(e instanceof ImageError ? e.key : 'error.unknown'));
      return null;
    }
  };
}

export function PortraitPreview({ src, alt }: { src: string; alt: string }) {
  return <img className="portrait-preview" src={src} alt={alt} width={64} height={64} />;
}

/** Bildauswahl für die ausgewählten Tokens. */
export function TokenPortraitField({
  tokens,
  update,
}: {
  tokens: Token[];
  update: (fn: (tk: Token) => Token, label: 'action.tokenImage') => void;
}) {
  const t = useT();
  const pick = usePick();
  const first = tokens[0];
  const url = useTokenImageUrl(first ?? ({ name: '', kind: 'creature' } as Token));
  if (!first) return null;
  const anyCustom = tokens.some((tk) => tk.image);

  const change = async () => {
    const data = await pick();
    const img = data ? dataUrlToBytes(data) : null;
    if (!img) return;
    const path = `tokens/${crypto.randomUUID()}.${img.ext}`;
    useMapStore.getState().addAsset(path, img.bytes);
    update((tk) => ({ ...tk, image: path }), 'action.tokenImage');
  };
  const reset = () =>
    update((tk) => {
      if (!tk.image) return tk;
      const { image: _image, ...rest } = tk;
      return rest;
    }, 'action.tokenImage');

  return (
    <div className="portrait-field">
      <PortraitPreview src={url} alt={t('portrait.of', { name: first.name })} />
      <div className="portrait-actions">
        <button type="button" className="btn" onClick={() => void change()}>
          {t('portrait.change')}
        </button>
        <button type="button" className="btn" disabled={!anyCustom} onClick={reset}>
          {t('portrait.default')}
        </button>
        <span className="small muted">
          {anyCustom ? t('portrait.custom') : t('portrait.generated')}
        </span>
      </div>
    </div>
  );
}

/** Bild einer Kreatur der Bibliothek (gilt für neu gesetzte Tokens). */
export function CreaturePortraitField({ creature }: { creature: Creature | HomebrewCreature }) {
  const t = useT();
  const pick = usePick();
  const override = useLibraryStore((s) => s.portraits[creature.id]);
  const homebrew = 'homebrew' in creature ? creature : null;
  const custom = homebrew ? homebrew.image : override;
  const url = custom ?? portraitUrl({ name: creature.name, type: creature.type });
  const lib = useLibraryStore.getState();
  const fail = (e: unknown) =>
    useNoticeStore.getState().push('error', t('creatures.saveError', { error: String(e) }));

  const change = async () => {
    const data = await pick();
    if (!data) return;
    try {
      if (homebrew) await lib.putHomebrew({ ...homebrew, image: data });
      else await lib.putPortrait(creature.id, creature.name, data);
    } catch (e) {
      fail(e);
    }
  };
  const reset = async () => {
    try {
      if (homebrew) {
        const { image: _image, ...rest } = homebrew;
        await lib.putHomebrew(rest);
      } else await lib.removePortrait(creature.id);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="portrait-field">
      <PortraitPreview src={url} alt={t('portrait.of', { name: creature.name })} />
      <div className="portrait-actions">
        <button type="button" className="btn" onClick={() => void change()}>
          {t('portrait.change')}
        </button>
        <button type="button" className="btn" disabled={!custom} onClick={() => void reset()}>
          {t('portrait.default')}
        </button>
        <span className="small muted">{t('portrait.creatureHint')}</span>
      </div>
    </div>
  );
}

/** Kleines Vorschaubild in der Kreaturenliste. */
export function CreatureThumb({ creature }: { creature: Creature | HomebrewCreature }) {
  const override = useLibraryStore((s) => s.portraits[creature.id]);
  const own = 'homebrew' in creature ? creature.image : override;
  return (
    <img
      className="creature-thumb"
      src={own ?? portraitUrl({ name: creature.name, type: creature.type })}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
    />
  );
}
