import type { ElementLayerId, TerrainProps } from '../../storage/mapDocument';
import type { CategoryId } from './categories';

/** Ein Element der Bibliothek (eingebaut). Namen stehen in names.<sprache>.json. */
export interface ElementDef {
  id: string;
  category: CategoryId;
  /** Ziel-Ebene beim Platzieren. */
  layer: ElementLayerId;
  /** Größe in Feldern (ungedreht). */
  w: number;
  h: number;
  /** Repräsentative Farbe für Vorschauen (Generator, Minikarte). */
  color: string;
  /** Vorgeschlagene Geländeeigenschaften; pro Feld überschreibbar. */
  props?: TerrainProps;
  /** Suchbegriffe zusätzlich zum Namen. */
  tags?: string[];
  /** Erzeugt das SVG (wird zwischengespeichert). */
  draw: () => string;
}
