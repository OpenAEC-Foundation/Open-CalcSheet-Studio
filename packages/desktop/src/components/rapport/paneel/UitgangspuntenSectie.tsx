import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type {
  Bevestigingsregel,
  Conserveringsregel,
  Materiaalregel,
  Vervormingsregel,
} from "../../../rapport/model";
import {
  beta,
  fmt,
  getal,
  inspectieniveau,
  klasse,
  levensduurklasse,
  normVoorBouwjaar,
  ontwerpSupervisie,
} from "../../../rapport/normwaarden";
import { noemtVorigeProductnaam, VORIGE_PRODUCTNAAM } from "../../../rapport/standaardteksten";
import { kFiVoor, projectWaarde } from "../../../store/projectGegevens";
import { useProjectStore } from "../../../store/projectStore";
import RijenTabel, { type Kolom } from "./RijenTabel";
import TekstVeld from "./TekstVeld";
import { Afgeleid, Keuze, Kop, Sectie, TekstVak, Veld, Vink, useRapport, type Optie } from "./velden";

/** Suggesties voor 4.1; eigen tekst kan altijd. Komt zo in het rapport, dus Nederlands. */
const SOORTEN = [
  "Woning",
  "Eengezinswoning",
  "Appartementencomplex",
  "Villa",
  "Kantoor",
  "Bedrijfshal",
  "Bijgebouw",
  "Schuur",
];

/** Ja of Nee: de waarde komt zo in het rapport, alleen het label volgt de taal. */
function jaNee(t: TFunction<"rapport">): Optie[] {
  return [
    { waarde: "Ja", label: t("algemeen.ja") },
    { waarde: "Nee", label: t("algemeen.nee") },
  ];
}

function materiaalKolommen(t: TFunction<"rapport">): Kolom<Materiaalregel>[] {
  return [
    { sleutel: "type", kop: t("uitgangspunten.materiaaltype"), breedte: "30%" },
    { sleutel: "soort", kop: t("uitgangspunten.sterkteklasse"), breedte: "24%" },
    { sleutel: "opmerking", kop: t("uitgangspunten.opmerking") },
  ];
}

function bevestigingKolommen(t: TFunction<"rapport">): Kolom<Bevestigingsregel>[] {
  return [
    { sleutel: "type", kop: t("uitgangspunten.bevestigingsmiddel"), breedte: "55%" },
    { sleutel: "kwaliteit", kop: t("uitgangspunten.kwaliteit") },
  ];
}

function conserveringKolommen(t: TFunction<"rapport">): Kolom<Conserveringsregel>[] {
  return [
    { sleutel: "onderdeel", kop: t("algemeen.onderdeel"), breedte: "45%" },
    { sleutel: "systeem", kop: t("uitgangspunten.systeem") },
  ];
}

/** De symbolen u_eind, u_bij en u_hor zijn die van de norm en blijven zoals ze zijn. */
function vervormingKolommen(t: TFunction<"rapport">): Kolom<Vervormingsregel>[] {
  return [
    { sleutel: "onderdeel", kop: t("algemeen.onderdeel") },
    { sleutel: "ueind", kop: <>u<sub>eind</sub></>, breedte: "7.5em" },
    { sleutel: "ubij", kop: <>u<sub>bij</sub></>, breedte: "7.5em" },
    { sleutel: "uhor", kop: <>u<sub>hor</sub></>, breedte: "7.5em" },
  ];
}

/** Tekstonderdelen van hoofdstuk 4 na de vervormingen. */
const SLOTTEKSTEN = ["montage", "rekenprogrammatuur", "temperatuur", "aardbeving"];

/**
 * Sectie Uitgangspunten (hoofdstuk 4). Invoer die alleen in het rapport
 * bestaat staat hier; CC, RC, ontwerplevensduur en wat daaruit volgt staan
 * grijs, want die komen uit de projectgegevens en de norm.
 */
export default function UitgangspuntenSectie() {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const u = rapport.uitgangspunten;
  const gegevens = useProjectStore((s) => s.gegevens);

  const cc = klasse(gegevens.CC, 2);
  const rc = klasse(gegevens.RC, 2);
  const jaren = getal(projectWaarde(gegevens, "DesignLife"));
  const bouwjaar = getal(u.bestaand.bouwjaar);
  const jaNeeOpties = jaNee(t);

  return (
    <Sectie
      id="uitgangspunten"
      titel={t("secties.uitgangspunten")}
      hoofdstuk="uitgangspunten"
      intro={t("uitgangspunten.intro")}
    >
      <div className="rapport-knoop">
        <Kop id="bouwwerk" />
        <Veld
          label={t("uitgangspunten.soortBouwwerk")}
          pad="uitgangspunten.soortBouwwerk"
          waarde={u.soortBouwwerk}
          lijst="rapport-soorten"
          hint={t("uitgangspunten.soortHint")}
        />
        <datalist id="rapport-soorten">
          {SOORTEN.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Afgeleid
          uitProjectgegevens
          regels={[
            { label: t("uitgangspunten.gevolgklasse"), waarde: `CC${cc}` },
            { label: t("uitgangspunten.betrouwbaarheidsklasse"), waarde: `RC${rc}` },
            {
              label: t("uitgangspunten.ontwerplevensduur"),
              waarde: Number.isFinite(jaren)
                ? t("uitgangspunten.levensduurWaarde", { jaren: fmt(jaren, 0), klasse: levensduurklasse(jaren) })
                : "—",
              bron: t("algemeen.tabel", { nummer: "NB.1–2.1" }),
            },
            {
              label: t("uitgangspunten.betrouwbaarheidsindex"),
              waarde: fmt(beta(rc), 1),
              bron: t("uitgangspunten.betaBron"),
            },
            { label: <>K<sub>FI</sub></>, waarde: fmt(kFiVoor(cc), 2), bron: t("algemeen.tabel", { nummer: "B3" }) },
            // De omschrijvingen van supervisie en inspectie komen uit de norm (normwaarden.ts) en blijven Nederlands.
            {
              label: t("uitgangspunten.supervisie"),
              waarde: ontwerpSupervisie(rc),
              bron: t("algemeen.tabel", { nummer: "B4" }),
            },
            {
              label: t("uitgangspunten.inspectieniveau"),
              waarde: inspectieniveau(rc),
              bron: t("algemeen.tabel", { nummer: "B5" }),
            },
          ]}
        />
      </div>

      <div className="rapport-knoop">
        <Kop id="brand" />
        <div className="rapport-rij">
          <Veld
            label={t("uitgangspunten.hoofddraagconstructie")}
            pad="uitgangspunten.brand.hoofddraagconstructie"
            waarde={u.brand.hoofddraagconstructie}
            eenheid="min"
          />
          <Veld
            label={t("uitgangspunten.brandscheiding")}
            pad="uitgangspunten.brand.brandscheiding"
            waarde={u.brand.brandscheiding}
            eenheid="min"
          />
          <Veld
            label={t("uitgangspunten.vluchtroute")}
            pad="uitgangspunten.brand.vluchtroute"
            waarde={u.brand.vluchtroute}
            eenheid="min"
          />
        </div>
        <Veld
          label={t("uitgangspunten.verwijzing")}
          pad="uitgangspunten.brand.verwijzing"
          waarde={u.brand.verwijzing}
          placeholder={t("uitgangspunten.verwijzingVoorbeeld")}
          hint={t("uitgangspunten.verwijzingHint")}
        />
      </div>

      <div className="rapport-knoop">
        <Kop id="materialen" />
        <RijenTabel<Materiaalregel>
          pad="uitgangspunten.materialen"
          rijen={u.materialen}
          kolommen={materiaalKolommen(t)}
          nieuweRij={() => ({ type: "", soort: "", opmerking: "" })}
          toevoegen={t("uitgangspunten.materiaalToevoegen")}
        />
        <Veld label={t("uitgangspunten.slotregel")} pad="uitgangspunten.materialenNoot" waarde={u.materialenNoot} />
        <h6 className="rapport-subkop">{t("uitgangspunten.bevestigingsmiddelen")}</h6>
        <RijenTabel<Bevestigingsregel>
          pad="uitgangspunten.bevestiging"
          rijen={u.bevestiging}
          kolommen={bevestigingKolommen(t)}
          nieuweRij={() => ({ type: "", kwaliteit: "" })}
          toevoegen={t("uitgangspunten.bevestigingToevoegen")}
        />
      </div>

      <div className="rapport-knoop">
        <Kop id="conservering" />
        <RijenTabel<Conserveringsregel>
          pad="uitgangspunten.conservering"
          rijen={u.conservering}
          kolommen={conserveringKolommen(t)}
          nieuweRij={() => ({ onderdeel: "", systeem: "" })}
          toevoegen={t("uitgangspunten.regelToevoegen")}
        />
        <label className="rapport-veld">
          <span className="rapport-label">{t("uitgangspunten.slotzin")}</span>
          <TekstVak pad="uitgangspunten.conserveringSlot" waarde={u.conserveringSlot} rijen={1} />
        </label>
      </div>

      <div className="rapport-knoop">
        <Kop id="factoren" />
        <p className="rapport-hint">{t("uitgangspunten.factorenHint", { cc })}</p>
      </div>

      <div className="rapport-knoop">
        <Kop id="bestaand-situatie" />
        <Vink
          label={t("uitgangspunten.bestaandOpnemen")}
          pad="uitgangspunten.bestaand.opnemen"
          aan={u.bestaand.opnemen}
          hint={t("uitgangspunten.bestaandHint")}
        />
        {u.bestaand.opnemen && (
          <>
            <div className="rapport-rij">
              <Veld
                label={t("uitgangspunten.bouwjaar")}
                pad="uitgangspunten.bestaand.bouwjaar"
                waarde={u.bestaand.bouwjaar}
                placeholder={t("uitgangspunten.bouwjaarVoorbeeld")}
              />
              <Veld
                label={t("uitgangspunten.bron")}
                pad="uitgangspunten.bestaand.bron"
                waarde={u.bestaand.bron}
                placeholder={t("uitgangspunten.bronVoorbeeld")}
              />
            </div>
            <Afgeleid
              regels={[
                {
                  label: t("uitgangspunten.normBouwjaar"),
                  waarde: Number.isFinite(bouwjaar) ? normVoorBouwjaar(bouwjaar) : t("uitgangspunten.bouwjaarInvullen"),
                },
              ]}
            />
            <div className="rapport-rij">
              <Keuze
                label={t("uitgangspunten.berekeningBeschikbaar")}
                pad="uitgangspunten.bestaand.berekeningBeschikbaar"
                waarde={u.bestaand.berekeningBeschikbaar}
                opties={jaNeeOpties}
              />
              <Keuze
                label={t("uitgangspunten.materiaalgegevensBeschikbaar")}
                pad="uitgangspunten.bestaand.materiaalgegevensBeschikbaar"
                waarde={u.bestaand.materiaalgegevensBeschikbaar}
                opties={jaNeeOpties}
              />
            </div>
          </>
        )}
      </div>

      <div className="rapport-knoop">
        <TekstVeld id="trillingen" kop={<Kop id="trillingen" />} />
      </div>

      <div className="rapport-knoop">
        <TekstVeld id="vervormingen" kop={<Kop id="vervormingen" />} hint={t("uitgangspunten.vervormingenHint")} />
        <RijenTabel<Vervormingsregel>
          pad="uitgangspunten.vervormingen"
          rijen={u.vervormingen}
          kolommen={vervormingKolommen(t)}
          nieuweRij={() => ({ onderdeel: "", ueind: "", ubij: "", uhor: "" })}
          toevoegen={t("uitgangspunten.eisToevoegen")}
        />
        <p className="rapport-hint">{t("uitgangspunten.eisUitleg")}</p>
      </div>

      {SLOTTEKSTEN.map((id) => (
        <div className="rapport-knoop" key={id}>
          <TekstVeld
            id={id}
            kop={<Kop id={id} />}
            hint={
              // Een opgeslagen rapport houdt zijn tekst; wijs op de vorige naam van het programma.
              id === "rekenprogrammatuur" && noemtVorigeProductnaam(rapport.teksten[id] ?? "")
                ? t("uitgangspunten.vorigeNaam", { naam: VORIGE_PRODUCTNAAM })
                : undefined
            }
          />
        </div>
      ))}
    </Sectie>
  );
}
