import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ThemedSelect from "../../ThemedSelect";
import {
  CATEGORIEEN,
  LEGE_INVOER,
  maakRegel,
  TOESTANDEN,
  type Categorie,
  type Gewichtregel,
  type RegelInvoer,
  type Toestand,
} from "../../../rapport/gewichtenBibliotheek";

type Tekstveld = Exclude<keyof RegelInvoer, "categorie" | "rhoEenheid" | "pEenheid" | "toestand">;

/**
 * Een regel toevoegen aan de eigen bibliotheek. Dezelfde eisen als aan een bestand: een naam, een
 * waarde en een bron. Een waarde uit een leveranciersblad kan in kg; die gaat om naar kN en de
 * omrekening komt in de opmerking.
 */
export default function RegelFormulier({ bestaand, opBewaar, opAnnuleer }: {
  bestaand: ReadonlySet<string>;
  opBewaar: (r: Gewichtregel) => void;
  opAnnuleer: () => void;
}) {
  const { t } = useTranslation("gewichten");
  const [invoer, setInvoer] = useState<RegelInvoer>(LEGE_INVOER);
  const [foutVeld, setFoutVeld] = useState<string | null>(null);
  const zet = <K extends keyof RegelInvoer>(k: K, v: RegelInvoer[K]) => setInvoer((i) => ({ ...i, [k]: v }));

  const categorieen = useMemo(() => CATEGORIEEN.map((c) => ({ value: c, label: t(`categorie.${c}`) })), [t]);
  const toestanden = useMemo(
    () => [{ value: "", label: t("toestand.onbekend") }, ...TOESTANDEN.map((s) => ({ value: s, label: t(`toestand.${s}`) }))],
    [t],
  );

  const veld = (k: Tekstveld, label: string, placeholder?: string) => (
    <label className="gew-veld">
      <span>{label}</span>
      <input
        className="settings-input"
        type="text"
        value={invoer[k]}
        placeholder={placeholder}
        onChange={(e) => zet(k, e.target.value)}
      />
    </label>
  );

  const bewaar = () => {
    const u = maakRegel(invoer, bestaand);
    if (u.regel) opBewaar(u.regel);
    else setFoutVeld(u.veld);
  };

  // Geen formulierelement: de knoppen van ThemedSelect hebben geen type en zouden het versturen.
  return (
    <div
      className="gew-formulier"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          bewaar();
        }
      }}
    >
      <div className="gew-formulier-raster">
        {veld("naamEn", t("formulier.naamEn"))}
        {veld("naamNl", t("formulier.naamNl"))}
        <div className="gew-veld">
          <span>{t("filter.categorie")}</span>
          <ThemedSelect value={invoer.categorie} options={categorieen} onChange={(v) => zet("categorie", v as Categorie)} />
        </div>
        <div className="gew-veld">
          <span>{t("formulier.toestand")}</span>
          <ThemedSelect value={invoer.toestand} options={toestanden} onChange={(v) => zet("toestand", v as "" | Toestand)} />
        </div>
        {veld("d", t("kolom.d"))}
        <div className="gew-veld-met-eenheid">
          {veld("rho", t("formulier.rho"))}
          <ThemedSelect
            value={invoer.rhoEenheid}
            options={[{ value: "kN/m3", label: "kN/m³" }, { value: "kg/m3", label: "kg/m³" }]}
            onChange={(v) => zet("rhoEenheid", v as RegelInvoer["rhoEenheid"])}
          />
        </div>
        <div className="gew-veld-met-eenheid">
          {veld("p", t("formulier.p"))}
          <ThemedSelect
            value={invoer.pEenheid}
            options={[{ value: "kN/m2", label: "kN/m²" }, { value: "kg/m2", label: "kg/m²" }]}
            onChange={(v) => zet("pEenheid", v as RegelInvoer["pEenheid"])}
          />
        </div>
        {veld("leverancier", t("filter.leverancier"))}
        {veld("regio", t("filter.regio"), t("formulier.regioVoorbeeld"))}
        {veld("opmerkingEn", t("formulier.opmerkingEn"))}
        {veld("opmerkingNl", t("formulier.opmerkingNl"))}
        {veld("bronTitel", t("formulier.bronTitel"))}
        {veld("bronUrl", t("formulier.bronUrl"), "https://")}
        {veld("bronDatum", t("formulier.bronDatum"), t("formulier.datumVoorbeeld"))}
      </div>
      <div className="gew-formulier-voet">
        {foutVeld && <span className="gew-fout" role="alert">{t(`formulierFout.${foutVeld.replace(".", "_")}`)}</span>}
        <button type="button" className="settings-btn settings-btn-secondary" onClick={opAnnuleer}>{t("annuleren")}</button>
        <button type="button" className="settings-btn settings-btn-primary" onClick={bewaar}>{t("formulier.toevoegen")}</button>
      </div>
    </div>
  );
}
