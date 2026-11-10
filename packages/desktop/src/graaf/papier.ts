/**
 * De graaf als SVG, voor op papier: dezelfde plek en poorten als op het scherm,
 * met de velden en het voorbeeld als tekst. Zuiver (een tekst erin, een tekst
 * eruit), dus los te toetsen; de opmaak staat in de SVG zelf, want de afdruk heeft
 * geen thema.
 */
import { uitkomstVerborgen, type Graaf, type GraafNode } from "./model.ts";
import { KOP_HOOGTE, RIJ_HOOGTE, nodeBreedte, poortenVan, veldSleutel, verbindingMidden, verbindingPad, type Poorten } from "./nodes.ts";
import { actieveVerbindingen, type GraafMelding, type GraafUitkomst } from "./rekenen.ts";
import { voorbeeldVan } from "./voorbeeld.ts";
import { waardeTekst } from "./waarde.ts";
import { groepKader, ingeklaptKaart, zichtbarePoortPlek, type Maat } from "./groepen.ts";

export interface PapierTeksten {
  naamVan: (node: GraafNode) => string;
  poort: (node: GraafNode, naam: string) => string;
  melding: (m: GraafMelding, node: GraafNode) => string;
  meer: (aantal: number) => string;
}

export interface GraafSvg {
  svg: string;
  breedte: number;
  hoogte: number;
}

const REGEL = 15;
const MARGE = 16;
const TEKEN_BREEDTE = 5.6;
const KLEUR = {
  rand: "#94a3b8",
  kop: "#e2e8f0",
  tekst: "#0f172a",
  zacht: "#64748b",
  lijn: "#64748b",
  fout: "#b91c1c",
  vak: "#f8fafc",
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function kort(t: string, breedte: number): string {
  const max = Math.max(4, Math.floor(breedte / TEKEN_BREEDTE));
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function tekst(x: number, y: number, t: string, opties: { kleur?: string; dik?: boolean; rechts?: boolean; mono?: boolean } = {}): string {
  const delen = [`x="${x}"`, `y="${y}"`, `fill="${opties.kleur ?? KLEUR.tekst}"`];
  if (opties.dik) delen.push('font-weight="600"');
  if (opties.rechts) delen.push('text-anchor="end"');
  if (opties.mono) delen.push('font-family="Consolas, monospace"');
  return `<text ${delen.join(" ")}>${esc(t)}</text>`;
}

/** Wat er onder de poorten staat: de velden van de node, per regel. */
function veldRegels(node: GraafNode): { tekst: string; mono?: boolean }[] {
  const i = node.invoer ?? {};
  if (node.soort === "getal") return [{ tekst: `${i.waarde ?? ""} ${i.eenheid ?? ""}`.trim() }];
  if (node.soort === "tekst") return (i.tekst ?? "").split("\n").slice(0, 6).map((t) => ({ tekst: t }));
  if (node.soort === "codeblok") return (i.code ?? "").split("\n").slice(0, 24).map((t) => ({ tekst: t, mono: true }));
  return [];
}

function tekenNode(node: GraafNode, poorten: Poorten, uitkomst: GraafUitkomst, verbonden: Set<string>, t: PapierTeksten): { svg: string; hoogte: number } {
  const b = nodeBreedte(node);
  const delen: string[] = [];
  const rijen = Math.max(poorten.ingangen.length, poorten.uitgangen.length);
  let y = KOP_HOOGTE + rijen * RIJ_HOOGTE;

  delen.push(tekst(8, KOP_HOOGTE / 2 + 4, kort(t.naamVan(node), b - 16), { dik: true }));
  poorten.ingangen.forEach((p, i) => {
    const py = KOP_HOOGTE + RIJ_HOOGTE * (i + 0.5);
    delen.push(`<circle cx="0" cy="${py}" r="3.5" fill="#fff" stroke="${KLEUR.lijn}"/>`);
    const label = t.poort(node, p.naam);
    delen.push(tekst(9, py + 4, label));
    if (!verbonden.has(`${node.id}\u0000${p.naam}`)) {
      const veld = node.invoer?.[veldSleutel(node, p.naam)] ?? p.standaard ?? "";
      if (veld) delen.push(tekst(9 + label.length * TEKEN_BREEDTE + 6, py + 4, kort(veld, b * 0.55), { kleur: KLEUR.zacht }));
    }
  });
  poorten.uitgangen.forEach((u, i) => {
    const py = KOP_HOOGTE + RIJ_HOOGTE * (i + 0.5);
    delen.push(`<circle cx="${b}" cy="${py}" r="3.5" fill="${KLEUR.lijn}" stroke="${KLEUR.lijn}"/>`);
    delen.push(tekst(b - 9, py + 4, t.poort(node, u), { rechts: true }));
  });

  const velden = veldRegels(node);
  if (velden.length > 0) {
    y += 4;
    for (const v of velden) {
      y += REGEL;
      delen.push(tekst(8, y - 4, kort(v.tekst, b - 16), { mono: v.mono }));
    }
  }

  const u = uitkomst.nodes[node.id];
  const onder: string[] = [];
  y += 4;
  const beginOnder = y;
  for (const m of u?.meldingen.filter((x) => x.code === "uitgeschakeld") ?? []) {
    y += REGEL;
    onder.push(tekst(8, y - 4, kort(t.melding(m, node), b - 16), { kleur: KLEUR.zacht }));
  }
  for (const f of u?.fouten ?? []) {
    y += REGEL;
    onder.push(tekst(8, y - 4, kort(t.melding(f, node), b - 16), { kleur: KLEUR.fout }));
  }
  // Het oogje op het scherm geldt ook op papier; een fout staat er altijd.
  if (u && u.fouten.length === 0 && !uitkomstVerborgen(node)) {
    const v = voorbeeldVan(u, 6);
    for (const r of v.regels) {
      y += REGEL;
      onder.push(tekst(8, y - 4, kort(`${r.label ? `${r.label}: ` : ""}${r.tekst}`, b - 16)));
    }
    if (v.rest > 0) {
      y += REGEL;
      onder.push(tekst(8, y - 4, t.meer(v.rest), { kleur: KLEUR.zacht }));
    }
  }
  if (onder.length > 0) {
    y += 3;
    delen.push(`<rect x="1" y="${beginOnder}" width="${b - 2}" height="${y - beginOnder - 1}" fill="${KLEUR.vak}"/>`);
    delen.push(...onder);
  }
  const hoogte = Math.max(y, KOP_HOOGTE + 8);
  const kader =
    `<rect x="0" y="0" width="${b}" height="${hoogte}" rx="4" fill="#fff" stroke="${KLEUR.rand}"/>` +
    `<path d="M 0 ${KOP_HOOGTE} V 4 Q 0 0 4 0 H ${b - 4} Q ${b} 0 ${b} 4 V ${KOP_HOOGTE} Z" fill="${KLEUR.kop}" stroke="${KLEUR.rand}"/>`;
  // Uitgeschakeld: de hele node half doorzichtig, zoals op het scherm.
  const uit = node.uit ? ' opacity="0.5"' : "";
  return { svg: `<g transform="translate(${node.x} ${node.y})"${uit}>${kader}${delen.join("")}</g>`, hoogte };
}

export function graafSvg(graaf: Graaf, uitkomst: GraafUitkomst, t: PapierTeksten): GraafSvg {
  const poorten = new Map<string, Poorten>(graaf.nodes.map((n) => [n.id, uitkomst.nodes[n.id]?.poorten ?? poortenVan(n)]));
  const actief = actieveVerbindingen(graaf, poorten);
  const verbonden = new Set(actief.map((v) => `${v.naarNode}\u0000${v.naarPoort}`));
  const opId = new Map(graaf.nodes.map((n) => [n.id, n]));

  const alle = graaf.nodes.map((n) => ({ n, ...tekenNode(n, poorten.get(n.id)!, uitkomst, verbonden, t) }));
  const maten = new Map<string, Maat>(alle.map(({ n, hoogte }) => [n.id, { x: n.x, y: n.y, b: nodeBreedte(n), h: hoogte }]));

  // Losse teksten: titel vet, de tekst eronder, in een dun kader.
  const teksten = (graaf.teksten ?? []).map((tk) => {
    const regels = tk.tekst ? tk.tekst.split("\n") : [];
    const h = 8 + (tk.titel ? REGEL : 0) + regels.length * REGEL + 6;
    maten.set(tk.id, { x: tk.x, y: tk.y, b: tk.breedte, h });
    let y = 8;
    const delen: string[] = [];
    if (tk.titel) {
      y += REGEL;
      delen.push(tekst(8, y - 4, kort(tk.titel, tk.breedte - 16), { dik: true }));
    }
    for (const r of regels) {
      y += REGEL;
      delen.push(tekst(8, y - 4, kort(r, tk.breedte - 16)));
    }
    return `<g transform="translate(${tk.x} ${tk.y})"><rect x="0" y="0" width="${tk.breedte}" height="${h}" rx="4" fill="#fff" stroke="${KLEUR.rand}" stroke-width="0.8"/>${delen.join("")}</g>`;
  });

  // Groepen: een gestippeld kader met de naam; ingeklapt een kaart, zonder de leden.
  const weg = new Set((graaf.groepen ?? []).filter((g) => g.ingeklapt).flatMap((g) => g.leden));
  const kaders: string[] = [];
  const kaarten: string[] = [];
  const groepMaten: Maat[] = [];
  for (const g of graaf.groepen ?? []) {
    const k = g.ingeklapt ? ingeklaptKaart(g, maten) : groepKader(g, maten);
    if (!k) continue;
    groepMaten.push(k);
    if (g.ingeklapt) {
      kaarten.push(
        `<g transform="translate(${k.x} ${k.y})"><rect x="0" y="0" width="${k.b}" height="${k.h}" rx="6" fill="${KLEUR.kop}" stroke="${KLEUR.rand}"/>` +
          `${tekst(10, 24, kort(g.naam, k.b - 20), { dik: true })}${tekst(10, 42, `(${g.leden.length})`, { kleur: KLEUR.zacht })}</g>`,
      );
    } else {
      kaders.push(
        `<g transform="translate(${k.x} ${k.y})"><rect x="0" y="0" width="${k.b}" height="${k.h}" rx="8" fill="none" stroke="${KLEUR.zacht}" stroke-dasharray="4 3"/>` +
          `${tekst(10, 20, kort(g.naam, k.b - 20), { dik: true })}</g>`,
      );
    }
  }

  const nodes = alle.filter(({ n }) => !weg.has(n.id));
  const lijnen = actief.flatMap((v) => {
    // Binnen één ingeklapte groep: niet te zien.
    if (weg.has(v.vanNode) && weg.has(v.naarNode) && graaf.groepen?.some((g) => g.ingeklapt && g.leden.includes(v.vanNode) && g.leden.includes(v.naarNode))) return [];
    const a = zichtbarePoortPlek(graaf, opId.get(v.vanNode)!, poorten.get(v.vanNode)!, "uit", v.vanPoort, maten);
    const b = zichtbarePoortPlek(graaf, opId.get(v.naarNode)!, poorten.get(v.naarNode)!, "in", v.naarPoort, maten);
    if (!a || !b) return [];
    const pad = `<path d="${verbindingPad(a, b)}" fill="none" stroke="${KLEUR.lijn}" stroke-width="1.2"/>`;
    // Een blijvend label: de waarde op het midden van de lijn, op een wit vlakje.
    const w = v.label ? uitkomst.nodes[v.vanNode]?.waarden[v.vanPoort] : undefined;
    if (w === undefined) return [pad];
    const m = verbindingMidden(a, b);
    const label = kort(waardeTekst(w), 160);
    const breed = label.length * TEKEN_BREEDTE + 10;
    return [
      pad,
      `<rect x="${m.x - breed / 2}" y="${m.y - 9}" width="${breed}" height="16" rx="8" fill="#fff" stroke="${KLEUR.lijn}" stroke-width="0.8"/>`,
      `<text x="${m.x}" y="${m.y + 3}" text-anchor="middle" fill="${KLEUR.tekst}">${esc(label)}</text>`,
    ];
  });

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const vlakken: Maat[] = [
    ...nodes.map(({ n, hoogte }) => ({ x: n.x, y: n.y, b: nodeBreedte(n), h: hoogte })),
    ...(graaf.teksten ?? []).map((tk) => maten.get(tk.id)!),
    ...groepMaten,
  ];
  for (const m of vlakken) {
    x0 = Math.min(x0, m.x);
    y0 = Math.min(y0, m.y);
    x1 = Math.max(x1, m.x + m.b);
    y1 = Math.max(y1, m.y + m.h);
  }
  if (vlakken.length === 0) {
    x0 = y0 = 0;
    x1 = y1 = 1;
  }
  const breedte = x1 - x0 + 2 * MARGE;
  const hoogte = y1 - y0 + 2 * MARGE;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - MARGE} ${y0 - MARGE} ${breedte} ${hoogte}" ` +
    `font-family="Segoe UI, Inter, system-ui, sans-serif" font-size="11">` +
    `${kaders.join("")}${lijnen.join("")}${nodes.map((d) => d.svg).join("")}${teksten.join("")}${kaarten.join("")}</svg>`;
  return { svg, breedte, hoogte };
}
