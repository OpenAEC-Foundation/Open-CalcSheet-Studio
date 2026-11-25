import { memo, useEffect, useId, useMemo, useRef, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { celVerwijzingTekst, eenheidInBeeld, invoerNaarBron, leesCelVerwijzing, type CelVerwijzing } from "@ifc-calc/core";
import ThemedSelect from "../../ThemedSelect";
import { Kop, UitkomstKop } from "../designerKit";
import { useActiefExemplaar, useProjectScope } from "../../../store/actiefBlad";
import { useProjectStore, type Exemplaar } from "../../../store/projectStore";
import { bewaarOpenWerkmappen, isSpreadsheetBlad } from "../../../store/spreadsheetBlad";
import { useDoorrekening } from "../../../rekenen/doorrekening";
import { leesCel, werkbladNamen } from "../../../rekenen/spreadsheetCellen";
import { inBeeld, leesGetypt, naamDelen, pauzeVoor, platTekst, type BladInvoer, type PaneelVeld, type TekstDeel } from "./velden";
import { useInvoerWachtrij } from "./useInvoerWachtrij";
import type { InvoerWachtrij } from "./wachtrij";
import "../../ThemedSelect.css";
import "../VoetplaatDesigner.css";
import "./InvoerPaneel.css";

/**
 * Het invoerscherm van een rekenblad zonder eigen parametrisch beeld: alle invoervelden
 * die het blad nu toont als formulier, onder de koppen van het blad. Zo heeft elk blad en
 * elke module, ook uit de modulebibliotheek, een plek voor "gewoon getallen" naast de
 * uitwerking.
 *
 * De velden komen uit dezelfde doorrekening als de uitwerking (rekenen/doorrekening.ts,
 * invoer/velden.ts). Wat je typt gaat pas naar het blad als je het veld verlaat, op Enter
 * drukt of even wacht (wachtrij.ts): een blad dat Open FEM Studio laat rekenen, rekent
 * dan niet bij elke toetsaanslag. De kop toont of er gerekend wordt, en anders de
 * uitkomst van het blad.
 *
 * Een module kan er een beeld boven krijgen dat de invoer volgt (`Beeld`, zie
 * invoerScherm.tsx). Dat beeld leest ook wat er nog wacht, en beweegt dus meteen mee.
 */

/** Wat een beeld boven het formulier krijgt. */
export interface BeeldProps {
  /** De rekentekst van het blad: daaruit de eenheden en standaardwaarden van de velden. */
  source: string;
  /** Wat er voor een veld is ingevuld, in de eenheid van het blad; wat nog wacht, gaat voor wat is opgeslagen. */
  lees: (naam: string) => string | undefined;
  /** Zet een waarde meteen in het blad: een maat die in de tekening is gewijzigd. */
  zet: (naam: string, waarde: string) => void;
}

/**
 * Vanaf deze paneelbreedte staat het beeld naast het formulier in plaats van erboven: op
 * een scherm van 1920 breed is het paneel ongeveer 840. Het venster waarmee de app opent
 * (1280 × 800, paneel 518) houdt het beeld boven het formulier.
 */
const BREED_PANEEL = 780;

/**
 * De hoogte van het beeld boven het formulier: de helft van wat er onder de kop en boven de
 * voetregel is, met een onder- en bovengrens. Niet hoger dan de breedte benut: twee
 * tekeningen naast elkaar worden in een smal paneel niet groter van meer hoogte. In px en
 * niet in procenten: het vak van de tekeningen wordt opgemeten, en een hoogte die van de
 * inhoud afhangt zou dan meebewegen.
 */
function beeldHoogte(paneel: { b: number; h: number }): number {
  const hoogstens = Math.min(340, paneel.b / 2 + 8);
  return Math.round(Math.min(hoogstens, Math.max(200, (paneel.h - 80) * 0.5)));
}

function Naam({ naam }: { naam: string }) {
  const { basis, index } = naamDelen(naam);
  return (
    <span className="ip-symbool">
      {basis}
      {index && <sub>{index}</sub>}
    </span>
  );
}

function Tekst({ delen }: { delen: readonly TekstDeel[] }) {
  return (
    <>
      {delen.map((d, i) =>
        d.stand === "sub" ? <sub key={i}>{d.tekst}</sub> : d.stand === "sup" ? <sup key={i}>{d.tekst}</sup> : <span key={i}>{d.tekst}</span>,
      )}
    </>
  );
}

/** Een spreadsheet-blad van het project waaruit een veld een cel kan nemen. */
interface CelBron {
  ref: string;
  naam: string;
  data: string | undefined;
}

/** Een getal uit een cel in de taal van de app, met de eenheid erachter als die er is. */
function getalTekst(n: number, eenheid: string, taal: string): string {
  const tekst = n.toLocaleString(taal.startsWith("nl") ? "nl-NL" : "en-GB", { maximumSignificantDigits: 8 });
  return eenheid ? `${tekst} ${eenheid}` : tekst;
}

const CEL_RE = /^\$?([A-Za-z]{1,3})\$?([1-9][0-9]{0,6})$/;

/**
 * Kiest een cel uit een spreadsheet-blad van het project voor een invoerveld: het blad,
 * het werkblad, de cel en de eenheid van het getal in de cel. Toont wat er nu in de cel
 * staat. `Koppelen` zet de verwijzing (`#3.Blad1!B4 kN`) als waarde van het veld.
 */
function CelKiezer({ veld, bronnen, huidig, kies, sluit }: {
  veld: PaneelVeld;
  bronnen: readonly CelBron[];
  huidig: CelVerwijzing | null;
  kies: (tekst: string) => void;
  sluit: () => void;
}) {
  const { t, i18n } = useTranslation("beelden");
  const [ref, setRef] = useState(() => (huidig && bronnen.some((b) => b.ref === huidig.ref) ? huidig.ref : bronnen[0]?.ref ?? ""));
  const bron = bronnen.find((b) => b.ref === ref);
  const namen = useMemo(() => werkbladNamen(bron?.data) ?? [], [bron?.data]);
  const [blad, setBlad] = useState(() => huidig?.blad ?? "");
  const gekozenBlad = namen.includes(blad) ? blad : namen[0] ?? "";
  const [cel, setCel] = useState(() => huidig?.cel ?? "A1");
  const [eenheid, setEenheid] = useState(() => huidig?.eenheid ?? "");
  const adres = cel.trim().match(CEL_RE);
  const celAdres = adres ? `${adres[1].toUpperCase()}${adres[2]}` : null;
  const inDeCel = bron && gekozenBlad && celAdres ? leesCel(bron.data, gekozenBlad, celAdres) : null;
  const klaar = !!bron && !!gekozenBlad && !!celAdres;
  const id = useId();
  return (
    <div className="ip-kiezer" role="group" aria-label={t("invoer.koppeling.titel")}>
      <div className="ip-kiezer-kop">{t("invoer.koppeling.titel")}</div>
      <span className="ip-kiezer-naam">{t("invoer.koppeling.spreadsheet")}</span>
      <ThemedSelect value={ref} options={bronnen.map((b) => ({ value: b.ref, label: `${b.naam} (#${b.ref})` }))} onChange={setRef} />
      <span className="ip-kiezer-naam">{t("invoer.koppeling.werkblad")}</span>
      <ThemedSelect value={gekozenBlad} options={namen.map((n) => ({ value: n, label: n }))} onChange={setBlad} />
      <label className="ip-kiezer-naam" htmlFor={`${id}-cel`}>{t("invoer.koppeling.cel")}</label>
      <input
        id={`${id}-cel`}
        className={celAdres ? "ip-veld" : "ip-veld ip-fout"}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={cel}
        title={celAdres ? undefined : t("invoer.koppeling.celOngeldig")}
        aria-invalid={celAdres ? undefined : true}
        onChange={(e) => setCel(e.target.value)}
      />
      <label className="ip-kiezer-naam" htmlFor={`${id}-eenheid`}>{t("invoer.koppeling.eenheid")}</label>
      <input
        id={`${id}-eenheid`}
        className="ip-veld"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={eenheid}
        placeholder={veld.eenheid}
        onChange={(e) => setEenheid(e.target.value)}
      />
      <p className="ip-kiezer-uitleg">
        {veld.eenheid ? t("invoer.koppeling.metVeldEenheid", { eenheid: eenheidInBeeld(veld.eenheid) }) : t("invoer.koppeling.zonderEenheid")}
      </p>
      {inDeCel !== null && (
        <p className={typeof inDeCel === "number" ? "ip-kiezer-waarde" : "ip-kiezer-waarde ip-koppeling-fout"}>
          {typeof inDeCel === "number"
            ? t("invoer.koppeling.inDeCel", { waarde: getalTekst(inDeCel, eenheid.trim() || veld.eenheid, i18n.language) })
            : t(`invoer.koppeling.fout.${inDeCel.fout}`, { detail: inDeCel.detail ?? "" })}
        </p>
      )}
      <div className="ip-kiezer-knoppen">
        <button
          type="button"
          className="settings-btn"
          disabled={!klaar}
          onClick={() => {
            if (!klaar) return;
            kies(celVerwijzingTekst({ ref, blad: gekozenBlad, cel: celAdres!, eenheid: eenheid.trim() }));
          }}
        >
          {t("invoer.koppeling.koppel")}
        </button>
        <button type="button" className="settings-btn settings-btn-secondary" onClick={sluit}>
          {t("invoer.koppeling.annuleer")}
        </button>
      </div>
    </div>
  );
}

/**
 * Onder een veld dat aan een cel gekoppeld is: waar de waarde vandaan komt, en de waarde
 * waarmee het blad rekende of waarom het niet rekende. Met de knop om de koppeling los te
 * maken; het veld houdt dan het laatste getal uit de cel.
 */
function Koppeling({ veld, cel, bronnen, rij }: { veld: PaneelVeld; cel: CelVerwijzing; bronnen: readonly CelBron[]; rij: InvoerWachtrij }) {
  const { t } = useTranslation("beelden");
  const bron = bronnen.find((b) => b.ref === cel.ref);
  const plek = celVerwijzingTekst({ ...cel, eenheid: "" }).replace(/^#[^.]+\./, "");
  const k = veld.koppeling;
  const verwijder = () => {
    const w = bron ? leesCel(bron.data, cel.blad, cel.cel) : null;
    let waarde = "";
    if (typeof w === "number") {
      const tekst = cel.eenheid ? `${w} ${cel.eenheid}` : String(w);
      if (!veld.eenheid) waarde = cel.eenheid ? "" : tekst;
      else {
        const terug = invoerNaarBron(tekst, veld.eenheid, veld.eenheid);
        waarde = "waarde" in terug ? terug.waarde : "";
      }
    }
    rij.zetNu(veld.naam, waarde);
  };
  return (
    <div className="ip-koppeling">
      <span className="ip-koppeling-bron" title={celVerwijzingTekst(cel)}>
        {t("invoer.koppeling.bron", { blad: bron?.naam ?? t("invoer.koppeling.onbekendBlad", { ref: cel.ref }), cel: plek })}
      </span>
      {k?.fout !== undefined ? (
        <span className="ip-koppeling-fout" role="alert">{k.fout}</span>
      ) : k?.waarde !== undefined ? (
        <span className="ip-koppeling-waarde">= {k.waarde}</span>
      ) : null}
      <button type="button" className="ip-koppeling-los" onClick={verwijder} title={t("invoer.koppeling.verwijderUitleg")}>
        {t("invoer.koppeling.verwijder")}
      </button>
    </div>
  );
}

/** Een `?`-veld: naam, toelichting, het getal en de eenheid. */
const GetalVeld = memo(function GetalVeld({ veld, opgeslagen, rij, bronnen }: {
  veld: PaneelVeld;
  opgeslagen: string | undefined;
  rij: InvoerWachtrij;
  bronnen: readonly CelBron[];
}) {
  const { t } = useTranslation("beelden");
  const id = useId();
  const [kiezen, setKiezen] = useState(false);
  const cel = opgeslagen !== undefined ? leesCelVerwijzing(opgeslagen) : null;
  // Wat er staat zolang niemand typt. Tijdens het typen blijft staan wat er getypt is:
  // teruggerekend en weer omgezet zou "12," halverwege "12" worden.
  const rust = inBeeld(veld, opgeslagen);
  const [tekst, setTekst] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const wijzig = (nieuw: string) => {
    setTekst(nieuw);
    // Terug naar wat er stond: de opgeslagen waarde houden. Anders wordt 4500 mm in een
    // veld in inch na één keer typen 4499,99.
    if (nieuw.trim() === rust.trim()) {
      setFout(null);
      rij.vergeet(veld.naam);
      return;
    }
    const terug = leesGetypt(veld, nieuw);
    if ("fout" in terug) {
      setFout(terug.fout);
      rij.houdTegen(veld.naam);
    } else {
      setFout(null);
      rij.typ(veld.naam, terug.waarde);
    }
  };
  const toelichting = platTekst(veld.label);
  return (
    <>
    <div className="ip-rij">
      <label className="ip-naam" htmlFor={id} title={veld.toonNaam}>
        <Naam naam={veld.toonNaam} />
      </label>
      <span className="ip-label" title={toelichting || undefined}>
        <Tekst delen={veld.label} />
      </span>
      <input
        id={id}
        className={fout ? "ip-veld ip-fout" : "ip-veld"}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={tekst ?? rust}
        placeholder={veld.standaard}
        title={fout ?? undefined}
        aria-invalid={fout ? true : undefined}
        onFocus={() => setTekst(rust)}
        onChange={(e) => wijzig(e.target.value)}
        onBlur={() => {
          rij.verlaat(veld.naam);
          setTekst(null);
          setFout(null);
        }}
        onKeyDown={(e) => {
          // Enter stuurt meteen. Ctrl+S ook: opslaan hoort te bewaren wat er staat, niet wat
          // er stond vóór de pauze om was (de sneltoets zelf handelt useSneltoetsen af).
          if (e.key === "Enter" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")) rij.verlaat(veld.naam);
          if (e.key === "Escape") {
            rij.vergeet(veld.naam);
            setTekst(rust);
            setFout(null);
          }
        }}
      />
      <span className="ip-eenheid">{eenheidInBeeld(veld.toonEenheid)}</span>
      {bronnen.length > 0 || cel ? (
        <button
          type="button"
          className={kiezen || cel ? "ip-koppel ip-koppel-aan" : "ip-koppel"}
          title={t("invoer.koppeling.knop")}
          aria-label={t("invoer.koppeling.knop")}
          aria-expanded={kiezen}
          onClick={() => {
            // Wat nog in een open spreadsheet staat eerst naar het project, zodat de kiezer de laatste cellen leest.
            if (!kiezen) void bewaarOpenWerkmappen();
            setKiezen((open) => !open);
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 01-3.5-3.5L5.5 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <span />
      )}
    </div>
    {cel && <Koppeling veld={veld} cel={cel} bronnen={bronnen} rij={rij} />}
    {kiezen && (
      bronnen.length > 0 ? (
        <CelKiezer
          veld={veld}
          bronnen={bronnen}
          huidig={cel}
          kies={(tekst) => {
            setKiezen(false);
            setTekst(null);
            setFout(null);
            rij.zetNu(veld.naam, tekst);
          }}
          sluit={() => setKiezen(false)}
        />
      ) : (
        <p className="ip-kiezer-uitleg">{t("invoer.koppeling.geenSpreadsheet")}</p>
      )
    )}
    </>
  );
});

/** Een keuzelijst: het label van het blad en de keuzes. Een keuze gaat meteen naar het blad. */
const KeuzeVeld = memo(function KeuzeVeld({ veld, opgeslagen, rij }: { veld: PaneelVeld; opgeslagen: string | undefined; rij: InvoerWachtrij }) {
  return (
    <div className="ip-rij ip-keuze">
      <span className="ip-label" title={veld.toonNaam}>
        <Tekst delen={veld.label} />
      </span>
      <ThemedSelect
        value={opgeslagen ?? veld.standaard}
        options={veld.keuzes.map((k) => ({ value: k.waarde, label: k.tekst }))}
        onChange={(waarde) => rij.zetNu(veld.naam, waarde)}
      />
    </div>
  );
});

function Paneel({ exemplaar, Beeld }: { exemplaar: Exemplaar; Beeld?: ComponentType<BeeldProps> }) {
  const { t } = useTranslation("beelden");
  const scope = useProjectScope();
  const { doorrekening, bezig } = useDoorrekening(exemplaar.id, exemplaar.source, exemplaar.waarden, scope, exemplaar.naam);
  // De spreadsheet-bladen van het project: daaruit kan een veld een cel nemen.
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const bronnen = useMemo<CelBron[]>(
    () => exemplaren.filter((e) => isSpreadsheetBlad(e) && e.ref).map((e) => ({ ref: e.ref!, naam: e.naam, data: e.xlsx?.data })),
    [exemplaren],
  );
  const rij = useInvoerWachtrij(exemplaar.id, pauzeVoor(exemplaar.source));
  const [toonBeeld, setToonBeeld] = useState(true);

  // De velden van de laatste doorrekening die ze had: een fout in de rekentekst, halverwege
  // het typen in de editor ernaast, laat het formulier staan.
  const laatste = useRef<BladInvoer | null>(null);
  if (doorrekening?.invoer) laatste.current = doorrekening.invoer;
  const invoer = laatste.current;

  // De maat van het hele paneel bepaalt de indeling: het beeld boven of naast het formulier.
  const paneelRef = useRef<HTMLDivElement>(null);
  const [maat, setMaat] = useState({ b: 518, h: 540 });
  const breed = maat.b >= BREED_PANEEL;
  useEffect(() => {
    const el = paneelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setMaat({ b: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wat er te melden is, in volgorde: er wacht invoer, Open FEM Studio rekent, het blad rekent.
  // Zolang er gerekend wordt, zegt de vorige uitkomst nog of FEM Studio bezig was.
  const titel = doorrekening?.uitkomst?.resultaat.titel || exemplaar.naam;
  const status = rij.aantal > 0 ? t("invoer.wacht") : invoer?.wachtOpFem ? t("invoer.fem") : bezig ? t("invoer.rekent") : null;
  const rekent = rij.aantal === 0 && (bezig || !!invoer?.wachtOpFem);

  const lees = (naam: string) => rij.wacht(naam) ?? exemplaar.waarden[naam];
  const metBeeld = !!Beeld && toonBeeld;

  return (
    <div ref={paneelRef} className={`vd-panel ip-paneel${breed ? " ip-breed" : ""}`}>
      {status ? <Kop titel={titel} badge={status} staat="info" /> : <UitkomstKop titel={titel} uitkomst={doorrekening?.uitkomst ?? null} />}
      <div className={rekent ? "ip-voortgang ip-loopt" : "ip-voortgang"} />

      <div className="ip-inhoud">
        {Beeld && metBeeld && (
          <div className="ip-beeld" style={breed ? undefined : { flexBasis: beeldHoogte(maat) }}>
            <Beeld source={exemplaar.source} lees={lees} zet={(naam, waarde) => rij.zetNu(naam, waarde)} />
          </div>
        )}
        <div className="ip-formulier">
          {!invoer ? (
            <p className="ip-leeg">{t("invoer.eerst")}</p>
          ) : invoer.groepen.length === 0 ? (
            <p className="ip-leeg">{t("invoer.geenVelden")}</p>
          ) : (
            <div className="ip-groepen">
              {invoer.groepen.map((groep, i) => (
                <section key={`${i}-${groep.kop}`} className="ip-groep">
                  {groep.kop && <div className="vd-ctrl-h">{groep.kop}</div>}
                  {groep.velden.map((veld) =>
                    veld.soort === "keuze" ? (
                      <KeuzeVeld key={veld.naam} veld={veld} opgeslagen={exemplaar.waarden[veld.naam]} rij={rij} />
                    ) : (
                      <GetalVeld key={veld.naam} veld={veld} opgeslagen={exemplaar.waarden[veld.naam]} rij={rij} bronnen={bronnen} />
                    ),
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="vd-foot ip-voet">
        <span title={t("invoer.uitleg")}>{t("invoer.uitleg")}</span>
        {Beeld && (
          <button type="button" className="settings-btn settings-btn-secondary" onClick={() => setToonBeeld((aan) => !aan)}>
            {toonBeeld ? t("invoer.verbergBeeld") : t("invoer.toonBeeld")}
          </button>
        )}
      </div>
    </div>
  );
}

export default function InvoerPaneel({ Beeld }: { Beeld?: ComponentType<BeeldProps> }) {
  const exemplaar = useActiefExemplaar();
  if (!exemplaar) return null;
  // Per blad een eigen paneel: wat er nog wacht, gaat bij het wisselen naar het blad waar
  // het bij hoort, en een half getypt getal verhuist niet mee naar het volgende blad.
  return <Paneel key={exemplaar.id} exemplaar={exemplaar} Beeld={Beeld} />;
}
