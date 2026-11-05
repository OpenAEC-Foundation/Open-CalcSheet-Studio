import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { Combinatieregel, Factorregel, LokaleKlasse, Psiregel, Windcoefficient } from "../../../rapport/model";
import { inTaal } from "../../../rapport/meertalig";
import { EN1990_BRONNEN } from "../../../rapport/normen/en1990";
import { groothedenVan, lokaalVan, normenVan, type Normkeuze } from "../../../rapport/normen/keuze";
import type { LocatieOnderwerp } from "../../../rapport/normen/landen";
import { beta, fmt, getal, inspectieniveau, klasse, ontwerpSupervisie } from "../../../rapport/normwaarden";
import { useNormkeuze } from "../../../store/actiefBlad";
import { kFiVoor, projectWaarde } from "../../../store/projectGegevens";
import { useProjectStore } from "../../../store/projectStore";
import BronLink from "../../calc/BronLink";
import { Index } from "../afdruk/raster";
import { getalTekst } from "./hulp";
import RijenTabel, { type Kolom } from "./RijenTabel";
import { Afgeleid, Veld, useRapport } from "./velden";

/*
 * De invoer buiten de Nederlandse tabellen (normen/keuze.ts): de grootheid die in dit land
 * geldt, met de bron en een link naar de officiële plek. De app haalt niets op bij een externe
 * dienst en vult geen getal voor: wat niet is ingevuld, blijft leeg.
 */

/** De invoer van het land van dit project en het pad ernaartoe. */
function useLokaal() {
  const rapport = useRapport();
  const k = useNormkeuze();
  return { k, rapport, l: lokaalVan(rapport, k), pad: `lokaal.${k.land.code}` };
}

/** De waarden die de locatie levert voor dit onderwerp, met de bron en de links. */
export function LocatieInvoer({ onderwerp }: { onderwerp: LocatieOnderwerp }) {
  const { t, i18n } = useTranslation("rapport");
  const { k, l, pad } = useLokaal();
  const taal = i18n.language;
  const locatie = k.land.locatie[onderwerp];
  const grootheden = groothedenVan(k.land, onderwerp);
  const norm = normenVan(k)[onderwerp];
  return (
    <>
      {grootheden.length > 0 && <p className="rapport-hint">{t("lokaal.invullen", { land: inTaal(k.land.naam, taal) })}</p>}
      {locatie.opmerking && <p className="rapport-hint">{inTaal(locatie.opmerking, taal)}</p>}
      {grootheden.map((g) => (
        <Veld
          key={g.id}
          label={<>{inTaal(g.naam, taal)}{g.symbool && <> <Index t={g.symbool} /></>}</>}
          pad={`${pad}.${onderwerp}.waarden.${g.id}`}
          waarde={l[onderwerp].waarden[g.id] ?? ""}
          eenheid={g.eenheid || undefined}
          hint={g.bevestigd ? undefined : t("lokaal.teBevestigen")}
        />
      ))}
      {grootheden.length > 0 && (
        <Veld
          label={t("lokaal.bron")}
          pad={`${pad}.${onderwerp}.bron`}
          waarde={l[onderwerp].bron}
          placeholder={t("lokaal.bronVoorbeeld")}
          hint={t("lokaal.bronHint")}
        />
      )}
      <p className="rapport-hint">
        {t("lokaal.norm")} <BronLink url={norm.url}>{norm.aanduiding}</BronLink>
        {norm.editie ? ` · ${norm.editie}` : ` · ${t("lokaal.editieTeBevestigen")}`}
        {locatie.waardenUrl && <> · <BronLink url={locatie.waardenUrl}>{t("lokaal.waardenBron")}</BronLink></>}
      </p>
    </>
  );
}

/** 5.1: de grootheid en de ingevulde belasting op een plat dak. */
export function LokaleSneeuwInvoer() {
  const { t } = useTranslation("rapport");
  const { l, pad } = useLokaal();
  return (
    <>
      <LocatieInvoer onderwerp="sneeuw" />
      <Veld label={t("lokaal.sneeuwPlatDak")} pad={`${pad}.sneeuw.s`} waarde={l.sneeuw.s} eenheid="kN/m²" hint={t("lokaal.nietBerekend")} />
    </>
  );
}

/** 5.2: de grootheid, de ingevulde stuwdruk en de coëfficiënten met P_rep = c · q. */
export function LokaleWindInvoer() {
  const { t } = useTranslation("rapport");
  const { k, l, pad, rapport } = useLokaal();
  const { wind } = rapport.belastingen;
  const q = getal(l.wind.q);
  const kolommen: Kolom<Windcoefficient>[] = [
    { sleutel: "omschrijving", kop: t("algemeen.omschrijving"), placeholder: t("belastingen.windVoorbeeld") },
    { sleutel: "c", kop: "c", breedte: "6em", getal: true },
  ];
  return (
    <>
      <LocatieInvoer onderwerp="wind" />
      <div className="rapport-rij">
        <Veld label={t("belastingen.gebouwhoogte")} pad="belastingen.wind.gebouwhoogte" waarde={wind.gebouwhoogte} eenheid="m" placeholder={t("belastingen.gebouwhoogteVoorbeeld")} />
        {k.eurocode && <Veld label={<>c<sub>s</sub>c<sub>d</sub></>} pad="belastingen.wind.cscd" waarde={wind.cscd} />}
      </div>
      <Veld label={t("lokaal.stuwdruk")} pad={`${pad}.wind.q`} waarde={l.wind.q} eenheid="kN/m²" hint={t("lokaal.nietBerekend")} />
      <h6 className="rapport-subkop">{t("belastingen.coefficienten")}</h6>
      <RijenTabel<Windcoefficient>
        pad="belastingen.wind.coefficienten"
        rijen={wind.coefficienten}
        kolommen={kolommen}
        nieuweRij={() => ({ omschrijving: "", c: "" })}
        toevoegen={t("belastingen.coefficientToevoegen")}
        extra={[{ kop: <>P<sub>rep</sub> [kN/m²]</>, breedte: "8em", waarde: (rij) => getalTekst(getal(rij.c) * q, 2, false, rapport.taal) }]}
      />
    </>
  );
}

/** 5.4: geen tabel om uit te kiezen, dus q_k en Q_k zijn invoer. */
export function LokaleKlassenInvoer() {
  const { t, i18n } = useTranslation("rapport");
  const { k, l, pad } = useLokaal();
  const kolommen: Kolom<LokaleKlasse>[] = [
    { sleutel: "omschrijving", kop: t("belastingen.categorie") },
    { sleutel: "qk", kop: <>q<sub>k</sub> (kN/m²)</>, breedte: "7em", getal: true },
    { sleutel: "Qk", kop: <>Q<sub>k</sub> (kN)</>, breedte: "6em", getal: true },
  ];
  const norm = normenVan(k).belastingen;
  return (
    <>
      <p className="rapport-hint">{t("lokaal.klassenUitleg", { land: inTaal(k.land.naam, i18n.language) })} <BronLink url={norm.url}>{norm.aanduiding}</BronLink></p>
      <RijenTabel<LokaleKlasse>
        pad={`${pad}.klassen`}
        rijen={l.klassen}
        kolommen={kolommen}
        nieuweRij={() => ({ omschrijving: "", qk: "", Qk: "" })}
        toevoegen={t("belastingen.klasseToevoegen")}
      />
    </>
  );
}

function factorKolommen(t: TFunction<"rapport">): Kolom<Factorregel>[] {
  return [
    { sleutel: "groep", kop: t("afdruk.factoren.groep"), breedte: "4em" },
    { sleutel: "naam", kop: t("afdruk.factoren.naam") },
    { sleutel: "gGinf", kop: <>γ<sub>Gkj;inf</sub></>, breedte: "5em", getal: true },
    { sleutel: "gGsup", kop: <>γ<sub>Gkj;sup</sub></>, breedte: "5em", getal: true },
    { sleutel: "gQ1", kop: <>γ<sub>Q;1</sub></>, breedte: "5.5em", getal: true },
    { sleutel: "gQi", kop: <>γ<sub>Q;2</sub></>, breedte: "5.5em", getal: true },
  ];
}

function psiKolommen(t: TFunction<"rapport">): Kolom<Psiregel>[] {
  return [
    { sleutel: "naam", kop: t("afdruk.lokaal.belasting") },
    { sleutel: "psi0", kop: <>ψ<sub>0</sub></>, breedte: "4.5em", getal: true },
    { sleutel: "psi1", kop: <>ψ<sub>1</sub></>, breedte: "4.5em", getal: true },
    { sleutel: "psi2", kop: <>ψ<sub>2</sub></>, breedte: "4.5em", getal: true },
  ];
}

function combinatieKolommen(t: TFunction<"rapport">): Kolom<Combinatieregel>[] {
  return [
    { sleutel: "naam", kop: t("afdruk.lokaal.combinatie"), breedte: "35%" },
    { sleutel: "formule", kop: t("afdruk.lokaal.formule"), placeholder: t("lokaal.formuleVoorbeeld") },
  ];
}

/**
 * 4.5: in een Eurocode-land de aanbevolen waarden uit EN 1990 als invoer, met de melding over de
 * nationale bijlage; buiten de Eurocodes de eigen combinaties.
 */
export function LokaleFactorenInvoer() {
  const { t, i18n } = useTranslation("rapport");
  const { k, l, pad } = useLokaal();
  const land = inTaal(k.land.naam, i18n.language);
  const norm = normenVan(k).belastingen;
  if (!k.eurocode) {
    return (
      <>
        <p className="rapport-hint">{t("lokaal.combinatiesUitleg", { land })} <BronLink url={norm.url}>{norm.aanduiding}</BronLink></p>
        <RijenTabel<Combinatieregel>
          pad={`${pad}.combinaties`}
          rijen={l.combinaties}
          kolommen={combinatieKolommen(t)}
          nieuweRij={() => ({ naam: "", formule: "" })}
          toevoegen={t("lokaal.combinatieToevoegen")}
        />
      </>
    );
  }
  const nieuweFactor = (): Factorregel => ({ groep: "", naam: "", gGinf: "", gGsup: "", gQ1: "", gQi: "" });
  return (
    <>
      {k.generatie === 1 ? (
        <p className="rapport-melding-blok rapport-hint">
          {t("lokaal.factorenAanbevolen", { land })}{" "}
          {EN1990_BRONNEN.map((b, i) => (
            <span key={b.url}>{i > 0 && " · "}<BronLink url={b.url}>{b.titel}</BronLink></span>
          ))}
        </p>
      ) : (
        <p className="rapport-melding-blok rapport-hint">{t("lokaal.factorenGeneratie2")}</p>
      )}
      <RijenTabel<Factorregel>
        pad={`${pad}.factoren`}
        rijen={l.factoren}
        kolommen={factorKolommen(t)}
        nieuweRij={nieuweFactor}
        toevoegen={t("uitgangspunten.regelToevoegen")}
      />
      <h6 className="rapport-subkop">{t("lokaal.psiKop")}</h6>
      <RijenTabel<Psiregel>
        pad={`${pad}.psi`}
        rijen={l.psi}
        kolommen={psiKolommen(t)}
        nieuweRij={() => ({ naam: "", psi0: "", psi1: "", psi2: "" })}
        toevoegen={t("uitgangspunten.regelToevoegen")}
      />
    </>
  );
}

/**
 * 4.1: wat uit de projectgegevens volgt. Tabel 2.1 en bijlage B staan in EN 1990 zelf, dus een
 * Eurocode-land van de eerste generatie ziet ze; de klasse van de Nederlandse bijlage niet. De
 * klasse uit de norm van dit land is een eigen veld.
 */
export function LokaalBouwwerkInvoer({ k }: { k: Normkeuze }) {
  const { t, i18n } = useTranslation("rapport");
  const { l, pad, rapport } = useLokaal();
  const gegevens = useProjectStore((s) => s.gegevens);
  const cc = klasse(gegevens.CC, 2);
  const rc = klasse(gegevens.RC, 2);
  const jaren = getal(projectWaarde(gegevens, "DesignLife"));
  const eerste = k.eurocode && k.generatie === 1;
  const en1990 = (nummer: string) => (eerste ? `EN 1990 ${t("algemeen.tabel", { nummer })}` : undefined);
  const f = (v: number, dec: number) => fmt(v, dec, false, rapport.taal);
  return (
    <>
      <Afgeleid
        uitProjectgegevens
        regels={[
          ...(k.eurocode ? [
            { label: t("uitgangspunten.gevolgklasse"), waarde: `CC${cc}` },
            { label: t("uitgangspunten.betrouwbaarheidsklasse"), waarde: `RC${rc}` },
          ] : []),
          {
            label: t("uitgangspunten.ontwerplevensduur"),
            waarde: Number.isFinite(jaren) ? t("lokaal.levensduur", { jaren: fmt(jaren, 0, false, rapport.taal) }) : "—",
            bron: en1990("2.1"),
          },
          ...(eerste ? [
            { label: t("uitgangspunten.betrouwbaarheidsindex"), waarde: f(beta(rc), 1), bron: en1990("B2") },
            { label: <>K<sub>FI</sub></>, waarde: f(kFiVoor(cc), 2), bron: en1990("B3") },
            { label: t("uitgangspunten.supervisie"), waarde: ontwerpSupervisie(rc), bron: en1990("B4") },
            { label: t("uitgangspunten.inspectieniveau"), waarde: inspectieniveau(rc), bron: en1990("B5") },
          ] : []),
        ]}
      />
      <Veld
        label={t("afdruk.lokaal.veiligheid")}
        pad={`${pad}.veiligheid`}
        waarde={l.veiligheid}
        hint={t("lokaal.veiligheidHint", { land: inTaal(k.land.naam, i18n.language) })}
      />
    </>
  );
}
