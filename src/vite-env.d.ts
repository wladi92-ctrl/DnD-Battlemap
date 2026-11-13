/// <reference types="vite/client" />

/** Versionsnummer aus package.json, zur Build-Zeit eingesetzt. */
declare const __APP_VERSION__: string;

/** Seiteneffekt-Modul von PixiJS (CSP-konforme Shader ohne eval); liefert keine Typen mit. */
declare module 'pixi.js/unsafe-eval';

/** Mitgelieferte Beispiele (siehe src/ui/examples.ts): Data-URL des Dateiinhalts. */
declare module '*.dndmap?inline' {
  const dataUrl: string;
  export default dataUrl;
}
declare module '*.dndcampaign?inline' {
  const dataUrl: string;
  export default dataUrl;
}
