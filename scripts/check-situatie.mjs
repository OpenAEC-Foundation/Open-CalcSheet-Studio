/**
 * De situatiekaart: het punt en de tegelwiskunde (Web Mercator, tegels van 256 px).
 *
 * Handberekening:
 *   tegelPositie(0, 0, zoom 1)  = (1, 1)           (de wereld is 2 × 2 tegels)
 *   metersPerPixel(0, 0)        = 156543,03392 m
 *   zoom 15 op 52,09° N: 156543,03392 · cos(52,09°) / 2^15 = 2,935 m/px
 *   200 px = 587 m, dus de grootste 1-2-5-waarde die past is 500 m
 *
 * Draaien:  node scripts/check-situatie.mjs
 */
import { readFileSync } from "node:fs";
import {
  leesPunt, puntJson, leesCoordinaten, puntTekst,
} from "../packages/desktop/src/kaart/punt.ts";
import { parseNominatim, zoekAdres } from "../packages/desktop/src/kaart/nominatim.ts";
import {
  tegelPositie, metersPerPixel, zoomVoor, uitsnede, schaalbalk, schaalTekst,
} from "../packages/desktop/src/kaart/tegels.ts";
import { KAARTEN, normaliseerSituatie, onderschrift, situatieBijPunt } from "../packages/desktop/src/rapport/situatie.ts";
import { normaliseerRapport, standaardRapport } from "../packages/desktop/src/rapport/model.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const bijna = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const gelijk = (p, lat, lon) => p !== null && bijna(p.lat, lat) && bijna(p.lon, lon);
const toon = (v) => JSON.stringify(v);

console.log("Het punt lezen en schrijven");
meld(gelijk(leesPunt('{"lat":52.09,"lon":5.12}'), 52.09, 5.12), "geldige JSON geeft het punt", toon(leesPunt('{"lat":52.09,"lon":5.12}')));
meld(leesPunt("kapot") === null, "geen JSON geeft null");
meld(leesPunt('{"lat":95,"lon":5}') === null, "lat buiten ±90 geeft null");
meld(leesPunt('{"lat":5,"lon":181}') === null, "lon buiten ±180 geeft null");
meld(leesPunt(undefined) === null, "undefined geeft null");
meld(leesPunt('{"lat":"52","lon":5}') === null, "lat als tekst geeft null");
meld(leesPunt("null") === null && leesPunt("[1,2]") === null, "null en een lijst geven null");
meld(puntJson({ lat: 52.0907, lon: 5.1214 }) === '{"lat":52.0907,"lon":5.1214}', "puntJson rond af op 6 decimalen", puntJson({ lat: 52.0907, lon: 5.1214 }));
meld(puntJson({ lat: 52.123456789, lon: -5.1 }) === '{"lat":52.123457,"lon":-5.1}', "puntJson kapt 52.123456789 af op 6 decimalen", puntJson({ lat: 52.123456789, lon: -5.1 }));
meld(gelijk(leesPunt(puntJson({ lat: 52.123456789, lon: -5.1 })), 52.123457, -5.1), "puntJson en leesPunt zijn elkaars omgekeerde");

console.log("\nCoördinaten uit een tekst");
meld(gelijk(leesCoordinaten("52.0907, 5.1214"), 52.0907, 5.1214), "52.0907, 5.1214");
meld(gelijk(leesCoordinaten("52,0907; 5,1214"), 52.0907, 5.1214), "52,0907; 5,1214");
meld(gelijk(leesCoordinaten("52.0907 5.1214"), 52.0907, 5.1214), "52.0907 5.1214");
meld(gelijk(leesCoordinaten("-33.8688, 151.2093"), -33.8688, 151.2093), "negatieve getallen");
meld(leesCoordinaten("Domplein 1, Utrecht") === null, "een adres geeft null");
meld(leesCoordinaten("95, 5") === null, "lat buiten bereik geeft null");
meld(leesCoordinaten("") === null, "leeg geeft null");

console.log("\nHet punt als tekst");
meld(puntTekst({ lat: -33.8688, lon: 151.2093 }, "en") === "33.86880° S, 151.20930° E", "en: 33.86880° S, 151.20930° E", puntTekst({ lat: -33.8688, lon: 151.2093 }, "en"));
meld(puntTekst({ lat: 52.0907, lon: -5.1214 }, "nl") === "52,09070° N, 5,12140° W", "nl: 52,09070° N, 5,12140° W", puntTekst({ lat: 52.0907, lon: -5.1214 }, "nl"));
meld(puntTekst({ lat: -1, lon: 5 }, "nl") === "1,00000° Z, 5,00000° O", "nl: zuid is Z, oost is O", puntTekst({ lat: -1, lon: 5 }, "nl"));

console.log("\nTegelwiskunde");
const t0 = tegelPositie({ lat: 0, lon: 0 }, 1);
meld(bijna(t0.x, 1, 1e-9) && bijna(t0.y, 1, 1e-9), "tegelPositie(0, 0, 1) = (1, 1)", toon(t0));
const t17 = tegelPositie({ lat: 52.0907, lon: 5.1214 }, 17);
meld(bijna(t17.x, 67400.64, 0.01) && bijna(t17.y, 43241.37, 0.01), "tegelPositie Utrecht zoom 17 = (67400,64; 43241,37)", toon(t17));
meld(bijna(metersPerPixel(0, 0), 156543.03392, 1e-3), "metersPerPixel(0, 0) = 156543,03392", String(metersPerPixel(0, 0)));
meld(bijna(metersPerPixel(60, 1), 156543.03392 * 0.5 / 2, 1e-3), "metersPerPixel(60°, 1) = 39135,76", String(metersPerPixel(60, 1)));

const utrecht = { lat: 52.09, lon: 5.12 };
console.log("\nHet zoomniveau");
meld(zoomVoor(utrecht, 1200, 2000) === 15, "1200 px voor 2000 m is zoom 15", String(zoomVoor(utrecht, 1200, 2000)));
meld(zoomVoor(utrecht, 600, 300) === 17, "600 px voor 300 m is zoom 17", String(zoomVoor(utrecht, 600, 300)));
meld(zoomVoor(utrecht, 600, 15000) === 11, "600 px voor 15000 m is zoom 11", String(zoomVoor(utrecht, 600, 15000)));
meld(zoomVoor(utrecht, 600, 1) === 19, "nooit hoger dan 19", String(zoomVoor(utrecht, 600, 1)));
meld(zoomVoor(utrecht, 100, 1e9) === 0, "nooit lager dan 0", String(zoomVoor(utrecht, 100, 1e9)));

console.log("\nDe uitsnede");
{
  const B = 1200, H = 700;
  const ts = uitsnede(utrecht, 15, B, H);
  const heel = ts.every((t) => Number.isInteger(t.px) && Number.isInteger(t.py));
  meld(heel, "elke px en py is een geheel getal");
  const minX = Math.min(...ts.map((t) => t.px)), minY = Math.min(...ts.map((t) => t.py));
  meld(minX > -256 && minX <= 0 && minY > -256 && minY <= 0, "de eerste tegel staat in (-256, 0] × (-256, 0]", `${minX}, ${minY}`);
  const maxX = Math.max(...ts.map((t) => t.px)) + 256, maxY = Math.max(...ts.map((t) => t.py)) + 256;
  meld(maxX >= B && maxY >= H, "de tegels reiken tot de rand", `${maxX} × ${maxY}`);
  // geen gat: elke pixel van het beeld ligt in precies één tegel
  let gat = 0, dubbel = 0;
  for (let y = 0; y < H; y += 7) for (let x = 0; x < B; x += 7) {
    const n = ts.filter((t) => x >= t.px && x < t.px + 256 && y >= t.py && y < t.py + 256).length;
    if (n === 0) gat++;
    if (n > 1) dubbel++;
  }
  meld(gat === 0 && dubbel === 0, "het beeld is zonder gat en zonder overlap gevuld", `gat ${gat}, dubbel ${dubbel}`);
  const uniek = new Set(ts.map((t) => `${t.z}/${t.x}/${t.y}`)).size === ts.length;
  meld(uniek && ts.every((t) => t.z === 15), "elke tegel komt eenmaal voor, op zoom 15");
  // het punt ligt in het midden
  const pos = tegelPositie(utrecht, 15);
  const pxMidden = pos.x * 256 - Math.floor(pos.x) * 256, pyMidden = pos.y * 256 - Math.floor(pos.y) * 256;
  const midden = ts.find((t) => t.x === Math.floor(pos.x) && t.y === Math.floor(pos.y));
  meld(!!midden && Math.abs(midden.px + pxMidden - B / 2) <= 1 && Math.abs(midden.py + pyMidden - H / 2) <= 1,
    "het punt ligt in het midden van het beeld", toon(midden));
}
{
  const ts = uitsnede({ lat: 0, lon: 179.999 }, 3, 600, 400);
  meld(ts.length > 0 && ts.every((t) => t.x >= 0 && t.x <= 7), "bij de datumgrens wikkelt x om (0..7)", toon(ts.map((t) => t.x)));
  meld(ts.some((t) => t.x === 7) && ts.some((t) => t.x === 0), "zowel tegel 7 als tegel 0 komt voor");
}
{
  const ts = uitsnede({ lat: 85, lon: 5 }, 2, 600, 600);
  meld(ts.every((t) => t.y >= 0 && t.y <= 3), "boven en onder de wereld staan geen tegels (y in 0..3)", toon(ts.map((t) => t.y)));
}

console.log("\nDe schaalbalk");
const sb = schaalbalk(52.09, 15, 200);
meld(sb.meters === 500 && sb.px <= 200 && sb.px > 100, "schaalbalk(52,09; 15; 200) is 500 m", toon(sb));
meld(bijna(sb.px, 500 / metersPerPixel(52.09, 15), 1e-6), "de breedte in pixels volgt uit de schaal", String(sb.px));
const sb2 = schaalbalk(0, 19, 100);
meld(sb2.meters === 20 && sb2.px <= 100, "schaalbalk(0; 19; 100) is 20 m (100 px = 29,9 m)", toon(sb2));
const sb3 = schaalbalk(52.09, 15, 300);
meld(sb3.meters === 500, "300 px (880 m) geeft nog 500 m", toon(sb3));
const sb4 = schaalbalk(52.09, 15, 400);
meld(sb4.meters === 1000, "400 px (1174 m) geeft 1000 m", toon(sb4));

console.log("\nHet zoekantwoord lezen");
{
  const antwoord = [
    { lat: "-33.8567844", lon: "151.2152967", display_name: "Sydney Opera House, Sydney, Australia" },
    { lat: "52.0907", lon: "5.1214", display_name: "Utrecht" },
    { lon: "5.1", display_name: "zonder lat" },
  ];
  const r = parseNominatim(antwoord);
  meld(r.length === 2, "twee goede regels en één zonder lat geven 2 uitkomsten", toon(r));
  meld(r.length > 0 && gelijk(r[0].punt, -33.8567844, 151.2152967) && r[0].naam.startsWith("Sydney Opera House"), "lat en lon komen als getal uit de tekst, met de naam", toon(r[0]));
  meld(parseNominatim({ fout: 1 }).length === 0 && parseNominatim(null).length === 0, "geen lijst geeft een lege lijst");
  meld(parseNominatim([{ lat: "95", lon: "5", display_name: "x" }]).length === 0, "een punt buiten bereik valt weg");
}

console.log("\nZoeken bij de dienst");
{
  const starts = [];
  const urls = [];
  const kopteksten = [];
  const nepFetch = async (url, init) => {
    starts.push(Date.now());
    urls.push(String(url));
    kopteksten.push(init?.headers ?? {});
    return { ok: true, status: 200, json: async () => [{ lat: "1", lon: "2", display_name: "plek" }] };
  };
  const eerste = await zoekAdres("Sydney Opera House", "en", nepFetch);
  await zoekAdres("Utrecht", "nl", nepFetch);
  meld(eerste.length === 1, "een antwoord geeft de uitkomsten", toon(eerste));
  meld(starts.length === 2 && starts[1] - starts[0] >= 1000, "de tweede aanroep start minstens 1000 ms na de eerste", toon(starts.length === 2 ? starts[1] - starts[0] : starts));
  meld(urls[0].startsWith("https://nominatim.openstreetmap.org/search?") && urls[0].includes("format=jsonv2") && urls[0].includes("limit=5") && urls[0].includes("q=Sydney%20Opera%20House"), "de URL heeft format=jsonv2, limit=5 en de zoekvraag", urls[0]);
  meld(urls.every((u) => !u.includes("countrycodes")), "de URL bevat geen countrycodes");
  meld(kopteksten[0]["Accept-Language"] === "en" && kopteksten[1]["Accept-Language"] === "nl", "Accept-Language is de taal", toon(kopteksten));
  const fout429 = async () => ({ ok: false, status: 429, json: async () => ({}) });
  let melding = "";
  try { await zoekAdres("x", "en", fout429); } catch (e) { melding = e instanceof Error ? e.message : String(e); }
  meld(melding.includes("429"), "een 429 geeft een Error met 429", melding);
  const drie = [];
  const tel = async () => { drie.push(Date.now()); return { ok: true, status: 200, json: async () => [] }; };
  await Promise.all([zoekAdres("a", "en", tel), zoekAdres("b", "en", tel)]);
  meld(drie.length === 2 && drie[1] - drie[0] >= 1000, "twee gelijktijdige aanroepen komen ook minstens 1000 ms uit elkaar", toon(drie.length === 2 ? drie[1] - drie[0] : drie));
  // Een verbinding die nooit antwoordt: het signaal breekt de vraag af.
  const hangend = (_url, init) => new Promise((_ok, fout) => {
    init.signal.addEventListener("abort", () => fout(init.signal.reason));
  });
  const t0 = Date.now();
  const houdWakker = setTimeout(() => {}, 2000); // AbortSignal.timeout houdt Node zelf niet wakker
  let timeoutFout = null;
  try { await zoekAdres("x", "en", hangend, 300); } catch (e) { timeoutFout = e; }
  clearTimeout(houdWakker);
  meld(timeoutFout instanceof Error && Date.now() - t0 < 3000, "een vastgelopen verbinding geeft binnen de tijdslimiet een Error", String(timeoutFout));
  let signaal = null;
  await zoekAdres("y", "en", async (_u, init) => { signaal = init.signal; return { ok: true, status: 200, json: async () => [] }; });
  meld(signaal instanceof AbortSignal, "zoekAdres geeft standaard een signaal mee");
}

console.log("\nHet schaallabel");
{
  const si = { eenheid: () => "m", waarde: (v) => v };
  const us = { eenheid: () => "ft", waarde: (v) => v / 0.3048 };
  meld(schaalTekst(500, si, "nl") === "500 m", "500 m is 500 m", schaalTekst(500, si, "nl"));
  meld(schaalTekst(2000, si, "nl") === "2 km", "2000 m is 2 km", schaalTekst(2000, si, "nl"));
  meld(schaalTekst(5000, si, "en") === "5 km" && schaalTekst(1500, si, "nl") === "1,5 km", "5 km en 1,5 km (komma in het Nederlands)", schaalTekst(1500, si, "nl"));
  meld(schaalTekst(500, us, "en") === "1,640 ft", "US: 500 m is 1,640 ft", schaalTekst(500, us, "en"));
  meld(schaalTekst(2000, us, "en") === "1.2 mi", "US: 2000 m is 1.2 mi", schaalTekst(2000, us, "en"));
  meld(schaalTekst(2000, us, "nl") === "1,2 mi" && schaalTekst(500, us, "nl") === "1.640 ft", "US in het Nederlands: komma", schaalTekst(2000, us, "nl"));
  meld(schaalTekst(1609.344, us, "en") === "1 mi" && schaalTekst(1600, us, "en") === "5,249 ft", "vanaf 5280 ft gaat het naar mi", schaalTekst(1600, us, "en"));
}

console.log("\nDe onderschriften op papier");
{
  // Een t die de echte vertaalbestanden leest, met {{naam}}-invulling zoals i18next.
  const woorden = (taal) => JSON.parse(readFileSync(new URL(`../packages/desktop/src/i18n/locales/${taal}/rapport.json`, import.meta.url), "utf8"));
  const maakT = (taal) => (sleutel, opties = {}) => {
    const tekst = sleutel.split(".").reduce((o, d) => o?.[d], woorden(taal));
    return typeof tekst === "string" ? tekst.replace(/\{\{(\w+)\}\}/g, (_, n) => String(opties[n] ?? "")) : sleutel;
  };
  const si = { eenheid: () => "m", waarde: (v) => v };
  const us = { eenheid: () => "ft", waarde: (v) => v / 0.3048 };
  const o = (id, eenh, taal) => onderschrift(id, eenh, taal, maakT(taal));
  meld(o("omgeving", si, "nl") === "Omgeving · ca. 2 km", "nl, zonder stelsel: Omgeving · ca. 2 km", o("omgeving", si, "nl"));
  meld(o("omgeving", us, "en") === "Surroundings · about 1.2 mi", "en, US: Surroundings · about 1.2 mi", o("omgeving", us, "en"));
  meld(o("gebied", si, "en") === "Area · about 15 km", "en: Area · about 15 km", o("gebied", si, "en"));
  meld(o("locatie", si, "nl") === "Locatie · ca. 300 m", "nl: Locatie · ca. 300 m", o("locatie", si, "nl"));
}

console.log("\nDe situatie in het rapport");
{
  meld(toon(KAARTEN) === toon([
    { id: "gebied", meters: 15000, breedte: 560, hoogte: 460 },
    { id: "omgeving", meters: 2000, breedte: 1180, hoogte: 640 },
    { id: "locatie", meters: 300, breedte: 560, hoogte: 460 },
  ]), "KAARTEN: gebied, omgeving en locatie met hun maten", toon(KAARTEN));
  const goed = {
    tonen: true, punt: { lat: 52.0907, lon: 5.1214 }, datum: "2026-11-06",
    kaarten: [
      { id: "gebied", zoom: 11, jpeg: "QUJD" },
      { id: "omgeving", zoom: 15, jpeg: "REVG" },
      { id: "locatie", zoom: 17, jpeg: "R0hJ" },
    ],
  };
  meld(toon(normaliseerSituatie(goed)) === toon(goed), "een goede situatie komt ongewijzigd terug", toon(normaliseerSituatie(goed)));
  const metWater = { ...goed, water: { afstand: 120, naam: "Vecht", punt: { lat: 52.09, lon: 5.12 } } };
  meld(toon(normaliseerSituatie(metWater)) === toon(metWater), "het water blijft behouden", toon(normaliseerSituatie(metWater)));
  meld(!("water" in normaliseerSituatie({ ...goed, water: { afstand: "ver" } })), "een kapot water valt weg");
  const wereld = { ...goed, kaarten: [{ id: "wereld", zoom: 1, jpeg: "QUJD" }] };
  meld(normaliseerSituatie(wereld) === undefined, "alleen een kaart met id wereld geeft undefined");
  const mix = normaliseerSituatie({ ...goed, kaarten: [{ id: "wereld", zoom: 1, jpeg: "QUJD" }, goed.kaarten[0], { id: "locatie", zoom: 17 }] });
  meld(mix !== undefined && mix.kaarten.length === 1 && mix.kaarten[0].id === "gebied", "een kaart met onbekende id of zonder jpeg valt weg", toon(mix));
  meld(normaliseerSituatie({ ...goed, kaarten: [] }) === undefined, "kaarten: [] geeft undefined");
  meld(normaliseerSituatie({ ...goed, punt: { lat: 200, lon: 5 } }) === undefined, "punt met lat 200 geeft undefined");
  meld(normaliseerSituatie("situatie") === undefined && normaliseerSituatie(null) === undefined && normaliseerSituatie([goed]) === undefined, "een tekst, null en een lijst geven undefined");
  meld(normaliseerSituatie({ ...goed, tonen: "ja" })?.tonen === true, "tonen dat geen boolean is: standaard aan");
  meld(normaliseerSituatie({ ...goed, tonen: false })?.tonen === false, "tonen: false blijft");

  const p = { lat: 52.0907, lon: 5.1214 };
  meld(situatieBijPunt(goed, { lat: 52.0907 + 0.5 / 111320, lon: 5.1214 }) === "actueel", "0,5 m ernaast is actueel");
  meld(situatieBijPunt(goed, { lat: 52.0907 + 50 / 111320, lon: 5.1214 }) === "verouderd", "50 m ernaast is verouderd");
  meld(situatieBijPunt(goed, p) === "actueel", "hetzelfde punt is actueel");
  meld(situatieBijPunt(goed, null) === "geen", "zonder punt: geen");
  meld(situatieBijPunt(undefined, p) === "geen", "zonder situatie: geen");

  const teksten = { inleiding: "x" };
  const oud = JSON.parse(JSON.stringify(standaardRapport("06-11-2026", teksten, "nl")));
  meld(!("situatie" in normaliseerRapport(oud, "06-11-2026", teksten, "nl")), "een rapport zonder situatie krijgt er geen");
  const mijn = normaliseerRapport({ ...oud, situatie: goed }, "06-11-2026", teksten, "nl");
  meld(toon(mijn.situatie) === toon(goed), "een rapport met situatie houdt hem", toon(mijn.situatie));
  const terug = normaliseerRapport(JSON.parse(JSON.stringify(mijn)), "06-11-2026", teksten, "nl");
  meld(toon(terug.situatie) === toon(goed), "de situatie komt na een rondgang via JSON gelijk terug");
  meld(!("situatie" in normaliseerRapport({ ...oud, situatie: wereld }, "06-11-2026", teksten, "nl")), "een kapotte situatie in het rapport valt weg");
}

console.log(fouten ? `\n${fouten} fout(en)` : "\nAlles OK");
process.exit(fouten ? 1 : 0);
