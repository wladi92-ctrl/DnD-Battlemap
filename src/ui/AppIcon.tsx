/** App-Logo: Raster mit Effektkreis – eigenes Motiv, identisch zu assets/icon.svg. */
export function AppIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="12" fill="#8a2b1c" />
      <g stroke="#f4e3c1" strokeOpacity="0.55" strokeWidth="1.5">
        <path d="M14 8v48M26 8v48M38 8v48M50 8v48M8 14h48M8 26h48M8 38h48M8 50h48" />
      </g>
      <circle
        cx="32"
        cy="32"
        r="15"
        fill="#f6a23c"
        fillOpacity="0.55"
        stroke="#ffd27a"
        strokeWidth="2.5"
      />
      <circle cx="32" cy="32" r="5" fill="#fff4dc" />
    </svg>
  );
}
