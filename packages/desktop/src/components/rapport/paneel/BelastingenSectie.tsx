import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { Belastingklasse, Windcoefficient } from "../../../rapport/model";
import {
  CATEGORIEEN,
  DAK_QK_DIRECT,
  PSI_WIND,
  SNEEUW,
  categorie,
  dakQk,
  fmt,
  getal,
  klasse,
  sneeuwPlatDak,
  windLabel,
  windQp,
} from "../../../rapport/normwaarden";
import { useProjectStore } from "../../../store/projectStore";
import { getalTekst, verplaatst } from "./hulp";
import OpbouwEditor from "./OpbouwEditor";
import RijenTabel, { type Kolom } from "./RijenTabel";
import TekstVeld from "./TekstVeld";
import { Afgeleid, Kop, Sectie, Veld, useRapport } from "./velden";

function windKolommen(t: TFunction<"rapport">): Kolom<Windcoefficient>[] {
  return [
    { sleutel: "omschrijving", kop: t("algemeen.omschrijving"), placeholder: t("belastingen.windVoorbeeld") },
    { sleutel: "c", kop: "c", breedte: "6em", getal: true },
  ];
}

/** Codes uit de projectgegevens → hoe de norm ze noemt (de terreincategorie als sleutel van het label). */
const GEBIED = { 1: "I", 2: "II", 3: "III" } as const;
const TERREIN = {
  1: "belastingen.terrein.zee",
  2: "belastingen.terrein.onbebouwd",
  3: "belastingen.terrein.bebouwd",
} as const;

const PSI = <>ψ<sub>0</sub> / ψ<sub>1</sub> / ψ<sub>2</sub></>;

/** "0,4 / 0,5 / 0,3" */
function psiTekst(psi: readonly number[]): string {
  return psi.map((p) => fmt(p, 1, true)).join(" / ");
}

const NIEUWE_KLASSE: Belastingklasse = {
  categorie: "A-vloer",
  lichteScheidingswanden: "",
  dakhelling: "",
  qlast: "",
};

/**
 * Sectie Belastingen (hoofdstuk 5): sneeuw, wind, regenwater, de
 * belastingklassen en de opbouwen van de blijvende belasting. Normwaarden
 * volgen uit de projectgegevens en worden hier alleen getoond.
 */
export default function BelastingenSectie() {
  const { t } = useTranslation("rapport");
  const b = useRapport().belastingen;
  const gegevens = useProjectStore((s) => s.gegevens);
  const werkBij = useProjectStore((s) => s.werkRapportBij);

  const wg = klasse(gegevens.windgebied, 2);
  const tc = klasse(gegevens.terreincategorie, 2);
  const h = getal(b.wind.gebouwhoogte);
  const hoogteBekend = Number.isFinite(h) && h > 0;
  // Zonder gebouwhoogte is er geen q_p, maar v_b,0, z_0 en z_min hangen
  // alleen van gebied en terrein af: die staan er dan al wel.
  const wind = windQp(wg, tc, hoogteBekend ? h : 0);
  const qp = hoogteBekend ? wind.qp : NaN;

  const wijzigKlassen = (fn: (lijst: Belastingklasse[]) => Belastingklasse[]) =>
    werkBij((r) => ({ ...r, belastingen: { ...r.belastingen, klassen: fn(r.belastingen.klassen) } }));

  return (
    <Sectie
      id="belastingen"
      titel={t("secties.belastingen")}
      hoofdstuk="belastingen"
      intro={t("belastingen.intro")}
    >
      <div className="rapport-knoop">
        <Kop id="sneeuw" />
        <Afgeleid
          regels={[
            {
              label: t("belastingen.platDak"),
              waarde: (
                <>
                  s = μ<sub>1</sub>·C<sub>e</sub>·C<sub>t</sub>·s<sub>k</sub> = {fmt(SNEEUW.mu1, 1)} ×{" "}
                  {fmt(SNEEUW.ce, 1)} × {fmt(SNEEUW.ct, 1)} × {fmt(SNEEUW.sk, 1)} ={" "}
                  {fmt(sneeuwPlatDak(), 2)} kN/m²
                </>
              ),
              bron: "NEN-EN 1991-1-3 (5.1)",
            },
          ]}
        />
        <TekstVeld id="sneeuw" hint={t("belastingen.sneeuwHint")} />
      </div>

      <div className="rapport-knoop">
        <Kop id="wind" />
        <Afgeleid
          uitProjectgegevens
          regels={[
            {
              label: t("belastingen.windgebied"),
              waarde: <>{GEBIED[wg]} — v<sub>b,0</sub> = {fmt(wind.vb0, 1)} m/s</>,
              bron: t("algemeen.tabel", { nummer: "NB.1" }),
            },
            {
              label: t("belastingen.terreincategorie"),
              waarde: t(TERREIN[tc]),
              bron: t("algemeen.tabel", { nummer: "NB.3–4.1" }),
            },
            // Zoals het in het rapport staat, dus Nederlands.
            { label: t("belastingen.omschrijving52"), waarde: windLabel(wg, tc) },
          ]}
        />
        <div className="rapport-rij">
          <Veld
            label={t("belastingen.gebouwhoogte")}
            pad="belastingen.wind.gebouwhoogte"
            waarde={b.wind.gebouwhoogte}
            eenheid="m"
            placeholder={t("belastingen.gebouwhoogteVoorbeeld")}
          />
          <Veld
            label={<>c<sub>s</sub>c<sub>d</sub></>}
            pad="belastingen.wind.cscd"
            waarde={b.wind.cscd}
            hint={t("belastingen.cscdHint")}
          />
        </div>
        <Afgeleid
          regels={[
            { label: <>z<sub>0</sub></>, waarde: `${fmt(wind.z0, 3, true)} m` },
            { label: <>z<sub>min</sub></>, waarde: `${fmt(wind.zmin, 0)} m` },
            {
              label: <>z<sub>e</sub></>,
              waarde: hoogteBekend ? `${fmt(wind.ze, 2, true)} m` : "—",
              bron: t("belastingen.zeBron"),
            },
            {
              label: <>q<sub>p</sub>(z<sub>e</sub>)</>,
              waarde: hoogteBekend ? `${fmt(qp, 2)} kN/m²` : t("belastingen.hoogteInvullen"),
              bron: "(4.8)",
            },
            { label: PSI, waarde: psiTekst(PSI_WIND), bron: t("algemeen.tabel", { nummer: "NB.2–A1.1" }) },
          ]}
        />
        <h6 className="rapport-subkop">{t("belastingen.coefficienten")}</h6>
        <RijenTabel<Windcoefficient>
          pad="belastingen.wind.coefficienten"
          rijen={b.wind.coefficienten}
          kolommen={windKolommen(t)}
          nieuweRij={() => ({ omschrijving: "", c: "" })}
          toevoegen={t("belastingen.coefficientToevoegen")}
          extra={[
            {
              kop: <>P<sub>rep</sub> [kN/m²]</>,
              breedte: "8em",
              waarde: (rij) => getalTekst(getal(rij.c) * qp, 2),
            },
          ]}
        />
        <p className="rapport-hint">
          P<sub>rep</sub> = c · q<sub>p</sub>; {t("belastingen.prepLeeg")}
        </p>
      </div>

      <div className="rapport-knoop">
        <TekstVeld id="regenwater" kop={<Kop id="regenwater" />} />
      </div>

      <div className="rapport-knoop">
        <Kop id="veranderlijk" />
        {b.klassen.length === 0 && <p className="rapport-hint">{t("belastingen.geenKlassen")}</p>}
        {b.klassen.map((k, i) => (
          <KlasseKaart key={i} regel={k} index={i} aantal={b.klassen.length} wijzig={wijzigKlassen} />
        ))}
        <button
          type="button"
          className="rapport-knop"
          onClick={() => wijzigKlassen((l) => [...l, { ...NIEUWE_KLASSE }])}
        >
          + {t("belastingen.klasseToevoegen")}
        </button>
      </div>

      <div className="rapport-knoop">
        <Kop id="blijvend" />
        <OpbouwEditor groep="vloerenDaken" titel={t("belastingen.vloerenDaken")} />
        <OpbouwEditor groep="wanden" titel={t("belastingen.wanden")} />
      </div>
    </Sectie>
  );
}

/**
 * Eén belastingklasse uit 5.4. Bij een vloer telt de toeslag voor lichte
 * scheidingswanden op bij q_k; bij een dak hangt q_k af van de dakhelling.
 */
function KlasseKaart({ regel, index, aantal, wijzig }: {
  regel: Belastingklasse;
  index: number;
  aantal: number;
  wijzig: (fn: (lijst: Belastingklasse[]) => Belastingklasse[]) => void;
}) {
  const { t } = useTranslation("rapport");
  const zet = useProjectStore((s) => s.zetRapportVeld);
  const pad = `belastingen.klassen.${index}`;
  const cat = categorie(regel.categorie);
  const ls = getal(regel.lichteScheidingswanden);
  const alfa = getal(regel.dakhelling);

  return (
    <div className="rapport-kaart">
      <div className="rapport-kaart-kop">
        <select
          value={regel.categorie}
          aria-label={t("belastingen.categorie")}
          onChange={(e) => zet(`${pad}.categorie`, e.target.value)}
        >
          {!cat && (
            <option value={regel.categorie}>{t("belastingen.onbekend", { waarde: regel.categorie || "—" })}</option>
          )}
          {/* De namen van de categorieën komen uit de norm (normwaarden.ts) en blijven Nederlands. */}
          <optgroup label={t("belastingen.vloeren")}>
            {CATEGORIEEN.filter((c) => c.soort === "vloer").map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("belastingen.daken")}>
            {CATEGORIEEN.filter((c) => c.soort === "dak").map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          type="button"
          className="rapport-icoon"
          title={t("algemeen.omhoog")}
          disabled={index === 0}
          onClick={() => wijzig((l) => verplaatst(l, index, -1))}
        >
          ↑
        </button>
        <button
          type="button"
          className="rapport-icoon"
          title={t("algemeen.omlaag")}
          disabled={index === aantal - 1}
          onClick={() => wijzig((l) => verplaatst(l, index, 1))}
        >
          ↓
        </button>
        <button
          type="button"
          className="rapport-icoon"
          title={t("belastingen.klasseVerwijderen")}
          onClick={() => wijzig((l) => l.filter((_, j) => j !== index))}
        >
          ✕
        </button>
      </div>

      {!cat && <p className="rapport-hint">{t("belastingen.onbekendeCategorie")}</p>}

      {cat?.soort === "vloer" && (
        <>
          <Veld
            label={t("belastingen.lichteScheidingswanden")}
            pad={`${pad}.lichteScheidingswanden`}
            waarde={regel.lichteScheidingswanden}
            eenheid="kN/m²"
            placeholder={t("belastingen.leegIsGeen")}
            hint={t("belastingen.lsHint")}
          />
          <Afgeleid
            regels={[
              {
                label: <>q<sub>k</sub></>,
                waarde: `${fmt(cat.qk, 2)} kN/m²`,
                bron: t("algemeen.tabel", { nummer: "NB.1–6.2" }),
              },
              {
                label: <>q<sub>k</sub> + L.S.</>,
                waarde: `${fmt(cat.qk + (Number.isFinite(ls) ? ls : 0), 2)} kN/m²`,
              },
              { label: <>Q<sub>k</sub></>, waarde: `${fmt(cat.Qk, 1)} kN` },
              { label: PSI, waarde: psiTekst(cat.psi), bron: t("algemeen.tabel", { nummer: "NB.2–A1.1" }) },
            ]}
          />
        </>
      )}

      {cat?.soort === "dak" && (
        <>
          <div className="rapport-rij">
            <Veld label={t("belastingen.dakhelling")} pad={`${pad}.dakhelling`} waarde={regel.dakhelling} eenheid="°" />
            <Veld label={t("belastingen.qlast")} pad={`${pad}.qlast`} waarde={regel.qlast} eenheid="kN/m¹" />
          </div>
          <Afgeleid
            regels={[
              {
                label: <>q<sub>k</sub> {t("belastingen.platDakKlein")}</>,
                waarde: `${fmt(cat.qk, 2)} kN/m²`,
                bron: t("algemeen.tabel", { nummer: "NB.4–6.10" }),
              },
              {
                label: <>q<sub>k</sub> {t("belastingen.bijAlfa")}</>,
                waarde: Number.isFinite(alfa) ? `${fmt(dakQk(alfa), 2)} kN/m²` : t("belastingen.dakhellingInvullen"),
              },
              {
                label: <>Q<sub>k</sub></>,
                waarde: t("belastingen.qkDirect", { qk: fmt(cat.Qk, 1), direct: fmt(DAK_QK_DIRECT, 1) }),
              },
              { label: PSI, waarde: psiTekst(cat.psi), bron: t("algemeen.tabel", { nummer: "NB.2–A1.1" }) },
            ]}
          />
        </>
      )}
    </div>
  );
}
