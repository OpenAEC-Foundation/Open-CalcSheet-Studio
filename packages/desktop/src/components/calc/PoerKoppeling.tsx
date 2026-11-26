import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActiefExemplaar, useAlleenLezen } from "../../store/actiefBlad";
import { useProjectStore } from "../../store/projectStore";
import { templates } from "../../templates";
import type { PoerVorm } from "./poerDxf";
import { huidigeRevisie, leesRevisie, revisieInhoud, vandaag, vastleggen, type Revisie, type Wijziging } from "./poerRevisie";
import { koppelingVoorIfcx, leesKoppeling, leesPalenplan, vergelijkMetPlan, PLAN_VELD, type Palenplan, type PlanMelding, type PlanPoer } from "./palenplan";
import { moduleNaam } from "./moduleNaam";

/**
 * De koppeling van een poerblad met een palenplan en de revisies van zijn detail
 * (palenplan.ts, poerRevisie.ts). Alleen op het scherm.
 *
 * `usePoerRevisie` geeft het revisienummer van de poer zoals hij nu is, de tekst voor de
 * titel van de tekening, en `vastleggen` voor het opslaan van het DXF-detail of de IFCX.
 * `PoerKoppeling` toont de revisie met wat er veranderde, de vaste id van de poer, en leest
 * een palenplan: de poeren daarin gaan in dit blad of als nieuw blad, en een gekoppeld blad
 * ziet wat er in het plan veranderde.
 */
export function usePoerRevisie(vorm: PoerVorm | null) {
  const exemplaar = useActiefExemplaar();
  const alleenLezen = useAlleenLezen();
  const zetWaarden = useProjectStore((s) => s.zetWaarden);
  const { t } = useTranslation("beelden");
  const waarden = exemplaar?.waarden ?? {};
  const stand = leesRevisie(waarden);
  const inhoud = vorm ? revisieInhoud(vorm) : {};
  const revisie: Revisie = huidigeRevisie(stand, inhoud);
  return {
    revisie,
    label: t("poerKoppeling.revisieTitel", { nr: revisie.nr }),
    koppeling: koppelingVoorIfcx(waarden, revisie.nr),
    vastleggen: () => {
      if (alleenLezen || !exemplaar || !vorm) return;
      const w = vastleggen(stand, inhoud, vandaag());
      if (w) zetWaarden(exemplaar.id, w);
    },
  };
}

const GETOOND = 14;

export default function PoerKoppeling({ templateId, vorm }: { templateId: "tweepaalspoer" | "meerpaalspoer"; vorm: PoerVorm }) {
  const { t, i18n } = useTranslation("beelden");
  const exemplaar = useActiefExemplaar();
  const alleenLezen = useAlleenLezen();
  const zetWaarden = useProjectStore((s) => s.zetWaarden);
  const { revisie, vastleggen } = usePoerRevisie(vorm);
  const [plan, setPlan] = useState<Palenplan | null>(null);
  const [bestand, setBestand] = useState("");
  const [fout, setFout] = useState("");
  const invoer = useRef<HTMLInputElement>(null);
  if (alleenLezen || !exemplaar) return null;

  const waarden = exemplaar.waarden;
  const koppeling = leesKoppeling(waarden);
  const datum = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language) : "");
  const melding = (m: PlanMelding) => (m.code === "ifcx" ? m.tekst ?? "" : t(`poerKoppeling.meldingen.${m.code}`, { n: m.n, id: m.id }));
  const naamVan = (sleutel: string) => {
    const [kop, ...rest] = sleutel.split(" ");
    const vertaald = t(`poerKoppeling.sleutels.${kop}`, { defaultValue: "" });
    return vertaald ? [vertaald, ...rest].join(" ") : sleutel;
  };
  const veldNaam = (naam: string) => t(`poerKoppeling.velden.${naam}`, { defaultValue: naam });
  const wijziging = (w: Wijziging) => (
    <li key={w.sleutel}>
      <b>{naamVan(w.sleutel)}</b>: {w.oud ?? t("poerKoppeling.nieuw")} → {w.nieuw ?? t("poerKoppeling.vervallen")}
    </li>
  );

  const lees = async (bestanden: FileList | null) => {
    const f = bestanden?.[0];
    if (!f) return;
    setFout("");
    try {
      const doc = JSON.parse(await f.text()) as unknown;
      setPlan(leesPalenplan(doc));
      setBestand(f.name);
    } catch (err) {
      setPlan(null);
      setFout(t("poerKoppeling.fout", { fout: (err as Error).message }));
    }
    if (invoer.current) invoer.current.value = "";
  };
  const metBron = (p: PlanPoer) => ({ ...p.waarden, [PLAN_VELD.bron]: bestand });
  const inDitBlad = (p: PlanPoer) => zetWaarden(exemplaar.id, metBron(p));
  const alsNieuwBlad = (p: PlanPoer) => {
    if (!p.templateId) return;
    const bron = templates[p.templateId];
    if (!bron) return;
    const store = useProjectStore.getState();
    const naam = `${(moduleNaam(p.templateId) ?? p.templateId).replace(/\s*\([^)]*\)\s*$/, "").trim()} ${p.id}`;
    const id = store.voegToe(p.templateId, naam, bron);
    store.zetWaarden(id, metBron(p));
  };

  const gekoppeld = koppeling.poerId ? plan?.poeren.find((p) => p.id === koppeling.poerId) ?? null : null;
  const verschillen = gekoppeld ? vergelijkMetPlan(waarden, gekoppeld) : [];
  const lijst = revisie.wijzigingen;

  return (
    <div className="poer-koppeling" style={{ padding: "6px 16px 10px", fontSize: 12, flex: "none" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{t("poerKoppeling.kop")}</div>

      <div data-revisie={revisie.nr} data-vastgelegd={revisie.vastgelegd ? 1 : 0}>
        {revisie.vastgelegd
          ? t("poerKoppeling.revisieVast", { nr: revisie.nr, datum: datum(revisie.datum) })
          : t("poerKoppeling.revisieNieuw", { nr: revisie.nr })}
        {" "}
        <button type="button" className="settings-btn settings-btn-secondary" disabled={revisie.vastgelegd} onClick={vastleggen}>
          {t("poerKoppeling.vastleggen")}
        </button>
      </div>
      {revisie.sinds > 0 && lijst.length > 0 && (
        <div style={{ marginTop: 3 }}>
          {revisie.vastgelegd ? t("poerKoppeling.inRevisie", { nr: revisie.sinds }) : t("poerKoppeling.sinds", { nr: revisie.sinds })}
          <ul className="poer-wijzigingen" style={{ margin: "2px 0 0 16px", padding: 0 }}>
            {lijst.slice(0, GETOOND).map(wijziging)}
            {lijst.length > GETOOND && <li>{t("poerKoppeling.meer", { n: lijst.length - GETOOND })}</li>}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        {koppeling.poerId
          ? <>{t("poerKoppeling.poerId", { id: koppeling.poerId })}{waarden[PLAN_VELD.bron] ? ` ${t("poerKoppeling.bron", { bestand: waarden[PLAN_VELD.bron] })}` : ""}</>
          : t("poerKoppeling.poerIdLos")}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 6 }}>
        <button type="button" className="settings-btn settings-btn-secondary" onClick={() => invoer.current?.click()}>{t("poerKoppeling.inlezen")}</button>
        <input ref={invoer} type="file" accept=".ifcx,.json,application/json" style={{ display: "none" }} onChange={(e) => void lees(e.target.files)} />
        {plan && <span>{t("poerKoppeling.gelezen", { bestand, n: plan.poeren.length })}</span>}
      </div>
      {fout && <div style={{ color: "#b91c1c", marginTop: 4 }}>{fout}</div>}
      {plan && plan.meldingen.length > 0 && <ul style={{ margin: "2px 0 0 16px", padding: 0, color: "#b45309" }}>{plan.meldingen.map((m, i) => <li key={i}>{melding(m)}</li>)}</ul>}

      {koppeling.poerId && plan && !gekoppeld && <div style={{ color: "#b45309", marginTop: 4 }}>{t("poerKoppeling.nietInPlan", { id: koppeling.poerId })}</div>}
      {gekoppeld && (verschillen.length === 0
        ? <div style={{ marginTop: 4 }}>{t("poerKoppeling.gelijk")}</div>
        : (
          <div style={{ marginTop: 4 }} data-verschillen={verschillen.length}>
            {t("poerKoppeling.verschillen")}
            <ul style={{ margin: "2px 0 0 16px", padding: 0 }}>
              {verschillen.map((v) => (
                <li key={v.naam}><b>{veldNaam(v.naam)}</b>: {v.blad || "—"} → {v.plan} <span style={{ color: "#64748b" }}>({v.inPlan ? t("poerKoppeling.inPlanVeranderd") : t("poerKoppeling.inBladVeranderd")})</span></li>
              ))}
            </ul>
            <button type="button" className="settings-btn settings-btn-secondary" onClick={() => inDitBlad(gekoppeld)}>{t("poerKoppeling.overnemen")}</button>
          </div>
        ))}

      {plan && plan.poeren.length > 0 && (
        <table style={{ borderCollapse: "collapse", marginTop: 6 }}>
          <tbody>
            {plan.poeren.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                <td style={{ padding: "2px 6px", fontWeight: 700 }}>{p.id}</td>
                <td style={{ padding: "2px 6px" }}>{t("poerKoppeling.palen", { n: p.palen.length })}</td>
                <td style={{ padding: "2px 6px" }}>
                  {p.templateId === templateId && <button type="button" className="settings-btn settings-btn-secondary" onClick={() => inDitBlad(p)}>{t("poerKoppeling.inDitBlad")}</button>}
                  {" "}
                  {p.templateId && <button type="button" className="settings-btn settings-btn-secondary" onClick={() => alsNieuwBlad(p)}>{t("poerKoppeling.alsNieuwBlad")}</button>}
                  {!p.templateId && <span style={{ color: "#b45309" }}>{t("poerKoppeling.geenBlad")}</span>}
                  {p.meldingen.length > 0 && <ul style={{ margin: "2px 0 0 16px", padding: 0, color: "#b45309" }}>{p.meldingen.map((m, i) => <li key={i}>{melding(m)}</li>)}</ul>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="gd-note" style={{ marginTop: 6 }}>{t("poerKoppeling.uitleg")}</div>
    </div>
  );
}
