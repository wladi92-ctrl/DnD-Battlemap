/** Kleine, selbst gezeichnete Werkzeug-Icons (24×24, currentColor). */
import type { Tool } from '../state/viewStore';

type IconName = Tool | 'undo' | 'redo' | 'template' | 'terrain' | 'grid';

const paths: Record<IconName, string> = {
  pan: 'M8 13V6a1.5 1.5 0 0 1 3 0v5V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7s-5-2-7-5l-1.5-3a1.5 1.5 0 0 1 2.6-1.5L8 13z',
  select: 'M5 3l13 8-6 1.5L15 20l-2.5 1-3-7.5L5 18z',
  brush: 'M18 3l3 3-9 9-3-3zM8 13l3 3c0 3-2.5 5-7 5 1.5-1.5 1-3 1.5-5S6 13 8 13z',
  rect: 'M4 5h16v14H4z',
  line: 'M4 20L20 4',
  fill: 'M5 11l7-7 7 7-7 7zM19 15c1 1.5 2 3 2 4a2 2 0 0 1-4 0c0-1 1-2.5 2-4z',
  erase: 'M3 15l9-9 8 8-6 6H8zM8 20h13',
  note: 'M5 3h10l4 4v14H5zM15 3v4h4M8 11h8M8 15h8',
  wall: 'M4 20V8l8-4 8 4v12M4 12h16M12 4v16',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  template: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  terrain: 'M2 20l6-10 4 6 3-4 7 8z',
  grid: 'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',
  fog: 'M3 8h13a3 3 0 1 0-3-3M3 12h17a3 3 0 1 1-3 3M3 16h9',
  light:
    'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
  effect:
    'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v3M12 19v3M2 12h3M19 12h3',
  draw: 'M4 20c3-1 4-4 7-4s3 3 6 2M14 4l6 6-8 8H6v-6z',
};

const filled: ReadonlySet<IconName> = new Set(['select', 'pan']);

export function ToolIcon({ name }: { name: IconName }) {
  const isFilled = filled.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill={isFilled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={isFilled ? 1 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
