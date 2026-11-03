import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { duimVan, kernGetal } from "./code";
import {
  isVorm,
  isWaardeGetal,
  mmUitdrukking,
  nieuweMaatVorm,
  plaatsingVan,
  schoonUitdrukking,
  sleutels,
  waardeMm,
  waardeVan,
  type Anker,
  type Maat,
  type Opgelost,
  type Tekening,
  type Vorm,
} from "./model";
import {
  aanzichtLengte,
  gelijkSleutel,
  getekend,
  heeftVulling,
  nieuwSymbool,
  plaatsingKeuze,
  profielMaten,
  profielSchaal,
  SCHAAL_SYMBOLEN,
  symboolDef,
  zetAanzichtLengte,
  zetOptie,
  zetProfielMaat,
  type SymboolId,
  type Veld,
} from "./symbolen";
import { FAMILIES, HOUTMATEN, PX_PER_MM, SCHALEN, familie } from "./staalprofielen";
import { kopieerSelectie, maakReeks, useTeken, verwijderSelectie, wijzig, wijzigVorm, zetOptieGelijk } from "./tekenStore";
import type { Koppeling, Proef } from "./waarden";
import ViewPaneel from "./ViewPaneel";
import { vormOpPapier } from "./vel";

const LIJST = "tk-variabelen";
const isHex = (s: string | null | undefined) => !!s && /^#[0-9a-f]{6}$/i.test(s);

interface Props {
  proef: Proef;
  opgelost: Opgelost;
}

/** Rechts in de editor: de eigenschappen van de selectie, of van de tekening. */
export default function TekenPaneel({ proef, opgelost }: Props) {
  const { t } = useTranslation("tekenen");
  const tekening = useTeken((s) => s.tekening);
  const gekozen = useTeken((s) => s.gekozen);
  const plaatst = useTeken((s) => s.gereedschap === "symbool");
  const inView = useTeken((s) => !!s.vel);
  const el = gekozen.length === 1 ? tekening.elementen.find((e) => e.id === gekozen[0]) : undefined;

  return (
    <div className="tk-paneel">
      <datalist id={LIJST}>
        {proef.variabelen.map(([n, w]) => (
          <option key={n} value={n} label={`${n} = ${kernGetal(w)}`} />
        ))}
      </datalist>
      {gekozen.length > 1 ? (
        <>
          <section className="tk-sectie">
            <Kop titel={t("paneel.meer", { aantal: gekozen.length })} />
            <p className="tk-uitleg tk-zacht">{t("paneel.meerUitleg")}</p>
          </section>
          <ReeksSectie />
        </>
      ) : plaatst && !el ? (
        <PlaatsKeuzes proef={proef} />
      ) : !el ? (
        inView ? <ViewPaneel /> : <TekeningEigenschappen tekening={tekening} proef={proef} opgelost={opgelost} />
      ) : isVorm(el) ? (
        <VormEigenschappen v={el} proef={proef} opgelost={opgelost} />
      ) : (
        <section className="tk-sectie">
          <Kop titel={t("soort.vast")} />
          <p className="tk-uitleg">{t("paneel.vastUitleg")}</p>
          <textarea className="tk-veld tk-code" readOnly value={el.markup} rows={6} />
        </section>
      )}
    </div>
  );
}

function Kop({ titel, verwijder }: { titel: string; verwijder?: boolean }) {
  const { t } = useTranslation("tekenen");
  return (
    <div className="tk-sectie-kop">
      <span>{titel}</span>
      {verwijder !== false && (
        <button className="tk-knop-klein" onClick={verwijderSelectie} title={t("lint.verwijderen")}>
          {t("lint.verwijderen")}
        </button>
      )}
    </div>
  );
}

function TekeningEigenschappen({ tekening, proef, opgelost }: { tekening: Tekening } & Props) {
  const { t } = useTranslation("tekenen");
  const zet = (k: "breed" | "hoog") => (m: Maat, sleutel: string) => wijzig((tk) => ({ ...tk, [k]: m }), sleutel);
  return (
    <>
      <section className="tk-sectie">
        <Kop titel={t("paneel.tekening", { naam: tekening.naam })} verwijder={false} />
        <div className="tk-maten">
          <MaatRij label={t("maat.breedte")} m={tekening.breed} proef={proef} opgelost={opgelost} onZet={zet("breed")} sleutel="breed" />
          <MaatRij label={t("maat.hoogte")} m={tekening.hoog} proef={proef} opgelost={opgelost} onZet={zet("hoog")} sleutel="hoog" />
        </div>
      </section>
      <section className="tk-sectie">
        <div className="tk-sectie-kop"><span>{t("paneel.koppelen")}</span></div>
        <p className="tk-uitleg">{t("paneel.koppelUitleg")}</p>
        <p className="tk-uitleg">{t("paneel.eenheidUitleg")}</p>
        <p className="tk-uitleg tk-zacht">
          {proef.bezig ? t("paneel.rekent") : t("paneel.variabelen", { count: proef.variabelen.length })}
        </p>
      </section>
    </>
  );
}

const VLAK = ["rechthoek", "cirkel", "polylijn"];

function VormEigenschappen({ v, proef, opgelost }: { v: Vorm } & Props) {
  const { t } = useTranslation("tekenen");
  const focus = useTeken((s) => s.focus);
  const inView = useTeken((s) => !!s.vel);
  const tekstVeld = useRef<HTMLTextAreaElement>(null);
  // Een oude maatlijn krijgt de nieuwe vorm zodra je hem wijzigt.
  const zet = (deel: Partial<Vorm>, sleutel: string) =>
    wijzigVorm(v.id, (o) => (o.soort === "maat" ? nieuweMaatVorm({ ...o, ...deel }) : { ...o, ...deel }), `${sleutel}-${v.id}`);
  const isTekst = v.soort === "tekst";
  const heeftTekst = isTekst || v.soort === "maat";
  const isSymbool = v.soort === "symbool";
  const symboolTekst = isSymbool && !!symboolDef(v.sym)?.tekst;
  const vlak = VLAK.includes(v.soort) || heeftVulling(v);

  useEffect(() => {
    if (focus === v.id && tekstVeld.current) {
      tekstVeld.current.focus();
      tekstVeld.current.select();
      useTeken.setState({ focus: null });
    }
  }, [focus, v.id]);

  const label = (k: string) => {
    const m = /^([xy])(\d+)$/.exec(k);
    if (v.soort === "polylijn" && m) return t("maat.punt", { n: Number(m[2]) + 1, as: m[1] });
    return t(`maat.${k}`);
  };

  return (
    <>
      <section className="tk-sectie">
        <Kop titel={isSymbool ? t(`symbool.${v.sym}`) : t(`soort.${v.soort}`)} />
        {isSymbool && <SymboolVelden v={v} proef={proef} />}
        {v.soort === "maat" && (
          <div className="tk-rij">
            <label>{t("paneel.eindteken")}</label>
            <select
              className="tk-veld"
              value={v.tik ? "tik" : "rond"}
              onChange={(e) =>
                wijzigVorm(v.id, (o) => {
                  if (e.target.value === "rond") return nieuweMaatVorm(o);
                  return { ...o, tik: true };
                })
              }
            >
              <option value="rond">{t("paneel.eindtekenRond")}</option>
              <option value="tik">{t("paneel.eindtekenTik")}</option>
            </select>
          </div>
        )}
        <div className="tk-rij">
          <label>{isTekst ? t("paneel.kleur") : t("paneel.lijn")}</label>
          <span className="tk-kleur">
            {!isTekst && (
              <input type="checkbox" checked={!!v.lijn} title={t("paneel.lijnAan")}
                onChange={(e) => zet({ lijn: e.target.checked ? "#1F2937" : null }, "lijnaan")} />
            )}
            <input type="color" value={isHex(v.lijn) ? v.lijn! : "#000000"} disabled={!v.lijn}
              onChange={(e) => zet({ lijn: e.target.value.toUpperCase() }, "lijn")} />
            <input className="tk-veld tk-kort" value={v.lijn ?? ""} placeholder={t("paneel.geen")} disabled={!v.lijn}
              onChange={(e) => zet({ lijn: e.target.value }, "lijntekst")} />
          </span>
        </div>
        {!isTekst && (
          <div className="tk-rij">
            <label>{t("paneel.dikte")}</label>
            <GetalVeld waarde={v.dikte} min={0.25} stap={0.5} onZet={(n) => zet({ dikte: n }, "dikte")} />
          </div>
        )}
        {vlak && (
          <div className="tk-rij">
            <label>{t("paneel.vulling")}</label>
            <span className="tk-kleur">
              <input type="checkbox" checked={!!v.vulling} title={t("paneel.vullingAan")}
                onChange={(e) => zet({ vulling: e.target.checked ? "#E5E7EB" : null }, "vulaan")} />
              <input type="color" value={isHex(v.vulling) ? v.vulling! : "#E5E7EB"} disabled={!v.vulling}
                onChange={(e) => zet({ vulling: e.target.value.toUpperCase() }, "vul")} />
              <input className="tk-veld tk-kort" value={v.vulling ?? ""} placeholder={t("paneel.geen")} disabled={!v.vulling}
                onChange={(e) => zet({ vulling: e.target.value }, "vultekst")} />
            </span>
          </div>
        )}
        {!isTekst && (
          <div className="tk-rij">
            <label>{t("paneel.streep")}</label>
            <input type="checkbox" checked={v.streep} onChange={(e) => zet({ streep: e.target.checked }, "streep")} />
          </div>
        )}
        {v.soort === "polylijn" && (
          <div className="tk-rij">
            <label>{t("paneel.gesloten")}</label>
            <input type="checkbox" checked={!!v.gesloten} onChange={(e) => zet({ gesloten: e.target.checked }, "gesloten")} />
          </div>
        )}
        {heeftTekst && (
          <>
            <div className="tk-rij tk-rij-hoog">
              <label>{isTekst ? t("paneel.tekst") : t("paneel.label")}</label>
              {/* In een view volgt een getal als label de echte maat: dat getal staat hier ook. */}
              <textarea ref={tekstVeld} className="tk-veld" rows={2} value={(inView ? vormOpPapier(v, 1).tekst : v.tekst) ?? ""}
                onChange={(e) => zet({ tekst: e.target.value.replace(/\n/g, " ") }, "tekst")} />
            </div>
            <p className="tk-uitleg tk-zacht">{inView ? t("paneel.maatLabelUitleg") : t("paneel.tekstUitleg", { o: "{{", s: "}}" })}</p>
            <div className="tk-rij">
              <label>{t("paneel.grootte")}</label>
              <GetalVeld waarde={v.grootte ?? 0} min={0} stap={1} leeg={!v.grootte}
                onZet={(n) => zet({ grootte: n > 0 ? n : undefined }, "grootte")} />
            </div>
          </>
        )}
        {symboolTekst && (
          <div className="tk-rij">
            <label>{t("paneel.grootte")}</label>
            <GetalVeld waarde={v.grootte ?? 12} min={4} stap={1} onZet={(n) => zet({ grootte: n }, "grootte")} />
          </div>
        )}
        {isTekst && (
          <div className="tk-rij">
            <label>{t("paneel.anker")}</label>
            <select className="tk-veld" value={v.anker ?? "start"} onChange={(e) => zet({ anker: e.target.value as Anker }, "anker")}>
              <option value="start">{t("paneel.ankerStart")}</option>
              <option value="middle">{t("paneel.ankerMidden")}</option>
              <option value="end">{t("paneel.ankerEind")}</option>
            </select>
          </div>
        )}
      </section>

      {isSymbool && profielMaten(v).length > 0 && <ProfielMaten v={v} proef={proef} opgelost={opgelost} />}

      <section className="tk-sectie">
        <div className="tk-sectie-kop"><span>{t(isSymbool ? "paneel.plaats" : "paneel.maten")}</span></div>
        <div className="tk-maten">
          <div className="tk-maten-kop">
            <span />
            <span>{t(inView ? "paneel.mm" : "paneel.px")}</span>
            {!inView && <span>{t("paneel.koppeling")}</span>}
          </div>
          {sleutels(v).map((k) => (
            <MaatRij
              key={k}
              label={label(k)}
              m={v.p[k] ?? { v: 0 }}
              proef={proef}
              opgelost={opgelost}
              sleutel={`${v.id}-${k}`}
              koppelbaar={!inView && !(v.soort === "boog" && (k === "a1" || k === "a2"))}
              onZet={(m, sleutel) =>
                wijzigVorm(v.id, (o) => {
                  const n = { ...o, p: { ...o.p, [k]: m } };
                  return o.soort === "maat" ? nieuweMaatVorm(n) : n;
                }, sleutel)
              }
            />
          ))}
        </div>
        {!inView && <p className="tk-uitleg tk-zacht">{t("paneel.koppelKort")}</p>}
      </section>

      <ReeksSectie />
    </>
  );
}

/** Of een veld nu te zien is: de tweede waarde alleen bij een trapezium, de labeltekst alleen met een label. */
function zichtbaar(v: Vorm, veld: Veld): boolean {
  const o = v.o ?? {};
  if (["naam2", "waarde2", "hoogte2"].includes(veld.k)) return o.trapezium === "1";
  if (veld.k === "tekst" && (v.sym === "staal" || v.sym === "hout")) return o.label === "1";
  // Een profiel in aanzicht ligt op zijn twee punten: geen eigen draaiing.
  if (veld.k === "hoek" && v.sym === "staal" && o.aanzicht && o.aanzicht !== "doorsnede") return false;
  return true;
}

/** Een klein voorbeeld van het gekozen type en de gekozen maat. */
function Duim({ v }: { v: Vorm }) {
  const o = v.o ?? {};
  const beeld = useMemo(
    () => (v.sym === "staal" || v.sym === "hout" ? duimVan(v.sym, o) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v.sym, o.familie, o.maat, o.aanzicht],
  );
  return beeld ? <div className="tk-duim" dangerouslySetInnerHTML={{ __html: beeld }} /> : null;
}

/** Plaatsen van een symbool: de keuzes voor het volgende exemplaar, met R en F aan de cursor. */
function PlaatsKeuzes({ proef }: { proef: Proef }) {
  const { t } = useTranslation("tekenen");
  const symbool = useTeken((s) => s.symbool);
  const schaal = useTeken((s) => s.schaal);
  const stijl = useTeken((s) => s.stijl);
  const inView = useTeken((s) => !!s.vel);
  const v = useMemo(() => {
    const plekken: Record<string, Record<string, number>> = {
      punt: { x: 0, y: 0 },
      lijn: { x1: 0, y1: 0, x2: 1, y2: 0 },
      vak: { x: 0, y: 0, w: 1, h: 1 },
    };
    const plek = plekken[plaatsingKeuze(symbool.sym, symbool.o)];
    const extra: Record<string, string> = SCHAAL_SYMBOLEN.includes(symbool.sym) ? { schaal: String(schaal) } : {};
    return nieuwSymbool(symbool.sym, plek, stijl, { ...symbool.o, ...extra });
  }, [symbool, schaal, stijl]);
  const zet = (k: string, w: string) => {
    if (k === "schaal") useTeken.setState({ schaal: Number(w) || schaal });
    useTeken.setState((s) => ({ symbool: { sym: s.symbool.sym, o: zetOptie(v, k, w).o ?? {} } }));
  };
  return (
    <section className="tk-sectie">
      <div className="tk-sectie-kop"><span>{t("paneel.plaatsen", { naam: t(`symbool.${symbool.sym}`) })}</span></div>
      <SymboolVelden v={v} proef={proef} zet={zet} />
      <p className="tk-uitleg tk-zacht">{t(inView ? "paneel.plaatsUitlegView" : "paneel.plaatsUitleg")}</p>
    </section>
  );
}

/** De keuzes van een symbool: type en maat van een profiel, schaal, lastwaarden, label … */
function SymboolVelden({ v, proef, zet }: { v: Vorm; proef: Proef; zet?: (k: string, w: string) => void }) {
  const { t } = useTranslation("tekenen");
  const def = symboolDef(v.sym);
  const focus = useTeken((s) => s.focus);
  const inView = useTeken((s) => !!s.vel);
  const waardeVeld = useRef<HTMLInputElement>(null);
  const o = v.o ?? {};
  // Standaard wijzigt alleen dit exemplaar; aangevinkt alle gelijke symbolen in de tekening.
  const [alle, setAlle] = useState(false);
  const aantalGelijk = useTeken((s) => {
    if (zet) return 0;
    const sl = gelijkSleutel(v);
    return s.tekening.elementen.filter((e) => isVorm(e) && e.soort === "symbool" && gelijkSleutel(e) === sl).length;
  });
  const zetOptieVan = zet ?? ((k: string, w: string) => {
    if (alle && aantalGelijk > 1) zetOptieGelijk(v, k, w);
    else wijzigVorm(v.id, (e) => zetOptie(e, k, w), `o-${k}-${v.id}`);
  });

  // Een zojuist geplaatste last (het ligger-schema): de cursor in de lastwaarde.
  useEffect(() => {
    if (focus === v.id && waardeVeld.current) {
      waardeVeld.current.focus();
      useTeken.setState({ focus: null });
    }
  }, [focus, v.id]);

  if (!def) return null;
  const f = familie(o.familie);
  const schaal = Number(o.schaal) || 10;
  let eersteWaarde = true;

  return (
    <>
      {aantalGelijk > 1 && (
        <label className="tk-alle" title={t("paneel.alleGelijkTip")}>
          <input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} />
          <span>{t("paneel.alleGelijk", { aantal: aantalGelijk })}</span>
        </label>
      )}
      {v.sym === "staal" && (
        <div className="tk-keuze-duim">
          <div className="tk-keuze-velden">
            <div className="tk-rij">
              <label>{t("veld.familie")}</label>
              <select className="tk-veld" value={f.id} onChange={(e) => zetOptieVan("familie", e.target.value)}>
                {FAMILIES.map((x) => <option key={x.id} value={x.id}>{t(`familie.${x.id}`)}</option>)}
              </select>
            </div>
            <div className="tk-rij">
              <label>{t("veld.maat")}</label>
              <select className="tk-veld" value={o.maat ?? ""} onChange={(e) => zetOptieVan("maat", e.target.value)}>
                {!f.rijen.some((r) => r.naam === o.maat) && <option value={o.maat ?? ""}>{o.maat || t("paneel.eigen")}</option>}
                {f.rijen.map((r) => <option key={r.naam} value={r.naam}>{r.naam}</option>)}
              </select>
            </div>
          </div>
          <Duim v={v} />
        </div>
      )}
      {v.sym === "hout" && (
        <div className="tk-keuze-duim">
          <div className="tk-keuze-velden">
            <div className="tk-rij">
              <label>{t("veld.maat")}</label>
              <select className="tk-veld" value={o.maat ?? ""} onChange={(e) => zetOptieVan("maat", e.target.value)}>
                {!HOUTMATEN.includes(o.maat ?? "") && <option value={o.maat ?? ""}>{o.maat || t("paneel.eigen")}</option>}
                {HOUTMATEN.map((m) => <option key={m} value={m}>{m.replace(" x ", " × ")}</option>)}
              </select>
            </div>
          </div>
          <Duim v={v} />
        </div>
      )}
      {/* In een view is de schaal die van de view; daar kiest een symbool hem niet zelf. */}
      {SCHAAL_SYMBOLEN.includes(v.sym as SymboolId) && !inView && (
        <>
          <div className="tk-rij">
            <label>{t("veld.schaal")}</label>
            <select className="tk-veld" value={schaal} onChange={(e) => zetOptieVan("schaal", e.target.value)}>
              {!SCHALEN.includes(schaal) && <option value={schaal}>1 : {schaal}</option>}
              {SCHALEN.map((n) => <option key={n} value={n}>1 : {n}</option>)}
            </select>
          </div>
          {plaatsingVan(v) === "punt" && (v.sym === "staal" || v.sym === "hout") && (
            <p className="tk-uitleg tk-zacht">
              {t("paneel.opPapier", {
                b: kernGetal(Math.round((waardeVan(v.p.b) / schaal) * 10) / 10),
                h: kernGetal(Math.round((waardeVan(v.p.h) / schaal) * 10) / 10),
                px: kernGetal(Math.round(profielSchaal(o) * waardeVan(v.p.h))),
              })}
            </p>
          )}
        </>
      )}
      {def.velden.filter((veld) => zichtbaar(v, veld)).map((veld) => {
        const eerste = veld.soort === "waarde" && eersteWaarde;
        if (veld.soort === "waarde") eersteWaarde = false;
        return <VeldRij key={veld.k} v={v} veld={veld} proef={proef} zet={zetOptieVan} invoer={eerste ? waardeVeld : undefined} />;
      })}
    </>
  );
}

function VeldRij({
  v,
  veld,
  proef,
  zet: zetOptieVan,
  invoer,
}: {
  v: Vorm;
  veld: Veld;
  proef: Proef;
  zet: (k: string, w: string) => void;
  invoer?: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation("tekenen");
  const w = v.o?.[veld.k] ?? "";
  const zet = (n: string) => zetOptieVan(veld.k, n);
  const label = <label title={t(`veldTip.${veld.k}`, { defaultValue: "" })}>{t(`veld.${veld.k}`)}</label>;
  switch (veld.soort) {
    case "keuze": {
      const naam = (x: string) => (veld.vertaal ? t(`optie.${veld.k}.${x}`) : veld.k === "hoek" ? `${x}°` : x);
      return (
        <div className="tk-rij">
          {label}
          <select className="tk-veld" value={w} onChange={(e) => zet(e.target.value)}>
            {!veld.opties.includes(w) && <option value={w}>{naam(w)}</option>}
            {veld.opties.map((x) => <option key={x} value={x}>{naam(x)}</option>)}
          </select>
        </div>
      );
    }
    case "vink":
      return (
        <div className="tk-rij">
          {label}
          <input type="checkbox" checked={w === "1"} onChange={(e) => zet(e.target.checked ? "1" : "0")} />
        </div>
      );
    case "getal":
      return (
        <div className="tk-rij">
          {label}
          <GetalVeld waarde={Number(w.replace(",", ".")) || 0} min={veld.min} stap={veld.stap} onZet={(n) => zet(String(veld.max !== undefined ? Math.min(veld.max, n) : n))} />
        </div>
      );
    case "waarde": {
      const e = schoonUitdrukking(w);
      const uitkomst = e && !isWaardeGetal(w) ? proef.per.get(e) : undefined;
      const status =
        !e || isWaardeGetal(w) ? null
        : !uitkomst ? { tekst: "…", klasse: "", titel: t("paneel.rekent") }
        : uitkomst.fout === "fout" || uitkomst.waarde === undefined ? { tekst: "!", klasse: "fout", titel: t("paneel.koppelFout") }
        // Een lastwaarde heeft gewoon een eenheid (kN/m): het getal komt in het label.
        : { tekst: "✓", klasse: "goed", titel: t("paneel.koppelGoed", { waarde: kernGetal(uitkomst.waarde) }) };
      return (
        <div className="tk-rij">
          {label}
          <span className="tk-koppel">
            <input ref={invoer} className="tk-veld" list={LIJST} value={w} placeholder={t("paneel.waardePlek")} spellCheck={false}
              onChange={(ev) => zet(ev.target.value)} />
            {status && <span className={`tk-status ${status.klasse}`} title={status.titel}>{status.tekst}</span>}
          </span>
        </div>
      );
    }
    default:
      return (
        <div className="tk-rij">
          {label}
          <input className="tk-veld" value={w} spellCheck={false} onChange={(e) => zet(e.target.value)} />
        </div>
      );
  }
}

/** De maten van een profiel of balk in mm: uit de tabel, met de hand, of gekoppeld aan het blad. */
function ProfielMaten({ v, proef, opgelost }: { v: Vorm } & Props) {
  const { t } = useTranslation("tekenen");
  const inView = useTeken((s) => !!s.vel);
  return (
    <section className="tk-sectie">
      <div className="tk-sectie-kop"><span>{t("paneel.profielmaten")}</span></div>
      <div className="tk-maten">
        <div className="tk-maten-kop">
          <span />
          <span>{t("paneel.mm")}</span>
          {!inView && <span>{t("paneel.koppeling")}</span>}
        </div>
        {profielMaten(v).map((k) => (
          <MaatRij
            key={k}
            label={t(`profiel.${k}`)}
            m={v.p[k] ?? { v: 0 }}
            proef={proef}
            opgelost={opgelost}
            sleutel={`${v.id}-${k}`}
            mm
            koppelbaar={!inView}
            onZet={(m, sleutel) => wijzigVorm(v.id, (o) => zetProfielMaat(o, k, m), sleutel)}
          />
        ))}
        {v.sym === "staal" && plaatsingVan(v) === "lijn" && (
          <MaatRij
            label={t("profiel.lengte")}
            m={v.p.lengte ?? { v: Math.round(aanzichtLengte(v, getekend(v, opgelost))) }}
            proef={proef}
            opgelost={opgelost}
            sleutel={`${v.id}-lengte`}
            mm
            koppelbaar={!inView}
            onZet={(m, sleutel) => wijzigVorm(v.id, (o) => zetAanzichtLengte(o, m), sleutel)}
          />
        )}
      </div>
      {!inView && <p className="tk-uitleg tk-zacht">{t("paneel.profielUitleg", { px: kernGetal(Math.round(PX_PER_MM * 1000) / 1000) })}</p>}
    </section>
  );
}

/** Kopiëren en een reeks: het origineel meegeteld, elk exemplaar Δx, Δy verder. */
function ReeksSectie() {
  const { t } = useTranslation("tekenen");
  const [aantal, setAantal] = useState(3);
  const [dx, setDx] = useState(50);
  const [dy, setDy] = useState(0);
  return (
    <section className="tk-sectie">
      <div className="tk-sectie-kop"><span>{t("paneel.reeks")}</span></div>
      <div className="tk-rij">
        <label>{t("paneel.aantal")}</label>
        <GetalVeld waarde={aantal} min={2} stap={1} onZet={(n) => setAantal(Math.round(n))} />
      </div>
      <div className="tk-rij">
        <label>{t("paneel.dx")}</label>
        <GetalVeld waarde={dx} stap={5} onZet={setDx} />
      </div>
      <div className="tk-rij">
        <label>{t("paneel.dy")}</label>
        <GetalVeld waarde={dy} stap={5} onZet={setDy} />
      </div>
      <div className="tk-knoppen">
        <button className="tk-knop" onClick={kopieerSelectie} title={t("lint.kopierenTip")}>{t("lint.kopieren")}</button>
        <button className="tk-knop" onClick={() => maakReeks(aantal, dx, dy)}>{t("paneel.reeksMaken")}</button>
      </div>
    </section>
  );
}

/** Eén maat: het getal in px, of een koppeling met de waarde die het blad geeft. */
function MaatRij({
  label,
  m,
  proef,
  opgelost,
  sleutel,
  onZet,
  koppelbaar = true,
  mm = false,
}: {
  label: string;
  m: Maat;
  sleutel: string;
  onZet: (m: Maat, sleutel: string) => void;
  koppelbaar?: boolean;
  /** Een maat in mm: een waarde met eenheid rekent om, dus daar is geen waarschuwing nodig. */
  mm?: boolean;
} & Props) {
  const { t } = useTranslation("tekenen");
  const huidig = mm ? waardeMm(m, opgelost) : waardeVan(m, opgelost);
  const formule = m.e ? (mm ? mmUitdrukking(m, opgelost) : schoonUitdrukking(m.e)) : "";
  const uitkomst: Koppeling | undefined = m.e ? proef.per.get(formule) ?? proef.per.get(schoonUitdrukking(m.e)) : undefined;
  let status: { tekst: string; klasse: string; titel: string } | null = null;
  if (m.e) {
    if (!uitkomst) status = { tekst: "…", klasse: "", titel: t("paneel.rekent") };
    else if (uitkomst.fout === "fout") status = { tekst: "!", klasse: "fout", titel: t("paneel.koppelFout") };
    else if (uitkomst.fout === "eenheid" && !mm) status = { tekst: "≈", klasse: "let-op", titel: t("paneel.koppelEenheid") };
    else status = { tekst: "✓", klasse: "goed", titel: t("paneel.koppelGoed", { waarde: kernGetal(uitkomst.waarde!) }) };
  }
  return (
    <div className={`tk-maat${m.e ? " gekoppeld" : ""}`}>
      <label>{label}</label>
      <GetalVeld
        waarde={huidig}
        stap={1}
        alleenLezen={!!m.e}
        onZet={(n) => onZet({ v: n }, `maat-${sleutel}`)}
      />
      <span className="tk-koppel">
        {koppelbaar && <input
          className="tk-veld"
          list={LIJST}
          value={m.e ?? ""}
          placeholder={t("paneel.koppelPlek")}
          spellCheck={false}
          onChange={(e) => {
            const tekst = e.target.value;
            onZet(tekst.trim() ? { v: huidig, e: tekst } : { v: huidig }, `koppel-${sleutel}`);
          }}
        />}
        {status && <span className={`tk-status ${status.klasse}`} title={status.titel}>{status.tekst}</span>}
      </span>
    </div>
  );
}

/** Een getalveld dat tijdens het typen zijn eigen tekst houdt. */
export function GetalVeld({
  waarde,
  onZet,
  min,
  stap,
  alleenLezen,
  leeg,
}: {
  waarde: number;
  onZet: (n: number) => void;
  min?: number;
  stap?: number;
  alleenLezen?: boolean;
  leeg?: boolean;
}) {
  const getoond = leeg ? "" : kernGetal(waarde);
  const [tekst, setTekst] = useState(getoond);
  const [bezig, setBezig] = useState(false);
  useEffect(() => {
    if (!bezig) setTekst(getoond);
  }, [getoond, bezig]);
  return (
    <input
      className="tk-veld tk-getal"
      type="number"
      value={tekst}
      min={min}
      step={stap}
      readOnly={alleenLezen}
      onFocus={() => setBezig(true)}
      onBlur={() => {
        setBezig(false);
        setTekst(getoond);
      }}
      onChange={(e) => {
        setTekst(e.target.value);
        const n = parseFloat(e.target.value.replace(",", "."));
        if (Number.isFinite(n) && (min === undefined || n >= min)) onZet(n);
      }}
    />
  );
}
