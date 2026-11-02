/**
 * Controle van het iframe-blok (`@iframe <adres> hoogte=120mm`).
 *
 * De kern schrijft een kader met het adres (packages/core/src/iframeBlok.ts);
 * de app zet er na bevestiging een iframe in en bepaalt zelf de rechten
 * (packages/desktop/src/components/calc/iframeRegels.ts). Dit script bewaakt:
 *   1. de schrijfwijze: adres, hoogte in mm, cm, m en px, titel, scripts, en dat
 *      de parser het adres heel laat (punten, komma's, dollartekens, IPv6);
 *   2. `{{…}}` in adres, hoogte en titel, URL-gecodeerd in een adres;
 *   3. geweigerde schema's, ook na het invullen van `{{…}}`, en in de kern
 *      én in de app;
 *   4. de uitvoer: geen <iframe> in de html van de kern, wel het kader;
 *   5. de attributen en rechten van het iframe dat de app maakt;
 *   6. `#hide`, `#pre` en de rest van het blad na een fout.
 *
 * Draaien:  node scripts/check-iframe.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render, iframeAdres } from "../packages/core/dist/index.js";
import {
  IFRAME_RECHTEN, iframeAttributen, herkomstVan, magLaden,
} from "../packages/desktop/src/components/calc/iframeRegels.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

function doorreken(bron, waarden = {}) {
  const nodes = evaluate(parse(bron), waarden);
  const vlak = (lijst) => lijst.flatMap((n) => (n.type === "conditional-branch" ? vlak(n.children) : [n]));
  return { blokken: vlak(nodes).filter((n) => n.type === "iframe"), html: render(nodes) };
}
const ontsnap = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const urlIn = (html) => {
  const m = html.match(/data-iframe-url="([^"]*)"/);
  return m ? ontsnap(m[1]) : null;
};

// ── 1. Schrijfwijze ─────────────────────────────────────────────────────────
console.log("\n1. Schrijfwijze");
{
  const { blokken, html } = doorreken(`"Blad
@iframe https://voorbeeld.nl/kaart?a=1,5&b=c.d$e#deel hoogte=120mm
'Daarna`);
  const b = blokken[0];
  meld(blokken.length === 1, "de parser maakt één knoop van type 'iframe'");
  meld(b?.url === "https://voorbeeld.nl/kaart?a=1,5&b=c.d$e#deel", "het adres blijft heel: punten, komma's, dollarteken, fragment", b?.url);
  meld(b?.hoogteMm === 120, "hoogte=120mm", String(b?.hoogteMm));
  meld(b?.scripts === false, "zonder `scripts` geen scripts");
  meld(/Daarna/.test(html), "het blad gaat na het blok gewoon verder");

  const maat = (t) => doorreken(`@iframe https://x.nl hoogte=${t}`).blokken[0];
  meld(maat("12cm").hoogteMm === 120, "hoogte=12cm is 120 mm");
  meld(maat("0.12m").hoogteMm === 120, "hoogte=0.12m is 120 mm");
  meld(maat("80").hoogteMm === 80, "een kaal getal telt in mm");
  meld(Math.abs(maat("378px").hoogteMm - 100) < 0.1, "hoogte=378px is 100 mm");
  meld(doorreken("@iframe https://x.nl").blokken[0].hoogteMm === 120, "zonder hoogte 120 mm");

  const zonderMaat = doorreken("@iframe https://x.nl hoogte=abc").blokken[0];
  meld(zonderMaat.meldingen.some((m) => /"abc" is geen hoogte/.test(m)) && zonderMaat.hoogteMm === 120, "een onleesbare hoogte geeft een melding en de standaard", zonderMaat.meldingen.join(" | "));
  const teHoog = doorreken("@iframe https://x.nl hoogte=900mm").blokken[0];
  meld(teHoog.hoogteMm === 230 && teHoog.meldingen.some((m) => /buiten 20 tot 230 mm/.test(m)), "te hoog wordt 230 mm, met een melding: het blok past altijd op één vel", String(teHoog.hoogteMm));
  meld(doorreken("@iframe https://x.nl hoogte=1mm").blokken[0].hoogteMm === 20, "te laag wordt 20 mm");

  const met = doorreken('@iframe http://[::1]:3040/a hoogte=50mm titel="Kaart van het terrein" scripts').blokken[0];
  meld(met.url === "http://[::1]:3040/a", "IPv6 met poort blijft heel; de matrix-herschrijving blijft eraf", met.url);
  meld(met.titel === "Kaart van het terrein" && met.scripts === true, "titel tussen aanhalingstekens, en `scripts`");
  const onbekend = doorreken("@iframe https://x.nl breedte=100mm").blokken[0];
  meld(onbekend.meldingen.some((m) => /onbekende optie "breedte=100mm"/.test(m)), "een onbekende optie geeft een melding", onbekend.meldingen.join(" | "));
  const geen = doorreken("@iframe hoogte=100mm");
  meld(geen.blokken[0].url === null && /geen adres/.test(geen.html), "zonder adres een melding");
  meld(doorreken("@IFRAME https://x.nl").blokken.length === 1, "hoofdletters mogen, zoals bij @3d");
}

// ── 2. Invulling ────────────────────────────────────────────────────────────
console.log("\n2. {{…}} in adres, hoogte en titel");
{
  const { blokken } = doorreken(`L = 5 m
V_b,0 = 27
naam = "a b&c"
h_k = 9 cm
@iframe https://x.nl/?L={{L}}&v={{V_b,0}}&d={{L*2}}&n={{naam}} hoogte={{h_k}} titel="L is {{L}} m"`);
  const b = blokken[0];
  meld(b?.url === "https://x.nl/?L=5&v=27&d=10&n=a%20b%26c", "waarden zonder eenheid, formule mag, tekst URL-gecodeerd", b?.url);
  meld(b?.hoogteMm === 90, "{{h_k}} = 9 cm is 90 mm", String(b?.hoogteMm));
  meld(b?.titel === "L is 5 m", "{{L}} in de titel", b?.titel);

  const heel = doorreken(`site = "https://x.nl/pad?q=1"
@iframe {{site}} hoogte=30mm`).blokken[0];
  meld(heel.url === "https://x.nl/pad?q=1", "{{…}} als het hele adres wordt niet gecodeerd", heel.url);
  meld(doorreken("h = 40\n@iframe https://x.nl hoogte={{h}}").blokken[0].hoogteMm === 40, "een getal zonder eenheid telt in mm");
  meld(doorreken("h = 2\n@iframe https://x.nl hoogte={{h}}cm").blokken[0].hoogteMm === 20, "{{h}}cm");

  const fout = doorreken("@iframe https://x.nl/?a={{onbekend}} hoogte=30mm");
  meld(fout.blokken[0].url === null && /\{\{onbekend\}\} is niet uit te rekenen/.test(fout.html), "een onbekende naam geeft een melding, geen half adres", fout.blokken[0].meldingen.join(" | "));
  const kracht = doorreken("F = 3 kN\n@iframe https://x.nl hoogte={{F}}").blokken[0];
  meld(kracht.meldingen.some((m) => /is geen lengte \(kN\)/.test(m)), "een kracht als hoogte: geen lengte", kracht.meldingen.join(" | "));
}

// ── 3. Geweigerde schema's ──────────────────────────────────────────────────
console.log("\n3. Geweigerde adressen");
{
  const slecht = [
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", " javascript:alert(1)",
    "file:///C:/Windows/win.ini", "data:text/html,<script>1</script>", "blob:https://x.nl/1",
    "about:blank", "tauri://localhost", "asset://localhost/x", "ftp://x.nl/", "vbscript:x", "ws://x.nl",
    "//x.nl/zonder-schema", "/pad", "pad/naar.html", "x.nl", "", "https://gebruiker:geheim@x.nl/",
  ];
  for (const adres of slecht) {
    const kern = iframeAdres(adres);
    const app = magLaden(adres);
    meld(kern.url === undefined && app === null, `geweigerd: ${JSON.stringify(adres)}`, JSON.stringify(kern));
  }
  const goed = ["http://localhost:3040/pagina.html", "https://x.nl/a?b=1#c", "HTTPS://X.NL/", "http://127.0.0.1:3040"];
  for (const adres of goed) {
    const kern = iframeAdres(adres);
    meld(kern.url !== undefined && magLaden(kern.url) === kern.url, `toegestaan: ${adres}`, JSON.stringify(kern));
  }

  const r = doorreken(`@iframe javascript:alert(1) hoogte=30mm
'Rest`);
  meld(r.blokken[0].url === null && !/data-iframe-url/.test(r.html), "javascript: staat niet als adres in de uitvoer");
  meld(/calc-iframe-melding/.test(r.html) && /niet toegestaan/.test(r.html), "wel als melding in de uitwerking");
  meld(/Rest/.test(r.html), "de rest van het blad staat er gewoon");

  // Ook wat pas na het invullen een ander schema wordt.
  const na = doorreken(`s = "javascript:alert(1)"
@iframe {{s}} hoogte=30mm`);
  meld(na.blokken[0].url === null && !/data-iframe-url/.test(na.html), "javascript: via {{…}} wordt ook geweigerd");
  const data = doorreken(`s = "file:///c:/x"
@iframe {{s}}`);
  meld(data.blokken[0].url === null, "file: via {{…}} wordt ook geweigerd");
  // Een waarde in een adres kan het adres niet ombouwen.
  const inbreken = doorreken(`s = "x\\"><script>1</script>"
@iframe https://x.nl/?q={{s}} hoogte=30mm`);
  meld(!/<script/.test(inbreken.html), "html uit een waarde komt niet in de uitvoer", inbreken.html.slice(0, 200));
  const titel = doorreken(`@iframe https://x.nl titel="<img src=x onerror=alert(1)>"`);
  meld(!/<img/.test(titel.html), "html in de titel wordt tekst");
}

// ── 4. De uitvoer van de kern ───────────────────────────────────────────────
console.log("\n4. De uitvoer van de kern");
{
  const { html } = doorreken("@iframe https://x.nl/a?b=1&c=2 hoogte=75mm scripts");
  meld(!/<iframe/i.test(html), "de kern schrijft geen <iframe>: laden gebeurt pas na bevestiging, in de app");
  meld(urlIn(html) === "https://x.nl/a?b=1&c=2", "data-iframe-url met het adres, & correct geschreven", urlIn(html));
  meld(/data-iframe-scripts="ja"/.test(html), "data-iframe-scripts");
  meld(/<div class="calc-iframe-vak" style="height:75mm">/.test(html), "het vak heeft de vaste hoogte in mm");
  meld(/class="calc-iframe-kader"/.test(html) && /class="calc-iframe-url">https:\/\/x\.nl\/a\?b=1&amp;c=2</.test(html), "het kader met het adres");
  meld(/class="calc-iframe-bron"/.test(html), "het onderschrift met de bron");
}

// ── 5. Het iframe van de app ────────────────────────────────────────────────
console.log("\n5. De attributen van het iframe");
{
  const a = iframeAttributen("https://x.nl/", false, "Kaart");
  meld(a.sandbox === "", 'sandbox="" zonder `scripts`: niets toegestaan', JSON.stringify(a));
  meld(a.referrerpolicy === "no-referrer", 'referrerpolicy="no-referrer"');
  meld(a.allow === "", 'allow="": geen camera, microfoon of locatie');
  meld("credentialless" in a, "credentialless: geen cookies mee");
  meld(a.src === "https://x.nl/" && a.title === "Kaart", "src en title");
  const s = iframeAttributen("https://x.nl/", true, "");
  meld(s.sandbox === "allow-scripts", 'met `scripts`: alleen sandbox="allow-scripts"', s.sandbox);
  const verboden = ["allow-same-origin", "allow-top-navigation", "allow-popups", "allow-forms", "allow-modals", "allow-downloads"];
  meld(!verboden.some((v) => IFRAME_RECHTEN.includes(v) || s.sandbox.includes(v)), "nooit allow-same-origin of een ander recht");
  meld(herkomstVan("https://x.nl:8080/a?b=1") === "https://x.nl:8080", "bevestigen gaat per herkomst: schema, host en poort");
  meld(herkomstVan("https://x.nl/a") !== herkomstVan("https://y.nl/a") && herkomstVan("http://x.nl/") !== herkomstVan("https://x.nl/"),
    "een ander domein of een ander schema is een andere herkomst");
}

// ── 6. #hide, #pre en een regel binnen #if ──────────────────────────────────
console.log("\n6. Zichtbaarheid");
{
  const v = doorreken("#hide\n@iframe https://x.nl\n#show\n'zichtbaar");
  meld(v.blokken.length === 0 && !/calc-iframe/.test(v.html), "#hide: geen blok");
  const s = doorreken("#pre\n@iframe https://x.nl\n#post");
  meld(/<div class="calc-iframe alleen-scherm"/.test(s.html), "#pre: alleen op het scherm", s.html.slice(0, 120));
  const i = doorreken("a = 2\n#if a > 1\n@iframe https://x.nl hoogte=30mm\n#else\n@iframe https://y.nl\n#end if");
  meld(i.blokken.length === 1 && i.blokken[0].url === "https://x.nl/", "binnen #if: de gekozen tak");
}

console.log(fouten === 0 ? "\nAlle iframe-controles groen." : `\n${fouten} iframe-controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
