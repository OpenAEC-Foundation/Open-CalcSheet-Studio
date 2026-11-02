import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { useActiefExemplaar, useAlleenLezen, useProjectScope } from "../../store/actiefBlad";
import { JaNee, IconKeuze, SchemaIcoon, type SchemaSoort } from "./designerKit";
import {
  KLEUR_M, KLEUR_V, KLEUR_U, Label, Oplegging, LijnLast, PuntLast, KrachtenLijn,
  RaveelPlattegrond, raveelMaten, raveelHoogte, extremen, randwaarden, nl,
} from "./balklaagTekening";
import { leesBlad, rekenBladDoor, useBladUitkomst } from "./bladResultaat";
import { belastinggevallen, helften, lijnen, omhullende, type Ligger, type Lijnen } from "./balklaagLijnen";
import { balklaagKent, kdefUitKlimaat } from "./balklaagBlad";
import "./VoetplaatDesigner.css"; // hergebruik vd-* stijlen

/**
 * Losstaand parametrisch beeld van een balklaag (doorsnede): beschot op
 * houten balken, hart-op-hart afstand. Leest/schrijft dezelfde invoer als de
 * rekensheet (balklaag.ts) via het exemplaar in de projectstore.
 *
 * Het beeld rekent niet zelf: de unity checks, M_y,Ed, V_z,Ed en w_fin komen
 * uit het doorgerekende blad (`useBladUitkomst`), net als de lasten per balk en
 * de factoren. De lijnen zijn de statica van dezelfde belastinggevallen en
 * combinaties (balklaagLijnen.ts), met die lasten en factoren.
 */
const MARKER = "Balklaag";

interface Prof { name: string; b: number; h: number }
const PROFILES: Record<number, Prof> = {
  1: { name: "46×96", b: 46, h: 96 }, 2: { name: "46×146", b: 46, h: 146 },
  3: { name: "46×171", b: 46, h: 171 }, 4: { name: "46×196", b: 46, h: 196 },
  5: { name: "63×146", b: 63, h: 146 }, 6: { name: "63×171", b: 63, h: 171 },
  7: { name: "63×196", b: 63, h: 196 }, 8: { name: "63×221", b: 63, h: 221 },
  9: { name: "71×146", b: 71, h: 146 }, 10: { name: "71×171", b: 71, h: 171 },
  11: { name: "71×196", b: 71, h: 196 }, 12: { name: "71×221", b: 71, h: 221 },
  13: { name: "71×246", b: 71, h: 246 }, 14: { name: "71×271", b: 71, h: 271 },
  15: { name: "96×171", b: 96, h: 171 }, 16: { name: "96×196", b: 96, h: 196 },
  17: { name: "96×221", b: 96, h: 221 }, 18: { name: "96×246", b: 96, h: 246 },
  19: { name: "96×271", b: 96, h: 271 },
  // SLS — geschaafd naaldhout in Noord-Amerikaanse maatvoering (38 mm dik),
  // zoals dat in de houtskeletbouw wordt geleverd. De dubbele varianten zijn
  // twee stuks tegen elkaar.
  20: { name: "SLS 38×89", b: 38, h: 89 }, 21: { name: "SLS 38×140", b: 38, h: 140 },
  22: { name: "SLS 38×184", b: 38, h: 184 }, 23: { name: "SLS 38×235", b: 38, h: 235 },
  24: { name: "SLS 38×285", b: 38, h: 285 },
  25: { name: "SLS dubbel 76×184", b: 76, h: 184 },
  26: { name: "SLS dubbel 76×235", b: 76, h: 235 },
  27: { name: "SLS dubbel 76×285", b: 76, h: 285 },
};
/** Laatste keuze in de profiellijst van het blad: b en h komen dan uit de invoer. */
const ZELF = 28;

const MATS: { v: number; label: string }[] = [
  { v: 1, label: "C18" }, { v: 2, label: "C24" }, { v: 3, label: "C30" }, { v: 4, label: "GL24h" }, { v: 5, label: "GL28h" },
];
/*
 * De omschrijvingen van de keuzelijsten hieronder staan in
 * locales/{nl,en}/beelden.json, onder "balklaag"; hier alleen de waarde die
 * in het blad komt en de sleutel van de omschrijving.
 */
const DUUR: { v: number; sleutel: string }[] = [
  { v: 1, sleutel: "kort" }, { v: 2, sleutel: "middellang" }, { v: 3, sleutel: "lang" }, { v: 4, sleutel: "blijvend" },
];
/**
 * Klimaatklassen volgens EN 1995-1-1 §2.3.1.3. De klasse bepaalt k_mod
 * (Tabel 3.1) en k_def (Tabel 3.2) en dus zowel de sterkte als de kruip —
 * vandaar de omschrijving erbij in plaats van alleen een nummer.
 */
const KLIM: { v: number; sleutel: string }[] = [
  { v: 1, sleutel: "binnen" },
  { v: 2, sleutel: "overdekt" },
  { v: 3, sleutel: "buiten" },
];
/**
 * ψ-factoren uit NEN-EN 1990 Tabel NB.2 — A1.1, gelijk aan de tabel in
 * `templates/balklaag.ts`. Het beeld gebruikt ze alleen om bij een
 * normcategorie de "zelf invullen"-velden voor te vullen; gerekend wordt in het blad.
 */
const CAT: { v: number; sleutel: string; psi0: number; psi2: number }[] = [
  { v: 1, sleutel: "a", psi0: 0.4, psi2: 0.3 },
  { v: 2, sleutel: "b", psi0: 0.5, psi2: 0.3 },
  { v: 3, sleutel: "c", psi0: 0.4, psi2: 0.6 },
  { v: 4, sleutel: "d", psi0: 0.4, psi2: 0.6 },
  { v: 5, sleutel: "e", psi0: 1.0, psi2: 0.8 },
  { v: 6, sleutel: "f", psi0: 0.7, psi2: 0.6 },
  { v: 7, sleutel: "g", psi0: 0.7, psi2: 0.3 },
  { v: 8, sleutel: "h", psi0: 0, psi2: 0 },
  { v: 9, sleutel: "sneeuw", psi0: 0, psi2: 0 },
  { v: 10, sleutel: "wind", psi0: 0, psi2: 0 },
  { v: 11, sleutel: "zelf", psi0: 0.5, psi2: 0.3 },
];
/**
 * De statische schema's, in de nummering van `templates/balklaag.ts`. De
 * omschrijving en het korte label staan onder balklaag.schemas.<soort>.
 */
const SCHEMA: { v: number; soort: SchemaSoort }[] = [
  { v: 1, soort: "enkelvoudig" },
  { v: 2, soort: "overstek" },
  { v: 3, soort: "tweeveld" },
  { v: 4, soort: "raveel" },
];
/** Soort ligger: een balk in een balklaag, of een onderslag met een eigen belaste breedte. */
const LIGGER: { v: number; sleutel: string }[] = [
  { v: 1, sleutel: "balk" }, { v: 2, sleutel: "onderslag" },
];
/**
 * De vloerplaat van een T-balk, in de nummering van het blad. De kolom van
 * tabel 9.1 volgt uit de soort; bij OSB/3 haalt het blad de sterkte uit
 * EN 12369-1, bij multiplex en spaanplaat zijn het fabrikantgegevens.
 */
const PLATEN: { v: number; sleutel: string }[] = [
  { v: 1, sleutel: "multiplexEvenwijdig" }, { v: 2, sleutel: "multiplexLoodrecht" },
  { v: 3, sleutel: "osbEvenwijdig" }, { v: 4, sleutel: "osbLoodrecht" }, { v: 5, sleutel: "spaanplaat" },
];
/** Fabrikantgegevens van de plaat: de naam in het blad en de stap van het veld. */
const PLAAT_INVOER: { naam: string; sym: ReactNode; sleutel: string; stap: number }[] = [
  { naam: "f_f_c_k", sym: <>f<sub>c,k</sub></>, sleutel: "druk", stap: 0.5 },
  { naam: "f_f_t_k", sym: <>f<sub>t,k</sub></>, sleutel: "trek", stap: 0.5 },
  { naam: "f_r_k", sym: <>f<sub>r,k</sub></>, sleutel: "rolschuif", stap: 0.1 },
  { naam: "E_f", sym: <>E<sub>mean</sub></>, sleutel: "emodulus", stap: 100 },
];
/** Bij spaan- en vezelplaat ook k_mod en k_def: die hangen af van de soort. */
const PLAAT_FACTOREN: { naam: string; sym: ReactNode; sleutel: string }[] = [
  { naam: "k_mod_f", sym: <>k<sub>mod</sub></>, sleutel: "kmod" },
  { naam: "k_mod_G_f", sym: <>k<sub>mod,G</sub></>, sleutel: "kmodG" },
  { naam: "k_def_f", sym: <>k<sub>def</sub></>, sleutel: "kdef" },
];

/** Pictogram van de doorsnede: een rechthoekige balk, of de balk onder een meewerkende plaat. */
function DoorsnedeIcoon({ vorm }: { vorm: "rechthoek" | "tbalk" }) {
  return (
    <svg viewBox="0 0 64 30" width={64} height={30} fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" aria-hidden="true">
      {vorm === "tbalk" ? (
        <>
          <rect x={8} y={3} width={48} height={5} fill="currentColor" fillOpacity={0.25} />
          <rect x={27} y={8} width={10} height={20} />
        </>
      ) : (
        <rect x={27} y={4} width={10} height={24} />
      )}
    </svg>
  );
}

/** Grens voor de eindstand w_fin; de NB noemt 0,004 × L, strenger mag. */
const GRENS: { v: number; label: string }[] = [
  { v: 0.004, label: "0,004 × L" }, { v: 0.003, label: "0,003 × L" }, { v: 0.002, label: "0,002 × L" },
];
/** Grens voor de bijkomende doorbuiging w_bij: 0,003 × L, bij een brosse afwerking 0,002 × L. */
const GRENS_BIJ: { v: number; label: string; bros?: boolean }[] = [
  { v: 0.003, label: "0,003 × L" }, { v: 0.002, label: "0,002 × L", bros: true },
];

/*
 * Vaste kleuren per lastsoort. Permanent en veranderlijk gaan met verschillende
 * partiële factoren de combinatie in (1,20 tegen 1,50) en horen in de quasi-
 * blijvende combinatie verschillend mee te tellen; één kleur voor de som maakt
 * uit de tekening niet meer op te maken wélk deel dat is.
 */
const KLEUR_G = "#475569"; // permanent
const KLEUR_Q = "#B45309"; // veranderlijk, verdeeld
const KLEUR_F = "#B91C1C"; // veranderlijk, geconcentreerd

/**
 * Eén unity check in de voetregel, gekleurd naar de uitkomst. Een rij grijze
 * getallen dwingt je ze allemaal te lezen om te zien welke knelt; met kleur
 * springt de maatgevende er meteen uit.
 */
function UcChip({ naam, uc, extra }: { naam: string; uc: number; extra?: string }) {
  if (!Number.isFinite(uc)) return <span className="vd-uc-nvt">{naam} —</span>;
  const staat = uc > 1 ? "bad" : uc > 0.9 ? "warn" : "ok";
  return (
    <span className={`vd-uc-chip ${staat}`}>
      {naam} {uc.toFixed(2)}
      {extra ? ` (${extra})` : ""}
    </span>
  );
}

/**
 * Eén bron van waarheid voor de invoer-defaults. Wordt zowel gebruikt om de
 * controls te tonen (via num()) als om de gedeelde store te seeden, zodat de
 * evaluator (rekensheet) en de designer nooit op verschillende defaults
 * uitkomen. Zonder seed valt de evaluator terug op de eerste @select-optie en
 * '0' voor `?`-velden — die wijken af van wat het beeld toont.
 *
 * F_k = 3 kN is de puntlast bij categorie A (vloeren) volgens NB tabel 6.2 bij
 * EN 1991-1-1, naast q_k = 1,75 kN/m² (+ 0,8 voor verplaatsbare wanden).
 *
 * g_bl en a_steun beginnen op 0: de seed vult ook bestaande bladen aan zodra
 * het beeld opent, en een andere startwaarde zou hun uitkomst stil veranderen.
 * g_bl = 0 betekent dat het gewicht van de gedragen balken al in G_k zit;
 * a_steun = 0 valt terug op a_opl.
 *
 * doorsnede = 1 is de rechthoekige balk: zo rekent een bestaand blad door als
 * voorheen. plaat = 4 (OSB/3, hoofdas loodrecht op de balken) is de plaat die
 * het blad uit EN 12369-1 kan halen. De sterkte en stijfheid van multiplex en
 * spaanplaat staan er bewust niet in: dat zijn fabrikantgegevens.
 */
const DEFAULTS: Record<string, number> = {
  profiel: 10, b_zelf: 63, h_zelf: 211, sterkteklasse: 2, duurklasse: 2, klimaat: 1,
  doorsnede: 1, plaat: 4,
  schema: 1, ligger: 1, a_over: 800, L_veld2: 3000, a_steun: 0, b_sparing: 2400, l_staart: 1800, b_ond: 2.5,
  L_d: 5000, a_opl: 50, hoh: 450, t_vloer: 25,
  E_beschot: 7000, b_vloer: 5,
  G_k: 0.5, Q_k: 2.55, F_k: 3, g_bl: 0, belastingcat: 1,
  "ψ_0_zelf": 0.5, "ψ_2_zelf": 0.3, controleer: 1, grensfactor: 0.004, grens_bij: 0.003,
  controleer_trilling: 1, "ζ": 0.01, a_tril: 1.0, b_tril: 120,
};

export default function BalklaagDesigner() {
  // Invoer hoort bij het exemplaar dat openstaat: twee bladen van dezelfde
  // module delen niets, ook al gebruiken ze dezelfde variabelenamen.
  // Welk blad getekend wordt: normaal het actieve, in de afdruk het blad dat de
  // context aanwijst. `alleenLezen` houdt daar het schrijven tegen.
  const exemplaar = useActiefExemplaar();
  const alleenLezen = useAlleenLezen();
  const activeId = alleenLezen ? "" : (exemplaar?.id ?? "");
  const zetWaarde = useProjectStore((s) => s.zetWaarde);
  const seedWaarden = useProjectStore((s) => s.seedWaarden);
  const source = exemplaar?.source ?? "";
  const zetBladWaarde = useCallback(
    (naam: string, waarde: string) => zetWaarde(activeId, naam, waarde),
    [activeId, zetWaarde],
  );
  const seedBladWaarden = useCallback(
    (defaults: Record<string, string>) => seedWaarden(activeId, defaults),
    [activeId, seedWaarden],
  );
  // Het doorgerekende blad en de projectgegevens waarmee het rekent. Hooks,
  // dus vóór de vroege return: anders roept deze component in de ene render
  // meer hooks aan dan in de andere en klapt React eruit bij een bladwissel.
  const uitkomst = useBladUitkomst();
  const scope = useProjectScope();
  // Op het scherm de taal van de app; in de afdruk zet PrintBlad er een
  // Nederlandse vertaling omheen, want het rapport is Nederlands.
  const { t } = useTranslation("beelden");
  const [editing, setEditing] = useState<string | null>(null);
  // Uitkomst van de ontwerpknop. De handtekening is een vingerafdruk van de
  // invoer waarop gezocht is — het profiel zit er bewust NIET in, want dat
  // verandert de knop zelf. Wijzigt de gebruiker daarna iets anders, dan klopt
  // de melding niet meer en verdwijnt hij vanzelf. De soort melding en het
  // profiel, geen tekst: zo volgt de melding de taal als die intussen wisselt.
  const [ontwerp, setOntwerp] = useState<{ sig: string; soort: "geen" | "al" | "gekozen"; profiel?: number } | null>(null);
  const [zoekt, setZoekt] = useState(false);
  // De handtekening van de invoer bij de laatste render. De ontwerpknop zoekt
  // een paar seconden; is de invoer intussen veranderd, dan hoort het gevonden
  // profiel bij de oude invoer en schrijft de knop niets.
  const laatsteSig = useRef("");

  // Meet het beschikbare tekengebied zodat het beeld meegroeit met het paneel.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 620, h: 360 });

  // Push the displayed defaults into the shared store on open / case switch, so
  // the rekensheet evaluates with the same inputs the picture shows. Only fills
  // missing keys — user-set values are never overwritten.
  const isBalklaag = source.includes(MARKER);
  useEffect(() => {
    if (!isBalklaag) return;
    const seed: Record<string, string> = {};
    for (const [k, v] of Object.entries(DEFAULTS)) seed[k] = String(v);
    seedBladWaarden(seed);
  }, [isBalklaag, activeId, seedBladWaarden]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      const w = Math.max(220, Math.floor(r.width));
      const h = Math.max(200, Math.floor(r.height));
      // Alleen bijwerken bij een merkbaar verschil. Het beeld schaalt op deze
      // maat, dus een verandering van één pixel zou een nieuwe meting kunnen
      // uitlokken en het beeld aan het trillen brengen.
      setBox((vorige) =>
        Math.abs(vorige.w - w) > 2 || Math.abs(vorige.h - h) > 2 ? { w, h } : vorige,
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isBalklaag]);

  if (!isBalklaag) return null;

  const vals = exemplaar?.waarden ?? {};
  const num = (name: string, def: number): number => {
    const raw = vals[name];
    if (raw === undefined || raw === "") return def;
    const n = parseFloat(String(raw).replace(",", "."));
    return Number.isFinite(n) ? n : def;
  };
  const setVal = (name: string, value: number) => zetBladWaarde(name, String(value));
  // Alleen de dubbele SLS-profielen hebben een woord in hun naam; de rest is een maat.
  const profielNaam = (p: Prof) =>
    p.name.startsWith("SLS dubbel ") ? t("balklaag.slsDubbel", { maat: p.name.slice("SLS dubbel ".length) }) : p.name;
  const schemaOpties = SCHEMA.map((x) => ({
    v: x.v,
    label: t(`balklaag.schemas.${x.soort}.label`),
    kort: t(`balklaag.schemas.${x.soort}.kort`),
    icoon: <SchemaIcoon soort={x.soort} />,
  }));
  // De doorsnedevorm, in de nummering van het blad (keuze "doorsnede").
  const vormOpties = (["rechthoek", "tbalk"] as const).map((v, i) => ({
    v: i + 1,
    label: t(`balklaag.vormen.${v}.label`),
    kort: t(`balklaag.vormen.${v}.kort`),
    icoon: <DoorsnedeIcoon vorm={v} />,
  }));

  // ── invoer (defaults uit gedeelde DEFAULTS-bron, zie boven) ───────────────
  const d = (name: string) => num(name, DEFAULTS[name]);
  // Een blad uit een oudere versie kent de soort ligger en de vrije maat niet;
  // het beeld biedt dan alleen aan waar dat blad mee rekent.
  const kent = balklaagKent(source);
  const oudBlad = !kent.ligger || !kent.zelf;
  const profId = Math.round(d("profiel"));
  const zelf = kent.zelf && profId === ZELF;
  const bZelf = d("b_zelf");
  const hZelf = d("h_zelf");
  const prof: Prof = zelf
    ? { name: `${nl(bZelf, 0)}×${nl(hZelf, 0)}`, b: bZelf, h: hZelf }
    : PROFILES[profId] ?? PROFILES[DEFAULTS.profiel];
  const matId = Math.round(d("sterkteklasse"));
  const duur = Math.round(d("duurklasse"));
  const klim = Math.round(d("klimaat"));
  const schema = Math.round(d("schema"));
  const soort = Math.round(d("ligger"));
  // Bij een raveelbalk blijft de belaste breedte l_staart/2, ook als soort
  // "onderslag" staat. Een blad zonder de keuze rekent altijd met hoh.
  const onderslag = kent.ligger && soort === 2 && schema !== 4;
  const bOnd = d("b_ond");
  const aOver = d("a_over");
  const LVeld2 = d("L_veld2");
  const aSteun = d("a_steun");
  const bSparing = d("b_sparing");
  const lStaart = d("l_staart");
  const Ld = d("L_d");
  const aOpl = d("a_opl");
  const hoh = d("hoh");
  const tVloer = d("t_vloer");
  const eBeschot = d("E_beschot");
  const bVloer = d("b_vloer");
  const gk = d("G_k");
  const qk = d("Q_k");
  const Fk = d("F_k");
  const gBl = d("g_bl");
  const cat = Math.round(d("belastingcat"));
  const tril = Math.round(d("controleer_trilling"));
  const zeta = d("ζ");
  const aTril = d("a_tril");
  const bTril = d("b_tril");
  const psi0zelf = d("ψ_0_zelf");
  const psi2zelf = d("ψ_2_zelf");
  const controleer = Math.round(d("controleer"));
  const grens = d("grensfactor");
  const grensBij = d("grens_bij");
  // T-balk (§9.1.2): alleen bij een balk in een balklaag, zoals in het blad, en
  // alleen als het blad de keuze kent (een ouder blad niet).
  const kentT = /@select doorsnede\b/.test(source);
  const vorm = kentT ? Math.round(d("doorsnede")) : 1;
  const plaat = Math.round(d("plaat"));
  const tGekozen = vorm === 2;
  const tActief = tGekozen && !onderslag && schema !== 4;
  // Multiplex en spaanplaat: fabrikantgegevens, zonder startwaarde. Het veld
  // toont wat er staat, en blijft leeg zolang er niets is ingevuld.
  const fabrikant = plaat !== 3 && plaat !== 4;
  const ruw = (naam: string) => vals[naam] ?? "";
  const plaatGetal = (naam: string) => {
    const n = parseFloat(String(vals[naam] ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  // Zoals het blad: ontbreekt er een fabrikantgegeven, of valt OSB/3 buiten
  // EN 12369-1 (6 < t ≤ 25 mm) of in klimaatklasse 3, dan is de T-balk niet
  // getoetst en rekent het blad verder met de balk alleen.
  const plaatOnvolledig = tActief && (
    !(tVloer > 0) ||
    (fabrikant
      ? [...PLAAT_INVOER, ...(plaat === 5 ? PLAAT_FACTOREN : [])].some((p) => !(plaatGetal(p.naam) > 0))
      : !(tVloer > 6 && tVloer <= 25) || klim === 3)
  );
  const tRekent = tActief && !plaatOnvolledig;
  const { b, h } = prof;
  // Theoretische overspanning van veld 1: bij een raveelbalk de breedte van de sparing.
  const Lth = schema === 4 ? bSparing + aOpl : Ld + aOpl;

  // ── uitkomst van het blad ──────────────────────────────────────────────────
  // Elke waarde in de eenheid van het blad: lasten in kN/m en kN, momenten in
  // kNm, zakkingen in mm. Ontbreekt een waarde (blad nog niet doorgerekend, of
  // de toets staat uit), dan NaN — het beeld toont dan een streepje.
  const getallen = uitkomst?.getallen ?? {};
  const uitBlad = (naam: string) => getallen[naam] ?? NaN;
  const resultaat = uitkomst?.resultaat;
  const ucMax = resultaat?.uc ?? NaN;
  const ok = resultaat?.voldoet === true;
  const Pg = uitBlad("P_g_k"), qq = uitBlad("q_q_k"), FQ = uitBlad("F_Q_k");
  const gG = uitBlad("γ_G"), gQ = uitBlad("γ_Q");
  // 6.10a: een ouder blad kent die factoren niet (NaN); dan alleen 6.10b.
  const gGa = uitBlad("γ_G_a"), gQa = uitBlad("γ_Q_a");
  // Een ouder blad toont k_def niet; dan uit de klimaatklasse, zoals het blad rekent.
  const kdefBlad = uitBlad("k_def");
  // Bij een T-balk de kruipfactor van de samengestelde doorsnede (5.1 van het blad).
  const kdefT = uitBlad("k_def_ef");
  const kdef = tRekent && Number.isFinite(kdefT) ? kdefT
    : Number.isFinite(kdefBlad) ? kdefBlad : kdefUitKlimaat(klim);
  const psi2 = uitBlad("ψ_2");
  const MyEd = uitBlad("M_y_Ed"), VzEd = uitBlad("V_z_Ed");
  const wfin = uitBlad("w_fin"), wlim = uitBlad("w_lim");
  const wfin2 = uitBlad("w_fin_2"), wlim2 = uitBlad("w_lim_2");
  const wbij = uitBlad("w_bij"), wlimBij = uitBlad("w_lim_bij");
  const ucBuig = uitBlad("UC_buiging"), ucAfsch = uitBlad("UC_afsch");
  const ucDoor = uitBlad("UC_doorbuiging"), ucTril = uitBlad("UC_trilling"), f1 = uitBlad("f_1");
  // De doorbuiging toetst de eindstand én de bijkomende doorbuiging; de chip
  // toont de grootste. Een ouder blad kent alleen de eindstand.
  const ucBij = uitBlad("UC_bij");
  const ucDoorMax = Number.isFinite(ucBij) ? Math.max(ucDoor, ucBij) : ucDoor;
  // Oplegdruk, kip bij het steunmoment en de combinatie met alleen permanente
  // last (k_mod blijvend); NaN bij een ouder blad, dan een streepje.
  const ucC90 = uitBlad("UC_c90"), ucKip = uitBlad("UC_kip"), ucG = uitBlad("UC_G");
  // T-balk: de plaat (9.13, 9.14), de lijmnaad (9.12) en de vrije flensbreedte (§9.1.2(5)).
  const ucFlens = uitBlad("UC_flens"), ucLijm = uitBlad("UC_lijm"), ucBf = uitBlad("UC_bf");
  const bEf = uitBlad("b_ef"), bEfS = uitBlad("b_ef_s");
  // Bij f₁ ≤ 8 Hz gelden (7.3) en (7.4) niet: de trilling is niet aangetoond.
  const trilNvt = Number.isFinite(f1) && f1 <= 8;
  // Trek in een eindoplegging (overstek of twee velden): R_min < 0.
  const rMin = uitBlad("R_min");
  // Zoals de slotzin van het blad: voldoet alles behalve f₁ > 8 Hz, dan is de
  // balklaag niet afgekeurd maar niet aangetoond.
  const rest = Math.max(
    ...[ucDoorMax, ucBuig, ucAfsch, ucC90, ucKip, ucG, uitBlad("UC_tril_a"), uitBlad("UC_tril_v"),
      ...(tRekent ? [ucFlens, ucLijm, ucBf] : [])].filter(Number.isFinite),
  );
  const nietAangetoond = !ok && trilNvt && tril === 1 && !onderslag && rest <= 1;
  // Buigstijfheid in kNm²: E in N/mm² maal I in mm⁴ geeft N·mm². Bij een
  // T-balk die van de samengestelde doorsnede, zoals het blad hem toont.
  const EIt = uitBlad("EI_ef");
  const EI = tRekent && Number.isFinite(EIt) ? EIt : uitBlad("E_mean") * uitBlad("I_y") * 1e-9;
  const tekenbaar = [Pg, qq, FQ, gG, gQ, kdef, psi2, EI].every(Number.isFinite) && EI > 0;
  const tekst = (v: number, dec = 2) => (Number.isFinite(v) ? nl(v, dec) : "—");

  // ── de ontwerpknop: het blad per profiel doorrekenen ───────────────────────
  // Alles waarop de ontwerpzoektocht gebaseerd was, behalve het profiel.
  const ontwerpSig = JSON.stringify([
    Object.entries(vals).filter(([k]) => k !== "profiel" && k !== "b_zelf" && k !== "h_zelf").sort(),
    scope,
  ]);
  const ontwerpGeldig = ontwerp && ontwerp.sig === ontwerpSig ? ontwerp : null;
  const ontwerpProfiel = ontwerpGeldig?.profiel !== undefined ? PROFILES[ontwerpGeldig.profiel] : undefined;
  const ontwerpMelding = !ontwerpGeldig
    ? null
    : ontwerpGeldig.soort === "geen" || !ontwerpProfiel
      ? t("balklaag.ontwerp.geen")
      : t(`balklaag.ontwerp.${ontwerpGeldig.soort}`, { profiel: profielNaam(ontwerpProfiel) });
  laatsteSig.current = ontwerpSig;
  /**
   * Het eerste profiel uit de keuzelijst waarop het blad voldoet. "Eerste" is
   * de volgorde van de lijst zelf; die loopt per reeks van klein naar groot,
   * dus het eerste passende profiel is ook het lichtste dat het redt. Tussen
   * twee doorrekeningen krijgt de browser even de beurt, zodat het paneel niet
   * bevriest.
   */
  const kiesEerstePassend = async () => {
    if (!exemplaar || zoekt) return;
    const sig = ontwerpSig;
    setZoekt(true);
    const ast = leesBlad(source);
    const naam = exemplaar.naam ?? "";
    let gevonden: number | null = null;
    for (const id of Object.keys(PROFILES).map(Number).sort((x, y) => x - y)) {
      await new Promise((klaar) => setTimeout(klaar, 0));
      const u = rekenBladDoor(ast, { ...vals, profiel: String(id) }, scope, naam);
      if (u?.resultaat.voldoet === true) { gevonden = id; break; }
    }
    setZoekt(false);
    // Tijdens het zoeken gewijzigde invoer: het gevonden profiel hoort bij de
    // oude invoer. Niets schrijven; de gebruiker kan opnieuw zoeken.
    if (laatsteSig.current !== sig) return;
    if (gevonden === null) {
      setOntwerp({ sig, soort: "geen" });
      return;
    }
    setVal("profiel", gevonden);
    setOntwerp({ sig, soort: gevonden === profId ? "al" : "gekozen", profiel: gevonden });
  };

  // ── de ligger en zijn lijnen, met de lasten en factoren uit het blad ──────
  const ligger: Ligger = {
    schema, L1: Math.max(Lth, 1) / 1000, a: aOver / 1000, L2: LVeld2 / 1000, EI: tekenbaar ? EI : 1,
  };
  const L1 = ligger.L1;
  const tot = L1 + (schema === 2 ? ligger.a : 0) + (schema === 3 ? ligger.L2 : 0);
  const lasten = {
    g: Number.isFinite(Pg) ? Pg : 0, q: Number.isFinite(qq) ? qq : 0, F: Number.isFinite(FQ) ? FQ : 0,
  };
  const bg = belastinggevallen(ligger, lasten);
  const gevalLijn: Record<number, Lijnen> = Object.fromEntries(
    ([1, 2, 3, 4, 5] as const).map((k) => [k, lijnen(ligger, bg[k])]),
  );
  // De omhullende van de UGT, met de puntlast per doorsnede op de ongunstigste
  // plaats. Getekend als twee vlakken aan weerszijden van de as: het grootste
  // veldmoment en het grootste steunmoment, en de grootste +V en −V.
  const omh = omhullende(ligger, lasten, {
    gG: Number.isFinite(gG) ? gG : 0, gQ: Number.isFinite(gQ) ? gQ : 0, gGa, gQa,
  });
  const Momh = helften(omh.Mmax, omh.Mmin);
  const Vomh = helften(omh.Vmax, omh.Vmin);
  // De randen van de velden: daar springt de dwarskracht en ligt het steunmoment.
  const grenzen = schema === 2 || schema === 3 ? [0, L1, tot] : [0, tot];
  const steunen = [0, L1, ...(schema === 3 ? [tot] : [])];

  // ── doorsnede-tekening — vult het gemeten tekengebied, gecentreerd ─────────
  // Eén uniforme fit-schaal: het beeld groeit/krimpt evenredig mee met het
  // paneel en blijft dimensioneel correct (x = y).
  // Op papier staat de plattegrond van de sparing boven het statisch schema:
  // daar minder tussenruimte en de onderschriften op hun werkelijke hoogte
  // (23 px, met een subscript 26 px).
  const krap = alleenLezen && schema === 4;
  const capH = krap ? 25 : 26;                     // ruimte voor het onderschrift boven de stage
  const nJ = onderslag ? 1 : 4;
  const schemaH = alleenLezen ? 154 : 186;         // vaste hoogte voor het statisch schema
  // De lijnen staan alleen op het scherm; op papier staan ze in de uitwerking.
  const mH = 164;                                  // vaste hoogte voor de M-lijn, met een regel onderschrift
  const vH = mH;                                   // en de V-lijn
  const uH = 140;                                  // en voor de doorbuigingslijn
  const W = box.w;
  // De doorsnede krijgt wat overblijft; 4 × `gap` tussenruimte tussen de vijf
  // tekeningen (.vd-canvases).
  const gap = krap ? 8 : 14;
  const gapH = 4 * gap;
  const hMin = 130;
  // Het label van de raveelbalk hier vertaald, in dezelfde taal als de rest van
  // het beeld: de plattegrond meet er de breedte van zijn labelkolom op af.
  const raveel = { bSparing, lStaart, hoh, bBalk: b, label: t("raveel.raveelbalk", { profiel: profielNaam(prof) }).trim() };
  // De plattegrond krijgt de hoogte waarbij hij de breedte vult: op het scherm
  // scrollt de kolom, en op papier is het beeld zo hoog als zijn inhoud.
  const H = schema === 4
    ? raveelHoogte(W, raveel)
    : Math.max(hMin, box.h - 5 * capH - schemaH - mH - vH - uH - gapH);
  const mX = 46, mTop = 26, mBot = 48;             // marges (px)
  // Bij een onderslag één balk; de "groep" is dan de balk met wat ruimte ernaast.
  const totalMM = onderslag ? b * 4 : (nJ - 1) * hoh + b;
  const availW = W - 2 * mX, availH = H - mTop - mBot;
  // grootste schaal die zowel de breedte als de hoogte (beschot + balk) laat passen
  const s = Math.min(availW / totalMM, availH / ((onderslag ? 0 : tVloer) + h));
  const jW = b * s, jH = h * s, sp = hoh * s, tV = onderslag ? 0 : Math.max(6, tVloer * s);
  const groupW = onderslag ? jW : (nJ - 1) * sp + jW; // getekende breedte van de balken
  const x0 = (W - groupW) / 2;                     // horizontaal gecentreerd
  const boardL = Math.min(mX, x0 - sp * 0.4), boardR = Math.max(W - mX, x0 + groupW + sp * 0.4);
  const blockH = tV + jH;
  const yBoard = mTop + Math.max(0, (availH - blockH) / 2);  // verticaal gecentreerd
  const yJoist = yBoard + tV;

  function Dim(props: { name: string; value: number; x: number; y: number; step?: number; anker?: "end" }) {
    const { name, value, x, y, step = 5, anker } = props;
    const isEd = editing === name;
    return (
      <div className="vd-dim" style={{ left: x, top: y, ...(anker === "end" ? { transform: "translate(-100%, -50%)" } : {}) }}>
        {isEd ? (
          <input className="vd-dim-input" type="number" step={step} defaultValue={value} autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => { setVal(name, parseFloat(e.target.value)); setEditing(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setVal(name, parseFloat((e.target as HTMLInputElement).value)); setEditing(null); }
              if (e.key === "Escape") setEditing(null);
            }} />
        ) : (
          <button className="vd-dim-num" title={t("kit.klikWijzig", { naam: name })} onClick={() => setEditing(name)}>
            {Number.isInteger(value) ? value : value.toFixed(0)}
          </button>
        )}
      </div>
    );
  }

  return (
    // Op papier alleen wat de uitwerking niet zelf tekent: het statisch schema
    // en bij een raveelbalk de plattegrond. De doorsnede staat in de invoer, de
    // lijnen per belastinggeval en als omhullende in de uitwerking. Geen van
    // die tekeningen schaalt op de gemeten hoogte, dus het beeld mag zo hoog
    // worden als zijn inhoud.
    <div className="vd-panel" data-afdrukhoogte="inhoud">
      <div className="vd-head">
        <strong>{t("balklaag.titel")}</strong>
        {resultaat && Number.isFinite(ucMax) ? (
          <span className={`vd-uc ${ok ? "ok" : "bad"}`}>
            UC<sub>max</sub> = {ucMax.toFixed(2)} {ok ? t("kit.voldoet") : plaatOnvolledig ? t("balklaag.tbalk.nietGetoetst") : nietAangetoond ? t("balklaag.nietAangetoond") : t("kit.voldoetNiet")}
          </span>
        ) : (
          <span className="vd-uc info">—</span>
        )}
      </div>

      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        {/* De invoerkolom scrollt zelf: hij is langer dan het paneel hoog is,
            en zonder eigen scroll puilt hij over de voetregel heen. */}
        <div className="vd-controls vd-compact" style={{ alignSelf: "stretch", overflowY: "auto", minHeight: 0 }}>
          <span className="vd-ctrl-h">{t("balklaag.algemeen")}</span>
          <span className="vd-ctrl-h">{t("balklaag.statischSchema")}</span>
          <IconKeuze label={t("balklaag.schema")} waarde={schema} opties={schemaOpties}
            onChange={(v) => setVal("schema", v)} />
          {kent.ligger && (
            <label>{t("balklaag.soortLigger")}
              {/* De trillingstoets volgt de soort in het blad zelf: bij een onderslag vervalt hij. */}
              <select value={soort} onChange={(e) => setVal("ligger", parseInt(e.target.value))}>
                {LIGGER.map((l) => <option key={l.v} value={l.v}>{t(`balklaag.liggers.${l.sleutel}`)}</option>)}
              </select>
            </label>
          )}
          {oudBlad && (
            <p className="vd-ontwerp-melding">{t("balklaag.oudBlad")}</p>
          )}
          {onderslag && (
            <label title={t("balklaag.belasteBreedteUitleg")}>
              <span className="vd-help">{t("balklaag.belasteBreedte")}</span>
              <input type="number" step={0.05} value={bOnd} onChange={(e) => setVal("b_ond", parseFloat(e.target.value))} />
            </label>
          )}
          {schema === 2 && (
            <label>{t("balklaag.overstek")}
              <input type="number" step={50} value={aOver}
                onChange={(e) => setVal("a_over", parseFloat(e.target.value))} />
            </label>
          )}
          {schema === 3 && (
            <label>{t("balklaag.tweedeOverspanning")}
              <input type="number" step={100} value={LVeld2}
                onChange={(e) => setVal("L_veld2", parseFloat(e.target.value))} />
            </label>
          )}
          {schema === 3 && kent.steun && (
            <label title={t("balklaag.opleglengteSteunUitleg")}>
              <span className="vd-help">{t("balklaag.opleglengteSteun")}</span>
              <input type="number" step={10} value={aSteun}
                onChange={(e) => setVal("a_steun", parseFloat(e.target.value))} />
            </label>
          )}
          {schema === 4 && (
            <>
              <label>{t("balklaag.breedteSparing")}
                <input type="number" step={100} value={bSparing}
                  onChange={(e) => setVal("b_sparing", parseFloat(e.target.value))} />
              </label>
              <label>{t("balklaag.staartlengte")}
                <input type="number" step={100} value={lStaart}
                  onChange={(e) => setVal("l_staart", parseFloat(e.target.value))} />
              </label>
            </>
          )}

          <span className="vd-ctrl-h">{t("balklaag.geometrie")}</span>
          <label>{t("balklaag.profiel")}
            <select value={profId} onChange={(e) => setVal("profiel", parseInt(e.target.value))}>
              {Object.entries(PROFILES).map(([id, p]) => <option key={id} value={id}>{profielNaam(p)}</option>)}
              {kent.zelf && <option value={ZELF}>{t("balklaag.zelfInvullen")}</option>}
            </select>
          </label>
          {zelf && (
            <>
              <label>{t("balklaag.breedteB")}
                <input type="number" step={1} value={bZelf} onChange={(e) => setVal("b_zelf", parseFloat(e.target.value))} />
              </label>
              <label>{t("balklaag.hoogteH")}
                <input type="number" step={1} value={hZelf} onChange={(e) => setVal("h_zelf", parseFloat(e.target.value))} />
              </label>
            </>
          )}
          {kentT && (
            <IconKeuze label={t("balklaag.doorsnedeVorm")} waarde={vorm} opties={vormOpties}
              onChange={(v) => setVal("doorsnede", v)} />
          )}
          {tGekozen && !tActief && <p className="vd-ontwerp-melding">{t("balklaag.tbalk.nvt")}</p>}
          {tActief && (
            <>
              <p className="vd-ontwerp-melding" style={{ color: "#b45309" }}>{t("balklaag.tbalk.nogTeControleren")}</p>
              <label title={t("balklaag.tbalk.verlijmd")}>
                <span className="vd-help">{t("balklaag.tbalk.plaat")}</span>
                <select value={plaat} onChange={(e) => setVal("plaat", parseInt(e.target.value))}>
                  {PLATEN.map((p) => <option key={p.v} value={p.v}>{t(`balklaag.tbalk.platen.${p.sleutel}`)}</option>)}
                </select>
              </label>
              {fabrikant && (
                <>
                  <p className="vd-ontwerp-melding">
                    {t(plaat === 5 ? "balklaag.tbalk.fabrikantSpaanplaat" : "balklaag.tbalk.fabrikantMultiplex")}
                  </p>
                  {[...PLAAT_INVOER, ...(plaat === 5 ? PLAAT_FACTOREN.map((p) => ({ ...p, stap: 0.05 })) : [])].map((p) => (
                    <label key={p.naam}>
                      <span>{p.sym} {t(`balklaag.tbalk.invoer.${p.sleutel}`)}</span>
                      <input type="number" step={p.stap} value={ruw(p.naam)} placeholder={t("balklaag.tbalk.fabrikantgegeven")}
                        onChange={(e) => zetBladWaarde(p.naam, e.target.value)} />
                    </label>
                  ))}
                </>
              )}
              {plaatOnvolledig && <p className="vd-ontwerp-melding" style={{ color: "#b91c1c" }}>{t("balklaag.tbalk.onvolledig")}</p>}
            </>
          )}
          <div className="vd-ontwerp">
            <button type="button" onClick={kiesEerstePassend} disabled={alleenLezen || zoekt}>
              {zoekt ? t("balklaag.ontwerp.zoekt") : t("balklaag.ontwerp.knop")}
            </button>
            <span>{t("balklaag.ontwerp.uitleg")}</span>
          </div>
          {ontwerpMelding && <p className="vd-ontwerp-melding">{ontwerpMelding}</p>}
          <label>{t("balklaag.dagmaat")}
            <input type="number" step={100} value={Ld} onChange={(e) => setVal("L_d", parseFloat(e.target.value))} />
          </label>
          <label>{t("balklaag.opleglengte")}
            <input type="number" step={5} value={aOpl} onChange={(e) => setVal("a_opl", parseFloat(e.target.value))} />
          </label>
          <label>{t("balklaag.hoh")}
            <input type="number" step={10} value={hoh} onChange={(e) => setVal("hoh", parseFloat(e.target.value))} />
          </label>
          <label>{t("balklaag.dikteBeschot")}
            <input type="number" step={1} value={tVloer} onChange={(e) => setVal("t_vloer", parseFloat(e.target.value))} />
          </label>
          <label>{t("balklaag.eBeschot")}
            <input type="number" step={100} value={eBeschot} onChange={(e) => setVal("E_beschot", parseFloat(e.target.value))} />
          </label>
          <label>{t("balklaag.breedteVloer")}
            <input type="number" step={0.5} value={bVloer} onChange={(e) => setVal("b_vloer", parseFloat(e.target.value))} />
          </label>

          <span className="vd-ctrl-h">{t("balklaag.materiaal")}</span>
          <label>{t("balklaag.sterkteklasse")}
            <select value={matId} onChange={(e) => setVal("sterkteklasse", parseInt(e.target.value))}>
              {MATS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
          </label>
          <label title={KLIM.map((k) => t(`balklaag.klimaat.${k.sleutel}.uitleg`)).join("\n\n")}>
            <span className="vd-help">{t("balklaag.klimaatklasse")}</span>
            <select
              value={klim}
              title={t(`balklaag.klimaat.${(KLIM.find((k) => k.v === klim) ?? KLIM[0]).sleutel}.uitleg`)}
              onChange={(e) => setVal("klimaat", parseInt(e.target.value))}
            >
              {KLIM.map((k) => (
                <option key={k.v} value={k.v} title={t(`balklaag.klimaat.${k.sleutel}.uitleg`)}>
                  {t(`balklaag.klimaat.${k.sleutel}.label`)}
                </option>
              ))}
            </select>
          </label>
          <label>{t("balklaag.duurklasse")}
            <select value={duur} onChange={(e) => setVal("duurklasse", parseInt(e.target.value))}>
              {DUUR.map((dk) => <option key={dk.v} value={dk.v}>{t(`balklaag.duur.${dk.sleutel}`)}</option>)}
            </select>
          </label>

          <span className="vd-ctrl-h">{t("balklaag.belasting")}</span>
          <label>G<sub>k</sub> (kN/m²)
            <input type="number" step={0.1} value={gk} onChange={(e) => setVal("G_k", parseFloat(e.target.value))} />
          </label>
          <label>Q<sub>k</sub> (kN/m²)
            <input type="number" step={0.5} value={qk} onChange={(e) => setVal("Q_k", parseFloat(e.target.value))} />
          </label>
          <label>F<sub>k</sub> (kN)
            <input type="number" step={0.5} value={Fk} onChange={(e) => setVal("F_k", parseFloat(e.target.value))} />
          </label>
          {kent.gedragen && (onderslag || schema === 4) && (
            <label title={t("balklaag.gedragenUitleg")}>
              <span className="vd-help">g<sub>bl</sub> {t("balklaag.gedragen")}</span>
              <input type="number" step={0.01} value={gBl} onChange={(e) => setVal("g_bl", parseFloat(e.target.value))} />
            </label>
          )}
          <label>{t("balklaag.categorie")}
            <select value={cat} onChange={(e) => {
              const v = parseInt(e.target.value); setVal("belastingcat", v);
              const rij = CAT.find((c) => c.v === v);
              // Bij een normcategorie de bijbehorende waarden meesturen, zodat
              // "zelf invullen" begint bij wat er stond in plaats van bij nul.
              if (rij && v !== 11) { setVal("ψ_0_zelf", rij.psi0); setVal("ψ_2_zelf", rij.psi2); }
            }}>
              {CAT.map((c) => <option key={c.v} value={c.v}>{t(`balklaag.categorieen.${c.sleutel}`)}</option>)}
            </select>
          </label>
          {cat === 11 && (
            <>
              <label>ψ<sub>0</sub>
                <input type="number" step={0.1} value={psi0zelf} onChange={(e) => setVal("ψ_0_zelf", parseFloat(e.target.value))} />
              </label>
              <label>ψ<sub>2</sub>
                <input type="number" step={0.1} value={psi2zelf} onChange={(e) => setVal("ψ_2_zelf", parseFloat(e.target.value))} />
              </label>
            </>
          )}

          <span className="vd-ctrl-h">{t("balklaag.doorbuiging")}</span>
          <JaNee
            label={t("balklaag.controleerDoorbuiging")}
            waarde={controleer === 1}
            onChange={(v) => setVal("controleer", v ? 1 : 0)}
          />
          <label>{t("balklaag.grensFin")} w<sub>fin</sub>
            <select value={grens} onChange={(e) => setVal("grensfactor", parseFloat(e.target.value))}>
              {GRENS.map((g) => <option key={g.v} value={g.v}>{g.label}</option>)}
            </select>
          </label>
          {kent.bijkomend && (
            <label>{t("balklaag.grensBij")} w<sub>bij</sub>
              <select value={grensBij} onChange={(e) => setVal("grens_bij", parseFloat(e.target.value))}>
                {GRENS_BIJ.map((g) => (
                  <option key={g.v} value={g.v}>{g.bros ? t("balklaag.brosseAfwerking", { grens: g.label }) : g.label}</option>
                ))}
              </select>
            </label>
          )}

          <span className="vd-ctrl-h">{t("balklaag.trilling")}</span>
          <JaNee
            label={t("balklaag.controleerTrilling")}
            waarde={tril === 1}
            onChange={(v) => setVal("controleer_trilling", v ? 1 : 0)}
          />
          {onderslag && tril === 1 && (
            <p className="vd-ontwerp-melding">{t("balklaag.onderslagTrilling")}</p>
          )}
          {tril === 1 && (
            <>
              <label>{t("balklaag.demping")}
                <input type="number" step={0.005} value={zeta} onChange={(e) => setVal("ζ", parseFloat(e.target.value))} />
              </label>
              <label>a (mm/kN)
                <input type="number" step={0.1} value={aTril} onChange={(e) => setVal("a_tril", parseFloat(e.target.value))} />
              </label>
              <label>b (—)
                <input type="number" step={5} value={bTril} onChange={(e) => setVal("b_tril", parseFloat(e.target.value))} />
              </label>
            </>
          )}

          {kent.drieD && (
            <>
              {/* Het beeld zelf staat in de uitwerking, achteraan het blad: het leest de
                  unity checks. Hier alleen de keuzes; een tweede beeld zou hier niets toevoegen. */}
              <span className="vd-ctrl-h">{t("balklaag.drieDKop")}</span>
              <JaNee
                label={t("balklaag.drieDTonen")}
                waarde={num("toon_3d", 1) === 1}
                onChange={(v) => setVal("toon_3d", v ? 1 : 0)}
              />
              {num("toon_3d", 1) === 1 && (
                <span title={t("balklaag.drieDAfdrukkenUitleg")}>
                  <JaNee
                    label={t("balklaag.drieDAfdrukken")}
                    waarde={num("druk_3d", 0) === 1}
                    onChange={(v) => setVal("druk_3d", v ? 1 : 0)}
                  />
                </span>
              )}
            </>
          )}
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, justifyContent: "safe center", borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18, ...(krap ? { gap } : {}) }}>
          {schema === 4 ? (
            <div className="vd-canvas">
              <div className="vd-caption">{t("balklaag.plattegrond")}</div>
              <div className="vd-stage" style={{ width: W, height: H, background: "transparent", border: "none", borderRadius: 0 }}>
                {/* Op papier tekent de plattegrond de maatgetallen zelf; op het
                    scherm staan er klikbare maten, boven en links naast hun lijn. */}
                <svg width={W} height={H} className="vd-svg">
                  <RaveelPlattegrond W={W} H={H} {...raveel} getallen={alleenLezen} />
                </svg>
                {!alleenLezen && (() => {
                  const m = raveelMaten(W, H, raveel);
                  return (
                    <>
                      <Dim name="b_sparing" value={bSparing} x={m.xm} y={m.yMaat - 9} step={100} />
                      <Dim name="l_staart" value={lStaart} x={m.xStaart - 3} y={(m.y0 + m.yRav) / 2} step={100} anker="end" />
                    </>
                  );
                })()}
              </div>
            </div>
          ) : alleenLezen ? null : onderslag ? (
          <div className="vd-canvas">
            <div className="vd-caption">{t("balklaag.doorsnedeOnderslag")}</div>
            <div className="vd-stage" style={{ width: W, height: H, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={H} className="vd-svg">
                {/* de balken die op de onderslag liggen, schematisch */}
                <line x1={mX} y1={yJoist - 8} x2={W - mX} y2={yJoist - 8} stroke="#8B6F47" strokeWidth={8} strokeDasharray="14 22" />
                <rect x={x0} y={yJoist} width={jW} height={jH} style={{ fill: "#E3C08A", stroke: "#8B6F47", strokeWidth: 1.5 }} />
              </svg>
              <div className="vd-dim-ro" style={{ left: x0 + jW / 2, top: yJoist + jH / 2 }}>{nl(b, 0)}×{nl(h, 0)}</div>
              <div className="vd-dim-ro" style={{ left: W / 2, top: yJoist - 26 }}>{t("balklaag.belasteBreedteMaat", { b: nl(bOnd, 2) })}</div>
            </div>
          </div>
          ) : (
          <div className="vd-canvas">
            <div className="vd-caption">
              {tActief ? t("balklaag.tbalk.kop") : t("balklaag.doorsnede")}
              {tActief && Number.isFinite(bEf) && (
                <span className="vd-caption-waarde">
                  {" "}· b<sub>ef</sub> = {nl(bEf, 0)} mm {t("balklaag.tbalk.inHetVeld")}
                  {(schema === 2 || schema === 3) && Number.isFinite(bEfS) && <>, {nl(bEfS, 0)} mm {t("balklaag.tbalk.bijHetSteunpunt")}</>}
                </span>
              )}
            </div>
            <div className="vd-stage" style={{ width: W, height: H, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={H} className="vd-svg">
                <defs>
                  <marker id="bdDim" markerWidth="10" markerHeight="12" refX="5" refY="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                    <circle cx="5" cy="6" r="2.4" className="vd-dimarrow" />
                  </marker>
                </defs>
                {/* beschot */}
                <rect x={boardL} y={yBoard} width={boardR - boardL} height={tV} style={{ fill: "#D9B382", stroke: "#8B6F47", strokeWidth: 1.5 }} />
                {/* balken */}
                {Array.from({ length: nJ }, (_, i) => (
                  <rect key={i} x={x0 + i * sp} y={yJoist} width={jW} height={jH} style={{ fill: "#E3C08A", stroke: "#8B6F47", strokeWidth: 1.5 }} />
                ))}
                {/* T-balk: de lijmnaad op elke balk, en de meewerkende breedte b_ef
                    boven de derde balk, met een maatlijn erboven */}
                {tActief && Array.from({ length: nJ }, (_, i) => (
                  <line key={`lijm${i}`} x1={x0 + i * sp} y1={yJoist} x2={x0 + i * sp + jW} y2={yJoist} stroke="#B45309" strokeWidth={2.4} />
                ))}
                {tActief && Number.isFinite(bEf) && bEf > 0 && (() => {
                  const cx = x0 + 2 * sp + jW / 2, w = bEf * s, yd = yBoard - 9;
                  return (
                    <g>
                      <rect x={cx - w / 2} y={yBoard} width={w} height={tV} style={{ fill: "rgba(37, 99, 235, 0.30)", stroke: "#1E40AF", strokeWidth: 1.2 }} />
                      <line x1={cx - w / 2} y1={yd} x2={cx + w / 2} y2={yd} className="vd-dimmeasure" markerStart="url(#bdDim)" markerEnd="url(#bdDim)" />
                      <line x1={cx - w / 2} y1={yBoard} x2={cx - w / 2} y2={yd - 4} className="vd-dimext" />
                      <line x1={cx + w / 2} y1={yBoard} x2={cx + w / 2} y2={yd - 4} className="vd-dimext" />
                    </g>
                  );
                })()}
                {/* hoh maatlijn tussen balk 1 en 2 */}
                <line x1={x0 + jW / 2} y1={yJoist + jH + 18} x2={x0 + sp + jW / 2} y2={yJoist + jH + 18} className="vd-dimmeasure" markerStart="url(#bdDim)" markerEnd="url(#bdDim)" />
                <line x1={x0 + jW / 2} y1={yJoist + jH} x2={x0 + jW / 2} y2={yJoist + jH + 22} className="vd-dimext" />
                <line x1={x0 + sp + jW / 2} y1={yJoist + jH} x2={x0 + sp + jW / 2} y2={yJoist + jH + 22} className="vd-dimext" />
              </svg>
              <Dim name="hoh" value={hoh} x={x0 + sp / 2 + jW / 2} y={yJoist + jH + 18} step={10} />
              <Dim name="t_vloer" value={tVloer} x={boardR - 26} y={yBoard + tV / 2} step={1} />
              <div className="vd-dim-ro" style={{ left: x0 + jW / 2, top: yJoist + jH / 2 }}>{nl(b, 0)}×{nl(h, 0)}</div>
              {tActief && Number.isFinite(bEf) && bEf > 0 && (
                <div className="vd-dim-ro" style={{ left: x0 + 2 * sp + jW / 2, top: yBoard - 20 }}>b<sub>ef</sub> = {nl(bEf, 0)}</div>
              )}
            </div>
          </div>
          )}

          {/* ── Statisch schema met de karakteristieke lasten per balk ── */}
          <div className="vd-canvas">
            <div className="vd-caption">{t("balklaag.schemaKop")}</div>
            <div className="vd-stage" style={{ width: W, height: schemaH, background: "transparent", border: "none", borderRadius: 0 }}>
              {(() => {
                const mx = 54;
                // De balk is bij een overstek of een tweede veld langer dan de
                // overspanning; sx2 blijft de tweede oplegging, sxE het einde.
                const sx1 = mx, sxE = Math.max(mx + 80, W - mx);
                const sx2 = sx1 + ((sxE - sx1) * L1) / Math.max(tot, 1e-6);
                const smid = (sx1 + sx2) / 2;
                // Op papier is het schema lager; alle maten schuiven mee.
                const kort_ = alleenLezen;
                const maatAf = kort_ ? 40 : 46;
                const ay = schemaH - maatAf - 12;    // hoogte van de balk-as
                const yBalk = ay - 6;                // bovenkant van de balk
                const gTop = yBalk - (kort_ ? 24 : 30); // bovenlijn van de permanente last
                // De veranderlijke last staat erboven, met een regel ertussen
                // voor het label van de permanente last.
                const qTip = gTop - (kort_ ? 14 : 17);
                const qTop = qTip - (kort_ ? 20 : 26); // bovenlijn van de veranderlijke last
                // De puntlast staat midden in veld 1, zoals in het statische
                // schema van het blad; de andere standen zijn aparte gevallen.
                const xF = smid;
                const yMaat = ay + maatAf;
                // In een smal paneel de lastlabels zonder de omschrijving.
                const kort = W < 440;
                return (
                  <>
                    <svg width={W} height={schemaH} className="vd-svg">
                      <defs>
                        <marker id="bdDim2" markerWidth="10" markerHeight="12" refX="5" refY="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                          <circle cx="5" cy="6" r="2.4" className="vd-dimarrow" />
                        </marker>
                      </defs>
                      {qk > 0 && <LijnLast x1={sx1} x2={sxE} yTop={qTop} yBalk={qTip} kleur={KLEUR_Q} />}
                      <LijnLast x1={sx1} x2={sxE} yTop={gTop} yBalk={yBalk} kleur={KLEUR_G} />
                      {Fk > 0 && (
                        <PuntLast x={xF} yTop={qTop - (kort_ ? 14 : 18)} yBalk={yBalk} kleur={KLEUR_F}
                          label={<>F<tspan baselineShift="sub" fontSize={8}>Q,k</tspan> = {tekst(FQ)} kN</>} />
                      )}
                      {/* labels als laatste: de puntlast loopt er dan niet doorheen */}
                      {qk > 0 && (
                        <Label x={sx1 + (sxE - sx1) * (kort ? 0.74 : 0.68)} y={qTop - 6} kleur={KLEUR_Q}>
                          q<tspan baselineShift="sub" fontSize={8}>q,k</tspan> = {tekst(qq)} kN/m{kort ? "" : ` · ${t("balklaag.veranderlijk")}`}
                        </Label>
                      )}
                      <Label x={sx1 + (sxE - sx1) * (kort ? 0.26 : 0.3)} y={gTop - 6} kleur={KLEUR_G}>
                        P<tspan baselineShift="sub" fontSize={8}>g,k</tspan> = {tekst(Pg)} kN/m{kort ? "" : ` · ${t("balklaag.permanent")}`}
                      </Label>
                      {/* de balk */}
                      <rect x={sx1} y={yBalk} width={sxE - sx1} height={12} fill="#E3C08A" stroke="#8B6F47" strokeWidth={1.5} />
                      <Oplegging x={sx1} y={yBalk + 12} soort="scharnier" />
                      <Oplegging x={sx2} y={yBalk + 12} soort="rol" />
                      {schema === 3 && <Oplegging x={sxE} y={yBalk + 12} soort="rol" />}
                      {/* maatlijnen: overspanning, en een overstek of tweede veld */}
                      <line x1={sx1} y1={yMaat} x2={sx2} y2={yMaat} className="vd-dimmeasure" markerStart="url(#bdDim2)" markerEnd="url(#bdDim2)" />
                      <line x1={sx1} y1={yBalk + 42} x2={sx1} y2={yMaat + 4} className="vd-dimext" />
                      <line x1={sx2} y1={yBalk + 42} x2={sx2} y2={yMaat + 4} className="vd-dimext" />
                      {(schema === 2 || schema === 3) && (
                        <>
                          <line x1={sx2} y1={yMaat} x2={sxE} y2={yMaat} className="vd-dimmeasure" markerStart="url(#bdDim2)" markerEnd="url(#bdDim2)" />
                          <line x1={sxE} y1={yBalk + 14} x2={sxE} y2={yMaat + 4} className="vd-dimext" />
                        </>
                      )}
                    </svg>
                    {schema === 4
                      ? <Dim name="b_sparing" value={bSparing} x={smid} y={yMaat} step={100} />
                      : <Dim name="L_d" value={Ld} x={smid} y={yMaat} step={100} />}
                    {schema === 2 && <Dim name="a_over" value={aOver} x={(sx2 + sxE) / 2} y={yMaat} step={50} />}
                    {schema === 3 && <Dim name="L_veld2" value={LVeld2} x={(sx2 + sxE) / 2} y={yMaat} step={100} />}
                  </>
                );
              })()}
            </div>
          </div>

          {/* ── Omhullende momentenlijn en dwarskrachtenlijn (UGT) ── */}
          {!alleenLezen && (() => {
            const mx1 = 54, mx2 = Math.max(mx1 + 80, W - 54);
            const X = (x: number) => mx1 + ((mx2 - mx1) * x) / tot;
            // Schaal: alles wat getekend wordt moet passen, boven én onder de as.
            // De opleggingen horen erbij: daar liggen de pieken.
            const punten = [
              ...Array.from({ length: 241 }, (_, i) => (tot * i) / 240),
              ...grenzen.flatMap((x) => [x - tot * 1e-6, x + tot * 1e-6]).filter((x) => x > 0 && x < tot),
            ];
            const bemonster = (fs: ((x: number) => number)[]) => {
              let pos = 0, neg = 0;
              for (const x of punten) {
                for (const f of fs) { const v = f(x); pos = Math.max(pos, v); neg = Math.max(neg, -v); }
              }
              return { pos, neg };
            };
            const bM = bemonster([Momh.boven, Momh.onder]);
            const bV = bemonster([Vomh.boven, Vomh.onder]);
            // Onder de lijn blijft een regel vrij voor het onderschrift.
            const sM = (mH - 66) / Math.max(bM.pos + bM.neg, 1e-9);
            const sV = (vH - 66) / Math.max(bV.pos + bV.neg, 1e-9);
            const asM = 26 + bM.neg * sM;                    // positief moment hangt onder de as
            const asV = 26 + bV.pos * sV;                    // positieve dwarskracht staat erboven
            // Waarden bij de uitersten: de veldmomenten onder de as, het steunmoment
            // erboven; de dwarskracht aan de randen van elk veld.
            const alsLabel = (p: { x: number; v: number }) => ({ ...p, tekst: `${nl(p.v)} kNm` });
            const MlabelsVeld = extremen(Momh.boven, grenzen).filter((p) => p.v > 0).map(alsLabel);
            const MlabelsSteun = extremen(Momh.onder, grenzen).filter((p) => p.v < 0).map(alsLabel);
            // Een waarde aan het begin of het eind van de ligger staat buiten de
            // ligger als zij het teken heeft dat daar niet bij de belasting hoort
            // (trek in een eindoplegging, of de puntlast op het uiteinde van een
            // overstek), of als het veld te smal is voor twee waarden naast elkaar.
            // Vlak onder de as zakt zij tot onder het teken van de oplegging.
            const pxPerM = (mx2 - mx1) / tot;
            const alsRand = (p: { x: number; v: number; kant: number }) => {
              const begin = p.kant > 0 && p.x < tot * 1e-3;
              const eind = p.kant < 0 && p.x > tot * (1 - 1e-3);
              const i = grenzen.findIndex((g) => Math.abs(g - p.x) < tot * 1e-6);
              const veld = p.kant > 0 ? grenzen[i + 1] - grenzen[i] : grenzen[i] - grenzen[i - 1];
              const smal = veld * pxPerM < 110;
              const buiten = (begin && (p.v < 0 || smal)) || (eind && (p.v > 0 || smal));
              const naarRechts = buiten ? eind : p.kant > 0;
              const afstand = buiten ? 3 : 5;
              const diepte = Math.abs(p.v) * sV;
              return {
                x: p.x, v: p.v, tekst: `${nl(p.v)} kN`, naast: buiten,
                anker: (naarRechts ? "start" : "end") as "start" | "end", dx: naarRechts ? afstand : -afstand,
                dy: buiten && p.v < 0 && diepte < 26 ? 26 - diepte : 0,
              };
            };
            const VlabelsBoven = randwaarden(Vomh.boven, grenzen).filter((p) => p.v > 0).map(alsRand);
            const VlabelsOnder = randwaarden(Vomh.onder, grenzen).filter((p) => p.v < 0).map(alsRand);
            // Bij de puntlast telt het blad de maxima van de permanente last en de
            // puntlast op, ook waar ze niet samenvallen: een veilige omhullende.
            // Ligt M_y,Ed daardoor boven de getekende piek, dan zeggen we dat.
            const piekM = Math.max(bM.pos, bM.neg);
            const omhullend = Number.isFinite(MyEd) && MyEd > 1.01 * piekM;
            return (
              <>
                <div className="vd-canvas">
                  <div className="vd-caption">{t("balklaag.mLijn")} <span className="vd-caption-waarde">· M<sub>y,Ed</sub> = {tekst(MyEd)} kNm</span></div>
                  <div className="vd-stage" style={{ width: W, height: mH, background: "transparent", border: "none", borderRadius: 0 }}>
                    {tekenbaar && (
                      <svg width={W} height={mH} className="vd-svg">
                        <KrachtenLijn x1={mx1} x2={mx2} tot={tot} asY={asM} schaal={sM} f={Momh.boven} omlaag kleur={KLEUR_M}
                          breekpunten={grenzen} tekens labels={MlabelsVeld} />
                        <KrachtenLijn x1={mx1} x2={mx2} tot={tot} asY={asM} schaal={sM} f={Momh.onder} omlaag kleur={KLEUR_M}
                          breekpunten={grenzen} tekens labels={MlabelsSteun} />
                        {steunen.map((x, i) => <Oplegging key={i} x={X(x)} y={asM} soort={i === 0 ? "scharnier" : "rol"} g={4.5} />)}
                        <text x={mx1 - 8} y={mH - 4} fontSize={10} fill="#6b7280">{t("balklaag.mLijnOnder")}</text>
                      </svg>
                    )}
                  </div>
                  {omhullend && (
                    <div className="vd-noot" style={{ width: W }}>
                      {t("balklaag.omhullendNoot")} M<sub>y,Ed</sub> = {tekst(MyEd)} kNm.
                    </div>
                  )}
                </div>
                <div className="vd-canvas">
                  <div className="vd-caption">{t("balklaag.vLijn")} <span className="vd-caption-waarde">· V<sub>z,Ed</sub> = {tekst(VzEd)} kN</span></div>
                  <div className="vd-stage" style={{ width: W, height: vH, background: "transparent", border: "none", borderRadius: 0 }}>
                    {tekenbaar && (
                      <svg width={W} height={vH} className="vd-svg">
                        <KrachtenLijn x1={mx1} x2={mx2} tot={tot} asY={asV} schaal={sV} f={Vomh.boven} omlaag={false} kleur={KLEUR_V}
                          breekpunten={grenzen} arcering tekens labels={VlabelsBoven} />
                        <KrachtenLijn x1={mx1} x2={mx2} tot={tot} asY={asV} schaal={sV} f={Vomh.onder} omlaag={false} kleur={KLEUR_V}
                          breekpunten={grenzen} arcering tekens labels={VlabelsOnder} />
                        {steunen.map((x, i) => <Oplegging key={i} x={X(x)} y={asV} soort={i === 0 ? "scharnier" : "rol"} g={4.5} />)}
                        <text x={mx1 - 8} y={vH - 4} fontSize={10} fill="#6b7280">{t("balklaag.vLijnOnder")}</text>
                      </svg>
                    )}
                  </div>
                </div>
              </>
            );
          })()}

          {/* ── Doorbuigingslijn (BGT) ─────────────────────────────────── */}
          {!alleenLezen && (
          <div className="vd-canvas">
            <div className="vd-caption">
              {t("balklaag.doorbuigingKop")}{" "}
              <span className="vd-caption-waarde">
                · w<sub>fin</sub> = {tekst(wfin, 1)} mm, {t("balklaag.grens")} {tekst(wlim, 1)} mm
                {Number.isFinite(wbij) && <> · w<sub>bij</sub> = {tekst(wbij, 1)} mm, {t("balklaag.grens")} {tekst(wlimBij, 1)} mm</>}
                {(schema === 2 || schema === 3) && Number.isFinite(wfin2) && (
                  <> · {schema === 2 ? t("balklaag.uiteinde") : t("balklaag.veld2")}: {tekst(wfin2, 1)} mm, {t("balklaag.grens")} {tekst(wlim2, 1)} mm</>
                )}
              </span>
            </div>
            <div className="vd-stage" style={{ width: W, height: uH, background: "transparent", border: "none", borderRadius: 0 }}>
              {tekenbaar && (() => {
                const mx = 54;
                const ux1 = mx, ux2 = Math.max(mx + 80, W - mx);
                const X = (x: number) => ux1 + ((ux2 - ux1) * x) / tot;
                // Per veld het veranderlijke geval dat het blad meetelt: de
                // verdeelde last op dat veld, of in de norm-stand de puntlast als
                // die de grootste zakking geeft (5.1 van het blad).
                const pv1 = uitBlad("u_var") > uitBlad("u_q_k") + 1e-9;
                const pv2 = uitBlad("u_var_2") > uitBlad("u_q_k_2") + 1e-9;
                const tweede = schema === 2 || schema === 3;
                const kvar = (x: number) => (tweede && x > L1 ? (pv2 ? 5 : 3) : (pv1 ? 4 : 2));
                const uInst = (x: number) => gevalLijn[1].u(x) + gevalLijn[kvar(x)].u(x);
                const uFin = (x: number) => (1 + kdef) * gevalLijn[1].u(x) + (1 + psi2 * kdef) * gevalLijn[kvar(x)].u(x);
                const xs = Array.from({ length: 241 }, (_, i) => (tot * i) / 240);
                const hoog = Math.max(0.001, ...xs.map((x) => Math.max(uFin(x), uInst(x))));
                const laag = Math.max(0, ...xs.map((x) => -Math.min(uFin(x), uInst(x))));
                const sU = (uH - 60) / (hoog + laag);
                const uas = 26 + laag * sU;
                const lijn = (f: (x: number) => number) => xs.map((x) => `${X(x)},${uas + sU * f(x)}`).join(" ");
                // De stippen staan waar het blad de grootste eindstand vond
                // (5.1); een ouder blad noemt die plaats niet, dan het midden.
                const xw1 = uitBlad("x_w1"), xw2 = uitBlad("x_w2");
                const velden = [
                  { x: Number.isFinite(xw1) ? xw1 : L1 / 2, w: wfin, lim: wlim },
                  ...(schema === 3 ? [{ x: Number.isFinite(xw2) ? xw2 : L1 + ligger.L2 / 2, w: wfin2, lim: wlim2 }] : []),
                  ...(schema === 2 && Number.isFinite(wfin2) ? [{ x: tot, w: wfin2, lim: wlim2 }] : []),
                ];
                return (
                  <svg width={W} height={uH} className="vd-svg">
                    <line x1={ux1 - 8} y1={uas} x2={ux2 + 8} y2={uas} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" />
                    <polyline points={lijn(uInst)} fill="none" stroke={KLEUR_U.licht} strokeWidth={1.6} strokeDasharray="6 4" />
                    <polyline points={lijn(uFin)} fill="none" stroke={KLEUR_U.lijn} strokeWidth={2.6} strokeLinejoin="round" />
                    {steunen.map((x, i) => <Oplegging key={i} x={X(x)} y={uas} soort={i === 0 ? "scharnier" : "rol"} g={5} />)}
                    {controleer === 1 && velden.map((v, i) => {
                      const y = uas + sU * uFin(v.x);
                      const teVeel = v.w > v.lim;
                      return (
                        <g key={i}>
                          <circle cx={X(v.x)} cy={y} r={3} fill={KLEUR_U.lijn} />
                          <Label x={X(v.x)} y={y + (uFin(v.x) >= 0 ? 17 : -9)} kleur={teVeel ? "#b91c1c" : KLEUR_U.lijn}>
                            w<tspan baselineShift="sub" fontSize={8}>fin</tspan> = {tekst(v.w, 1)} mm{teVeel ? ` > ${tekst(v.lim, 1)} mm` : ` ≤ ${tekst(v.lim, 1)} mm`}
                          </Label>
                        </g>
                      );
                    })}
                    <text x={ux1 - 8} y={uH - 4} fontSize={10} fill="#6b7280">{t("balklaag.stippel")} w<tspan baselineShift="sub" fontSize={7}>inst</tspan> · {t("balklaag.lijn")} w<tspan baselineShift="sub" fontSize={7}>fin</tspan> {t("balklaag.metKruip")}</text>
                  </svg>
                );
              })()}
            </div>
          </div>
          )}
        </div>
      </div>

      <div className="vd-foot">
        <span>{t("balklaag.klik")}</span>
        <span className="vd-live">
          {controleer === 1
            ? <UcChip naam={t("balklaag.uc.doorbuiging")} uc={ucDoorMax} />
            : <span className="vd-uc-nvt">{t("balklaag.uc.doorbuigingNvt")}</span>}
          <UcChip naam={t("balklaag.uc.buiging")} uc={ucBuig} />
          <UcChip naam={t("balklaag.uc.afschuiving")} uc={ucAfsch} />
          {tRekent && (
            <>
              <UcChip naam={t("balklaag.uc.plaat")} uc={ucFlens} />
              <UcChip naam={t("balklaag.uc.lijmnaad")} uc={ucLijm} />
              <UcChip naam={t("balklaag.uc.flensbreedte")} uc={ucBf} />
            </>
          )}
          {Number.isFinite(ucC90) && <UcChip naam={t("balklaag.uc.oplegdruk")} uc={ucC90} />}
          {(schema === 2 || schema === 3) && Number.isFinite(ucKip) && <UcChip naam={t("balklaag.uc.kip")} uc={ucKip} />}
          {Number.isFinite(ucG) && <UcChip naam={t("balklaag.uc.alleenG")} uc={ucG} />}
          {tril === 1 && !onderslag
            ? <UcChip naam={t("balklaag.uc.trilling")} uc={ucTril}
                extra={Number.isFinite(f1) ? `f₁ = ${f1.toFixed(1)} Hz${trilNvt ? `, ${t("balklaag.uc.nietAangetoond")}` : ""}` : undefined} />
            : <span className="vd-uc-nvt">{t("balklaag.uc.trillingNvt")}</span>}
          {Number.isFinite(rMin) && rMin < 0 && (
            <span className="vd-uc-chip bad">{t("balklaag.uc.trekOplegging", { kn: nl(-rMin, 2) })}</span>
          )}
        </span>
      </div>
    </div>
  );
}
