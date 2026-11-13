/** Handout in der Spieleransicht: Bild und/oder Text über der Karte (die Spielleitung blendet es aus). */
import { useEffect, useMemo } from 'react';
import { mimeForAsset } from '../../storage/assets';
import type { PlayerHandout } from '../vision/playerChannel';

export function HandoutCard({ handout }: { handout: PlayerHandout }) {
  const url = useMemo(
    () =>
      handout.image && handout.imageName
        ? URL.createObjectURL(new Blob([handout.image], { type: mimeForAsset(handout.imageName) }))
        : null,
    [handout.image, handout.imageName],
  );
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return (
    <div className="handout-card" role="dialog" aria-label={handout.title}>
      <h2>{handout.title}</h2>
      {url && <img src={url} alt={handout.title} />}
      {handout.text && <p className="handout-text">{handout.text}</p>}
    </div>
  );
}
