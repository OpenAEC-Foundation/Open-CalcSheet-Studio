/**
 * De parametrische beelden in het eenhedenstelsel van het project
 * (docs/superpowers/specs/2026-11-06-eenheden-design.md, stap 3): wat in beeld staat,
 * rekent om; wat je in een beeld typt, gaat terug in de eenheid van het blad.
 *
 * Handberekening:
 *   4500 mm / 25,4 = 177,165 in        12 in · 25,4 = 304,8 mm
 *   12 kNm / (4,448222 kN/kip · 0,3048 m/ft) = 8,851 kip·ft
 *   10 kN/m / 14,594 kN/m per klf = 0,6852 klf
 *
 * Draaien:  node scripts/check-eenheden-beelden.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { STELSELS } from "../packages/core/dist/index.js";
import { beeldEenheden } from "../packages/desktop/src/components/calc/beeldEenheden.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const bijna = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const opmaak = (v, dec) => v.toFixed(dec);

console.log("Zonder stelsel: alles zoals het was");
const zonder = beeldEenheden(undefined);
meld(zonder.doel("mm") === null, "geen doeleenheid");
meld(zonder.eenheid("kNm") === "kNm" && zonder.eenheid("kN/m²") === "kN/m²", "de eenheid precies zoals het beeld hem schreef");
meld(zonder.waarde(4500, "mm") === 4500 && zonder.decimalen(2, "mm") === 2, "het getal en de decimalen ongewijzigd");
meld(zonder.tekst(12.5, "kNm", 2, opmaak) === "12.50 kNm", "tekst: 12.50 kNm", zonder.tekst(12.5, "kNm", 2, opmaak));
meld(zonder.invoer(4500, "mm") === "4500", "het bewerkveld: 4500", zonder.invoer(4500, "mm"));
meld(zonder.terug("4600", "mm") === 4600 && zonder.terug("12,5", "mm") === 12.5, "terug: het getypte getal, ook met een komma");
meld(zonder.terug("", "mm") === null && zonder.terug("abc", "mm") === null, "terug: geen getal is null");

console.log("\nUS customary");
const us = beeldEenheden(STELSELS.us);
meld(us.doel("mm") === "in" && us.eenheid("mm") === "in", "mm wordt in", `${us.doel("mm")} / ${us.eenheid("mm")}`);
meld(bijna(us.waarde(4500, "mm"), 177.165), "4500 mm = 177,165 in", String(us.waarde(4500, "mm")));
meld(us.decimalen(0, "mm") === 1, "0 decimalen in mm worden 1 in inch", String(us.decimalen(0, "mm")));
meld(us.tekst(4500, "mm", 0, opmaak) === "177.2 in", "tekst: 177.2 in", us.tekst(4500, "mm", 0, opmaak));
meld(us.eenheid("kNm") === "kip·ft" && bijna(us.waarde(12, "kNm"), 8.851), "12 kNm = 8,851 kip·ft", `${us.waarde(12, "kNm")} ${us.eenheid("kNm")}`);
meld(us.eenheid("kN/m") === "klf" && bijna(us.waarde(10, "kN/m"), 0.6852), "10 kN/m = 0,6852 klf", String(us.waarde(10, "kN/m")));
meld(us.eenheid("kN/m²") === "psf" && us.eenheid("kN/m¹") === "klf", "kN/m² wordt psf, kN/m¹ wordt klf");
meld(us.eenheid("m") === "ft" && us.eenheid("N/mm²") === "ksi", "m wordt ft, N/mm² wordt ksi");
meld(us.invoer(4500, "mm") === "177.165", "het bewerkveld op 6 cijfers: 177.165", us.invoer(4500, "mm"));
meld(bijna(us.terug("12", "mm"), 304.8, 1e-9), "12 getypt in inch is 304,8 mm", String(us.terug("12", "mm")));
meld(us.terug("12", "mm") === 304.8, "zonder rekenruis: precies 304.8", String(us.terug("12", "mm")));
meld(bijna(us.terug(us.invoer(4500, "mm"), "mm"), 4500, 1e-5), "heen en terug blijft 4500 mm (op 6 cijfers)", String(us.terug(us.invoer(4500, "mm"), "mm")));

meld(us.label("Cantilever a (mm)", "mm") === "Cantilever a (in)", "een label: (mm) wordt (in)", us.label("Cantilever a (mm)", "mm"));
meld(us.label("E-modulus (N/mm²)", "N/mm²") === "E-modulus (ksi)", "een label: (N/mm²) wordt (ksi)", us.label("E-modulus (N/mm²)", "N/mm²"));
meld(us.label("Opening width", "mm") === "Opening width", "een label zonder eenheid blijft");
meld(zonder.label("Cantilever a (mm)", "mm") === "Cantilever a (mm)", "zonder stelsel blijft het label");

console.log("\nWat het stelsel niet kent, blijft");
for (const e of ["mm/kN", "°", "min", "%", ""]) {
  meld(us.doel(e) === null && us.eenheid(e) === e && us.waarde(3, e) === 3, `"${e}" blijft zoals hij is`);
}

console.log("\nSI (m) en SI (mm)");
const siM = beeldEenheden(STELSELS["si-m"]);
meld(siM.tekst(4500, "mm", 0, opmaak) === "4.500 m", "4500 mm wordt 4.500 m (0 decimalen in mm zijn 3 in m)", siM.tekst(4500, "mm", 0, opmaak));
const siMm = beeldEenheden(STELSELS["si-mm"]);
meld(siMm.doel("mm") === null && siMm.doel("kNm") === null && siMm.doel("kN/m²") === null && siMm.doel("kN/m¹") === null,
  "SI (mm) rekent mm, kNm, kN/m² en kN/m¹ niet om: dezelfde eenheid");
meld(siMm.eenheid("kNm") === "kNm" && siMm.eenheid("kN/m¹") === "kN/m¹", "en laat de schrijfwijze van het beeld staan");

console.log("\nEen eigen keuze per grootheid");
const eigen = beeldEenheden({ ...STELSELS["si-mm"], kracht: "N", maat: "cm" });
meld(eigen.tekst(2.5, "kN", 2, opmaak) === "2500 N", "2,5 kN wordt 2500 N (2 decimalen in kN zijn 0 in N)", eigen.tekst(2.5, "kN", 2, opmaak));
meld(eigen.tekst(150, "mm", 0, opmaak) === "15.0 cm", "150 mm wordt 15.0 cm (0 decimalen in mm zijn 1 in cm)", eigen.tekst(150, "mm", 0, opmaak));

if (fouten > 0) {
  console.error(`\nBeelden in het stelsel: ${fouten} afwijking(en).`);
  process.exit(1);
}
console.log("\nBeelden in het stelsel: alles klopt.");
