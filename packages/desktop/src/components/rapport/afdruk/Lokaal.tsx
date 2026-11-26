import type { ReactNode } from "react";
import { inTaal } from "../../../rapport/meertalig";
import { beta, getal, inspectieniveau, klasse, ontwerpSupervisie } from "../../../rapport/normwaarden";
import { groothedenVan, normenVan } from "../../../rapport/normen/keuze";
import { ONDERWERPEN, type LocatieOnderwerp } from "../../../rapport/normen/landen";
import { kFiVoor, projectWaarde } from "../../../store/projectGegevens";
import { Cel, Eenheid, Index, Leeg, Rij, Tekst } from "./raster";
import type { RapportWeergave } from "./useRapportWeergave";

/*
 * Wat er op papier staat buiten de Nederlandse tabellen (normen/keuze.ts): de grootheid die
 * daar geldt, met de bron, en de invoer. Niets hieruit is afgeleid uit normwaarden.ts, behalve
 * wat de EN zelf geeft (bijlage B van EN 1990, alleen bij de eerste generatie). Wat niet is
 * ingevuld, zegt dat: een lege cel lijkt anders op "geen eis".
 *
 * Net als hoofdstuk 4 en 5 springt dit één kolom in, dus kolom 1 is kolom 2 van het vel.
 */

/** Label over vijf kolommen, de waarde, de eenheid, een lijn onder allemaal; rechts eventueel iets kleins. */
function Regel({ label, waarde, eenheid, klein, w }: {
  label: ReactNode; waarde: string; eenheid?: ReactNode; klein?: string; w: RapportWeergave;
}) {
  return (
    <Rij klasse="rpa-tt">
      <Cel k={1} n={5} o>{label}</Cel>
      <Cel k={6} o klasse={waarde ? "rpa-invoer" : undefined}>{waarde ? w.n(waarde) : "—"}</Cel>
      <Cel k={7} o>{eenheid}</Cel>
      {klein && <Cel k={8} n={2} klasse="rpa-norm">{klein}</Cel>}
    </Rij>
  );
}

/** De grootheden die de locatie levert voor dit onderwerp, en waar ze vandaan komen. */
function Locatie({ onderwerp, w }: { onderwerp: LocatieOnderwerp; w: RapportWeergave }) {
  const { land } = w.normkeuze;
  const invoer = w.lokaal[onderwerp];
  const grootheden = groothedenVan(land, onderwerp);
  const opmerking = land.locatie[onderwerp].opmerking;
  return (
    <>
      {grootheden.map((g) => (
        <Regel
          key={g.id}
          w={w}
          label={<>{inTaal(g.naam, w.taal)}{g.symbool && <> <Index t={g.symbool} /></>}</>}
          waarde={invoer.waarden[g.id] ?? ""}
          eenheid={g.eenheid}
          klein={g.bevestigd ? undefined : w.t("afdruk.lokaal.teBevestigen")}
        />
      ))}
      {grootheden.length > 0 && (
        <Rij klasse="rpa-tt">
          <Cel k={1} n={2} o>{w.t("afdruk.lokaal.bron")}</Cel>
          <Cel k={3} n={7} o klasse={invoer.bron.trim() ? "rpa-invoer" : undefined}>{invoer.bron.trim() || w.t("afdruk.lokaal.nietIngevuld")}</Cel>
        </Rij>
      )}
      {opmerking && <p className="rpa-tekst">{inTaal(opmerking, w.taal)}</p>}
    </>
  );
}

/** Rechts de norm bij een getal, als die er is; hetzelfde label als in de Nederlandse tabel. */
function Veld({ label, waarde, norm, invoer }: { label: ReactNode; waarde: ReactNode; norm?: string; invoer?: boolean }) {
  return (
    <Rij>
      <Cel k={1} n={3} o>{label}</Cel>
      <Cel k={4} o klasse={invoer ? "rpa-invoer" : undefined}>{waarde}</Cel>
      {norm && <Cel k={8} n={2} klasse="rpa-norm">{norm}</Cel>}
    </Rij>
  );
}

/**
 * 4.1 buiten de Nederlandse tabellen. Tabel 2.1 en bijlage B komen uit EN 1990 zelf, dus in een
 * Eurocode-land van de eerste generatie staan ze er wel; de levensduurklasse van de Nederlandse
 * bijlage niet. Onder de uitgangspunten de normen van dit land.
 */
export function LokaalBouwwerk({ w }: { w: RapportWeergave }) {
  const { normkeuze: k, t, f } = w;
  const cc = klasse(w.gegevens.CC, 2);
  const rc = klasse(w.gegevens.RC, 2);
  const jaren = getal(projectWaarde(w.gegevens, "DesignLife"));
  const levensduur = Number.isFinite(jaren) ? jaren : 50;
  const eerste = k.eurocode && k.generatie === 1;
  const en1990 = (nummer: string) => (eerste ? `EN 1990 ${t("algemeen.tabel", { nummer })}` : undefined);
  const normen = normenVan(k);
  return (
    <>
      <Veld label={t("afdruk.bouwwerk.soort")} waarde={w.rapport.uitgangspunten.soortBouwwerk} invoer />
      {k.eurocode && <Veld label={t("afdruk.bouwwerk.gevolgklasse")} waarde={`CC${cc}`} invoer />}
      {k.eurocode && <Veld label={t("afdruk.bouwwerk.betrouwbaarheidsklasse")} waarde={`RC${rc}`} />}
      <Veld label={t("afdruk.bouwwerk.levensduur")} waarde={f(levensduur, 0)} norm={en1990("2.1")} />
      {eerste && (
        <>
          <Veld label="β" waarde={f(beta(rc), 1)} norm={en1990("B2")} />
          <Veld label={<>K<sub>FI</sub></>} waarde={f(kFiVoor(cc), 2)} norm={en1990("B3")} />
          <Veld label={t("afdruk.bouwwerk.supervisie")} waarde={ontwerpSupervisie(rc)} norm={en1990("B4")} />
          <Veld label={t("afdruk.bouwwerk.inspectie")} waarde={inspectieniveau(rc)} norm={en1990("B5")} />
        </>
      )}
      {w.lokaal.veiligheid.trim() && <Veld label={t("afdruk.lokaal.veiligheid")} waarde={w.lokaal.veiligheid} invoer />}
      <Leeg />
      <Rij klasse="rpa-vet" houd>
        <Cel k={1} n={9} o>{t("afdruk.lokaal.normenKop", { land: inTaal(k.land.naam, w.taal) })}</Cel>
      </Rij>
      {ONDERWERPEN.map((o) => (
        <Rij key={o} klasse="rpa-tt">
          <Cel k={1} n={2} o>{t(`afdruk.lokaal.onderwerpen.${o}`)}</Cel>
          <Cel k={3} n={7} o>{normen[o].aanduiding} · {normen[o].editie ?? t("afdruk.lokaal.editieTeBevestigen")}</Cel>
        </Rij>
      ))}
    </>
  );
}

/**
 * 4.5 buiten de Eurocodes: de combinaties zoals de norm van dit land ze schrijft. Geen kolommen
 * γ_G en γ_Q: die horen bij de Eurocode.
 */
export function EigenCombinaties({ w }: { w: RapportWeergave }) {
  const rijen = w.lokaal.combinaties;
  if (rijen.length === 0) return <p className="rpa-tekst">{w.t("afdruk.lokaal.combinatiesNietIngevuld")}</p>;
  return (
    <>
      <Rij houd>
        <Cel k={1} n={3} b o l klasse="rpa-kop-donker">{w.t("afdruk.lokaal.combinatie")}</Cel>
        <Cel k={4} n={6} b o l r klasse="rpa-kop-donker">{w.t("afdruk.lokaal.formule")}</Cel>
      </Rij>
      {rijen.map((r, i) => (
        <Rij key={i} klasse="rpa-tt">
          <Cel k={1} n={3} o l>{r.naam}</Cel>
          <Cel k={4} n={6} o l r klasse="rpa-invoer">{r.formule}</Cel>
        </Rij>
      ))}
    </>
  );
}

/** Onder de factoren in een Eurocode-land: de melding over de nationale bijlage en de ψ-factoren. */
export function FactorenSlot({ w }: { w: RapportWeergave }) {
  const { t, n, normkeuze: k } = w;
  if (k.generatie === 2) return <p className="rpa-tekst">{t("afdruk.lokaal.factorenGeneratie2")}</p>;
  return (
    <>
      <p className="rpa-tekst">{t("afdruk.lokaal.factorenAanbevolen")}</p>
      <Leeg />
      <Rij houd>
        <Cel k={1} n={5} b o l klasse="rpa-kop-donker">{t("afdruk.lokaal.belasting")}</Cel>
        <Cel k={6} b o l klasse="rpa-kop-donker rpa-midden">ψ<sub>0</sub></Cel>
        <Cel k={7} b o klasse="rpa-kop-donker rpa-midden">ψ<sub>1</sub></Cel>
        <Cel k={8} b o r klasse="rpa-kop-donker rpa-midden">ψ<sub>2</sub></Cel>
      </Rij>
      {w.lokaal.psi.map((r, i) => (
        <Rij key={i} klasse="rpa-tt">
          <Cel k={1} n={5} o l>{r.naam}</Cel>
          <Cel k={6} o l klasse="rpa-midden">{n(r.psi0)}</Cel>
          <Cel k={7} o klasse="rpa-midden">{n(r.psi1)}</Cel>
          <Cel k={8} o r klasse="rpa-midden">{n(r.psi2)}</Cel>
        </Rij>
      ))}
    </>
  );
}

/** 4.12: de tekst uit het rapport, en de grootheid die hier geldt. */
export function LokaleAardbeving({ w }: { w: RapportWeergave }) {
  const tekst = w.rapport.teksten.aardbeving ?? "";
  return (
    <>
      <Tekst tekst={tekst} invul={w.invul} subkoppen={w.rapport.opmaak.subkoppen} />
      {tekst.trim() && <Leeg />}
      <Locatie onderwerp="aardbeving" w={w} />
    </>
  );
}

/** 5.1: de grootheid, de ingevulde belasting op een plat dak, en de tekst eronder. */
export function LokaleSneeuw({ w }: { w: RapportWeergave }) {
  const tekst = w.rapport.teksten.sneeuw ?? "";
  return (
    <>
      <Locatie onderwerp="sneeuw" w={w} />
      <Regel w={w} label={w.t("afdruk.lokaal.sneeuwPlatDak")} waarde={w.lokaal.sneeuw.s} eenheid={<Eenheid e="kN/m2" />} />
      {tekst.trim() && (
        <>
          <Leeg />
          <Tekst tekst={tekst} invul={w.invul} subkoppen={w.rapport.opmaak.subkoppen} />
        </>
      )}
    </>
  );
}

/**
 * 5.2: de grootheid, de ingevulde stuwdruk, en per coëfficiënt P_rep = c · q. De stuwdruk is
 * invoer: de keten naar q_p staat in de nationale bijlage en is hier niet na te rekenen. Geen
 * ψ-factoren: die staan bij de factoren, of ze bestaan niet.
 */
export function LokaleWind({ w }: { w: RapportWeergave }) {
  const { t, f, n } = w;
  const { wind } = w.rapport.belastingen;
  const q = getal(w.lokaal.wind.q);
  return (
    <>
      <Locatie onderwerp="wind" w={w} />
      <Regel w={w} label={t("afdruk.belastingen.gebouwhoogte")} waarde={wind.gebouwhoogte} eenheid={<Eenheid e="m" />} />
      {w.normkeuze.eurocode && <Regel w={w} label={<>c<sub>s</sub>*c<sub>d</sub></>} waarde={wind.cscd} />}
      <Regel w={w} label={t("afdruk.lokaal.stuwdruk")} waarde={w.lokaal.wind.q} eenheid={<Eenheid e="kN/m2" />} />
      {wind.coefficienten.length > 0 && (
        <>
          <Leeg />
          <Rij klasse="rpa-tt" houd>
            <Cel k={1} o klasse="rpa-vet">c</Cel>
            <Cel k={2} o klasse="rpa-vet">P<sub>rep</sub></Cel>
          </Rij>
        </>
      )}
      {wind.coefficienten.map((c, i) => (
        <Rij key={i} klasse="rpa-tt">
          <Cel k={1} o>{n(c.c)}</Cel>
          <Cel k={2} o>{f(getal(c.c) * q, 2)}</Cel>
          <Cel k={3} o><Eenheid e="kN/m2" /></Cel>
          {c.omschrijving && <Cel k={4} n={6}>{c.omschrijving}</Cel>}
        </Rij>
      ))}
    </>
  );
}

/** 5.4: geen tabel om uit te kiezen, dus q_k en Q_k zoals ze zijn ingevuld. */
export function LokaleKlassen({ w }: { w: RapportWeergave }) {
  const { t, n } = w;
  const rijen = w.lokaal.klassen;
  if (rijen.length === 0) return <p className="rpa-tekst">{t("afdruk.lokaal.klassenNietIngevuld")}</p>;
  return (
    <>
      <Rij klasse="rpa-tt" houd>
        <Cel k={1} n={5} o klasse="rpa-vet">{t("afdruk.belastingen.klasse")}</Cel>
        <Cel k={6} o klasse="rpa-vet">q<sub>k</sub></Cel>
        <Cel k={7} o klasse="rpa-vet"><Eenheid e="kN/m2" /></Cel>
        <Cel k={8} o klasse="rpa-vet">Q<sub>k</sub></Cel>
        <Cel k={9} o klasse="rpa-vet"><Eenheid e="kN" /></Cel>
      </Rij>
      {rijen.map((k, i) => (
        <Rij key={i} klasse="rpa-tt">
          <Cel k={1} n={5} o klasse="rpa-invoer">{k.omschrijving}</Cel>
          <Cel k={6} o klasse={k.qk ? "rpa-invoer" : undefined}>{k.qk ? n(k.qk) : "—"}</Cel>
          <Cel k={7} o />
          <Cel k={8} o klasse={k.Qk ? "rpa-invoer" : undefined}>{k.Qk ? n(k.Qk) : "—"}</Cel>
          <Cel k={9} o />
        </Rij>
      ))}
    </>
  );
}
