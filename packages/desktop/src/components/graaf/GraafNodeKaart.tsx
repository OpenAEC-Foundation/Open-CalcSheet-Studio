import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { uitkomstVerborgen, type GraafNode } from "../../graaf/model";
import { KOP_HOOGTE, MAX_LIJST_INGANGEN, RIJ_HOOGTE, nodeBreedte, nodeDef, nodeIcoon, veldSleutel, type PoortDef } from "../../graaf/nodes";
import type { NodeUitkomst } from "../../graaf/rekenen";
import { voorbeeldVan } from "../../graaf/voorbeeld";
import Icoon from "../Icoon";
import { groepKleur, waardeKleur } from "./graafKleur";
import { meldingTekst, poortTekst } from "./graafTeksten";

/*
 * Eén node op het vlak, in stijl A: een streepje en het icoon in de kleur van de
 * groep, de naam, het oogje; daaronder de poorten, de velden en het voorbeeld van
 * de uitkomst. De poorten staan op vaste rijen bovenaan, zodat de verbindingen
 * (GraafBladWeergave.tsx) hun plek weten zonder iets te meten.
 */

/** Een CSS-variabele op een element. */
const kleur = (naam: string, waarde: string | undefined) => (waarde ? ({ [naam]: waarde } as CSSProperties) : undefined);

export interface NodeActies {
  /** Slepen van de node. */
  beginSlepen: (e: ReactPointerEvent, node: GraafNode) => void;
  /** Een verbinding trekken vanaf een poort. */
  beginTrekken: (e: ReactPointerEvent, node: GraafNode, kant: "in" | "uit", naam: string) => void;
  zetVeld: (id: string, naam: string, waarde: string) => void;
  zetNaam: (id: string, naam: string) => void;
  wisselGeheel: (id: string, naam: string) => void;
  verwijder: (id: string) => void;
  /** Het oogje: de uitkomst van deze nodes tonen of verbergen. */
  zetVerborgen: (ids: string[], verborgen: boolean) => void;
  /** Getal: de schuif en min/max/stap open of dicht. */
  zetSchuif: (id: string, open: boolean) => void;
  /** Hernoemen beginnen (dubbelklik, F2, het menu) of stoppen (null). */
  hernoem: (id: string | null) => void;
}

/** Hier begint geen slepen: bediening, en het voorbeeld, waar je tekst uit kunt selecteren. */
const isBediening = (t: EventTarget | null) =>
  !!(t as HTMLElement | null)?.closest?.("input, textarea, button, select, [data-graaf-poort], .graaf-voorbeeld");

/** Een getal uit een veld; een onleesbaar veld valt terug op `anders`, zodat de schuif blijft werken. */
function getal(tekst: string | undefined, anders: number): number {
  const n = Number(String(tekst ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : anders;
}

/** De getal-node, compact: waarde en eenheid in de rij van de uitgang, met het knopje voor de schuif. */
function GetalRij({ node, zet, zetSchuif }: { node: GraafNode; zet: (naam: string, waarde: string) => void; zetSchuif: (open: boolean) => void }) {
  const { t } = useTranslation("werkruimte");
  const i = node.invoer ?? {};
  return (
    <div className="graaf-rij getal" style={{ height: RIJ_HOOGTE }}>
      <input className="graaf-veld" value={i.waarde ?? ""} onChange={(e) => zet("waarde", e.target.value)} aria-label={t("graaf.poort.waarde")} />
      <input className="graaf-veld graaf-eenheid" value={i.eenheid ?? ""} placeholder={t("graaf.getal.eenheid")} onChange={(e) => zet("eenheid", e.target.value)} aria-label={t("graaf.getal.eenheid")} />
      <button
        type="button"
        className="graaf-schuifknop"
        aria-expanded={!!node.schuif}
        title={t("graaf.getal.schuif")}
        aria-label={t("graaf.getal.schuif")}
        onClick={() => zetSchuif(!node.schuif)}
      >
        {node.schuif ? "▴" : "▾"}
      </button>
    </div>
  );
}

/** De schuif en min/max/stap van een getal, als het knopje open staat. */
function GetalSchuif({ node, zet }: { node: GraafNode; zet: (naam: string, waarde: string) => void }) {
  const { t } = useTranslation("werkruimte");
  const i = node.invoer ?? {};
  const min = getal(i.min, 0);
  const max = getal(i.max, 10);
  const stap = getal(i.stap, 0.1);
  return (
    <div className="graaf-velden">
      <input
        className="graaf-schuif"
        type="range"
        min={min}
        max={max}
        step={stap > 0 ? stap : "any"}
        value={getal(i.waarde, min)}
        onChange={(e) => zet("waarde", e.target.value)}
        aria-label={t("graaf.poort.waarde")}
      />
      <div className="graaf-velden-rij graaf-grenzen">
        {(["min", "max", "stap"] as const).map((n) => (
          <label key={n}>
            <span>{t(`graaf.getal.${n}`)}</span>
            <input className="graaf-veld" value={i[n] ?? ""} onChange={(e) => zet(n, e.target.value)} />
          </label>
        ))}
      </div>
    </div>
  );
}

/** Eén ingang: de poort, zijn naam en, zonder verbinding, zijn veld. */
function Ingang({ node, poort, verbonden, poortKleur, acties }: {
  node: GraafNode;
  poort: PoortDef;
  verbonden: boolean;
  /** De kleur van wat er binnenkomt. */
  poortKleur: string | undefined;
  acties: NodeActies;
}) {
  const { t } = useTranslation("werkruimte");
  const codeblok = node.soort === "codeblok";
  const metVeld = !verbonden && !poort.geenVeld && !poort.lijst;
  return (
    <div className={`graaf-rij${verbonden ? " verbonden" : ""}`} style={{ height: RIJ_HOOGTE }}>
      <span
        className="graaf-poort in"
        style={kleur("--poort", poortKleur)}
        data-graaf-poort="in"
        data-node={node.id}
        data-naam={poort.naam}
        onPointerDown={(e) => acties.beginTrekken(e, node, "in", poort.naam)}
      />
      <span className="graaf-poort-naam" title={poort.naam}>{poortTekst(t, node, poort.naam)}</span>
      {metVeld && (
        <input
          className="graaf-veld"
          value={node.invoer?.[veldSleutel(node, poort.naam)] ?? poort.standaard ?? ""}
          placeholder={t("graaf.veldLeeg")}
          onChange={(e) => acties.zetVeld(node.id, veldSleutel(node, poort.naam), e.target.value)}
          aria-label={poort.naam}
        />
      )}
      {codeblok && (
        <button
          type="button"
          className={`graaf-geheel${poort.lijst ? " aan" : ""}`}
          title={t(poort.lijst ? "graaf.geheelAan" : "graaf.geheelUit")}
          aria-pressed={!!poort.lijst}
          onClick={() => acties.wisselGeheel(node.id, poort.naam)}
        >
          {"[ ]"}
        </button>
      )}
    </div>
  );
}

export const GraafNodeKaart = memo(function GraafNodeKaart({ node, x, y, naam, uitkomst, verbonden, gekozen, hernoemt, acties }: {
  node: GraafNode;
  /** De plek op het vlak, ook tijdens het slepen. */
  x: number;
  y: number;
  naam: string;
  uitkomst: NodeUitkomst | undefined;
  /**
   * De ingangen met een verbinding, als regels `naam` of `naam\tkleur` (de kleur van wat
   * er binnenkomt): een tekst blijft gelijk voor memo.
   */
  verbonden: string;
  gekozen: boolean;
  /** De naam staat in bewerking. */
  hernoemt: boolean;
  acties: NodeActies;
}) {
  const { t } = useTranslation("werkruimte");
  const poorten = uitkomst?.poorten ?? { ingangen: [], uitgangen: [] };
  const opIngang = new Map((verbonden ? verbonden.split("\n") : []).map((r) => r.split("\t") as [string, string | undefined]));
  const rijen = Math.max(poorten.ingangen.length, poorten.uitgangen.length);
  const fouten = uitkomst?.fouten ?? [];
  const meldingen = uitkomst?.meldingen ?? [];
  const verborgen = uitkomstVerborgen(node);
  const voorbeeld = !verborgen && (fouten.length === 0 || node.soort === "codeblok") ? voorbeeldVan(uitkomst) : null;
  const def = nodeDef(node.soort);
  const bekend = !!def;
  const zet = (veld: string, waarde: string) => acties.zetVeld(node.id, veld, waarde);
  const code = node.invoer?.code ?? "";
  const soortNaam = t(`graaf.soort.${node.soort}`);

  return (
    <div
      className={`graaf-node graaf-soort-${node.soort}${gekozen ? " gekozen" : ""}${fouten.length > 0 ? " fout" : ""}${node.uit ? " uit" : ""}`}
      style={{ left: x, top: y, width: nodeBreedte(node), ...kleur("--groep", def ? groepKleur(def.groep) : undefined) }}
      data-graaf-node={node.id}
      onPointerDown={(e) => {
        if (e.button === 0 && !isBediening(e.target)) acties.beginSlepen(e, node);
      }}
    >
      <div className="graaf-node-kop" style={{ height: KOP_HOOGTE }}>
        <span className="graaf-node-icoon" aria-hidden="true">
          <Icoon id={nodeIcoon(node.soort)} uit="graaf" />
        </span>
        {hernoemt ? (
          <input
            className="graaf-veld"
            autoFocus
            defaultValue={node.naam ?? ""}
            placeholder={naam}
            onBlur={(e) => {
              acties.zetNaam(node.id, e.target.value);
              acties.hernoem(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") acties.hernoem(null);
            }}
          />
        ) : (
          <span className="graaf-node-namen" title={t("graaf.hernoemen")} onDoubleClick={() => acties.hernoem(node.id)}>
            <span className="graaf-node-titel">{naam}</span>
            {naam !== soortNaam && <span className="graaf-node-soort">{soortNaam}</span>}
          </span>
        )}
        {node.soort !== "bekijken" && (
          <button
            type="button"
            className={`graaf-oog${verborgen ? "" : " aan"}`}
            aria-pressed={!verborgen}
            title={t(verborgen ? "graaf.uitkomstTonen" : "graaf.uitkomstVerbergen")}
            aria-label={t(verborgen ? "graaf.uitkomstTonen" : "graaf.uitkomstVerbergen")}
            onClick={() => acties.zetVerborgen([node.id], !verborgen)}
          >
            <Icoon id={verborgen ? "object.hide" : "object.show"} uit="graaf" />
          </button>
        )}
      </div>

      {rijen > 0 && (
        <div className="graaf-poorten">
          <div className="graaf-kolom">
            {node.soort === "getal" && <GetalRij node={node} zet={zet} zetSchuif={(open) => acties.zetSchuif(node.id, open)} />}
            {poorten.ingangen.map((p) => (
              <Ingang key={p.naam} node={node} poort={p} verbonden={opIngang.has(p.naam)} poortKleur={opIngang.get(p.naam) || undefined} acties={acties} />
            ))}
          </div>
          <div className="graaf-kolom uit">
            {poorten.uitgangen.map((u) => (
              <div key={u} className="graaf-rij uit" style={{ height: RIJ_HOOGTE }}>
                {node.soort !== "getal" && <span className="graaf-poort-naam" title={u}>{poortTekst(t, node, u)}</span>}
                <span
                  className="graaf-poort uit"
                  style={kleur("--poort", waardeKleur(uitkomst?.waarden[u]))}
                  data-graaf-poort="uit"
                  data-node={node.id}
                  data-naam={u}
                  onPointerDown={(e) => acties.beginTrekken(e, node, "uit", u)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {node.soort === "getal" && node.schuif && <GetalSchuif node={node} zet={zet} />}
      {node.soort === "waarOnwaar" && (
        <div className="graaf-velden">
          <label className="graaf-keuze">
            <input type="checkbox" checked={node.invoer?.waarde !== "false"} onChange={(e) => zet("waarde", String(e.target.checked))} />
            {t(node.invoer?.waarde !== "false" ? "graaf.waar" : "graaf.onwaar")}
          </label>
        </div>
      )}
      {node.soort === "lijstMaken" && (
        <div className="graaf-velden">
          <label className="graaf-keuze">
            {t("graaf.aantalIngangen")}
            <input className="graaf-veld" type="number" min={1} max={MAX_LIJST_INGANGEN} value={node.invoer?.aantal ?? "3"} onChange={(e) => zet("aantal", e.target.value)} />
          </label>
        </div>
      )}
      {node.soort === "ingelezen" && node.invoer?.code && (
        <div className="graaf-velden">
          <textarea className="graaf-tekst graaf-code" readOnly spellCheck={false} rows={Math.min(8, node.invoer.code.split("\n").length + 1)} value={node.invoer.code} aria-label={t("graaf.soort.ingelezen")} />
        </div>
      )}
      {node.soort === "tekst" && (
        <div className="graaf-velden">
          <textarea className="graaf-tekst" rows={2} value={node.invoer?.tekst ?? ""} onChange={(e) => zet("tekst", e.target.value)} aria-label={t("graaf.poort.tekst")} />
        </div>
      )}
      {node.soort === "codeblok" && (
        <div className="graaf-velden">
          <textarea
            className="graaf-tekst graaf-code"
            spellCheck={false}
            rows={Math.min(16, Math.max(3, code.split("\n").length + 1))}
            value={code}
            onChange={(e) => zet("code", e.target.value)}
            aria-label={t("graaf.soort.codeblok")}
          />
        </div>
      )}

      {(fouten.length > 0 || meldingen.length > 0 || (voorbeeld && voorbeeld.regels.length > 0)) && (
        <div className={`graaf-voorbeeld${node.soort === "bekijken" ? " groot" : ""}`}>
          {fouten.map((f, i) => <div key={i} className="graaf-melding fout">{meldingTekst(t, f, node)}</div>)}
          {meldingen.map((f, i) => <div key={i} className="graaf-melding">{meldingTekst(t, f, node)}</div>)}
          {voorbeeld?.aantal !== undefined && <div className="graaf-lijstkop">{t("graaf.lijst", { count: voorbeeld.aantal })}</div>}
          {voorbeeld?.regels.map((r, i) => (
            <div key={i} className="graaf-regel">
              {r.label && <span className="graaf-regel-label">{r.label}</span>}
              <span className="graaf-regel-tekst">{r.tekst}</span>
            </div>
          ))}
          {!!voorbeeld?.rest && <div className="graaf-lijstkop">{t("graaf.meer", { count: voorbeeld.rest })}</div>}
        </div>
      )}
      {!bekend && <div className="graaf-voorbeeld"><div className="graaf-melding fout">{t("graaf.onbekend")}</div></div>}
    </div>
  );
});
