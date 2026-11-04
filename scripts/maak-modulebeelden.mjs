/**
 * De getekende beelden van het scherm "Module toevoegen": SVG naar WebP, in de stijl van
 * `tweepaalspoer.webp` (zie docs/modulebeelden.md). Elk beeld staat hieronder als een
 * isometrische tekening; opnieuw maken is opnieuw draaien.
 *
 * Draaien:  node scripts/maak-modulebeelden.mjs [uitvoermap] [naam …]
 * Zonder uitvoermap schrijft het naar packages/desktop/src/assets/module-beelden.
 * scripts/check-modulebeelden.mjs controleert de uitkomst.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const BREEDTE = 540;
const HOOGTE = 312;
/** De marge rond de tekening; het kaartje op het scherm is 180 × 104. */
const MARGE_X = 34;
const MARGE_Y = 20;
const MAP = fileURLToPath(new URL("../packages/desktop/src/assets/module-beelden/", import.meta.url));

// ── De kleuren van tweepaalspoer.webp ────────────────────────────────────────
const GROND = "#f1efea";
const SCHADUW = "#e6e3dc";
const PAPIER = "#fbfaf7";
const PAPIER_LINKS = "#dcd8cf";
const PAPIER_RECHTS = "#cfcac0";
const LEI = { boven: "#4d6a89", links: "#35536f", rechts: "#2a425b" };
const LICHT = { boven: "#b4bfd0", links: "#94a4bb", rechts: "#7c8ca6" };
const TURKOOIS = { boven: "#74c3b7", links: "#58a99d", rechts: "#478f84" };
const LIJN = "#8b9096";
const LIJN_LICHT = "#c9c6bf";

// ── De projectie ─────────────────────────────────────────────────────────────
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);

/** Eén beeld: x loopt naar rechtsvoor, y naar linksvoor, z omhoog. Het beeld past zichzelf op het vlak. */
function beeld() {
  const delen = [];
  const punten = [];
  const pt = (x, y, z = 0) => {
    const p = [(x - y) * COS, (x + y) * SIN - z];
    punten.push(p);
    return p;
  };
  const tekst = (lijst) => lijst.map((p) => pt(...p).map((v) => v.toFixed(2)).join(",")).join(" ");
  const b = {
    /** Een vlak door punten in de ruimte. */
    vlak(punten, vul, lijn = "none", dik = 0) {
      delen.push(`<polygon points="${tekst(punten)}" fill="${vul}"${lijn !== "none" ? ` stroke="${lijn}" stroke-width="${dik}" stroke-linejoin="round"` : ""}/>`);
      return b;
    },
    /** Een lijn door punten in de ruimte. */
    lijn(punten, kleur = LIJN, dik = 1.6, sluit = false) {
      delen.push(`<${sluit ? "polygon" : "polyline"} points="${tekst(punten)}" fill="none" stroke="${kleur}" stroke-width="${dik}" stroke-linecap="round" stroke-linejoin="round"/>`);
      return b;
    },
    /** Een blok: alleen de drie vlakken die in beeld zijn. */
    blok(x, y, z, dx, dy, dz, kleuren = LEI) {
      const [x1, y1, z1] = [x + dx, y + dy, z + dz];
      b.vlak([[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]], kleuren.links);
      b.vlak([[x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1]], kleuren.rechts);
      b.vlak([[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]], kleuren.boven);
      return b;
    },
    /** Een vel papier met een dunne rand; de inhoud komt er met z = `dik` op. */
    vel(x, y, dx, dy, dik = 5) {
      return b.blok(x, y, 0, dx, dy, dik, { boven: PAPIER, links: PAPIER_LINKS, rechts: PAPIER_RECHTS });
    },
    /** Een schijf in een horizontaal vlak, met een dunne rand. */
    schijf(x, y, z, r, kleur, dik = 0, randKleur = LEI.rechts) {
      const ring = (hoogte) => Array.from({ length: 28 }, (_, i) => {
        const h = (i / 28) * 2 * Math.PI;
        return [x + r * Math.cos(h), y + r * Math.sin(h), hoogte];
      });
      if (dik > 0) {
        b.vlak(ring(z), randKleur);
        for (const [i, p] of ring(z).entries()) {
          const q = ring(z)[(i + 1) % 28];
          b.vlak([p, q, [q[0], q[1], z + dik], [p[0], p[1], z + dik]], randKleur);
        }
      }
      b.vlak(ring(z + dik), kleur);
      return b;
    },
    /** Een zachte schaduw op de grond, naar rechtsachter. */
    schaduw(x, y, dx, dy, lengte = 40) {
      return b.vlak([[x + lengte, y - lengte * 0.2, 0], [x + dx + lengte, y - lengte * 0.2, 0], [x + dx + lengte, y + dy, 0], [x + dx, y + dy, 0], [x, y + dy, 0], [x, y, 0]], SCHADUW);
    },
    /** Een lijn op het scherm rond een punt in de ruimte: een teken op een schijf staat rechtop. */
    schermLijn(plek, verschuiving, kleur, dik) {
      const [x, y] = pt(...plek);
      delen.push(`<polyline points="${verschuiving.map(([a, c]) => `${(x + a).toFixed(2)},${(y + c).toFixed(2)}`).join(" ")}" fill="none" stroke="${kleur}" stroke-width="${dik}" stroke-linecap="round" stroke-linejoin="round"/>`);
      return b;
    },
    svg() {
      const xs = punten.map((p) => p[0]);
      const ys = punten.map((p) => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const schaal = Math.min((BREEDTE - 2 * MARGE_X) / (x1 - x0), (HOOGTE - 2 * MARGE_Y) / (y1 - y0));
      const tx = (BREEDTE - schaal * (x1 + x0)) / 2;
      const ty = (HOOGTE - schaal * (y1 + y0)) / 2;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${BREEDTE * 2}" height="${HOOGTE * 2}" viewBox="0 0 ${BREEDTE} ${HOOGTE}">`
        + `<rect width="${BREEDTE}" height="${HOOGTE}" fill="${GROND}"/>`
        + `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${schaal.toFixed(4)})">${delen.join("")}</g></svg>`;
    },
  };
  return b;
}

/** Tekstregels op een vel: balkjes in plaats van woorden. */
function regels(b, x, y, z, lengtes, stap = 13, dik = 3.2, kleur = LIJN_LICHT) {
  lengtes.forEach((l, i) => {
    const yy = y + i * stap;
    b.lijn([[x, yy, z], [x + l, yy, z]], kleur, dik);
  });
}

/** Een pijl door de ruimte als een plat, stevig vlak: schacht en punt. */
function pijlOmlaag(b, x, y, z0, z1, kleuren = TURKOOIS, breed = 13) {
  const d = breed * 0.42;
  const kop = breed * 1.55;
  b.vlak([[x - d, y + d, z0], [x + d, y - d, z0], [x + d, y - d, z1 + kop], [x + breed, y - breed, z1 + kop], [x, y, z1], [x - breed, y + breed, z1 + kop], [x - d, y + d, z1 + kop]], kleuren.boven);
}

// ── De beelden ───────────────────────────────────────────────────────────────

/** Lege tekening: een leeg vel op de tekentafel, met stempelveld, potlood en driehoek. */
function tekenblad() {
  const b = beeld();
  b.schaduw(-120, -60, 250, 190, 34);
  b.vel(-120, -60, 250, 190, 5);
  const z = 5;
  // het raster op het vel, licht
  for (let x = -100; x <= 120; x += 30) b.lijn([[x, -48, z], [x, 120, z]], "#ece9e2", 1);
  for (let y = -40; y <= 120; y += 30) b.lijn([[-110, y, z], [120, y, z]], "#ece9e2", 1);
  b.lijn([[-110, -50, z], [120, -50, z], [120, 120, z], [-110, 120, z]], LIJN, 1.4, true);
  // stempelveld in de hoek
  b.vlak([[50, 86, z], [120, 86, z], [120, 120, z], [50, 120, z]], LEI.boven);
  regels(b, 58, 96, z, [52, 34], 11, 2.6, "#c9d4df");
  // de driehoek
  b.vlak([[-92, -28, z + 3], [-92, 74, z + 3], [26, 74, z + 3]], "rgba(116,195,183,0.38)", TURKOOIS.rechts, 1.6);
  b.vlak([[-78, 26, z + 3], [-78, 60, z + 3], [-38, 60, z + 3]], PAPIER, TURKOOIS.rechts, 1.2);
  // het potlood, schuin over het vel
  const [hx, hy] = [66, -18];
  const lengte = 118;
  const [ex, ey] = [Math.cos(2.06), Math.sin(2.06)];
  const [nx, ny] = [-ey, ex];
  const r = 6.5;
  const p = (d, n, h) => [hx + ex * d + nx * n, hy + ey * d + ny * n, z + h];
  b.vlak([p(0, -r, 2), p(0, r, 2), p(lengte, r, 2), p(lengte, -r, 2)], SCHADUW);
  b.vlak([p(0, -r, 2), p(0, r, 2), p(lengte, r, 2), p(lengte, -r, 2)], LEI.rechts);
  b.vlak([p(0, -r, 14), p(0, r, 14), p(lengte, r, 14), p(lengte, -r, 14)], LEI.boven);
  b.vlak([p(0, r, 2), p(lengte, r, 2), p(lengte, r, 14), p(0, r, 14)], LEI.links);
  b.vlak([p(lengte, r, 2), p(lengte + 26, 0, 3), p(lengte, r, 14)], TURKOOIS.links);
  b.vlak([p(lengte, -r, 14), p(lengte + 26, 0, 3), p(lengte, r, 14)], TURKOOIS.boven);
  return b.svg();
}

/** Open FEM Studio-project: een raamwerk op een rastervloer, met knopen en de vervormde ligger. */
function femProject() {
  const b = beeld();
  const h = 118;
  const kolommen = [[-130, -60], [20, -60], [170, -60], [-130, 70], [20, 70], [170, 70]];
  b.schaduw(-170, -90, 370, 190, 26);
  // de vloer met het elementennet
  b.blok(-170, -90, 0, 370, 190, 4, { boven: "#ebe8e1", links: PAPIER_LINKS, rechts: PAPIER_RECHTS });
  for (let x = -170; x <= 200; x += 37) b.lijn([[x, -90, 4], [x, 100, 4]], LIJN_LICHT, 1);
  for (let y = -90; y <= 100; y += 38) b.lijn([[-170, y, 4], [200, y, 4]], LIJN_LICHT, 1);
  const d = 9;
  // de achterste ligger, dan de kolommen van achter naar voor
  const ligger = (y) => b.blok(-130 - d / 2, y - d / 2, h, 300 + d, d, 13);
  ligger(-60);
  for (const [x, y] of kolommen.filter(([, q]) => q < 0)) b.blok(x - d / 2, y - d / 2, 4, d, d, h, LEI);
  for (const x of [-130, 20, 170]) b.blok(x - d / 2, -60, h, d, 130, 13);
  for (const [x, y] of kolommen.filter(([, q]) => q > 0)) b.blok(x - d / 2, y - d / 2, 4, d, d, h, LEI);
  ligger(70);
  // de vervormde lijn onder de voorste ligger
  const vorm = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    return [-130 + 300 * t, 70 + d / 2 + 1, h - 7 - 26 * Math.sin(Math.PI * ((t * 2) % 1)) * Math.sin(Math.PI * ((t * 2) % 1))];
  });
  b.lijn(vorm, TURKOOIS.links, 3.4);
  // de knopen
  for (const [x, y] of kolommen) b.schijf(x, y, h + 13, 8.5, TURKOOIS.boven, 3, TURKOOIS.links);
  for (const [x, y] of kolommen) b.schijf(x, y, 4, 9, LICHT.boven, 2, LICHT.rechts);
  return b.svg();
}

/** Eén cel van een notebook: een opstaande plaat met regels code. */
function cel(b, x, y, z, dx, dy, kleur = LICHT, regelsCode = []) {
  b.blok(x, y, z, dx, dy, 9, { boven: PAPIER, links: PAPIER_LINKS, rechts: PAPIER_RECHTS });
  b.vlak([[x, y, z + 9], [x + 10, y, z + 9], [x + 10, y + dy, z + 9], [x, y + dy, z + 9]], kleur.boven);
  regels(b, x + 22, y + 13, z + 9, regelsCode, 13, 3.2, LIJN);
}

/** Jupyter-notebook: gestapelde cellen, de laatste met een grafiek als uitvoer. */
function jupyter() {
  const b = beeld();
  b.schaduw(-96, -92, 190, 262, 30);
  b.vel(-96, -92, 190, 262, 6);
  const z = 6;
  cel(b, -82, -80, z, 162, 44, LEI, [96, 124]);
  cel(b, -82, -26, z, 162, 44, LEI, [120, 72]);
  // de uitvoer: een eigen vlak met staven
  b.blok(-82, 30, z, 162, 128, 9, { boven: "#eef7f5", links: PAPIER_LINKS, rechts: PAPIER_RECHTS });
  b.vlak([[-82, 30, z + 9], [-72, 30, z + 9], [-72, 158, z + 9], [-82, 158, z + 9]], TURKOOIS.boven);
  b.lijn([[-56, 44, z + 9], [-56, 146, z + 9], [66, 146, z + 9]], LIJN, 1.6);
  [34, 62, 46, 84, 58].forEach((hoogte, i) => {
    b.blok(-46 + i * 22, 118, z + 9, 13, 16, hoogte, TURKOOIS);
  });
  return b.svg();
}

/** Marimo-notebook: een schuif die via lijnen de cellen stuurt tot en met de grafiek. */
function marimo() {
  const b = beeld();
  b.schaduw(-124, -94, 268, 212, 28);
  b.blok(-124, -94, 0, 268, 212, 4, { boven: "#ebe8e1", links: PAPIER_LINKS, rechts: PAPIER_RECHTS });
  const z = 4;
  // de verbindingen, onder de platen door
  const lijn = (a, c) => b.lijn([[a[0], a[1], z + 1], [c[0], c[1], z + 1]], TURKOOIS.links, 3.2);
  lijn([-48, -48], [-48, 14]);
  lijn([-48, 14], [72, 14]);
  lijn([-48, -48], [84, -48]);
  lijn([84, -48], [72, 14]);
  lijn([72, 14], [72, 70]);
  lijn([-48, 14], [-48, 70]);
  lijn([-48, 70], [72, 70]);
  // de schuif
  b.blok(-108, -82, z, 132, 36, 9, { boven: PAPIER, links: PAPIER_LINKS, rechts: PAPIER_RECHTS });
  b.lijn([[-92, -64, z + 9], [8, -64, z + 9]], LIJN, 3.6);
  b.lijn([[-92, -64, z + 9], [-28, -64, z + 9]], TURKOOIS.links, 3.6);
  b.schijf(-28, -64, z + 9, 9.5, TURKOOIS.boven, 5, TURKOOIS.rechts);
  // de cellen
  cel(b, 42, -68, z, 88, 38, LEI, [46]);
  cel(b, -102, -8, z, 104, 40, LEI, [62, 40]);
  // de grafiek
  b.blok(4, -2, z, 128, 106, 9, { boven: "#eef7f5", links: PAPIER_LINKS, rechts: PAPIER_RECHTS });
  b.lijn([[18, 8, z + 9], [18, 92, z + 9], [120, 92, z + 9]], LIJN, 1.6);
  b.lijn(Array.from({ length: 31 }, (_, i) => {
    const t = i / 30;
    return [24 + 94 * t, 86 - 66 * Math.sin(Math.PI * t) ** 1.2, z + 9];
  }), TURKOOIS.links, 3.8);
  // de uitvoer van de linkercel
  cel(b, -102, 52, z, 86, 40, LICHT, [50]);
  return b.svg();
}

/** Een pagina met koppen, tekst en een lijst, met een omgevouwen hoek. */
function pagina(b, x, y, z, dx, dy) {
  const hoek = 34;
  b.vlak([[x, y, z], [x + dx, y, z], [x + dx, y + dy - hoek, z], [x + dx - hoek, y + dy, z], [x, y + dy, z]], SCHADUW);
  b.vlak([[x, y + dy, z], [x + dx - hoek, y + dy, z], [x + dx - hoek, y + dy, z + 6], [x, y + dy, z + 6]], PAPIER_LINKS);
  b.vlak([[x + dx, y, z], [x + dx, y + dy - hoek, z], [x + dx, y + dy - hoek, z + 6], [x + dx, y, z + 6]], PAPIER_RECHTS);
  b.vlak([[x + dx, y + dy - hoek, z], [x + dx - hoek, y + dy, z], [x + dx - hoek, y + dy, z + 6], [x + dx, y + dy - hoek, z + 6]], PAPIER_RECHTS);
  const zb = z + 6;
  b.vlak([[x, y, zb], [x + dx, y, zb], [x + dx, y + dy - hoek, zb], [x + dx - hoek, y + dy, zb], [x, y + dy, zb]], PAPIER);
  b.vlak([[x + dx, y + dy - hoek, zb], [x + dx - hoek, y + dy - hoek, zb], [x + dx - hoek, y + dy, zb]], PAPIER_LINKS);
  return zb;
}

/** De inhoud van een Markdown-pagina: het kopteken, koppen, tekst en een lijst. */
function markdownInhoud(b, x, y, z, dx) {
  // het kopteken, twee maal twee strepen
  const m = (a, c, q, s) => b.lijn([[x + 14 + a, y + 14 + c, z], [x + 14 + q, y + 14 + s, z]], TURKOOIS.links, 3.6);
  m(6, 0, 3, 20); m(15, 0, 12, 20); m(0, 6, 19, 6); m(-1, 14, 18, 14);
  b.lijn([[x + 44, y + 24, z], [x + dx - 22, y + 24, z]], LEI.boven, 8);
  regels(b, x + 16, y + 56, z, [dx - 40, dx - 62, dx - 34, dx - 86], 14, 3.2, LIJN);
  const y2 = y + 124;
  b.lijn([[x + 16, y2, z], [x + dx * 0.56, y2, z]], LEI.links, 5.4);
  for (const i of [0, 1, 2]) {
    const q = y2 + 20 + i * 16;
    b.schijf(x + 22, q, z, 4, TURKOOIS.boven);
    b.lijn([[x + 34, q, z], [x + dx * (0.72 - i * 0.1), q, z]], LIJN, 3.2);
  }
}

/** Markdown toevoegen: een nieuwe pagina met een plusteken erbij. */
function markdown() {
  const b = beeld();
  const [x, y, dx, dy] = [-96, -92, 192, 258];
  b.schaduw(x, y, dx, dy, 30);
  const z = pagina(b, x, y, 0, dx, dy);
  markdownInhoud(b, x, y, z, dx);
  // de plus, op een dikke turkooizen schijf
  const [px, py] = [92, 44];
  b.schijf(px, py, 6, 40, TURKOOIS.boven, 12, TURKOOIS.rechts);
  b.schermLijn([px, py, 18], [[-19, 0], [19, 0]], "#ffffff", 7.5);
  b.schermLijn([px, py, 18], [[0, -13], [0, 13]], "#ffffff", 7.5);
  return b.svg();
}

/** Markdown inlezen: een bestaande pagina zakt met een pijl in het blad. */
function markdownImport() {
  const b = beeld();
  // de bak waarin de pagina landt
  b.schaduw(-132, -112, 264, 276, 28);
  b.blok(-132, -112, 0, 264, 276, 24, LEI);
  b.vlak([[-116, -96, 24], [116, -96, 24], [116, 148, 24], [-116, 148, 24]], LEI.rechts);
  // de pagina, in de lucht
  const [x, y, dx, dy] = [-84, -102, 168, 214];
  const zb = pagina(b, x, y, 72, dx, dy);
  markdownInhoud(b, x, y, zb, dx);
  // de pijl ervoor, naar beneden
  const [ax, ay] = [152, 18];
  pijlOmlaag(b, ax, ay, 172, 42, TURKOOIS, 26);
  return b.svg();
}

/** De demo van Open CalcSheet Studio: een rekenblad met een formule, een M-lijn en het oordeel. */
function rekentaalDemo() {
  const b = beeld();
  const [x, y, dx, dy] = [-104, -86, 208, 252];
  b.schaduw(x, y, dx, dy, 30);
  b.vel(x, y, dx, dy, 6);
  const z = 6;
  b.vlak([[x, y, z], [x + dx, y, z], [x + dx, y + 26, z], [x, y + 26, z]], LEI.boven);
  regels(b, x + 14, y + 13, z, [88], 12, 4.4, "#d4dde6");
  // de invoervelden
  for (const [i, l] of [52, 72, 40].entries()) {
    const q = y + 44 + i * 22;
    b.lijn([[x + 16, q, z], [x + 46, q, z]], LIJN, 3.2);
    b.vlak([[x + 58, q - 7, z], [x + 58 + l, q - 7, z], [x + 58 + l, q + 7, z], [x + 58, q + 7, z]], "#e9f4f2", TURKOOIS.links, 1.2);
  }
  // de formule, met een breukstreep
  const f = y + 118;
  b.lijn([[x + 16, f, z], [x + 42, f, z]], LEI.links, 4.2);
  b.lijn([[x + 54, f - 5, z], [x + 62, f - 5, z]], LIJN, 2.4);
  b.lijn([[x + 54, f + 5, z], [x + 62, f + 5, z]], LIJN, 2.4);
  b.lijn([[x + 76, f - 12, z], [x + 116, f - 12, z]], LIJN, 3.2);
  b.lijn([[x + 70, f, z], [x + 122, f, z]], LEI.links, 2.4);
  b.lijn([[x + 88, f + 12, z], [x + 104, f + 12, z]], LIJN, 3.2);
  // de momentenlijn van de ligger
  const g = y + 188;
  b.lijn([[x + 16, g, z], [x + dx - 18, g, z]], LEI.links, 4.4);
  b.lijn(Array.from({ length: 31 }, (_, i) => {
    const t = i / 30;
    return [x + 16 + (dx - 34) * t, g - 38 * 4 * t * (1 - t), z];
  }), TURKOOIS.links, 3.6);
  // het oordeel
  const [px, py] = [96, 142];
  b.schijf(px, py, 6, 38, TURKOOIS.boven, 12, TURKOOIS.rechts);
  b.schermLijn([px, py, 18], [[-18, 0], [-5, 10], [18, -11]], "#ffffff", 7.5);
  return b.svg();
}

/** Spanningen in een doorsnede: een stuk I-profiel met het spanningsveld op de snede, en de spanningsdriehoeken ernaast. */
function doorsnedeSpanningen() {
  const b = beeld();
  const [L, x0, h, tf, tw, bf] = [-150, -24, 150, 16, 18, 104];
  const [yv, xm] = [86, x0 + bf / 2];
  b.schaduw(x0, L, bf, yv - L, 46);
  // Het profiel, van achter naar voor: onderflens, lijf, bovenflens.
  b.blok(x0, L, 0, bf, yv - L, tf, LEI);
  b.blok(xm - tw / 2, L, tf, tw, yv - L, h - 2 * tf, LEI);
  b.blok(x0, L, h - tf, bf, yv - L, tf, LICHT);
  // Het veld op de snede: van leisteen onder naar turkoois boven.
  const meng = (t) => {
    const a = [0x2a, 0x42, 0x5b];
    const c = [0x74, 0xc3, 0xb7];
    return `rgb(${a.map((w, i) => Math.round(w + (c[i] - w) * t)).join(",")})`;
  };
  const stukken = 24;
  for (let i = 0; i < stukken; i++) {
    const [z0, z1] = [(h * i) / stukken, (h * (i + 1)) / stukken];
    const mid = (z0 + z1) / 2;
    const breed = mid < tf || mid > h - tf ? bf : tw;
    const x = xm - breed / 2;
    b.vlak([[x, yv, z0], [x + breed, yv, z0], [x + breed, yv, z1 + 0.4], [x, yv, z1 + 0.4]], meng(mid / h));
  }
  // De spanningsdiagrammen voor de snede: de as, trek in turkoois, druk in leisteen.
  const xa = x0 - 58;
  b.vlak([[xa, yv, h / 2], [xa, yv, h], [xa - 70, yv, h]], TURKOOIS.boven, TURKOOIS.rechts, 1.2);
  b.vlak([[xa, yv, h / 2], [xa, yv, 0], [xa + 44, yv, 0]], LEI.boven, LEI.rechts, 1.2);
  b.lijn([[xa, yv, -8], [xa, yv, h + 8]], LIJN, 1.8);
  return b.svg();
}

const BEELDEN = {
  "doorsnede-spanningen": doorsnedeSpanningen,
  tekenblad,
  "fem-project": femProject,
  jupyter,
  marimo,
  markdown,
  "markdown-import": markdownImport,
  "rekentaal-demo": rekentaalDemo,
};

const [uitvoer = MAP, ...alleen] = process.argv.slice(2);
mkdirSync(uitvoer, { recursive: true });
for (const [naam, maak] of Object.entries(BEELDEN)) {
  if (alleen.length && !alleen.includes(naam)) continue;
  const svg = Buffer.from(maak());
  const uit = await sharp(svg, { density: 144 }).resize(BREEDTE, HOOGTE).webp({ quality: 86, effort: 6 }).toBuffer();
  writeFileSync(join(uitvoer, `${naam}.webp`), uit);
  console.log(`${naam}.webp: ${(uit.length / 1024).toFixed(1)} kB`);
}
