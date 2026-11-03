import { createPortal } from "react-dom";
import { defineXlsxPlugin, type XlsxPlugin } from "@betteroffice/xlsx-react";

/*
 * Kolomletters en rijnummers rond het raster van een spreadsheet-blad; de editor
 * tekent die niet zelf. Een plugin van de editor: die krijgt bij elk getekend
 * beeld de geometrie van het raster, ook na scrollen en zoomen. De koppen zelf
 * staan in een eigen laag buiten het raster (`host`), want de overlay van de
 * editor is afgekapt op het raster. De ruimte ervoor maakt
 * SpreadsheetBladWeergave.css. Een klik op een kop selecteert de hele kolom of rij.
 */

/** De grootste werkmap die het XLSX-formaat kent. */
const MAX_RIJ = 1_048_575;
const MAX_KOLOM = 16_383;
/** Meer koppen dan dit staan nooit tegelijk in beeld. */
const MAX_SPOREN = 600;

interface Spoor {
  nummer: number;
  positie: number;
  grootte: number;
}

type Rechthoek = { x: number; y: number; width: number; height: number };

/** "A", "B", …, "Z", "AA", … voor een kolomnummer vanaf 0. */
export function kolomnaam(nummer: number): string {
  let naam = "";
  for (let n = nummer + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    naam = String.fromCharCode(65 + ((n - 1) % 26)) + naam;
  }
  return naam;
}

/**
 * De zichtbare kolommen of rijen. `zicht(van, tot)` geeft het zichtbare deel van
 * dat bereik, of null. Een onzichtbaar stuk (verborgen, of weggescrold naast
 * vastgezette rijen) wordt binair overgeslagen, zodat dit ook op rij een miljoen
 * snel blijft.
 */
export function zichtbareSporen(
  zicht: (van: number, tot: number) => Rechthoek | null,
  max: number,
  as: "x" | "y",
): Spoor[] {
  const uit: Spoor[] = [];
  let i = 0;
  while (i <= max && uit.length < MAX_SPOREN) {
    const r = zicht(i, i);
    if (r) {
      uit.push({ nummer: i, positie: as === "x" ? r.x : r.y, grootte: as === "x" ? r.width : r.height });
      i += 1;
      continue;
    }
    if (!zicht(i, max)) break;
    let laag = i + 1;
    let hoog = max;
    while (laag < hoog) {
      const midden = Math.floor((laag + hoog) / 2);
      if (zicht(i, midden)) hoog = midden;
      else laag = midden + 1;
    }
    i = laag;
  }
  return uit;
}

/** De plugin; `host` is de laag waarin de koppen komen. */
export function koppenPlugin(laag: HTMLElement): XlsxPlugin {
  return defineXlsxPlugin<null>({
    id: "openaec-koppen",
    createState: () => null,
    overlay: function Koppen({ context, geometry }) {
      const omhulsel = laag.parentElement;
      const nulpunt = omhulsel?.querySelector<HTMLElement>('[data-testid="xlsx-overlay-host"]');
      const scroll = omhulsel?.querySelector<HTMLElement>('[data-testid="xlsx-scroll"]');
      if (!nulpunt || !scroll) return null;
      const sheetId = geometry.layout.sheetId;
      const kolommen = zichtbareSporen(
        (van, tot) => geometry.getRangeRect({ sheetId, range: { top: 0, bottom: MAX_RIJ, left: van, right: tot } }),
        MAX_KOLOM,
        "x",
      );
      const rijen = zichtbareSporen(
        (van, tot) => geometry.getRangeRect({ sheetId, range: { left: 0, right: MAX_KOLOM, top: van, bottom: tot } }),
        MAX_RIJ,
        "y",
      );

      // De rechthoeken tellen vanaf het nulpunt van de overlay; de strook is zo groot als het raster.
      const buiten = laag.getBoundingClientRect();
      const raster = scroll.getBoundingClientRect();
      const nul = nulpunt.getBoundingClientRect();
      const links = raster.left - buiten.left;
      const boven = raster.top - buiten.top;
      const naarKolom = nul.left - raster.left;
      const naarRij = nul.top - raster.top;

      const cellen = context.snapshot.selection?.cells;
      const bereik = cellen?.range ?? (cellen && {
        top: Math.min(cellen.anchor.row, cellen.focus.row),
        bottom: Math.max(cellen.anchor.row, cellen.focus.row),
        left: Math.min(cellen.anchor.col, cellen.focus.col),
        right: Math.max(cellen.anchor.col, cellen.focus.col),
      });

      const selecteer = (soort: "kolom" | "rij", nummer: number) => {
        void context.run(async (c) => {
          await c.navigation.selectCells(
            {
              sheetId,
              selection: soort === "kolom"
                ? { anchor: { row: 0, col: nummer }, focus: { row: 0, col: nummer }, range: { top: 0, bottom: MAX_RIJ, left: nummer, right: nummer } }
                : { anchor: { row: nummer, col: 0 }, focus: { row: nummer, col: 0 }, range: { top: nummer, bottom: nummer, left: 0, right: MAX_KOLOM } },
            },
            { expectVersion: c.snapshot.version, focus: true },
          );
        });
      };

      return createPortal(
        <>
          <div className="spreadsheet-hoek" style={{ left: links - 38, top: boven - 23 }} />
          <div className="spreadsheet-kolomkoppen" style={{ left: links, top: boven - 23, width: scroll.clientWidth }}>
            {kolommen.map((k) => (
              <span
                key={k.nummer}
                data-actief={bereik ? k.nummer >= bereik.left && k.nummer <= bereik.right : false}
                style={{ left: k.positie + naarKolom, width: k.grootte }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selecteer("kolom", k.nummer);
                }}
              >
                {kolomnaam(k.nummer)}
              </span>
            ))}
          </div>
          <div className="spreadsheet-rijkoppen" style={{ left: links - 38, top: boven, height: scroll.clientHeight }}>
            {rijen.map((r) => (
              <span
                key={r.nummer}
                data-actief={bereik ? r.nummer >= bereik.top && r.nummer <= bereik.bottom : false}
                style={{ top: r.positie + naarRij, height: r.grootte }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selecteer("rij", r.nummer);
                }}
              >
                {r.nummer + 1}
              </span>
            ))}
          </div>
        </>,
        laag,
      );
    },
  });
}
