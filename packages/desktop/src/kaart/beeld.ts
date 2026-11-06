/**
 * Een kaartbeeld voor de situatiepagina: de tegels van OpenStreetMap op een canvas, met een
 * speld in het midden, een schaalbalk, de bron en eventueel een lijn naar het water.
 * Faalt een tegel, dan faalt het hele beeld: er komt nooit een half beeld.
 */
import type { Punt } from "./punt.ts";
import { schaalbalk, tegelPositie, TEGEL, uitsnede, zoomVoor } from "./tegels.ts";
import { KAARTEN, type Kaartbeeld } from "../rapport/situatie.ts";

export interface KaartOpties {
  /** Het dichtstbijzijnde water: de blauwe streeplijn van de speld ernaartoe, met het label. */
  water?: { punt: Punt; label: string };
  /** De bronvermelding rechtsonder. */
  bron: string;
  /** De tekst bij de schaalbalk voor deze lengte in meters. */
  schaalLabel: (meters: number) => string;
}

const TEGEL_URL = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const TEGEL_TIJD_MS = 15000;
const MAX_BASE64 = 400000;

/** Eén tegel laden; `crossOrigin` houdt het canvas exporteerbaar. */
function laadTegel(z: number, x: number, y: number): Promise<HTMLImageElement> {
  return new Promise((ja, nee) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const klok = setTimeout(() => {
      img.src = "";
      nee(new Error(`tegel ${z}/${x}/${y}: te traag`));
    }, TEGEL_TIJD_MS);
    img.onload = () => {
      clearTimeout(klok);
      ja(img);
    };
    img.onerror = () => {
      clearTimeout(klok);
      nee(new Error(`tegel ${z}/${x}/${y} niet geladen`));
    };
    img.src = TEGEL_URL(z, x, y);
  });
}

/** Vullen de tegels het hele beeld, zonder gaten? */
function isVolledig(
  tegels: { px: number; py: number }[],
  breedte: number,
  hoogte: number,
): boolean {
  if (tegels.length === 0) return false;
  const xs = [...new Set(tegels.map((t) => t.px))];
  const ys = [...new Set(tegels.map((t) => t.py))];
  if (xs.length * ys.length !== tegels.length) return false;
  return (
    Math.min(...xs) <= 0 &&
    Math.max(...xs) + TEGEL >= breedte &&
    Math.min(...ys) <= 0 &&
    Math.max(...ys) + TEGEL >= hoogte
  );
}

/** Het lettertype van alle teksten in het beeld; meten en tekenen gebruiken dezelfde. */
const lettertype = (fs: number) => `${fs}px sans-serif`;

/** Een rode speld waarvan de punt op (x, y) staat. */
function tekenSpeld(c: CanvasRenderingContext2D, x: number, y: number, h: number) {
  const r = h * 0.2;
  const kop = y - h + r;
  c.save();
  c.beginPath();
  c.moveTo(x, y);
  c.bezierCurveTo(x - r * 0.4, y - h * 0.4, x - r, kop + r * 0.6, x - r, kop);
  c.arc(x, kop, r, Math.PI, 0);
  c.bezierCurveTo(x + r, kop + r * 0.6, x + r * 0.4, y - h * 0.4, x, y);
  c.closePath();
  c.fillStyle = "#d32f2f";
  c.strokeStyle = "#ffffff";
  c.lineWidth = Math.max(2, h * 0.06);
  c.shadowColor = "rgba(0,0,0,0.45)";
  c.shadowBlur = h * 0.15;
  c.stroke();
  c.fill();
  c.shadowColor = "transparent";
  c.beginPath();
  c.arc(x, kop, r * 0.38, 0, Math.PI * 2);
  c.fillStyle = "#ffffff";
  c.fill();
  c.restore();
}

/** Tekst met een lichte achtergrond, zodat hij op elke kaart leesbaar is. */
function tekenLabel(
  c: CanvasRenderingContext2D,
  tekst: string,
  x: number,
  y: number,
  uitlijning: "left" | "right" | "center",
  fs: number,
) {
  c.font = lettertype(fs);
  const b = c.measureText(tekst).width;
  const pad = fs * 0.3;
  const x0 = uitlijning === "left" ? x : uitlijning === "right" ? x - b : x - b / 2;
  c.fillStyle = "rgba(255,255,255,0.85)";
  c.fillRect(x0 - pad, y - fs - pad * 0.5, b + pad * 2, fs + pad * 1.5);
  c.fillStyle = "#222222";
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillText(tekst, x0, y);
}

/**
 * Maakt het beeld van kaart `k` rond punt `p`. Bij een fout (een tegel die niet laadt, te
 * dicht bij de pool voor een volledige kaart, een canvas dat niet te exporteren is) een Error.
 */
export async function maakKaartbeeld(
  p: Punt,
  k: (typeof KAARTEN)[number],
  opties: KaartOpties,
): Promise<Kaartbeeld> {
  const zoom = zoomVoor(p, k.breedte, k.meters);
  const tegels = uitsnede(p, zoom, k.breedte, k.hoogte);
  if (!isVolledig(tegels, k.breedte, k.hoogte)) {
    throw new Error("Voor deze plek is geen volledige kaart beschikbaar.");
  }
  const plaatjes = await Promise.all(tegels.map((t) => laadTegel(t.z, t.x, t.y)));

  const canvas = document.createElement("canvas");
  canvas.width = k.breedte;
  canvas.height = k.hoogte;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("Geen canvas beschikbaar.");
  c.fillStyle = "#e8e8e8";
  c.fillRect(0, 0, k.breedte, k.hoogte);
  tegels.forEach((t, i) => c.drawImage(plaatjes[i], t.px, t.py, TEGEL, TEGEL));

  const mx = k.breedte / 2;
  const my = k.hoogte / 2;
  // Vaste maten: de tegels hebben op elk beeld dezelfde pixelgrootte.
  const fs = 20;

  if (opties.water) {
    const a = tegelPositie(p, zoom);
    const w = tegelPositie(opties.water.punt, zoom);
    let wx = mx + (w.x - a.x) * TEGEL;
    let wy = my + (w.y - a.y) * TEGEL;
    // Ligt het water buiten het beeld, dan loopt de lijn tot net binnen de rand en eindigt in een pijl.
    const rand = fs * 1.2;
    const buiten = wx < rand || wx > k.breedte - rand || wy < rand || wy > k.hoogte - rand;
    const dx = wx - mx;
    const dy = wy - my;
    if (buiten) {
      const tx = dx > 0 ? (k.breedte - rand - mx) / dx : dx < 0 ? (rand - mx) / dx : Infinity;
      const ty = dy > 0 ? (k.hoogte - rand - my) / dy : dy < 0 ? (rand - my) / dy : Infinity;
      const t = Math.min(tx, ty, 1);
      wx = mx + dx * t;
      wy = my + dy * t;
    }
    c.save();
    c.strokeStyle = "#1565c0";
    c.fillStyle = "#1565c0";
    c.lineWidth = Math.max(3, fs * 0.2);
    c.setLineDash([fs * 0.7, fs * 0.45]);
    c.beginPath();
    c.moveTo(mx, my);
    c.lineTo(wx, wy);
    c.stroke();
    if (buiten) {
      const hoek = Math.atan2(dy, dx);
      const l = fs * 1.2;
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(wx, wy);
      c.lineTo(wx - l * Math.cos(hoek - 0.45), wy - l * Math.sin(hoek - 0.45));
      c.lineTo(wx - l * Math.cos(hoek + 0.45), wy - l * Math.sin(hoek + 0.45));
      c.closePath();
      c.fill();
    }
    c.restore();
    // Het label blijft altijd binnen het beeld, ook voor water aan de rand of daarbuiten.
    c.font = lettertype(fs);
    const halve = c.measureText(opties.water.label).width / 2 + fs * 0.3;
    const lx = Math.min(Math.max(wx, halve), k.breedte - halve);
    const ly = Math.min(Math.max(wy - fs * 0.8, fs * 1.5), k.hoogte - fs * 4);
    tekenLabel(c, opties.water.label, lx, ly, "center", fs);
  }

  tekenSpeld(c, mx, my, 52);

  const marge = fs * 0.6;
  const balk = schaalbalk(p.lat, zoom, k.breedte * 0.3);
  const by = k.hoogte - marge - fs * 1.9;
  c.fillStyle = "rgba(255,255,255,0.85)";
  const tekst = opties.schaalLabel(balk.meters);
  c.font = lettertype(fs);
  const tb = Math.max(balk.px, c.measureText(tekst).width);
  c.fillRect(marge - fs * 0.3, by - fs * 0.3, tb + fs * 0.6, fs * 2.2);
  c.fillStyle = "#222222";
  c.fillRect(marge, by + fs * 0.9, balk.px, Math.max(3, fs * 0.18));
  c.fillRect(marge, by + fs * 0.5, Math.max(2, fs * 0.1), fs * 0.6);
  c.fillRect(marge + balk.px - Math.max(2, fs * 0.1), by + fs * 0.5, Math.max(2, fs * 0.1), fs * 0.6);
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillText(tekst, marge, by + fs * 0.4);

  tekenLabel(c, opties.bron, k.breedte - marge, k.hoogte - marge, "right", Math.round(fs * 0.8));

  // toDataURL gooit een SecurityError als het canvas besmet is; dat is dan een Error van het beeld.
  // Kwaliteit 0,85; een drukke plek kan boven de grens van het project uitkomen (400 000
  // base64-tekens, zo'n 300 kB): dan stap voor stap iets lager.
  let jpeg = "";
  for (const kwaliteit of [0.85, 0.78, 0.7, 0.62]) {
    const url = canvas.toDataURL("image/jpeg", kwaliteit);
    jpeg = url.slice(url.indexOf(",") + 1);
    if (jpeg.length <= MAX_BASE64) break;
  }
  if (!jpeg) throw new Error("Het beeld kon niet worden bewaard.");
  return { id: k.id, zoom, jpeg };
}
