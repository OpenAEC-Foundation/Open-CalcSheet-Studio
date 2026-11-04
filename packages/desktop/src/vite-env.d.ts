/// <reference types="vite/client" />

declare module "*.geojson?raw" {
  const content: string;
  export default content;
}

/** De map library/ in de dev-server; in een productiebouw leeg (vite.config.ts). */
declare const __LIBRARY_DEV__: string;

/**
 * Ontwikkelhaak uit main.tsx, alleen bij `import.meta.env.DEV`: de stores en
 * de bestandslezer voor scripts/rapport-pdf.mjs. In een productiebouw bestaat
 * hij niet, vandaar optioneel.
 */
interface Window {
  __ocs?: {
    useProjectStore: typeof import("./store/projectStore").useProjectStore;
    usePrintStore: typeof import("./store/printStore").usePrintStore;
    useBureauStore: typeof import("./store/bureauProfiel").useBureauStore;
    leesProjectBestand: typeof import("./store/projectBestand").leesProjectBestand;
    wachtOpVellen: typeof import("./components/rapport/afdruk/drukvellen").wachtOpVellen;
    zetDrukvellenKlaar: typeof import("./components/rapport/afdruk/drukvellen").zetDrukvellenKlaar;
    wachtOpDrukbeelden: typeof import("./components/rapport/afdruk/drukvellen").wachtOpDrukbeelden;
  };
}
