/**
 * De PDF-viewer: zoomen en aantekeningen (store/pdfAantekeningen.ts). Wat een aantekening is,
 * hoe hij in het projectbestand komt en hoe hij wordt getekend, op scherm en op papier.
 *
 * Een aantekening komt uit een projectbestand, dus uit een bestand van iemand anders: de
 * tekening gaat als markup de pagina in en mag niets uitvoeren.
 *
 * Draaien:  node scripts/check-pdf-viewer.mjs
 */
import { readFileSync } from "node:fs";
import { afwijkingen } from "./lib/ifcx-specificatie.mjs";

const a = await import("../packages/desktop/src/store/pdfAantekeningen.ts");
const { leesPdfBijlage } = await import("../packages/desktop/src/store/pdfBijlage.ts");
const { bouwProjectBestand, leesProjectBestand } = await import("../packages/desktop/src/store/projectBestand.ts");

let fouten = 0;
let getest = 0;
const waar = (wat, ok, detail = "") => {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : ` — ${detail}`}`);
};
const dichtbij = (x, y, tol = 1e-6) => Math.abs(x - y) <= tol;

console.log("\n1. Zoomen");
{
  // 100 % is de ware grootte: 1 punt is 96/72 pixel. Een A4 van 595,28 punt is 793,7 px breed.
  waar("A4 op ware grootte", dichtbij(a.puntNaarPixel(595.28, 100), 793.707, 1e-2));
  waar("op 200 % twee keer zo groot", dichtbij(a.puntNaarPixel(595.28, 200), 1587.413, 1e-2));
  // Paneel 900 × 700 met 32 marge in de breedte en 52 in de hoogte: (900 − 32)/793,7 = 109,4 %; (700 − 52)/1122,5 = 57,7 %.
  waar("passend op de breedte", dichtbij(a.passendeZoom(595.28, 841.89, 900, 700, "breedte"), 109.36, 0.05), String(a.passendeZoom(595.28, 841.89, 900, 700, "breedte")));
  waar("hele pagina in beeld", dichtbij(a.passendeZoom(595.28, 841.89, 900, 700, "pagina"), 57.73, 0.05), String(a.passendeZoom(595.28, 841.89, 900, 700, "pagina")));
  waar("een paneel zonder maat geeft geen onzin", a.passendeZoom(595.28, 841.89, 0, 0, "breedte") === a.ZOOM_MIN);
  waar("een stap in: van 100 naar 125", a.zoomStap(100, 1) === 125);
  waar("een stap uit: van 100 naar 75", a.zoomStap(100, -1) === 75);
  waar("vanaf een tussenwaarde naar de volgende stap", a.zoomStap(109.4, 1) === 125 && a.zoomStap(109.4, -1) === 100);
  waar("niet verder dan de grenzen", a.zoomStap(a.ZOOM_MAX, 1) === a.ZOOM_MAX && a.zoomStap(a.ZOOM_MIN, -1) === a.ZOOM_MIN);
  waar("begrenzen", a.beperkZoom(5000) === a.ZOOM_MAX && a.beperkZoom(1) === a.ZOOM_MIN && a.beperkZoom(Number.NaN) === 100);
  // De plek onder de muis blijft staan: 300 gescrold + 100 tot de muis is 400; dubbel zo groot is 800; min 100 is 700.
  waar("zoomen op de plek van de muis", a.scrollNaZoom(300, 100, 100, 200) === 700);
}

console.log("\n2. Scherp tekenen");
{
  // Pagina getekend op 2 pixels per punt. Op 100 % bij scherm 1: 1,33 pixel per punt, de afbeelding is scherp genoeg.
  waar("op 100 % volstaat de afbeelding", a.scherpeSchaal(595, 842, 100, 1, 2) === null);
  // Op 300 % bij scherm 1,5: 3·1,5·4/3 = 6 pixels per punt.
  waar("op 300 % bij 150 % scherm: 6 pixels per punt", dichtbij(a.scherpeSchaal(595, 842, 300, 1.5, 2), 6));
  // Een A0 mag het geheugen niet opeten: 2384 × 3370 op 6 geeft 289 miljoen pixels; de grens is 24 miljoen: √(24e6/(2384·3370)) = 1,73, minder dan de gewone 2.
  waar("een grote tekening blijft binnen de grens, en onder de gewone schaal is er niets te winnen", a.scherpeSchaal(2384, 3370, 300, 1.5, 2) === null);
  waar("een middelgrote blijft binnen de grens", dichtbij(a.scherpeSchaal(1191, 1684, 600, 2, 2), Math.sqrt(24e6 / (1191 * 1684)), 1e-6));
}

console.log("\n3. Vormen");
{
  const pen = { id: "p", pagina: 0, soort: "pen", kleur: "#dc2626", dikte: 2, punten: [[10, 20], [30, 40], [50, 20]] };
  const uit = a.aantekeningSvg(pen);
  waar("pen: een pad door de punten", uit.includes('d="M10 20L30 40L50 20"') && uit.includes('stroke="#dc2626"') && uit.includes('data-aantekening="p"'), uit);
  const mark = a.aantekeningSvg({ ...pen, id: "m", soort: "markeer", dikte: 12 });
  waar("markeren: breed en doorzichtig", mark.includes('stroke-width="12"') && mark.includes("stroke-opacity") && mark.includes("multiply"), mark);
  const pijl = a.aantekeningSvg({ id: "a", pagina: 0, soort: "pijl", kleur: "#2563eb", dikte: 2, van: [0, 0], naar: [100, 0] });
  // Kop van 10 punt (de grootste van 8 en 5·dikte), naar links gericht: punten (100, 0), (90, ±4).
  waar("pijl: een lijn en een kop op de punt", pijl.includes('points="100,0 90,4 90,-4"') || pijl.includes('points="100,0 90,-4 90,4"'), pijl);
  const nulPijl = a.aantekeningSvg({ id: "a", pagina: 0, soort: "pijl", kleur: "#2563eb", dikte: 2, van: [5, 5], naar: [5, 5] });
  waar("pijl zonder lengte: geen NaN", !/NaN|Infinity/.test(nulPijl), nulPijl);
  const kader = a.aantekeningSvg({ id: "k", pagina: 0, soort: "kader", kleur: "#16a34a", dikte: 1.5, x: 10, y: 20, b: 30, h: 40 });
  waar("kader", kader.includes('x="10"') && kader.includes('width="30"') && kader.includes('height="40"') && kader.includes('fill="none"'), kader);
  const wolk = a.wolkPad(0, 0, 100, 50, 10);
  // 100/10 = 10 bogen boven en onder, 50/10 = 5 links en rechts: 30 bogen in een gesloten pad.
  waar("wolk: bogen rondom en gesloten", (wolk.match(/A/g) ?? []).length === 30 && wolk.trim().endsWith("Z"), wolk.slice(0, 60));
  waar("wolk zonder maat: geen NaN", !/NaN|Infinity/.test(a.wolkPad(5, 5, 0, 0, 10)));
  const tekst = a.aantekeningSvg({ id: "t", pagina: 0, soort: "tekst", kleur: "#111111", dikte: 1, x: 10, y: 20, tekst: "eerste\ntweede", grootte: 12 });
  waar("tekst: elke regel een eigen regel", (tekst.match(/<tspan/g) ?? []).length === 2 && tekst.includes("eerste") && tekst.includes("tweede"), tekst);
  // Het hart van de letters op de eerste regel staat onder het punt waar is geklikt.
  waar("tekst: de bovenkant bij het punt", tekst.includes('y="31"') || tekst.includes('y="30.'), tekst);
}

console.log("\n4. Wat uit een bestand komt, voert niets uit");
{
  const kwaad = a.leesAantekeningen([
    { id: '"><script>alert(1)</script>', pagina: 0, soort: "tekst", kleur: '"/><script>alert(2)</script>', dikte: 1, x: 1, y: 1, tekst: "<img src=x onerror=alert(3)>&", grootte: 12 },
  ]);
  const uit = a.paginaSvg(kwaad, 0, 100, 100);
  waar("geen script of element uit de invoer", !/<script|<img|onerror="/.test(uit), uit);
  waar("de tekst blijft leesbaar staan", uit.includes("&lt;img src=x onerror=alert(3)&gt;&amp;"), uit);
  waar("een verkeerde kleur wordt de standaard", !kwaad[0].kleur.includes("script") && /^#[0-9a-f]{6}$/i.test(kwaad[0].kleur), kwaad[0].kleur);
  waar("een id wordt schoongemaakt", /^[\w-]+$/.test(kwaad[0].id), kwaad[0].id);
}

console.log("\n5. Lezen uit het projectbestand");
{
  const lijst = a.leesAantekeningen([
    { id: "a", pagina: 1, soort: "pen", kleur: "#000000", dikte: 2, punten: [[1, 2], [3, 4]] },
    { id: "b", pagina: 0, soort: "onbekend" },
    { id: "c", pagina: -1, soort: "kader", kleur: "#000000", dikte: 1, x: 1, y: 1, b: 2, h: 2 },
    { id: "d", pagina: 0, soort: "kader", kleur: "#000000", dikte: 1, x: Number.NaN, y: 1, b: 2, h: 2 },
    { id: "e", pagina: 0, soort: "pen", kleur: "#000000", dikte: 2, punten: "x" },
    { id: "f", pagina: 0, soort: "pen", kleur: "#000000", dikte: 2, punten: [[1, 2]] },
    { id: "g", pagina: 0, soort: "pijl", kleur: "#000000", dikte: 500, van: [0, 0], naar: [1, 1] },
    { id: "h", pagina: 0, soort: "tekst", kleur: "#000000", dikte: 1, x: 0, y: 0, tekst: "" },
    "kapot",
    null,
  ]);
  waar("alleen geldige aantekeningen blijven", lijst.map((x) => x.id).join() === "a,g", lijst.map((x) => x.id).join());
  waar("een dikte blijft binnen de grens", lijst[1].dikte <= a.MAX_DIKTE, String(lijst[1].dikte));
  waar("geen lijst: leeg", a.leesAantekeningen("x").length === 0 && a.leesAantekeningen(undefined).length === 0);

  const pdf = leesPdfBijlage({ bestandsnaam: "x.pdf", data: "QUJD", aantekeningen: [{ id: "a", pagina: 0, soort: "pijl", kleur: "#000000", dikte: 2, van: [0, 0], naar: [1, 1] }], opPapier: false });
  waar("de bijlage houdt zijn aantekeningen", pdf.aantekeningen.length === 1 && pdf.aantekeningen[0].id === "a");
  waar("de keuze voor papier blijft", pdf.opPapier === false);
  const oud = leesPdfBijlage({ bestandsnaam: "x.pdf", data: "QUJD" });
  waar("een oud bestand heeft geen aantekeningen en houdt dat zo", oud.aantekeningen === undefined && oud.opPapier === undefined && JSON.stringify(oud) === '{"bestandsnaam":"x.pdf","data":"QUJD"}', JSON.stringify(oud));
}

console.log("\n5b. Opslaan en heropenen");
{
  const aantekeningen = [
    { id: "a", pagina: 0, soort: "wolk", kleur: "#dc2626", dikte: 2, x: 10, y: 20, b: 30, h: 40 },
    { id: "b", pagina: 1, soort: "tekst", kleur: "#2563eb", dikte: 1, x: 5, y: 6, tekst: "regel\n<b>twee</b>", grootte: 12 },
  ];
  const ex = { id: "ex-1", naam: "Rapport", templateId: "pdf", source: "", waarden: {}, elementen: [], pdf: { bestandsnaam: "x.pdf", data: "QUJD", aantekeningen, opPapier: false } };
  const bestand = bouwProjectBestand({ versie: 2, naam: "Proef", gegevens: {}, exemplaren: [ex] }, null);
  const terug = leesProjectBestand(bestand, "proef").exemplaren[0];
  const vast = (x) => JSON.stringify(x, (_, w) => (w && typeof w === "object" && !Array.isArray(w) ? Object.fromEntries(Object.entries(w).sort(([p], [q]) => p.localeCompare(q))) : w));
  waar("de aantekeningen blijven na opslaan en heropenen", vast(terug.pdf?.aantekeningen) === vast(aantekeningen), JSON.stringify(terug.pdf));
  const fout = afwijkingen(JSON.parse(bestand));
  waar("het bestand met aantekeningen volgt de IFCX-specificatie", fout.length === 0, fout.slice(0, 4).join(" | "));
  waar("de keuze voor papier blijft na heropenen", terug.pdf?.opPapier === false);
}

console.log("\n6. Bewerken");
{
  waar("dun uit: dichtbij vervalt, begin en eind blijven", a.dunUit([[0, 0], [0.1, 0], [0.2, 0], [5, 0], [5.1, 0]], 1).join("|") === "0,0|5,0|5.1,0", a.dunUit([[0, 0], [0.1, 0], [0.2, 0], [5, 0], [5.1, 0]], 1).join("|"));
  const k = { id: "k", pagina: 0, soort: "kader", kleur: "#000000", dikte: 1, x: 10, y: 20, b: 30, h: 40 };
  const v = a.verschuif(k, 5, -5);
  waar("verschuiven van een kader", v.x === 15 && v.y === 15 && k.x === 10);
  const p = a.verschuif({ id: "p", pagina: 0, soort: "pen", kleur: "#000000", dikte: 1, punten: [[1, 1], [2, 2]] }, 1, 2);
  waar("verschuiven van een lijn", p.punten.join("|") === "2,3|3,4");
  const q = a.verschuif({ id: "q", pagina: 0, soort: "pijl", kleur: "#000000", dikte: 1, van: [0, 0], naar: [1, 1] }, 1, 1);
  waar("verschuiven van een pijl", q.van.join() === "1,1" && q.naar.join() === "2,2");
  waar("een kader van twee punten, in elke richting getrokken", JSON.stringify(a.kaderUit([30, 40], [10, 20])) === '{"x":10,"y":20,"b":20,"h":20}');
  waar("alleen de aantekeningen van deze pagina", (a.paginaSvg([k, { ...k, id: "l", pagina: 3 }], 0, 100, 100).match(/data-aantekening/g) ?? []).length === 1);
  const svg = a.paginaSvg([k], 0, 595, 842);
  waar("de laag rekent in punten van de pagina", svg.includes('viewBox="0 0 595 842"'), svg.slice(0, 120));
  waar("een geselecteerde krijgt een kader", a.paginaSvg([k], 0, 100, 100, "k").includes("data-selectie"));
}

console.log("\n7. Op het lint, in beide talen");
{
  const talen = ["nl", "en"].map((taal) => ({
    lint: JSON.parse(readFileSync(new URL(`../packages/desktop/src/i18n/locales/${taal}/ribbon.json`, import.meta.url), "utf8")),
    werk: JSON.parse(readFileSync(new URL(`../packages/desktop/src/i18n/locales/${taal}/werkruimte.json`, import.meta.url), "utf8")),
  }));
  const sleutels = (o, pad = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? sleutels(v, `${pad}${k}.`) : [`${pad}${k}`])).sort().join();
  waar("nl en en kennen dezelfde teksten voor het lint", sleutels(talen[0].lint.pdf) === sleutels(talen[1].lint.pdf));
  waar("elk gereedschap heeft een naam", a.GEREEDSCHAP.every((g) => talen[0].lint.pdf.gereedschap[g] && talen[1].lint.pdf.gereedschap[g]));
  const sprite = readFileSync(new URL("../packages/desktop/public/icons/pdf.svg", import.meta.url), "utf8");
  const lint = readFileSync(new URL("../packages/desktop/src/components/ribbon/PdfTab.tsx", import.meta.url), "utf8");
  const ids = [...lint.matchAll(/b2\("([\w.-]+)", "pdf"\)/g)].map((m) => m[1]);
  waar(`${ids.length} iconen op het lint staan in beide maten in de sprite`, ids.length > 8 && ids.every((id) => sprite.includes(`id="i24-${id}"`) && sprite.includes(`id="i16-${id}"`)), ids.filter((id) => !sprite.includes(`id="i24-${id}"`)).join());
}

console.log(`\nPDF-viewer: ${getest} controles, ${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
