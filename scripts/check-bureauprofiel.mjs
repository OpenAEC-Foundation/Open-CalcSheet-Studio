/**
 * Controlescript voor het bureauprofiel en de eigen tekstvarianten
 * (packages/desktop/src/rapport/bureau.ts).
 *
 * Beide staan in de instellingen van de app en kunnen daar door een andere
 * versie van de app zijn neergezet, of met de hand zijn aangepast. Normaliseren
 * moet daar altijd een volledig, bruikbaar geheel van maken: onbekende velden
 * weg, verkeerde typen terug naar de standaard, wat klopt blijft staan.
 *
 * Toevoegen en verwijderen van eigen varianten mag het bestaande object nooit
 * aanpassen: de store herkent een wijziging aan een nieuw object, en alleen
 * dan wordt er iets bewaard.
 *
 * Draaien:  node scripts/check-bureauprofiel.mjs
 */
import { isDeepStrictEqual } from "node:util";
import { heeftEigenHuisstijl, huisstijlVariabelen, leegBureau, LETTERTYPEN, STANDAARD_HUISSTIJL, veiligLettertype } from "../packages/desktop/src/rapport/model.ts";
import {
  normaliseerBureau,
  normaliseerEigenTeksten,
  metEigenVariant,
  zonderEigenVariant,
} from "../packages/desktop/src/rapport/bureau.ts";

let fouten = 0;
function toets(naam, ok, gekregen) {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam}` + (ok ? "" : `   gekregen ${JSON.stringify(gekregen)}`));
}
const gelijk = isDeepStrictEqual;

// ── normaliseerBureau ──────────────────────────────────────────────────────
console.log("Bureauprofiel normaliseren");
toets("niets opgeslagen → leeg profiel", gelijk(normaliseerBureau(null), leegBureau()), normaliseerBureau(null));
toets("geen object → leeg profiel", gelijk(normaliseerBureau("onzin"), leegBureau()), normaliseerBureau("onzin"));

const deels = normaliseerBureau({ naam: "Voorbeeldbureau", plaats: "Voorbeeldstad", onbekend: 1 });
toets("ingevulde velden blijven staan", deels.naam === "Voorbeeldbureau" && deels.plaats === "Voorbeeldstad", deels);
toets("onbekend veld valt weg", !("onbekend" in deels), Object.keys(deels));
toets("ontbrekende huisstijl → standaardhuisstijl", gelijk(deels.huisstijl, STANDAARD_HUISSTIJL), deels.huisstijl);
toets("ontbrekende constructeurs → lege lijst", gelijk(deels.constructeurs, []), deels.constructeurs);

const fout = normaliseerBureau({ naam: 12, logo: false });
toets("verkeerd type → standaard", fout.naam === "" && fout.logo === "", fout);

const kleur = normaliseerBureau({ huisstijl: { hoofdkleur: "#000000" } });
toets(
  "huisstijl per veld aangevuld",
  gelijk(kleur.huisstijl, { ...STANDAARD_HUISSTIJL, hoofdkleur: "#000000" }),
  kleur.huisstijl,
);

toets("het logo staat standaard in de kop", leegBureau().logoInKop === true && deels.logoInKop === true, deels.logoInKop);
toets("de keuze zonder logo in de kop blijft", normaliseerBureau({ logoInKop: false }).logoInKop === false);
toets("de standaardhuisstijl is geen eigen huisstijl", !heeftEigenHuisstijl(STANDAARD_HUISSTIJL));
toets("één kleur anders wel", heeftEigenHuisstijl({ ...STANDAARD_HUISSTIJL, accentkleur: "#ff0000" }));
const standaardVars = huisstijlVariabelen(STANDAARD_HUISSTIJL);
toets("zonder eigen huisstijl alleen het rapport: losse bladen houden hun opmaak", standaardVars["--rpa-font"] === STANDAARD_HUISSTIJL.lettertype && !Object.keys(standaardVars).some((k) => k.startsWith("--pr-")), standaardVars);
const eigenVars = huisstijlVariabelen({ ...STANDAARD_HUISSTIJL, hoofdkleur: "#112233", accentkleur: "#445566", lettertype: "Georgia, serif" });
toets("met eigen huisstijl ook de losse bladen", eigenVars["--pr-accent"] === "#445566" && eigenVars["--pr-kopkleur"] === "#112233" && eigenVars["--pr-letter"] === "Georgia, serif" && eigenVars["--rpa-hoofd"] === "#112233", eigenVars);
toets("de lijst begint met het standaardlettertype", LETTERTYPEN[0].css === STANDAARD_HUISSTIJL.lettertype);
toets("elk lettertype in de lijst kan veilig in een stijlregel", LETTERTYPEN.every((l) => veiligLettertype(l.css) !== ""));
toets("aanhalingstekens worden enkel", veiligLettertype('"Segoe UI", Arial') === "'Segoe UI', Arial");
toets("een stijlregel als lettertype valt weg", veiligLettertype("x; } @import url(http://x); {") === "" && veiligLettertype('a"><script>') === "");

const ir = { naam: "Ir. A. Voorbeeld", telefoon: "010-0000000", email: "a.voorbeeld@example.com" };
const metIr = normaliseerBureau({ constructeurs: [ir] });
toets("geldige constructeur blijft staan", gelijk(metIr.constructeurs, [ir]), metIr.constructeurs);

// ── normaliseerEigenTeksten ────────────────────────────────────────────────
console.log("Eigen tekstvarianten normaliseren");
toets("niets opgeslagen → geen varianten", gelijk(normaliseerEigenTeksten(null), {}), normaliseerEigenTeksten(null));
toets("lijst in plaats van object → geen varianten", gelijk(normaliseerEigenTeksten([]), {}), normaliseerEigenTeksten([]));
const gemengd = normaliseerEigenTeksten({
  inleiding: [
    { label: "Kort", tekst: "Tekst A" },
    { label: 3, tekst: "zonder geldig label" },
    "geen object",
    { label: "Lang", tekst: "Tekst B", extra: true },
  ],
  rol: "geen lijst",
  sneeuw: [],
});
toets(
  "alleen geldige varianten, zonder extra velden",
  gelijk(gemengd, { inleiding: [{ label: "Kort", tekst: "Tekst A" }, { label: "Lang", tekst: "Tekst B" }] }),
  gemengd,
);

// ── metEigenVariant / zonderEigenVariant ──────────────────────────────────
console.log("Eigen varianten toevoegen en verwijderen");
const basis = { inleiding: [{ label: "Kort", tekst: "A" }] };
const erbij = metEigenVariant(basis, "inleiding", { label: "Lang", tekst: "B" });
toets(
  "toevoegen zet de variant achteraan",
  gelijk(erbij.inleiding, [{ label: "Kort", tekst: "A" }, { label: "Lang", tekst: "B" }]),
  erbij,
);
toets("toevoegen laat het oude object ongemoeid", basis.inleiding.length === 1 && erbij !== basis, basis);

const vervangen = metEigenVariant(erbij, "inleiding", { label: "Kort", tekst: "A2" });
toets(
  "zelfde label vervangt de variant op zijn plek",
  gelijk(vervangen.inleiding, [{ label: "Kort", tekst: "A2" }, { label: "Lang", tekst: "B" }]),
  vervangen.inleiding,
);
const nieuweId = metEigenVariant({}, "sneeuw", { label: "Eigen", tekst: "S" });
toets("nieuwe tekst-id krijgt een eigen lijst", gelijk(nieuweId, { sneeuw: [{ label: "Eigen", tekst: "S" }] }), nieuweId);

const eraf = zonderEigenVariant(erbij, "inleiding", 0);
toets("verwijderen haalt precies die variant weg", gelijk(eraf.inleiding, [{ label: "Lang", tekst: "B" }]), eraf);
toets("verwijderen laat het oude object ongemoeid", erbij.inleiding.length === 2, erbij);
const leeg = zonderEigenVariant(nieuweId, "sneeuw", 0);
toets("laatste variant weg → tekst-id verdwijnt", gelijk(leeg, {}) && !("sneeuw" in leeg), leeg);
toets("onbekende index → zelfde object", zonderEigenVariant(erbij, "inleiding", 5) === erbij, null);
toets("onbekende tekst-id → zelfde object", zonderEigenVariant(erbij, "rol", 0) === erbij, null);

if (fouten > 0) {
  console.error(`\nBureauprofiel: ${fouten} afwijking(en).`);
  process.exit(1);
}
console.log("\nBureauprofiel: normaliseren, toevoegen en verwijderen kloppen.");
