import type { ReactNode } from "react";
import { klasse, windLabel } from "../../../rapport/normwaarden";
import { leesPunt, puntTekst } from "../../../kaart/punt";
import { schaalTekst } from "../../../kaart/tegels";
import { onderschrift, situatieBijPunt, type KaartId, type Situatie as SituatieModel } from "../../../rapport/situatie";
import type { RapportWeergave } from "./useRapportWeergave";
import { Cel, Leeg, Rij, Vlak } from "./raster";

/*
 * De pagina Situatie: de plek van het project op drie kaarten van OpenStreetMap
 * (omgeving over de volle breedte, gebied en locatie ernaast) en daaronder de
 * gegevens van de plek. Staat direct na het voorblad op een eigen vel en niet in
 * de inhoudsopgave. Zonder situatie, of met het vinkje uit, komt er niets.
 */

/** "2026-11-06" in de notatie van de taal van het rapport; iets anders blijft zoals het is. */
function datumTekst(datum: string, taal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  if (!m) return datum;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat(taal, { dateStyle: "long", timeZone: "UTC" }).format(d);
}

function Kaart({ situatie, id, w }: { situatie: SituatieModel; id: KaartId; w: RapportWeergave }) {
  const beeld = situatie.kaarten.find((k) => k.id === id);
  if (!beeld) return null;
  const tekst = onderschrift(id, w.eenheden, w.taal, w.t);
  return (
    <figure className={`rpa-sit-kaart rpa-sit-${id}`}>
      <img src={`data:image/jpeg;base64,${beeld.jpeg}`} alt={tekst} />
      <figcaption>{tekst}</figcaption>
    </figure>
  );
}

function Regel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Rij>
      <Cel k={1} n={3} o klasse="rpa-label">{label}</Cel>
      <Cel k={4} n={6} o>{children}</Cel>
    </Rij>
  );
}

export default function Situatie({ w }: { w: RapportWeergave }) {
  const situatie = w.rapport.situatie;
  if (!situatie || !situatie.tonen) return null;
  const { t, taal, gegevens } = w;
  // Het adres hoort bij het punt van het project; horen de kaarten bij een ander punt, dan blijft het weg.
  const adresHoortErbij = situatieBijPunt(situatie, leesPunt(gegevens.locatie_punt)) === "actueel";
  const terrein = windLabel(klasse(gegevens.windgebied, 2), klasse(gegevens.terreincategorie, 2), taal);
  const water = situatie.water
    ? [schaalTekst(situatie.water.afstand, w.eenheden, taal), situatie.water.naam].filter(Boolean).join(", ")
    : "—";

  return (
    <section className="rpa-sectie rpa-situatie">
      <Vlak>
        <h1 className="rpa-h1">{t("afdruk.situatie.titel")}</h1>
        <div className="rpa-sit-beelden">
          <Kaart situatie={situatie} id="omgeving" w={w} />
          <div className="rpa-sit-paar">
            <Kaart situatie={situatie} id="gebied" w={w} />
            <Kaart situatie={situatie} id="locatie" w={w} />
          </div>
        </div>
        <Leeg />
        {adresHoortErbij && gegevens.locatie && <Regel label={t("afdruk.situatie.adres")}>{gegevens.locatie}</Regel>}
        <Regel label={t("afdruk.situatie.coordinaten")}>{puntTekst(situatie.punt, taal)}</Regel>
        <Regel label={t("afdruk.situatie.terreincategorie")}>
          {terrein} {t("afdruk.situatie.keuze")}
        </Regel>
        <Regel label={t("afdruk.situatie.water")}>{water}</Regel>
        <Regel label={t("afdruk.situatie.kaart")}>
          {t("afdruk.situatie.bron", { datum: datumTekst(situatie.datum, taal) })}
        </Regel>
      </Vlak>
    </section>
  );
}
