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
import {
  leesPunt, puntJson, leesCoordinaten, puntTekst,
} from "../packages/desktop/src/kaart/punt.ts";
import {
  tegelPositie, metersPerPixel, zoomVoor, uitsnede, schaalbalk,
} from "../packages/desktop/src/kaart/tegels.ts";

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

console.log(fouten ? `\n${fouten} fout(en)` : "\nAlles OK");
process.exit(fouten ? 1 : 0);
