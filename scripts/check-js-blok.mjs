/**
 * Controle van het JavaScript-blok (`@js … @end`) en van de opschoning van de
 * uitwerking.
 *
 * De kern laat de code letterlijk en schrijft een kader (packages/core/src/jsBlok.ts);
 * de app voert hem na bevestiging uit in een afgeschermd venster
 * (packages/desktop/src/components/calc/jsRegels.ts, jsLooptijd.js). Alle html van de
 * kern gaat door uitwerkingRegels.ts voordat hij in het document komt. Dit script
 * bewaakt:
 *   1. de code blijft letterlijk: `#`, `'`, `a.b`, `[1; 2]`, `{{x}}`, `#if`, macro's,
 *      `@img`, `#include`; alleen een regel die precies `@end` is, sluit het blok;
 *   2. de attributen, ook met `{{…}}`, en de geweigerde netwerkwaarden;
 *   3. de sandbox en de CSP van het venster, ook wat een blok er niet in kan zetten;
 *   4. de twee vensters in elkaar: de code zit alleen in het binnenste, en het buitenste
 *      geeft alleen de afgesproken berichten door, van de juiste kant;
 *   5. welke berichten uit het venster worden aangenomen;
 *   6. `calc`: waarden met eenheid, omrekenen, fouten (de omgeving draait hier in jsdom),
 *      en wat de omgeving dichtzet voordat de code begint;
 *   7. de opschoning: kwaadaardige tekstregels en SVG gaan weg;
 *   8. wat de bladen gebruiken, blijft: opmaak, SVG met `<symbol>` en `<use>`,
 *      formules, invoervelden en onze eigen blokken;
 *   9. geen adres naar buiten dat vanzelf laadt: een afbeelding wacht op bevestiging,
 *      de rest vervalt, en een link blijft een link;
 *  10. de sjablonen: de zichtbare tekst van elk blad staat er na de opschoning nog.
 *
 * Wat echt in een browser moet (de CSP, de `frame-src` van de ouder, `window.parent`,
 * opslag, netwerk) staat niet hier: jsdom kent geen sandbox.
 *
 * Draaien:  node scripts/check-js-blok.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import createDOMPurify from "dompurify";
import { parse, evaluate, render, jsHost } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";
import {
  JS_SANDBOX, JS_NAAR_APP, JS_NAAR_SCRIPT, jsAttributen, jsBinnenSrcdoc, jsCsp, jsSrcdoc, leesBericht, geldigePng, geldigeHost,
} from "../packages/desktop/src/components/calc/jsRegels.ts";
import { adresNaarBuiten, linkNaarBuiten, maakOpschoner, gevaarlijkeStijl } from "../packages/desktop/src/components/calc/uitwerkingRegels.ts";
import { magLaden } from "../packages/desktop/src/components/calc/iframeRegels.ts";

const hier = dirname(fileURLToPath(import.meta.url));
const looptijd = readFileSync(join(hier, "../packages/desktop/src/components/calc/jsLooptijd.js"), "utf8");

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const vlak = (lijst) => lijst.flatMap((n) => (n.type === "conditional-branch" ? vlak(n.children) : [n]));
function doorreken(bron, waarden = {}, scope) {
  const ast = parse(bron);
  const nodes = evaluate(ast, waarden, scope);
  return { ast, blokken: vlak(nodes).filter((n) => n.type === "js"), html: render(nodes) };
}
const ontsnap = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// ── 1. De code blijft letterlijk ────────────────────────────────────────────
console.log("\n1. De code blijft letterlijk");
{
  const code = [
    "// #if geen rekentaal; a.b 'x' [1; 2] {{x}} $Plot{f(x)}",
    "#if 1",
    "#def mac(x) = x*2",
    "#include bestand.cpd",
    "#hide",
    "@img(detail.svg)",
    "@svg",
    "const a = { b: [1, 2] }, s = 'it''s', t = \"</script><img src=x>\", u = `--> ]> ${1 + 1}`;",
    "b_p,1 = 5; c.d = 3; x:F2; y$ = 1; mac(2); L = ?{5}*(m)",
    "'tekst die geen tekst is",
    "\"Titel die geen titel is",
    "# Kop die geen kop is",
    "  @end2",
    "@end ook niet",
    "#end if",
  ].join("\n");
  const { ast, blokken, html } = doorreken(`"Blad
L = 5 m
#def mac(x) = x*2
@js hoogte=40mm
${code}
@end
'Daarna: L = 'L
`);
  const knoop = ast.find((n) => n.type === "js");
  meld(knoop?.code === code, "de knoop heeft de code letter voor letter", knoop?.code?.slice(0, 80));
  meld(blokken[0]?.code === code, "en het doorgerekende blok ook");
  meld(knoop?.fouten.length === 0, "zonder meldingen", knoop?.fouten.join(" | "));
  const m = html.match(/data-js-code="([^"]*)"/);
  meld(!!m && JSON.parse(ontsnap(m[1])) === code, "data-js-code leest terug als precies de code");
  meld(!/<script|<\/script|\]>|-->/.test(m?.[1] ?? "x"), "in het attribuut staat geen < of >: de opschoning laat het met rust", m?.[1].slice(0, 60));
  meld(/Daarna: L = 5/.test(html.replace(/<[^>]+>/g, "")), "het blad gaat na @end gewoon verder");
  meld(!/calc-svg|calc-image/.test(html), "`@svg` en `@img` in de code doen niets");

  const crlf = doorreken("L = 1\r\n@js\r\nconst a = 1;\r\n@end\r\n'na\r\n");
  meld(crlf.blokken[0]?.code === "const a = 1;" && /na/.test(crlf.html), "een regeleinde met CR telt niet mee");
  const ingesprongen = doorreken("@js\nx\n   @end  \n'na");
  meld(ingesprongen.blokken[0]?.code === "x" && ingesprongen.blokken[0].meldingen.length === 0, "@end met spaties eromheen sluit");
  const open = doorreken("@js\nconst a = 1;\n'tekst");
  meld(open.blokken[0].code === "const a = 1;\n'tekst" && /geen regel @end/.test(open.blokken[0].meldingen[0]), "zonder @end: de rest is code, met een melding");
  const inc = parse("#include x\n", { includes: new Map([["x", "@js\n#if a.b\n@end\n"]]) });
  meld(inc.find((n) => n.type === "js")?.code === "#if a.b", "een blok uit een #include blijft ook letterlijk");
  const svg = doorreken("@svg\n<svg></svg>\n@end\n@js\n1\n@end\n");
  meld(svg.blokken[0]?.code === "1" && /calc-svg/.test(svg.html), "een @svg ervoor behoudt zijn eigen @end");
  const verborgen = doorreken("#hide\n@js\n1\n@end\n#show\n'x");
  meld(verborgen.blokken.length === 0 && !/calc-js/.test(verborgen.html), "#hide: geen blok");
  meld(/<div class="calc-js alleen-scherm"/.test(doorreken("#pre\n@js\n1\n@end\n#post").html), "#pre: alleen op het scherm");
  const lus = doorreken("#for i = 1 : 2\n@js\n1\n@end\n#loop");
  meld(lus.blokken.length === 2 && lus.blokken[1].waarden.i?.w === 2, "in een lus: elk blok zijn eigen waarden", JSON.stringify(lus.blokken[1]?.waarden.i));
}

// ── 2. Attributen ───────────────────────────────────────────────────────────
console.log("\n2. Attributen");
{
  const { blokken } = doorreken(`L = 5 m
h_b = 7 cm
naam = "Ligger"
@js hoogte={{h_b}} titel="{{naam}} van {{L}} m" bibliotheek=three netwerk=cdn.voorbeeld.nl,https://b.voorbeeld.nl:8443
1
@end`);
  const b = blokken[0];
  meld(b.hoogteMm === 70 && b.titel === "Ligger van 5 m", "{{…}} in hoogte en titel", `${b.hoogteMm} ${b.titel}`);
  meld(b.bibliotheken.join() === "three", "bibliotheek=three");
  meld(b.netwerk.join() === "cdn.voorbeeld.nl,b.voorbeeld.nl:8443", "netwerk, met of zonder https://", b.netwerk.join());
  meld(doorreken("@js hoogte=9cm\n1\n@end").blokken[0].hoogteMm === 90, "hoogte=9cm");
  meld(doorreken("@js\n1\n@end").blokken[0].hoogteMm === 90, "zonder hoogte 90 mm");
  meld(doorreken("@js hoogte=900mm\n1\n@end").blokken[0].hoogteMm === 230, "te hoog wordt 230 mm");
  const fout = doorreken('@js breedte=1 bibliotheek=jquery hoogte=abc\n1\n@end').blokken[0];
  meld(/onbekende optie "breedte=1"/.test(fout.meldingen.join()) && /onbekende bibliotheek "jquery"/.test(fout.meldingen.join()) && /"abc" is geen hoogte/.test(fout.meldingen.join()),
    "onbekende optie, bibliotheek en hoogte: meldingen", fout.meldingen.join(" | "));
  const h = doorreken('@js titel="<img src=x onerror=alert(1)>"\n1\n@end').html;
  meld(!/<img/.test(h), "html in de titel wordt tekst");

  const slecht = ["*", "*.voorbeeld.nl", "http://x.nl", "ftp://x.nl", "data:", "blob:", "'self'", "'unsafe-eval'", "x.nl;script-src", "x.nl script-src *",
    "x.nl/pad", "localhost", "voorbeeld", "", "javascript:alert(1)", "https://", "x.nl:abc", "x..nl", "-x.nl", "x.nl\nconnect-src *"];
  for (const w of slecht) {
    meld(jsHost(w).host === undefined && !geldigeHost(w), `geweigerde host: ${JSON.stringify(w)}`, JSON.stringify(jsHost(w)));
  }
  const goed = ["cdn.voorbeeld.nl", "https://cdn.voorbeeld.nl", "https://cdn.voorbeeld.nl/", "A.B.NL", "x.nl:8443"];
  for (const w of goed) meld(geldigeHost(jsHost(w).host ?? ""), `toegestane host: ${w}`, JSON.stringify(jsHost(w)));
  const via = doorreken('h = "*"\n@js netwerk={{h}}\n1\n@end').blokken[0];
  meld(via.netwerk.length === 0 && via.meldingen.length === 1, "een jokerteken via {{…}} wordt ook geweigerd", via.meldingen.join());
  const uit = doorreken("@js netwerk=*,x.nl\n1\n@end");
  meld(uit.blokken[0].netwerk.join() === "x.nl" && /data-js-netwerk="x.nl"/.test(uit.html), "alleen de goedgekeurde host staat in de uitvoer");
}

// ── 3. Sandbox en CSP ───────────────────────────────────────────────────────
console.log("\n3. Sandbox en CSP");
{
  const { html } = doorreken('@js titel="T"\n1\n@end');
  meld(!/<iframe|<script/i.test(html), "de kern schrijft geen iframe en geen script");
  meld(/class="calc-iframe-kader"/.test(html) && /calc-iframe-kop">T</.test(html), "wel een kader met de titel");
  const a = jsAttributen("Titel");
  meld(JS_SANDBOX === "allow-scripts" && a.sandbox === "allow-scripts", 'sandbox="allow-scripts"', a.sandbox);
  meld(!/allow-same-origin|allow-top|allow-popups|allow-forms|allow-modals|allow-downloads/.test(a.sandbox), "zonder allow-same-origin of een ander recht");
  meld(a.referrerpolicy === "no-referrer" && a.allow === "", "referrerpolicy en een leeg allow");
  const csp = jsCsp([]);
  for (const regel of ["default-src 'none'", "script-src 'unsafe-inline' blob:", "style-src 'unsafe-inline'", "img-src data: blob:", "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "worker-src 'none'"]) {
    meld(csp.split("; ").includes(regel), `CSP: ${regel}`, csp);
  }
  meld(!/https?:|\*/.test(csp), "zonder netwerk= geen enkele host");
  meld(!/unsafe-eval/.test(csp), "geen unsafe-eval");
  const met = jsCsp(["cdn.voorbeeld.nl"]);
  meld(/connect-src https:\/\/cdn\.voorbeeld\.nl/.test(met) && /script-src 'unsafe-inline' blob: https:\/\/cdn\.voorbeeld\.nl/.test(met), "met netwerk=: die host, met https", met);
  meld(!/http:/.test(met), "nooit http");
  meld(met.split("; ").includes("frame-src 'none'"), "ook met netwerk= geen frame naar die host: de navigatie blijft dicht", met);
  meld(!/;\s*script-src \*/.test(jsCsp(["x.nl; script-src *"])) && !jsCsp(["x.nl; script-src *"]).includes("x.nl"), "een nagemaakte host in de html komt niet in de CSP");

  const code = 'const t = "</script><img src=x onerror=1>"; document.body.dataset.a = t;';
  const doc = jsBinnenSrcdoc(looptijd, { code, waarden: { L: { w: "</script>" } }, netwerk: ["x.nl", "*"], bibliotheken: [], opPapier: false });
  meld(doc.indexOf('http-equiv="Content-Security-Policy"') < doc.indexOf("<script"), "de CSP staat vóór elk script");
  meld(!doc.includes("</script><img"), "een </script> in de code breekt de pagina niet", doc.slice(doc.indexOf("__calcStart"), doc.indexOf("__calcStart") + 120));
  const csp2 = ontsnap(doc.match(/content="([^"]*default-src[^"]*)"/)?.[1] ?? "");
  meld(csp2.includes("https://x.nl") && !csp2.includes("*"), "de hosts in de srcdoc zijn opnieuw getoetst", csp2);
}

// ── 4. De twee vensters ─────────────────────────────────────────────────────
console.log("\n4. De twee vensters");
{
  const start = { code: '"></iframe><script>parent.x = 1</script><iframe srcdoc="', waarden: { L: { w: "</iframe>" } }, netwerk: ["x.nl", "*"], bibliotheken: [], opPapier: false };
  const buiten = jsSrcdoc(looptijd, start, 'Titel "met" <tekens>');
  const d = new JSDOM(buiten).window.document;
  const frames = d.querySelectorAll("iframe");
  meld(frames.length === 1 && d.querySelectorAll("script").length === 1, "één binnenste venster en één script, ook met </iframe> in de code", `${frames.length} ${d.querySelectorAll("script").length}`);
  const f = frames[0];
  meld(f?.getAttribute("sandbox") === "allow-scripts" && f?.getAttribute("referrerpolicy") === "no-referrer" && f?.getAttribute("allow") === "", "het binnenste venster heeft dezelfde rechten", f?.outerHTML.slice(0, 100));
  meld(f?.getAttribute("title") === 'Titel "met" <tekens>', "en de titel, als tekst");
  // De HTML-parser maakt van CRLF een LF, en jsLooptijd.js staat in de werkmap op LF of CRLF (core.autocrlf).
  meld(f?.getAttribute("srcdoc") === jsBinnenSrcdoc(looptijd, start).replace(/\r\n/g, "\n"), "de code en de waarden staan alleen in het binnenste venster");
  meld(!d.querySelector("script").textContent.includes("parent.x"), "niet in het script van het buitenste");
  const cspVan = (doc) => doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content");
  meld(cspVan(d) === jsCsp(["x.nl"]) && cspVan(new JSDOM(f.getAttribute("srcdoc")).window.document) === jsCsp(["x.nl"]), "beide vensters dezelfde CSP, met frame-src 'none'", cspVan(d));
  meld(buiten.indexOf("Content-Security-Policy") < buiten.indexOf("<script") && buiten.indexOf("<script") < buiten.indexOf("<iframe"), "de CSP eerst, dan het script, dan het venster");

  // Het doorgeven: alleen de afgesproken soorten, en alleen van de juiste kant.
  const dom = new JSDOM(buiten, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  await new Promise((k) => setTimeout(k, 50));
  const app = [];
  const script = [];
  const ander = {};
  w.postMessage = (b) => app.push(b);
  const inner = w.document.querySelector("iframe");
  const binnenWindow = inner.contentWindow;
  binnenWindow.postMessage = (b) => script.push(b);
  const stuur = (data, bron) => {
    const e = new w.MessageEvent("message", { data });
    Object.defineProperty(e, "source", { value: bron });
    w.dispatchEvent(e);
  };
  for (const soort of JS_NAAR_APP) stuur({ soort }, binnenWindow);
  meld(app.map((b) => b.soort).join() === JS_NAAR_APP.join(), "van het script naar de app: de afgesproken soorten", app.map((b) => b.soort).join());
  for (const soort of JS_NAAR_SCRIPT) stuur({ soort }, w);
  meld(script.map((b) => b.soort).join() === JS_NAAR_SCRIPT.join(), "van de app naar het script: de afgesproken soorten", script.map((b) => b.soort).join());
  app.length = 0;
  script.length = 0;
  stuur({ soort: "html", html: "<img>" }, binnenWindow);
  stuur({ soort: "weg" }, binnenWindow);
  stuur({ soort: "ping" }, binnenWindow);
  stuur("klaar", binnenWindow);
  stuur(null, binnenWindow);
  meld(app.length === 0, "een andere soort van het script gaat niet door, ook geen `weg`", JSON.stringify(app));
  stuur({ soort: "klaar" }, w);
  stuur({ soort: "html" }, w);
  meld(script.length === 0, "wat de app niet stuurt, gaat ook niet naar het script", JSON.stringify(script));
  stuur({ soort: "klaar" }, ander);
  stuur({ soort: "ping" }, ander);
  stuur({ soort: "klaar" }, null);
  meld(app.length === 0 && script.length === 0, "van een ander venster: niets", JSON.stringify([app, script]));
  meld(!JS_NAAR_APP.includes("html") && !JS_NAAR_SCRIPT.includes("html"), "html staat nergens op de lijst");
  // Een tweede keer laden: het script is weg, en het venster meldt dat zelf.
  inner.dispatchEvent(new w.Event("load"));
  inner.dispatchEvent(new w.Event("load"));
  meld(app.filter((b) => b.soort === "weg").length === 1 && !w.document.querySelector("iframe"), "een tweede keer laden: `weg` naar de app, en het binnenste venster verdwijnt", JSON.stringify(app));
  w.close();
}

// ── 5. Berichten uit het venster ────────────────────────────────────────────
console.log("\n5. Berichten uit het venster");
{
  const png = "data:image/png;base64,iVBORw0KGgo=";
  meld(geldigePng(png), "een PNG als base64");
  for (const w of ["data:image/svg+xml;base64,PHN2Zz4=", "data:text/html;base64,PGI+", "data:image/png,<svg onload=1>", "javascript:alert(1)", "https://x.nl/a.png", png + '"><img', 5, null]) {
    meld(!geldigePng(w), `geen PNG: ${String(w).slice(0, 40)}`);
  }
  meld(leesBericht({ soort: "klaar", luistert: true })?.soort === "klaar", "klaar");
  meld(leesBericht({ soort: "weg" })?.soort === "weg", "weg");
  meld(leesBericht({ soort: "html", html: "<img>" }) === null, "een onbekende soort: genegeerd");
  meld(leesBericht("klaar") === null && leesBericht(null) === null, "geen object: genegeerd");
  meld(leesBericht({ soort: "hoogte", px: 1e9 })?.px === 870 && leesBericht({ soort: "hoogte", px: 1 })?.px === 76, "hoogte binnen de grenzen");
  meld(leesBericht({ soort: "hoogte", px: "<b>" }) === null && leesBericht({ soort: "hoogte", px: NaN }) === null, "een hoogte is een getal");
  meld(leesBericht({ soort: "fout", tekst: "x".repeat(9000) })?.tekst.length === 500, "een foutmelding wordt afgekapt");
  meld(leesBericht({ soort: "fout", tekst: { toString: () => "x" } }) === null, "een foutmelding is tekst");
  const a = leesBericht({ soort: "afdruk", id: 1, dataUrl: "data:text/html,<b>", leeg: false });
  meld(a?.dataUrl === null && a?.mislukt === true, "een afbeelding die geen PNG is: afgekeurd, het kader blijft");
  meld(leesBericht({ soort: "afdruk", id: 2, dataUrl: png })?.dataUrl === png, "een goede afbeelding gaat door");
  meld(leesBericht({ soort: "vraag-bibliotheek", naam: "jquery" }) === null, "alleen de eigen bibliotheek");
  meld(Object.keys(leesBericht({ soort: "pong", html: "<img>", extra: 1 })).join() === "soort", "wat er verder in staat, gaat niet mee");
}

// ── 6. calc ─────────────────────────────────────────────────────────────────
console.log("\n6. calc in het venster");
/**
 * Het binnenste venster in jsdom. Dat laadt geen blob, dus dat doet dit: de omgeving zet de
 * code als blob in de pagina, en hier wordt die uitgevoerd. Klaar als de omgeving dat zegt.
 */
async function draaiBinnen(start, voorbereiden) {
  const blobs = new Map();
  const dom = new JSDOM(jsBinnenSrcdoc(looptijd, start), {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      voorbereiden?.(w);
      w.Blob = class { constructor(delen) { this.tekst = delen.join(""); } };
      w.URL.createObjectURL = (b) => { const u = `blob:proef/${blobs.size}`; blobs.set(u, b.tekst); return u; };
      w.URL.revokeObjectURL = () => {};
      const voegToe = w.Node.prototype.appendChild;
      w.Node.prototype.appendChild = function (n) {
        const uit = voegToe.call(this, n);
        if (n.localName === "script" && blobs.has(n.getAttribute("src"))) {
          w.eval(blobs.get(n.getAttribute("src")));
          n.onload?.();
        }
        return uit;
      };
    },
  });
  await new Promise((k) => {
    if (dom.window.document.readyState === "complete") k();
    else dom.window.addEventListener("load", k);
  });
  await new Promise((k) => setTimeout(k, 20));
  return dom;
}
{
  const { blokken } = doorreken(`L = 5 m
b = 75 mm
F = 12 kN
q = 3 kN/m
M = 8 kN*m
s = 12 N/mm^2
A = 2 m^2
hoek = 30 deg
n = 3
tekst = "ligger"
v_i = [1; 2; 3]
f(x) = x*2
@js
window.__uit = {
  L_mm: calc.getal("L", "mm"), L_m: calc.getal("L"), L_cm: calc.getal("L", "cm"), b_m: calc.getal("b", "m"), F_N: calc.getal("F", "N"),
  q_nmm: calc.getal("q", "N/mm"), M_nm: calc.getal("M", "N*m"), M_knm: calc.getal("M", "kNm"), s_mpa: calc.getal("s", "MPa"), s_kn: calc.getal("s", "kN/m^2"),
  A_mm2: calc.getal("A", "mm²"), hoek: calc.getal("hoek", "rad"), n: calc.getal("n"), n_mm: calc.getal("n", "mm"),
  groep: calc.getallen("mm"), tekst: calc.waarde("tekst"), eenheid: calc.eenheid("L"), lijn: calc.tekst("L"), lijst: calc.waarde("v_i"), namen: calc.namen(),
};
window.__fouten = [];
for (const f of [() => calc.getal("onbekend"), () => calc.getal("F", "mm"), () => calc.getal("L", "smurf"), () => calc.getal("tekst")]) {
  try { f(); window.__fouten.push("geen fout"); } catch (e) { window.__fouten.push(e.message); }
}
window.__bevroren = Object.isFrozen(calc);
@end`, {}, {});
  const b = blokken[0];
  meld(b.waarden.L.w === 5 && b.waarden.L.e === "m" && b.waarden.L.s === 5 && b.waarden.L.d[1] === 1, "de waarde, eenheid, SI en dimensie gaan mee", JSON.stringify(b.waarden.L));
  meld(!("f" in b.waarden), "een functie gaat niet mee");
  const dom = await draaiBinnen({ code: b.code, waarden: b.waarden, netwerk: [], bibliotheken: [], opPapier: false });
  const u = dom.window.__uit ?? {};
  const dicht = (a, w) => Math.abs(a - w) < 1e-9 * Math.max(1, Math.abs(w));
  meld(u.L_mm === 5000 && u.L_m === 5 && u.L_cm === 500, "L: mm, zonder eenheid, cm", JSON.stringify(u));
  meld(u.b_m === 0.075 && u.F_N === 12000, "omrekenen: mm naar m, kN naar N");
  meld(dicht(u.q_nmm, 3) && u.M_nm === 8000 && u.M_knm === 8, "samengesteld: N/mm, N*m, kNm", `${u.q_nmm} ${u.M_nm} ${u.M_knm}`);
  meld(dicht(u.s_mpa, 12) && dicht(u.s_kn, 12000) && u.A_mm2 === 2e6, "spanning en oppervlak: MPa, kN/m^2, mm²", `${u.s_mpa} ${u.s_kn} ${u.A_mm2}`);
  meld(dicht(u.hoek, Math.PI / 6), "een hoek in radialen", String(u.hoek));
  meld(u.n === 3 && u.n_mm === 3, "een kaal getal telt in die eenheid");
  meld(u.groep?.L === 5000 && u.groep?.b === 75 && u.groep?.F === 12 && u.groep?.n === 3, 'calc.getallen("mm"): lengtes omgerekend, de rest zoals het blad', JSON.stringify(u.groep));
  meld(u.tekst === "ligger" && u.eenheid === "m" && u.lijn === "5 m", "tekst, eenheid en de waarde als tekst");
  meld(JSON.stringify(u.lijst).replace(/[\[\]]/g, "") === "1,2,3", "een lijst getallen", JSON.stringify(u.lijst));
  meld(u.namen?.includes("L") && !u.namen?.includes("f"), "calc.namen");
  const fout = dom.window.__fouten ?? [];
  meld(/"onbekend" staat niet in het blad/.test(fout[0]) && /is niet om te rekenen naar mm/.test(fout[1]) && /Onbekende eenheid "smurf"/.test(fout[2]) && /is geen getal/.test(fout[3]),
    "duidelijke fouten", fout.join(" | "));
  meld(dom.window.__bevroren === true, "het script kan calc niet veranderen");
  meld(!/__calcStart/.test(Object.keys(dom.window).join()), "de startgegevens staan niet meer op window");
  dom.window.close();

  // Wat dicht is voordat de code begint, met en zonder netwerk=.
  for (const netwerk of [[], ["x.nl"]]) {
    const proef = await draaiBinnen({ code: "window.__rtc = [typeof RTCPeerConnection, typeof webkitRTCPeerConnection, typeof RTCDataChannel].join();", waarden: {}, netwerk, bibliotheken: [], opPapier: false }, (w) => {
      w.RTCPeerConnection = class {};
      w.webkitRTCPeerConnection = class {};
      w.RTCDataChannel = class {};
    });
    const naam = netwerk.length ? "met netwerk=" : "zonder netwerk=";
    meld(proef.window.__rtc === "undefined,undefined,undefined", `WebRTC is weg, ${naam}`, proef.window.__rtc);
    const regels = [...proef.window.document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')].map((m) => m.getAttribute("content"));
    const verwacht = `script-src blob:${netwerk.map((h) => ` https://${h}`).join("")}`;
    meld(regels.at(-1) === verwacht, `daarna geen inline script meer, ${naam}: ${verwacht}`, regels.at(-1));
    proef.window.close();
  }
  const volgorde = await draaiBinnen({ code: "window.__stand = document.readyState;", waarden: {}, netwerk: [], bibliotheken: [], opPapier: false });
  meld(volgorde.window.__stand === "complete", "de code begint pas als de pagina geladen is: een tweede `load` is dan altijd een navigatie", volgorde.window.__stand);
  volgorde.window.close();
}

// ── 7. De opschoning: kwaadaardig ───────────────────────────────────────────
console.log("\n7. De opschoning: wat er niet in mag");
const venster = new JSDOM("<!doctype html>").window;
const schoon = maakOpschoner(createDOMPurify(venster));
const lees = (html) => {
  const t = venster.document.createElement("template");
  t.innerHTML = schoon(html);
  return t.content;
};
const heeftGevaar = (d) => {
  for (const e of d.querySelectorAll("*")) {
    if (/^(script|iframe|object|embed|form|meta|base|link|frame|frameset|applet|foreignobject)$/i.test(e.localName)) return `<${e.localName}>`;
    for (const a of e.attributes) {
      if (/^on/i.test(a.name)) return `${e.localName}@${a.name}`;
      if (/^\s*(javascript|vbscript)\s*:/i.test(a.value.replace(/[\s\u0000-\u001f]/g, ""))) return `${e.localName}@${a.name}=${a.value}`;
    }
  }
  return null;
};
{
  const kwaad = [
    "<img src=x onerror=alert(1)>",
    '<svg onload="alert(1)"></svg>',
    "<script>alert(1)</script>",
    '<iframe src="javascript:alert(1)"></iframe>',
    '<iframe srcdoc="<script>parent.alert(1)</script>"></iframe>',
    '<iframe src="https://x.nl"></iframe>',
    '<object data="javascript:alert(1)"></object>',
    '<embed src="javascript:alert(1)">',
    '<a href="javascript:alert(1)">x</a>',
    '<a href=" jav&#x09;ascript:alert(1)">x</a>',
    '<details open ontoggle=alert(1)></details>',
    '<body onload=alert(1)>',
    '<input autofocus onfocus=alert(1)>',
    '<video src=x onerror=alert(1)></video>',
    '<form action="javascript:alert(1)"><button>x</button></form>',
    '<button formaction="javascript:alert(1)">x</button>',
    '<meta http-equiv="refresh" content="0;url=https://x.nl">',
    '<base href="https://x.nl/">',
    '<link rel="stylesheet" href="https://x.nl/a.css">',
    '<svg><script>alert(1)</script></svg>',
    '<svg><image href="x" onerror="alert(1)"/></svg>',
    '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg><animate onbegin="alert(1)" attributeName="x" dur="1s"/></svg>',
    '<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>',
    '<svg><set attributeName="onmouseover" to="alert(1)"/></svg>',
    '<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>',
    '<svg></p><style><a id="</style><img src=x onerror=alert(1)>"></a>',
  ];
  for (const k of kwaad) {
    const g = heeftGevaar(lees(k));
    meld(g === null, `weg: ${k.slice(0, 64)}`, g);
  }
  const use = lees('<svg><use href="data:image/svg+xml,<svg id=x xmlns=%22http://www.w3.org/2000/svg%22/>#x"/><use href="https://x.nl/a.svg#x"/><use xlink:href="//x.nl/a.svg#x"/><use href="#a"/></svg>');
  const hrefs = [...use.querySelectorAll("use")].map((e) => e.getAttribute("href") ?? e.getAttribute("xlink:href"));
  meld(hrefs.filter(Boolean).join() === "#a", "<use> alleen naar deze pagina", JSON.stringify(hrefs));
  const stijl = (css) => lees(`<div style="${css}">x</div>`).querySelector("div").hasAttribute("style");
  meld(!stijl("background:url(https://x.nl/lek)") && !stijl("background:URL( 'http://x.nl/lek' )") && !stijl("background:url(//x.nl/lek)"), "een stijl haalt niets van buiten op");
  meld(!stijl("position:fixed;inset:0;z-index:9999"), "en bedekt de app niet");
  meld(stijl("color:#b91c1c;font-weight:700") && stijl("fill:url(#verloop)") && stijl("position:relative"), "gewone stijlen en url(#…) blijven");
  meld(gevaarlijkeStijl("@import 'https://x.nl/a.css'") && gevaarlijkeStijl("a{background:u\\72l(https://x.nl)}"), "@import en een verstopte url");
  meld(gevaarlijkeStijl("background:image-set('https://x.nl/a.png' 1x)") && gevaarlijkeStijl("background:-webkit-image-set('https://x.nl/a.png' 1x)") && gevaarlijkeStijl("background:src('https://x.nl/a.png')"), "image-set en src zonder url()");
  meld(lees("<style>*{display:none}</style><b>x</b>").querySelector("style") === null, "een los stijlblok gaat weg");
  meld(lees("<svg><style>@import url(https://x.nl/a.css);</style></svg>").querySelector("style") === null, "een stijlblok in SVG met @import ook");
  meld(lees("<svg><style>.a{fill:red}</style></svg>").querySelector("style") !== null, "een gewoon stijlblok in SVG blijft");
  const clobber = lees('<img name="getElementById" src="data:,"><form id="x"></form>');
  meld(!clobber.querySelector("img")?.hasAttribute("name"), "een naam die `document` overschrijft, gaat weg");
}

// ── 8. De opschoning: wat blijft ────────────────────────────────────────────
console.log("\n8. De opschoning: wat er blijft");
{
  const blijft = (html, kies, wat, f) => {
    const d = lees(html);
    const e = d.querySelector(kies);
    meld(!!e && (!f || f(e)), wat, schoon(html).slice(0, 160));
  };
  for (const tag of ["i", "b", "code", "hr", "sub", "sup", "br", "em", "strong", "table", "h1", "h6"]) blijft(`<div><${tag}>x</${tag}></div>`, tag, `<${tag}>`);
  blijft('<span class="kolom-3 alleen-scherm" style="color:green">x</span>', "span.kolom-3", "<span class> met stijl", (e) => e.getAttribute("style") === "color:green");
  blijft('<p class="calc-text"><span class="alleen-afdruk"></span></p>', ".alleen-afdruk", "een leeg merkteken");
  blijft('<table style="width:100%"><tr><td style="padding:2px 8px">x</td></tr></table>', "td", "tabel met stijl", (e) => !!e.getAttribute("style"));
  blijft('<input class="calc-input-value" data-prompt="L" value="5" type="text">', "input", "invoerveld", (e) => e.dataset.prompt === "L" && e.value === "5");
  blijft('<select class="calc-select-input" data-var="k"><option value="1" selected>a</option></select>', "select option", "keuzelijst", (e) => e.value === "1");
  blijft('<img src="data:image/png;base64,iVBORw0KGgo=" alt="">', "img", "een afbeelding als data-url", (e) => e.src.startsWith("data:image/png"));
  blijft('<img src="/src/assets/a.png">', "img", "een afbeelding uit de app");
  // Tekenen: <defs>, <symbol>, <use href="#…">, data-attributen en tekst.
  const tekening = `<svg data-tekening="a" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><defs><marker id="m1" markerWidth="4" markerHeight="4"><path d="M0 0L4 2z"/></marker><symbol id="ipe-200" overflow="visible"><rect width="10" height="20" fill="#ccc"/></symbol><linearGradient id="v"><stop offset="0"/></linearGradient><clipPath id="c"><rect width="1" height="1"/></clipPath><pattern id="p" width="2" height="2"><path d="M0 0"/></pattern></defs><use href="#ipe-200" data-symbool="staal" data-params="a=1" transform="translate(5 5)"/><line x1="0" y1="0" x2="9" y2="9" marker-end="url(#m1)" stroke-dasharray="2 2"/><text x="1" y="2" font-size="3" text-anchor="middle" paint-order="stroke">M = 5 kNm</text><g clip-path="url(#c)" fill="url(#v)"><circle r="1"/><polygon points="0,0 1,1"/><polyline points="0,0 1,1"/><ellipse rx="1" ry="1"/></g></svg>`;
  const d = lees(tekening);
  for (const k of ["defs", "symbol#ipe-200", "marker#m1", "linearGradient#v", "clipPath#c", "pattern#p", "polygon", "polyline", "ellipse", "circle", "text"]) {
    meld(!!d.querySelector(k.replace("linearGradient", "lineargradient").replace("clipPath", "clippath")) || !!d.querySelector(k), `SVG: ${k}`, schoon(tekening).slice(0, 200));
  }
  const u = d.querySelector("use");
  meld(u?.getAttribute("href") === "#ipe-200" && u?.getAttribute("data-symbool") === "staal" && u?.getAttribute("transform") === "translate(5 5)", '<use href="#…"> met data en plaatsing', u?.outerHTML);
  meld(d.querySelector("svg")?.getAttribute("data-tekening") === "a" && d.querySelector("svg")?.getAttribute("viewBox") === "0 0 100 50", "<svg> houdt data-tekening en viewBox");
  meld(d.querySelector("line")?.getAttribute("marker-end") === "url(#m1)", "marker-end");
  meld(d.querySelector("text")?.textContent === "M = 5 kNm", "tekst in de tekening");

  // Een echte tekening uit Tekenen: door de rekenkern en dan door de opschoning.
  const tekenen = (bestand) => import(pathToFileURL(join(hier, "../packages/desktop/src/components/tekenen", bestand)).href);
  const [Y, M, C] = await Promise.all([tekenen("symbolen.ts"), tekenen("model.ts"), tekenen("code.ts")]);
  const heb = (x, o = {}) => Y.nieuwSymbool("staal", { x, y: 50 }, M.STANDAARD_STIJL, { familie: "HEB", maat: "HEB 240", ...o });
  const blok = C.schrijfTekening(Object.assign(M.legeTekening("tek1"), { elementen: [heb(100), heb(250), heb(400, { maat: "HEB 300" })] }), { verborgen: false, kop: "x" });
  const echt = render(evaluate(parse(blok)));
  const voorEcht = venster.document.createElement("template");
  voorEcht.innerHTML = echt;
  const naEcht = lees(echt);
  const serie = (root) => [...root.querySelectorAll("svg, svg *")].map((e) => `${e.localName}|${[...e.attributes].map((a) => `${a.name}=${a.value}`).sort().join("|")}|${e.children.length ? "" : e.textContent}`).join("\n");
  meld(serie(voorEcht.content) === serie(naEcht), "een tekening uit Tekenen blijft element voor element gelijk", serie(naEcht).slice(0, 200));
  meld(naEcht.querySelectorAll("symbol").length === 2 && naEcht.querySelectorAll("use").length === 3, "twee <symbol> en drie <use>", String(naEcht.querySelectorAll("use").length));
  const ids = new Set([...naEcht.querySelectorAll("symbol")].map((s) => `#${s.id}`));
  meld([...naEcht.querySelectorAll("use")].every((u) => ids.has(u.getAttribute("href"))), "elke <use> wijst naar zijn <symbol>");

  // Formules: KaTeX
  const formule = '<span class="katex-display"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>x</mi><mo>=</mo><mfrac><mn>1</mn><mn>2</mn></mfrac><mi><mrow><mn mathvariant="bold">5</mn></mrow></mi></mrow><annotation encoding="application/x-tex">x=\\frac12</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base" style="height:1em"><span class="mord mathnormal">x</span></span></span></span></span>';
  const f = lees(formule);
  meld(!!f.querySelector("math semantics annotation") && f.querySelector("annotation").getAttribute("encoding") === "application/x-tex", "MathML met annotatie");
  meld(!!f.querySelector(".katex-html[aria-hidden]") && f.querySelector(".base").getAttribute("style") === "height:1em", "de zichtbare formule met haar stijlen");
  meld(/5/.test(f.querySelector("math mrow").textContent), "een vet getal in de MathML houdt zijn tekst", f.querySelector("math")?.outerHTML.slice(0, 200));

  // Onze eigen blokken
  const eigen = doorreken(`L = 5 m
@3d
balk 0 0 0 1000 0 0 100 200 hout
tekst 0 0 0 "a --> b ]> </style>"
@end
@iframe https://x.nl/a?b=1&c=2 hoogte=40mm scripts
@js titel="T" netwerk=x.nl bibliotheek=three
const a = [1, 2][0] > 0 ? "</script>" : "-->";
@end`);
  const e = lees(eigen.html);
  const scene = e.querySelector(".calc-3d")?.getAttribute("data-scene");
  meld(!!scene && JSON.parse(scene).elementen.length === 2 && JSON.parse(scene).elementen[1].tekst.includes("</style>"), "@3d houdt data-scene, ook met </style> in een tekst", String(scene).slice(0, 80));
  meld(e.querySelector(".calc-3d svg polygon") !== null, "en de projectie");
  meld(e.querySelector(".calc-iframe")?.dataset.iframeUrl === "https://x.nl/a?b=1&c=2" && e.querySelector(".calc-iframe")?.dataset.iframeScripts === "ja", "@iframe houdt zijn adres en rechten");
  const j = e.querySelector(".calc-js");
  meld(!!j && JSON.parse(j.getAttribute("data-js-code")) === 'const a = [1, 2][0] > 0 ? "</script>" : "-->";', "@js houdt zijn code, ook met </script>, ]> en -->", j?.getAttribute("data-js-code"));
  meld(j?.dataset.jsNetwerk === "x.nl" && j?.dataset.jsBibliotheek === "three" && j?.dataset.jsTitel === "T" && !!j?.dataset.jsWaarden, "en zijn attributen");
  meld(j?.querySelector(".calc-iframe-vak")?.getAttribute("style") === "height:90mm", "de vaste hoogte van het vak");
  const ifcx = doorreken(`b_balk = 71 mm
h_balk = 221 mm
hoh = 450 mm
L_th = 5050 mm
a_opl = 50 mm
t_vloer = 18 mm
@ifcx balklaag`);
  meld(JSON.parse(lees(ifcx.html).querySelector(".calc-ifcx")?.getAttribute("data-ifcx") ?? "{}").header?.ifcxVersion === "ifcx_alpha", "@ifcx houdt zijn document");
}

// ── 9. Adressen naar buiten ─────────────────────────────────────────────────
console.log("\n9. Adressen naar buiten");
{
  // Een waarde uit het blad komt zo in een adres; dat mag niet vanzelf laden.
  const blad = (regel) => lees(doorreken(`L = 5 m\n${regel}`).html);
  const metWaarde = blad(`'<img src="https://x.nl/a.png?L={{L}}">`).querySelector("img");
  meld(metWaarde && !metWaarde.hasAttribute("src") && metWaarde.dataset.externSrc === "https://x.nl/a.png?L=5", "een tekstregel met {{L}} in het adres: wacht op bevestiging", metWaarde?.outerHTML);
  const opImg = blad("@img(https://x.nl/a.png)").querySelector("img");
  meld(opImg && !opImg.hasAttribute("src") && opImg.dataset.externSrc === "https://x.nl/a.png", "@img(https://…) ook", opImg?.outerHTML);
  for (const vorm of ["//x.nl/a.png", "/\\x.nl/a.png", "\\\\x.nl\\a.png", "ht&#9;tps://x.nl/a.png", " https://x.nl/a.png", "HTTPS://X.NL/a.png", "http://x.nl:8080/a.png", "http://127.0.0.1:3000/a.png"]) {
    const img = lees(`<img src="${vorm}">`).querySelector("img");
    meld(img && !img.hasAttribute("src") && !!magLaden(img.dataset.externSrc ?? ""), `naar buiten: ${vorm}`, img?.outerHTML);
  }
  for (const vorm of ["a.png", "./a.png", "/src/assets/a.png", "data:image/png;base64,iVBORw0KGgo="]) {
    const img = lees(`<img src="${vorm}">`).querySelector("img");
    meld(img?.getAttribute("src") === vorm && !img.hasAttribute("data-extern-src"), `blijft staan: ${vorm.slice(0, 30)}`, img?.outerHTML);
  }
  meld(adresNaarBuiten("onleesbaar://[") === null && adresNaarBuiten("") === null, "wat niet te lezen is, laadt de browser ook niet");
  const weg = {
    srcset: '<img srcset="https://x.nl/a.png 1x">',
    picture: '<picture><source srcset="https://x.nl/a.png"><img src="a.png"></picture>',
    video: '<video src="https://x.nl/a" poster="https://x.nl/b.png"></video>',
    audio: '<audio src="https://x.nl/a" autoplay></audio>',
    source: '<video><source src="https://x.nl/a"></video>',
    track: '<video><track src="https://x.nl/a"></video>',
    input: '<input type="image" src="https://x.nl/a.png">',
    tabel: '<table background="https://x.nl/a.png"><tr><td>x</td></tr></table>',
    feImage: '<svg><filter id="f"><feImage href="https://x.nl/a.png"/></filter></svg>',
    "feImage xlink": '<svg><filter id="f"><feImage xlink:href="https://x.nl/a.png"/></filter></svg>',
    pattern: '<svg><pattern id="p" href="https://x.nl/a.svg#b"/></svg>',
    verloop: '<svg><linearGradient id="g" href="https://x.nl/a.svg#b"/></svg>',
    use: '<svg><use href="https://x.nl/a.svg#b"/></svg>',
    fill: '<svg><rect fill="url(https://x.nl/a.svg#b)"/></svg>',
    filter: '<svg><rect filter="url(https://x.nl/a.svg#b)"/></svg>',
    mask: '<svg><rect mask="url(https://x.nl/a.svg#b)"/></svg>',
    "clip-path": '<svg><rect clip-path="url(https://x.nl/a.svg#b)"/></svg>',
    marker: '<svg><line marker-end="url(https://x.nl/a.svg#b)"/></svg>',
    stijl: '<div style="background:image-set(\'https://x.nl/a.png\' 1x)">x</div>',
    stijlblok: '<svg><style>rect{cursor:url(https://x.nl/a.png),auto}</style></svg>',
  };
  for (const [naam, html] of Object.entries(weg)) meld(!schoon(html).includes("x.nl"), `geen adres meer: ${naam}`, schoon(html));
  for (const naam of ["href", "xlink:href"]) {
    const img = lees(`<svg><image ${naam}="https://x.nl/a.png"/></svg>`).querySelector("image");
    meld(img && !img.hasAttribute("href") && !img.hasAttribute("xlink:href") && img.dataset.externSrc === "https://x.nl/a.png", `SVG <image ${naam}>: wacht op bevestiging`, img?.outerHTML);
  }
  meld(lees('<svg><rect fill="url(#a)"/></svg>').querySelector("rect")?.getAttribute("fill") === "url(#a)", "een verwijzing binnen de tekening blijft");
  meld(lees('<svg><image href="#a"/></svg>').querySelector("image")?.getAttribute("href") === "#a", "en een <image> binnen de pagina ook");
  // Een link laadt pas na een klik: die blijft, en opent buiten de app.
  meld(lees('<a href="https://x.nl/?L=5">x</a>').querySelector("a")?.getAttribute("href") === "https://x.nl/?L=5", "een link blijft staan");
  meld(lees('<svg><a href="https://x.nl/"><text>x</text></a></svg>').querySelector("a")?.getAttribute("href") === "https://x.nl/", "ook in SVG");
  meld(linkNaarBuiten("https://x.nl/?L=5") === "https://x.nl/?L=5" && linkNaarBuiten("//x.nl/a") === "http://x.nl/a" && linkNaarBuiten("mailto:a@x.nl") === "mailto:a@x.nl", "een link naar buiten: http, https, mailto");
  for (const adres of ["/pad", "a.html", "#kop", "ms-proef:x", "javascript:alert(1)", "file:///c:/a", "data:text/html,x"]) {
    meld(linkNaarBuiten(adres) === null, `geen link naar buiten: ${adres}`, String(linkNaarBuiten(adres)));
  }
  meld(magLaden("javascript:alert(1)") === null && magLaden("data:image/png;base64,x") === null, "een nagemaakte data-extern-src met iets anders dan http laadt niet");
}

// ── 10. De sjablonen ────────────────────────────────────────────────────────
console.log("\n10. De sjablonen door de opschoning");
{
  const SCOPE = { CC: 2, K_FI: 1, rekenwijze: 0 };
  const BALKLAAG = {
    profiel: "12", sterkteklasse: "2", klimaat: "1", duurklasse: "2", schema: "1", ligger: "1", doorsnede: "1", L_d: "5000", a_opl: "50", hoh: "600", t_vloer: "18",
    E_beschot: "7000", b_vloer: "3", G_k: "1", Q_k: "1.75", F_k: "2", belastingcat: "2", controleer: "1", grensfactor: "0.004", grens_bij: "0.003", controleer_trilling: "1",
    "ζ": "0.01", a_tril: "1", b_tril: "120", g_bl: "0", a_steun: "0", a_over: "0", L_veld2: "0", b_sparing: "0", l_staart: "0", b_ond: "0", b_zelf: "0", h_zelf: "0", "ψ_0_zelf": "0", "ψ_2_zelf": "0",
  };
  for (const [naam, bestand, waarden] of [["balklaag", "balklaag.ts", BALKLAAG], ["ligger", "ligger.ts", {}], ["voorbeeldblad", "calcpad-demo.ts", {}]]) {
    const html = render(evaluate(parse(laadTemplate(bestand)), waarden, SCOPE));
    const voor = venster.document.createElement("template");
    voor.innerHTML = html;
    const na = lees(html);
    const zichtbaar = (d) => [...d.querySelectorAll(".katex-mathml")].forEach((e) => e.remove()) ?? d.textContent.replace(/\s+/g, " ");
    meld(zichtbaar(voor.content) === zichtbaar(na), `${naam}: de zichtbare tekst is gelijk`);
    meld(heeftGevaar(na) === null, `${naam}: geen gevaarlijke elementen`, heeftGevaar(na));
    meld(na.querySelectorAll("[data-extern-src]").length === 0, `${naam}: geen afbeelding van buiten`);
    const tel = (d, k) => d.querySelectorAll(k).length;
    for (const k of ["svg", "input", "select", "table", ".katex-html", ".calc-line", ".calc-js", ".calc-iframe"]) {
      if (tel(voor.content, k) !== tel(na, k)) meld(false, `${naam}: ${k} blijft`, `${tel(voor.content, k)} → ${tel(na, k)}`);
    }
  }
  meld(true, "svg, invoer, keuzelijsten, tabellen, formules en blokken: evenveel");
}

console.log(fouten === 0 ? "\nAlle controles van het JavaScript-blok groen." : `\n${fouten} controle(s) van het JavaScript-blok gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
