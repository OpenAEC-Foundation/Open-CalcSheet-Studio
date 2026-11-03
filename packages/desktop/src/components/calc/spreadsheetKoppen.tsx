import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { defineXlsxPlugin, type XlsxPlugin, type XlsxPluginContext, type XlsxPluginGeometry } from "@betteroffice/xlsx-react";
import { wijsKopAan } from "./spreadsheetAanwijzen";
import { breedteTekens, hoogtePunten } from "./spreadsheetLogica";
import { passendeBreedte, passendeHoogte, sporenBij, uitvoeren, zetKolombreedte, zetRijhoogte } from "./spreadsheetOpdrachten";

/*
 * Kolomletters en rijnummers rond het raster van een spreadsheet-blad; de editor
 * tekent die niet zelf. Een plugin van de editor: die krijgt bij elk getekend
 * beeld de geometrie van het raster, ook na scrollen en zoomen. De koppen zelf
 * staan in een eigen laag buiten het raster (`host`), want de overlay van de
 * editor is afgekapt op het raster. De ruimte ervoor maakt
 * SpreadsheetBladWeergave.css.
 *
 * Een klik op een kop selecteert de hele kolom of rij, Shift+klik en slepen een
 * reeks, de hoek alles. De rand van een kop sleep je voor de breedte of hoogte, en
 * een dubbelklik op die rand maakt de kolom of rij passend.
 */

/** De grootste werkmap die het XLSX-formaat kent. */
const MAX_RIJ = 1_048_575;
const MAX_KOLOM = 16_383;
/** Meer koppen dan dit staan nooit tegelijk in beeld. */
const MAX_SPOREN = 600;
/** Zoveel px rond een rand pakt de muis de rand in plaats van de kop. */
const RAND = 4;

interface Spoor {
  nummer: number;
  positie: number;
  grootte: number;
}

type Soort = "kolom" | "rij";
type Rechthoek = { x: number; y: number; width: number; height: number };

/** Een rand die de gebruiker sleept: het spoor, het beginpunt en de verschuiving. */
interface Slepen {
  soort: Soort;
  nummer: number;
  start: number;
  grootte: number;
  delta: number;
}

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

/** De rand onder de muis: van het spoor zelf (rechts of onder) of van het spoor ervoor. */
function randBij(soort: Soort, e: ReactMouseEvent, spoor: Spoor, lijst: Spoor[]): Spoor | null {
  const r = e.currentTarget.getBoundingClientRect();
  const plek = soort === "kolom" ? e.clientX - r.left : e.clientY - r.top;
  if (plek >= spoor.grootte - RAND) return spoor;
  if (plek <= RAND) {
    const i = lijst.indexOf(spoor);
    return i > 0 ? lijst[i - 1] : null;
  }
  return null;
}

function Koppen({ context, geometry, laag }: { context: XlsxPluginContext<null>; geometry: XlsxPluginGeometry; laag: HTMLElement }) {
  const { t } = useTranslation("werkruimte");
  const [slepen, setSlepen] = useState<Slepen | null>(null);
  const anker = useRef<{ soort: Soort; nummer: number } | null>(null);
  const zoom = geometry.layout.zoom;

  // Een rand slepen: hulplijn tonen, bij loslaten breedte of hoogte zetten.
  useEffect(() => {
    if (!slepen) return;
    const beweeg = (e: MouseEvent) => {
      const delta = (slepen.soort === "kolom" ? e.clientX : e.clientY) - slepen.start;
      setSlepen((s) => (s ? { ...s, delta: Math.max(delta, -s.grootte) } : s));
    };
    const los = () => {
      setSlepen(null);
      if (Math.abs(slepen.delta) < 1) return;
      const px = Math.max(0, (slepen.grootte + slepen.delta) / zoom);
      const sporen = sporenBij(slepen.soort, slepen.nummer);
      uitvoeren(() => (slepen.soort === "kolom" ? zetKolombreedte(sporen, px) : zetRijhoogte(sporen, px)));
    };
    window.addEventListener("mousemove", beweeg);
    window.addEventListener("mouseup", los, { once: true });
    return () => {
      window.removeEventListener("mousemove", beweeg);
      window.removeEventListener("mouseup", los);
    };
  }, [slepen, zoom]);

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

  /** Selecteert hele kolommen of rijen, zonder dat het blad naar het begin springt. */
  const selecteer = (soort: Soort, van: number, tot: number, begin: number) => {
    const x = scroll.scrollLeft;
    const y = scroll.scrollTop;
    void context.run(async (c) => {
      const cel = soort === "kolom" ? { row: 0, col: begin } : { row: begin, col: 0 };
      await c.navigation.selectCells(
        {
          sheetId,
          selection: {
            anchor: cel,
            focus: cel,
            range: soort === "kolom"
              ? { top: 0, bottom: MAX_RIJ, left: van, right: tot }
              : { top: van, bottom: tot, left: 0, right: MAX_KOLOM },
          },
        },
        { expectVersion: c.snapshot.version, focus: true },
      );
      requestAnimationFrame(() => {
        scroll.scrollLeft = x;
        scroll.scrollTop = y;
      });
    });
  };

  const omlaag = (soort: Soort, spoor: Spoor, lijst: Spoor[], e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rand = randBij(soort, e, spoor, lijst);
    if (rand) {
      if (e.detail < 2 && !context.snapshot.readOnly) {
        setSlepen({ soort, nummer: rand.nummer, start: soort === "kolom" ? e.clientX : e.clientY, grootte: rand.grootte, delta: 0 });
      }
      return;
    }
    if (wijsKopAan(soort, spoor.nummer, e.nativeEvent)) return;
    const vorige = anker.current;
    const uitbreiden = e.shiftKey && vorige?.soort === soort;
    const begin = uitbreiden ? vorige.nummer : spoor.nummer;
    if (!uitbreiden) anker.current = { soort, nummer: spoor.nummer };
    selecteer(soort, Math.min(begin, spoor.nummer), Math.max(begin, spoor.nummer), begin);
    // Slepen over de koppen breidt de selectie uit.
    let huidig = spoor.nummer;
    const verder = (m: MouseEvent) => {
      const onder = document.elementsFromPoint(m.clientX, m.clientY).find(
        (el): el is HTMLElement => el instanceof HTMLElement && el.dataset.soort === soort && el.dataset.spoor !== undefined,
      );
      const nummer = onder ? Number(onder.dataset.spoor) : huidig;
      if (nummer === huidig) return;
      huidig = nummer;
      selecteer(soort, Math.min(begin, nummer), Math.max(begin, nummer), begin);
    };
    window.addEventListener("mousemove", verder);
    window.addEventListener("mouseup", () => window.removeEventListener("mousemove", verder), { once: true });
  };

  const dubbel = (soort: Soort, spoor: Spoor, lijst: Spoor[], e: ReactMouseEvent) => {
    if (context.snapshot.readOnly) return;
    const rand = randBij(soort, e, spoor, lijst);
    if (!rand) return;
    e.preventDefault();
    const sporen = sporenBij(soort, rand.nummer);
    uitvoeren(() => (soort === "kolom" ? passendeBreedte(sporen) : passendeHoogte(sporen)));
  };

  /** De muisaanwijzer boven een kop, en de maat in de tooltip. */
  const wijzer = (soort: Soort, spoor: Spoor, lijst: Spoor[], e: ReactMouseEvent<HTMLElement>) => {
    const rand = randBij(soort, e, spoor, lijst);
    e.currentTarget.style.cursor = rand ? (soort === "kolom" ? "col-resize" : "row-resize") : soort === "kolom" ? "s-resize" : "e-resize";
    e.currentTarget.title = soort === "kolom"
      ? t("spreadsheet.kolomTip", { naam: kolomnaam(spoor.nummer), breedte: breedteTekens(spoor.grootte / zoom) })
      : t("spreadsheet.rijTip", { naam: spoor.nummer + 1, hoogte: hoogtePunten(spoor.grootte / zoom) });
  };

  const hulp = slepen && (slepen.soort === "kolom" ? kolommen : rijen).find((s) => s.nummer === slepen.nummer);

  return createPortal(
    <>
      <div
        className="spreadsheet-hoek"
        title={t("spreadsheet.allesSelecteren")}
        style={{ left: links - 38, top: boven - 23 }}
        onMouseDown={(e) => {
          e.preventDefault();
          void context.run(async (c) => {
            await c.navigation.selectCells(
              {
                sheetId,
                selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 }, range: { top: 0, bottom: MAX_RIJ, left: 0, right: MAX_KOLOM } },
              },
              { expectVersion: c.snapshot.version, focus: true },
            );
          });
        }}
      />
      <div className="spreadsheet-kolomkoppen" style={{ left: links, top: boven - 23, width: scroll.clientWidth }}>
        {kolommen.map((k) => (
          <span
            key={k.nummer}
            data-actief={bereik ? k.nummer >= bereik.left && k.nummer <= bereik.right : false}
            data-spoor={k.nummer}
            data-soort="kolom"
            style={{ left: k.positie + naarKolom, width: k.grootte }}
            onMouseDown={(e) => omlaag("kolom", k, kolommen, e)}
            onDoubleClick={(e) => dubbel("kolom", k, kolommen, e)}
            onMouseMove={(e) => wijzer("kolom", k, kolommen, e)}
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
            data-spoor={r.nummer}
            data-soort="rij"
            style={{ top: r.positie + naarRij, height: r.grootte }}
            onMouseDown={(e) => omlaag("rij", r, rijen, e)}
            onDoubleClick={(e) => dubbel("rij", r, rijen, e)}
            onMouseMove={(e) => wijzer("rij", r, rijen, e)}
          >
            {r.nummer + 1}
          </span>
        ))}
      </div>
      {slepen && hulp && (
        <div
          className={`spreadsheet-hulplijn ${slepen.soort}`}
          style={slepen.soort === "kolom"
            ? { left: links + naarKolom + hulp.positie + slepen.grootte + slepen.delta, top: boven - 23, height: scroll.clientHeight + 23 }
            : { top: boven + naarRij + hulp.positie + slepen.grootte + slepen.delta, left: links - 38, width: scroll.clientWidth + 38 }}
        />
      )}
    </>,
    laag,
  );
}

/** De plugin; `host` is de laag waarin de koppen komen. */
export function koppenPlugin(laag: HTMLElement): XlsxPlugin {
  return defineXlsxPlugin<null>({
    id: "openaec-koppen",
    createState: () => null,
    overlay: function KoppenLaag({ context, geometry }) {
      return <Koppen context={context} geometry={geometry} laag={laag} />;
    },
  });
}
