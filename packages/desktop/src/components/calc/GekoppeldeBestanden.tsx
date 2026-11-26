import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../Modal";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { usePrintStore } from "../../store/printStore";
import { isGekoppeld, meldingVoor, naamVan } from "../../store/koppeling";
import { useKoppelingStatus } from "../../store/koppelingStatus";
import { leesBereik, plekVoor, verwijzingTekst, type GelezenBereik } from "../../store/werkmapBereik";
import { usePapier } from "./afdrukTaal";
import { includeBewaakSleutel, werkIncludeTabelBij } from "./includeBestanden";
import {
  bewaarSjabloon, bladVoorBereik, controleerVoorAfdruk, isTauri, leesOpnieuw, meldingenTekst, useKoppelVenster,
  voegBereikenToe, wachter, WACHT_MS, type GekozenWerkmap,
} from "./koppelingen";
import "./GekoppeldeBestanden.css";

/*
 * Gekoppelde bestanden op het scherm (zie store/koppeling.ts en koppelingen.ts):
 * de wachter die de bronnen bewaakt, de vensters voor een werkmapbereik en een
 * sjabloon, de regel boven een gekoppeld blad en de melding op papier.
 */

/** Wat bepaalt welke bronnen er te bewaken zijn: het projectbestand en de koppelingen. */
function bewaakSleutel(s: { bestandspad: string | null; exemplaren: Exemplaar[] }): string {
  return [s.bestandspad ?? "", includeBewaakSleutel(s.exemplaren), ...s.exemplaren.filter((e) => isGekoppeld(e.md)).map((e) => `${e.id}|${e.md?.koppeling?.pad}|${e.md?.koppeling?.verwijzing ?? ""}`)].join("\n");
}

/**
 * Zet de wachter aan en tekent de vensters. Eén keer in App, naast de andere
 * houders: zo komt er in App zelf geen haak bij.
 */
export default function GekoppeldeBestanden() {
  useEffect(() => {
    // De tabel voor #include volgt de bladen meteen: een geopend project rekent zo al
    // met zijn bewaarde kopieën, vóór de eerste lezing (includeBestanden.ts).
    werkIncludeTabelBij();
    const tabel = useProjectStore.subscribe((s, vorige) => {
      if (s.exemplaren !== vorige.exemplaren) werkIncludeTabelBij(s.exemplaren);
    });
    void wachter.nu();
    let sleutel = bewaakSleutel(useProjectStore.getState());
    const project = useProjectStore.subscribe((s) => {
      const nieuw = bewaakSleutel(s);
      if (nieuw === sleutel) return;
      sleutel = nieuw;
      void wachter.nu();
    });
    // Vóór het afdrukvoorbeeld en het afdrukken eerst de bronnen lezen.
    const afdruk = usePrintStore.subscribe((s, vorige) => {
      if ((s.voorbeeld && !vorige.voorbeeld) || (s.bezig && !vorige.bezig)) void controleerVoorAfdruk();
    });
    const focus = () => void wachter.nu();
    window.addEventListener("focus", focus);
    if (isTauri()) wachter.start(WACHT_MS);
    return () => {
      tabel();
      project();
      afdruk();
      window.removeEventListener("focus", focus);
      wachter.stop();
    };
  }, []);
  const bereik = useKoppelVenster((s) => s.bereik);
  const sjabloon = useKoppelVenster((s) => s.sjabloon);
  return (
    <>
      {bereik && <BereikVenster werkmap={bereik} />}
      {sjabloon && <SjabloonVenster />}
    </>
  );
}

// ── Vensters ──────────────────────────────────────────────────────────────────

const VOORBEELD_RIJEN = 8;

/** De eerste rijen van een gelezen bereik, of waarom het niet gelezen kon worden. */
function BereikVoorbeeld({ bereik }: { bereik: GelezenBereik }) {
  const { t } = useTranslation("werkruimte");
  const tr = usePapier();
  if (!bereik.ok) return <p className="koppel-fout">{tr(`koppeling.reden.${bereik.reden}`, { detail: bereik.detail ?? "" })}</p>;
  if (bereik.rijen.length === 0) return <p className="koppel-fout">{t("koppeling.bereikLeeg")}</p>;
  return (
    <div className="koppel-voorbeeld">
      <table>
        <tbody>
          {bereik.rijen.slice(0, VOORBEELD_RIJEN).map((rij, i) => (
            <tr key={i}>{rij.map((c, k) => (i === 0 ? <th key={k}>{c}</th> : <td key={k} className={bereik.getallen[i]?.[k] ? "getal" : undefined}>{c}</td>))}</tr>
          ))}
        </tbody>
      </table>
      <p className="koppel-uitleg">{t("koppeling.bereikMaat", { blad: bereik.blad, cellen: bereik.a1, count: bereik.rijen.length })}</p>
    </div>
  );
}

/** Een bereik kiezen uit een geopende werkmap: op naam, of werkblad en cellen. */
function BereikVenster({ werkmap }: { werkmap: GekozenWerkmap }) {
  const { t } = useTranslation("werkruimte");
  const sluit = useKoppelVenster((s) => s.sluit);
  const [opNaam, setOpNaam] = useState(werkmap.namen.length > 0);
  const [naam, setNaam] = useState(werkmap.namen[0] ?? "");
  const [blad, setBlad] = useState(werkmap.bladen[0] ?? "");
  const [cellen, setCellen] = useState("A1:D10");
  const [bladnaam, setBladnaam] = useState("");
  const verwijzing = opNaam ? naam : verwijzingTekst({ soort: "cellen", blad, a1: cellen.replace(/\$/g, "").trim().toUpperCase() });
  const bereik = useMemo(() => leesBereik(werkmap.wb, verwijzing), [werkmap, verwijzing]);
  const voegIn = () => {
    if (!bereik.ok) return;
    voegBereikenToe([{ naam: bladnaam.trim() || (opNaam ? naam : `${blad} ${bereik.a1}`), md: bladVoorBereik(werkmap, verwijzing, bereik) }]);
    sluit();
  };
  return (
    <Modal
      open
      onClose={sluit}
      title={t("koppeling.bereikTitel")}
      width={560}
      footer={
        <>
          <button className="var-knop hoofd" disabled={!bereik.ok || bereik.rijen.length === 0} onClick={voegIn}>{t("koppeling.invoegen")}</button>
          <button className="var-knop" onClick={sluit}>{t("koppeling.annuleren")}</button>
        </>
      }
    >
      <div className="koppel-venster">
        <p className="koppel-uitleg" title={werkmap.bron.pad}>{t("koppeling.werkmap", { naam: naamVan(werkmap.bron.pad) })}</p>
        <label className="koppel-regel">
          <input type="radio" checked={opNaam} disabled={werkmap.namen.length === 0} onChange={() => setOpNaam(true)} />
          <span>{t("koppeling.opNaam")}</span>
          <select value={naam} disabled={!opNaam} onChange={(e) => setNaam(e.target.value)}>
            {werkmap.namen.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {werkmap.namen.length === 0 && <p className="koppel-uitleg">{t("koppeling.geenNamen")}</p>}
        <label className="koppel-regel">
          <input type="radio" checked={!opNaam} onChange={() => setOpNaam(false)} />
          <span>{t("koppeling.opCellen")}</span>
          <select value={blad} disabled={opNaam} onChange={(e) => setBlad(e.target.value)}>
            {werkmap.bladen.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <input className="koppel-cellen" value={cellen} disabled={opNaam} onChange={(e) => setCellen(e.target.value)} aria-label={t("koppeling.cellen")} />
        </label>
        <label className="koppel-regel">
          <span>{t("koppeling.bladnaam")}</span>
          <input value={bladnaam} placeholder={opNaam ? naam : blad} onChange={(e) => setBladnaam(e.target.value)} />
        </label>
        <BereikVoorbeeld bereik={bereik} />
        <p className="koppel-uitleg">{t(opNaam ? "koppeling.uitlegNaam" : "koppeling.uitlegCellen")}</p>
      </div>
    </Modal>
  );
}

/** Een sjabloon toepassen: per onderdeel wat de gekozen werkmap heeft, aan of uit te vinken. */
function SjabloonVenster() {
  const { t } = useTranslation("werkruimte");
  const tr = usePapier();
  const sluit = useKoppelVenster((s) => s.sluit);
  const sjabloon = useKoppelVenster((s) => s.sjabloon)!;
  const [aan, setAan] = useState(() => new Set(sjabloon.onderdelen.flatMap((o, i) => (o.bereik.ok ? [i] : []))));
  const zet = (i: number, ja: boolean) => setAan((s) => {
    const n = new Set(s);
    if (ja) n.add(i);
    else n.delete(i);
    return n;
  });
  const voegToe = () => {
    const namen = useProjectStore.getState().exemplaren.map((e) => e.naam);
    const bladen: { naam: string; md: ReturnType<typeof bladVoorBereik>; plek: number }[] = [];
    sjabloon.onderdelen.forEach(({ onderdeel, bereik }, i) => {
      if (!aan.has(i) || !bereik.ok) return;
      const plek = plekVoor(onderdeel, namen);
      namen.splice(plek, 0, onderdeel.naam);
      bladen.push({ naam: onderdeel.naam, md: bladVoorBereik(sjabloon.werkmap, onderdeel.verwijzing, bereik), plek });
    });
    voegBereikenToe(bladen);
    sluit();
  };
  const ontbreekt = sjabloon.onderdelen.filter((o) => !o.bereik.ok).length;
  return (
    <Modal
      open
      onClose={sluit}
      title={t("koppeling.sjabloonTitel")}
      width={620}
      footer={
        <>
          <button className="var-knop hoofd" disabled={aan.size === 0} onClick={voegToe}>{t("koppeling.sjabloonToevoegen", { count: aan.size })}</button>
          <button className="var-knop" onClick={sluit}>{t("koppeling.annuleren")}</button>
        </>
      }
    >
      <div className="koppel-venster">
        <p className="koppel-uitleg" title={sjabloon.werkmap.bron.pad}>{t("koppeling.werkmap", { naam: naamVan(sjabloon.werkmap.bron.pad) })}</p>
        {ontbreekt > 0 && <p className="koppel-fout">{t("koppeling.sjabloonOntbreekt", { count: ontbreekt })}</p>}
        <table className="koppel-onderdelen">
          <thead>
            <tr><th /><th>{t("koppeling.onderdeel")}</th><th>{t("koppeling.verwijzing")}</th><th>{t("koppeling.inWerkmap")}</th></tr>
          </thead>
          <tbody>
            {sjabloon.onderdelen.map(({ onderdeel, bereik }, i) => (
              <tr key={i} className={bereik.ok ? undefined : "ontbreekt"}>
                <td><input type="checkbox" checked={aan.has(i)} disabled={!bereik.ok} onChange={(e) => zet(i, e.target.checked)} aria-label={onderdeel.naam} /></td>
                <td>{onderdeel.naam}</td>
                <td><code>{onderdeel.verwijzing}</code></td>
                <td>{bereik.ok ? t("koppeling.gevonden", { blad: bereik.blad, cellen: bereik.a1, count: bereik.rijen.length }) : tr(`koppeling.reden.${bereik.reden}`, { detail: bereik.detail ?? "" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// ── Bij een gekoppeld blad ────────────────────────────────────────────────────

function datumTekst(iso: string, taal: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "?" : d.toLocaleString(taal, { dateStyle: "medium", timeStyle: "short" });
}

/** Kop van het paneel van een gekoppeld blad: de bron, de stand, opnieuw lezen en ontkoppelen. */
export function KoppelingInfo({ ex }: { ex: Exemplaar }) {
  const { t, i18n } = useTranslation("werkruimte");
  const zetMarkdown = useProjectStore((s) => s.zetMarkdown);
  const stand = useKoppelingStatus((s) => s.per[ex.id]);
  const md = ex.md;
  if (!isGekoppeld(md)) return null;
  const k = md.koppeling;
  const ontkoppel = () => {
    if (!confirm(t("koppeling.ontkoppelVraag", { naam: ex.naam }))) return;
    const { koppeling: _, ...los } = md;
    zetMarkdown(ex.id, los);
  };
  const bron = [naamVan(k.pad), k.verwijzing].filter(Boolean).join(" · ");
  const staat = stand?.staat ?? (isTauri() ? "lezen" : "geenToegang");
  return (
    <span className="pdf-info">
      <span className={`pdf-info-tekst koppel-staat-${staat}`} title={`${k.pad}\n${t("koppeling.gelezenOp", { datum: datumTekst(k.gelezenOp, i18n.language) })}`}>
        {t(`koppeling.staat.${staat}`, { bron })}
      </span>
      {stand?.meldingen && stand.meldingen.length > 0 && (
        <span className="pdf-info-tekst koppel-staat-fout" title={meldingenTekst(stand.meldingen)}>{t("koppeling.nietAllesKort")}</span>
      )}
      {isTauri() && (
        <button className="pdf-vervang" onClick={() => void leesOpnieuw(ex.id)} title={t("koppeling.leesUitleg")}>{t("koppeling.lees")}</button>
      )}
      {k.soort === "werkmapbereik" && (
        <button className="pdf-vervang" onClick={() => void bewaarSjabloon()} title={t("koppeling.sjabloonBewarenUitleg")}>{t("koppeling.sjabloonBewaren")}</button>
      )}
      <button className="pdf-vervang" onClick={ontkoppel} title={t("koppeling.ontkoppelUitleg")}>{t("koppeling.ontkoppel")}</button>
    </span>
  );
}

/**
 * De melding boven de tekst van een gekoppeld blad, op het scherm en op papier: de
 * bron ontbreekt, is niet bij te werken, of is in de browser niet te lezen. Zolang
 * de bron gelezen wordt, houdt hij het afdrukken tegen (`data-afdruk-laadt`).
 */
export function KoppelingMelding({ ex, opPapier = false }: { ex: Exemplaar; opPapier?: boolean }) {
  const t = usePapier();
  const { i18n } = useTranslation();
  const stand = useKoppelingStatus((s) => s.per[ex.id]);
  const md = ex.md;
  if (!isGekoppeld(md)) return null;
  const melding = meldingVoor(md.koppeling, stand, { bestandstoegang: isTauri(), datum: datumTekst(md.koppeling.gelezenOp, i18n.language) });
  if (!melding) return null;
  const klasse = opPapier ? "print-pdf-melding koppel-melding" : "koppel-melding koppel-melding-scherm";
  if (melding.laadt) return opPapier ? <p className={klasse} data-afdruk-laadt="">{t(melding.sleutel)}</p> : null;
  const { reden, ...waarden } = melding.waarden;
  const tekst = t(melding.sleutel, { ...waarden, ...(reden ? { reden: t(reden, { detail: stand?.detail ?? "" }) } : {}) });
  return <p className={klasse} role={opPapier ? undefined : "status"}>{tekst}</p>;
}
