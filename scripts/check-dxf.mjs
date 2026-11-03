/**
 * Controle van de DXF-omzetting (packages/desktop/src/components/ribbon/dxfNaarSvg.ts).
 *
 * De knop "Afbeelding…" in het lint zet een DXF-tekening om naar een
 * `@svg … @end`-blok. Hier wordt nagerekend, met kleine zelfgemaakte
 * tekeningen in scripts/fixtures/dxf-*.dxf:
 *
 *   • geometrie   — de eindpunten in de SVG, teruggerekend naar tekeningcoördinaten,
 *                   liggen waar ze horen (y-as omgeklapt, blokken geschaald,
 *                   gedraaid en gespiegeld, bulges als bogen);
 *   • lagen       — kleur, lijndikte en lijntype van de laag; lagen die uit,
 *                   bevroren of niet-plotbaar zijn blijven weg;
 *   • tekst       — besturings- en opmaakcodes, uitlijning, en leestekens als
 *                   tekenverwijzing zodat het blad ze niet als rekentaal leest;
 *   • blad        — het blok gaat ongeschonden door parse/evaluate/render van de kern;
 *   • fouten      — DWG, binaire DXF, geen DXF, lege tekening, te groot.
 *
 * Draaien:  node scripts/check-dxf.mjs   (vereist een gebouwde core)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { dxfNaarSvg, leesDxf, DxfFout } from "../packages/desktop/src/components/ribbon/dxfNaarSvg.ts";
import { parse, evaluate, render } from "../packages/core/dist/index.js";

const hier = dirname(fileURLToPath(import.meta.url));
const FIX = join(hier, "fixtures");
let fouten = 0;

function meld(ok, naam, detail = "") {
  if (ok) console.log(`  OK     ${naam}`);
  else {
    fouten++;
    console.log(`  FOUT   ${naam}${detail ? `\n         ${detail}` : ""}`);
  }
}

const bytes = (naam) => new Uint8Array(readFileSync(join(FIX, naam)));
const zetOm = (naam) => dxfNaarSvg(leesDxf(bytes(naam)));
const tekstBytes = (s) => new TextEncoder().encode(s);

/** Alle paden: attributen en de eindpunten van elk stuk, als tekeningcoördinaten. */
function paden(uit) {
  const [ox, oy] = uit.oorsprong;
  const lijst = [];
  for (const m of uit.svg.matchAll(/<path ([^>]*?) d="([^"]*)"\/>/g)) {
    const tk = m[2].match(/[MmLlAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
    const punten = [];
    let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
    const n = () => parseFloat(tk[i++]);
    while (i < tk.length) {
      if (/[A-Za-z]/.test(tk[i])) {
        cmd = tk[i++];
        if (cmd === "z" || cmd === "Z") { x = sx; y = sy; continue; }
      }
      if (cmd === "M") { x = n(); y = n(); sx = x; sy = y; }
      else if (cmd === "l") { x += n(); y += n(); }
      else if (cmd === "a") { i += 5; x += n(); y += n(); }
      else throw new Error(`onverwacht padcommando ${cmd}`);
      punten.push([ox + x, oy - y]);
    }
    lijst.push({ attr: m[1], d: m[2], punten });
  }
  return lijst;
}

const allePunten = (uit) => paden(uit).flatMap((p) => p.punten);
const heeftPunt = (pts, x, y, tol = 0.02) => pts.some(([a, b]) => Math.abs(a - x) <= tol && Math.abs(b - y) <= tol);

/** Klopt de nesting van de tags (zonder XML-parser)? */
function welgevormd(svg) {
  const stapel = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) { if (stapel.pop() !== m[2]) return false; }
    else stapel.push(m[2]);
  }
  return stapel.length === 0;
}

/** Het blok door de rekenkern: de SVG moet ongeschonden in de uitvoer staan. */
function doorHetBlad(svg) {
  const html = render(evaluate(parse(`"DXF-test\nx = 2\n@svg\n${svg}\n@end\n'Na de tekening\n`)));
  return html.includes(svg);
}

function algemeen(naam, uit) {
  meld(welgevormd(uit.svg), `${naam}: SVG is welgevormd`);
  meld(!/NaN|undefined|Infinity/.test(uit.svg), `${naam}: geen NaN/undefined/Infinity in de SVG`);
  meld(uit.svg.split("\n").every((r) => r.startsWith("<") && r.trim() !== "@end"), `${naam}: één element per regel, geen @end`);
  meld(doorHetBlad(uit.svg), `${naam}: blok gaat ongeschonden door parse/evaluate/render`);
}

// ─────────────────────────────────────────────────────────────────────────
console.log("Lijnen, bogen, krommen en lagen (dxf-lijnen.dxf):");
{
  const uit = zetOm("dxf-lijnen.dxf");
  algemeen("lijnen", uit);
  meld(uit.elementen === 15, "15 zichtbare elementen", `kreeg ${uit.elementen}`);
  meld(Object.keys(uit.overgeslagen).length === 0, "niets overgeslagen", JSON.stringify(uit.overgeslagen));
  meld(Math.abs(uit.breedte - 120) < 1e-6 && Math.abs(uit.hoogte - 97.5) < 1e-6,
    "maat 120 × 97,5: verborgen, bevroren, niet-plotbare en onzichtbare lijnen tellen niet mee",
    `${uit.breedte} × ${uit.hoogte}`);
  meld(uit.svg.includes('viewBox="0 0 122.4 99.9"'), "viewBox om de tekening met 1 % rand", uit.svg.split("\n")[0]);
  const pts = allePunten(uit);
  meld(heeftPunt(pts, 0, 0) && heeftPunt(pts, 100, 0) && heeftPunt(pts, 0, 50), "lijnen op hun plaats (y-as omgeklapt)");
  meld(!heeftPunt(pts, 200, 200, 1) && !heeftPunt(pts, -100, -100, 1) && !heeftPunt(pts, 0, 300, 1),
    "laag uit / bevroren / niet plotten: niet getekend");
  meld(heeftPunt(pts, 115, 25) && heeftPunt(pts, 120, 30), "gespiegelde boog (extrusie 0,0,-1) op x → -x");
  const p = paden(uit);
  const rood = p.find((q) => q.attr.includes('stroke="#f00"'));
  const zwart = p.find((q) => q.attr.includes('stroke="#000"') && !q.attr.includes("butt"));
  const dikte = (q) => parseFloat(/stroke-width="([^"]+)"/.exec(q?.attr ?? "")?.[1] ?? "0");
  meld(rood && dikte(rood) > 2.5 * dikte(zwart), "laagkleur rood met lijndikte 0,50 mm (dikker dan standaard)",
    `${rood?.attr} / ${zwart?.attr}`);
  meld(!/stroke="#fff"/.test(uit.svg) && zwart !== undefined, "wit (kleur 7) wordt zwart op papier");
  meld(uit.svg.includes('stroke="#979700"'), "geel wordt donkerder op papier");
  meld(uit.svg.includes('stroke="#123456"'), "ware kleur (420) gaat voor het kleurnummer");
  // Streeppatronen staan in beeldpunten (de lijn schaalt niet mee); de verhoudingen blijven.
  const patronen = [...uit.svg.matchAll(/stroke-dasharray="([^"]+)"/g)].map((m) => m[1].split(" ").map(Number));
  const zelfdeVorm = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v / a[0] - b[i] / b[0]) < 0.01);
  meld(patronen.some((q) => zelfdeVorm(q, [4, 2])), "lijntype van de laag als streeppatroon (4 : 2)", JSON.stringify(patronen));
  const sp = patronen.find((q) => zelfdeVorm(q, [12, 4, 0, 4]));
  const kort = patronen.find((q) => zelfdeVorm(q, [4, 2]));
  meld(sp && kort && Math.abs(sp[0] / kort[0] - 3) < 0.02, "eigen lijntype met punt, lijntypeschaal 2 (streep 12 tegen 4)");
  meld(/stroke-width="[^"]+" vector-effect="non-scaling-stroke"/.test(uit.svg), "lijndikte in beeldpunten, schaalt niet mee");
  const groen = p.find((q) => q.attr.includes('stroke="#00c400"'));
  meld(groen?.d.includes("a15 15 0 0 0 0-30"), "bulge 1 in een LWPOLYLINE wordt een halve cirkel", groen?.d.slice(0, 60));
  meld(heeftPunt(pts, 95, 20) && heeftPunt(pts, 80, 5), "POLYLINE met VERTEX'en en bulge");
  meld(heeftPunt(pts, 60, 45) && heeftPunt(pts, 40, 45), "volle ELLIPSE: uiteinden van de grote as");
  meld(heeftPunt(pts, 75, 51) && heeftPunt(pts, 75, 39), "halve ELLIPSE met staande grote as");
  meld(heeftPunt(pts, 0, 60) && heeftPunt(pts, 40, 60), "SPLINE begint en eindigt in zijn eindpunten");
  meld(/stroke-width="2" stroke-linecap="butt"/.test(uit.svg), "LWPOLYLINE met constante breedte 2 als dikke lijn");
  meld(/<path fill="#000" d="M[^"]*z[^"]*z"\/>/.test(uit.svg), "wisselende breedte als gevulde vlakken");
  meld(dxfNaarSvg(leesDxf(bytes("dxf-lijnen.dxf"))).svg === uit.svg, "zelfde invoer, zelfde SVG");
  // De fixture staat in de werkmap op LF of CRLF (core.autocrlf): beide vormen expliciet maken.
  const lf = new TextDecoder().decode(bytes("dxf-lijnen.dxf")).replace(/\r\n/g, "\n");
  meld(dxfNaarSvg(leesDxf(tekstBytes(lf))).svg === uit.svg, "LF-regeleinden geven dezelfde SVG");
  meld(dxfNaarSvg(leesDxf(tekstBytes(lf.replace(/\n/g, "\r\n")))).svg === uit.svg, "CRLF-regeleinden geven dezelfde SVG");
}

console.log("\nBlokken en maatvoering (dxf-blokken.dxf):");
{
  const uit = zetOm("dxf-blokken.dxf");
  algemeen("blokken", uit);
  const pts = allePunten(uit);
  const w = 10 / Math.SQRT2 * 2;
  meld(heeftPunt(pts, 50, -w) && heeftPunt(pts, 50, w), "INSERT met schaal 2 en draaiing 45°", `±${w.toFixed(3)}`);
  meld(heeftPunt(pts, 105, -5) && heeftPunt(pts, 95, 5), "INSERT gespiegeld (x-schaal -1)");
  meld(heeftPunt(pts, 35, 60) && heeftPunt(pts, 45, 70) && heeftPunt(pts, 0, 65), "INSERT met 3 kolommen × 2 rijen");
  meld(heeftPunt(pts, -5, 95) && heeftPunt(pts, 5, 105) && heeftPunt(pts, 10, 100), "genest blok met basispunt");
  meld(/<path stroke="#00f"[^>]* d="M42\.91 107\.05l28\.28 0"/.test(uit.svg), "BYBLOCK-kleur volgt het INSERT (blauw)");
  meld(/<path stroke="#f00"[^>]*d="M2\.05 112\.05/.test(uit.svg), "laag 0 in het blok neemt de laag van het INSERT over (rood)");
  meld(!heeftPunt(pts, 195, -5) && heeftPunt(pts, 200, 3), "INSERT op een laag die uit staat: laag-0-inhoud weg, eigen laag blijft");
  meld(/<g fill="#f00">\n<text[^>]*>K1<\/text>/.test(uit.svg), "ATTRIB-waarde in de kleur van het INSERT");
  meld(!/Nummer|>NR</.test(uit.svg), "ATTDEF (definitie) niet getekend");
  meld(heeftPunt(pts, 0, -20) && heeftPunt(pts, 100, -20) && /<g fill="#00c400">\n<text[^>]*>100<\/text>/.test(uit.svg),
    "DIMENSION via zijn anonieme blok, in de laagkleur");
  meld(/<path fill="#00c400" d="[^"]*z[^"]*z"\/>/.test(uit.svg), "pijlpunten (SOLID) gevuld");
  meld(uit.overgeslagen.INSERT === 1, "INSERT van een onbekend blok overgeslagen en geteld", JSON.stringify(uit.overgeslagen));
}

console.log("\nTekst en arcering (dxf-tekst-arcering.dxf):");
{
  const uit = zetOm("dxf-tekst-arcering.dxf");
  algemeen("tekst", uit);
  const s = uit.svg;
  meld(s.includes(">Ligger Ø200 L&#61;5&#46;4 m &#91;a&#59; b&#93; it&#39;s &#123;&#123;x&#125;&#125; 30°</text>"),
    "%%c en %%d omgezet, leestekens als tekenverwijzing");
  meld(/text-anchor="middle">midden</.test(s) && /text-anchor="end">rechtsboven</.test(s), "uitlijning midden en rechts");
  meld(/transform="rotate\(-90 [^"]+\)">verticaal</.test(s), "gedraaide tekst");
  meld(/transform="translate\([^)]+\) scale\(\.8 1\)">smal</.test(s), "breedtefactor uit de tekststijl");
  meld(/textLength="40" lengthAdjust="spacingAndGlyphs">passend</.test(s), "tekst passend tussen twee punten");
  meld(s.includes(">Regel een<tspan") && s.includes(">Regel twee 1&#47;2 °C</tspan>")
    && /dy="8\.33">na lege regel</.test(s), "MTEXT: \\P, opmaak weg, \\S-breuk, \\U+, lege regel");
  meld((/>dit is een lange[\s\S]*?<\/text>/.exec(s)?.[0].match(/<tspan/g) ?? []).length >= 3, "MTEXT afgebroken op de kaderbreedte");
  meld(/<path fill="#414141" fill-rule="evenodd" d="M[^"]+z"\/>/.test(s), "volle HATCH gevuld in de laagkleur (8)");
  const patroon = /<path fill="#f00" fill-opacity="\.15" fill-rule="evenodd" d="([^"]+)"\/>/.exec(s)?.[1] ?? "";
  meld(patroon.includes("a15 15") && patroon.includes("a3 3") && (patroon.match(/z/g) ?? []).length === 2,
    "patroon-HATCH als tint, met boogrand en gat", patroon);
  const pts = allePunten(uit);
  meld(heeftPunt(pts, 40, -30) && heeftPunt(pts, 70, -20), "HATCH-rand op zijn plaats (omgekeerde rand gekeerd)");
  meld(heeftPunt(pts, 80, -30) && heeftPunt(pts, 100, -20), "LEADER getekend");
  meld(heeftPunt(pts, 115, -30) && heeftPunt(pts, 130, -20) && s.includes(">beton C30&#47;37</text>"),
    "MULTILEADER: lijn, knik en tekst");
}

console.log("\nFouten en bijzondere invoer:");
{
  const code = (b) => {
    try { dxfNaarSvg(leesDxf(b)); return "geen fout"; }
    catch (e) { return e instanceof DxfFout ? e.code : `andere fout: ${e.message}`; }
  };
  const dwg = new Uint8Array(64);
  dwg.set(tekstBytes("AC1032"));
  meld(code(dwg) === "dwg", "DWG herkend aan zijn versiekop");
  // De kop van een binaire DXF begint met de naam van het programma; die is hier vervangen.
  const binair = new Uint8Array(64);
  binair.set(tekstBytes("XXXXXXX Binary DXF\r\n\x1a\0"));
  meld(code(binair) === "binair", "binaire DXF herkend");
  meld(code(tekstBytes("dit is geen tekening\n")) === "ongeldig", "gewone tekst is geen DXF");
  const leeg = "0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n0\nLAYER\n2\nA\n62\n-1\n0\nENDTAB\n0\nENDSEC\n"
    + "0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nA\n10\n0\n20\n0\n11\n1\n21\n1\n0\nENDSEC\n0\nEOF\n";
  meld(code(tekstBytes(leeg)) === "leeg", "alleen een laag die uit staat: niets te tekenen");
  const veel = "0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nB\n10\n0\n20\n0\n0\nLINE\n10\n0\n20\n0\n11\n1\n21\n0\n0\nENDBLK\n0\nENDSEC\n"
    + "0\nSECTION\n2\nENTITIES\n0\nINSERT\n2\nB\n10\n0\n20\n0\n70\n200\n71\n200\n44\n2\n45\n2\n0\nENDSEC\n0\nEOF\n";
  meld(code(tekstBytes(veel)) === "teGroot", "40 000 kopieën van een blok: te groot");

  // Een oudere DXF in codetabel 1252, zonder tabellen.
  const r12 = "0\nSECTION\n2\nHEADER\n9\n$DWGCODEPAGE\n3\nANSI_1252\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n"
    + "0\nTEXT\n8\n0\n10\n0\n20\n0\n40\n1\n1\nCAFÉ ë\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n10\n21\n5\n0\nENDSEC\n0\nEOF\n";
  const cp1252 = Uint8Array.from(r12, (c) => c.charCodeAt(0));
  const oud = dxfNaarSvg(leesDxf(cp1252));
  meld(oud.svg.includes(">CAFÉ ë</text>"), "codetabel 1252 gelezen (É, ë)");
  const bom = tekstBytes("﻿" + r12);
  meld(dxfNaarSvg(leesDxf(bom)).svg.includes(">CAFÉ ë</text>"), "UTF-8 met BOM gelezen");

  // Veel elementen: snel genoeg, en het aantal klopt (de knop vraagt boven 5000).
  let groot = "0\nSECTION\n2\nENTITIES\n";
  for (let i = 0; i < 20_000; i++) groot += `0\nLINE\n8\n0\n10\n${i}\n20\n0\n11\n${i}\n21\n${(i % 50) + 1}\n`;
  groot += "0\nENDSEC\n0\nEOF\n";
  const t0 = performance.now();
  const g = dxfNaarSvg(groot);
  const ms = performance.now() - t0;
  meld(g.elementen === 20_000 && ms < 5000, `20 000 lijnen in ${ms.toFixed(0)} ms, ${(g.svg.length / 1e6).toFixed(2)} MB`);
  meld(g.svg.split("\n").every((r) => r.length < 9000), "lange paden over meerdere <path>-regels verdeeld");
}

console.log(fouten === 0 ? "\nDXF-omzetting: alle controles groen." : `\nDXF-omzetting: ${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
