import { Fragment } from "react";
import { laatsteRevisie } from "../../../rapport/revisies";
import type { Rapportknoop } from "../../../rapport/opzet";
import { keuzeVan, plekVanRegel, regelKop, regelTekst, zichtbareRegels, type Wijzigingsregel } from "../../../rapport/wijzigingen";
import type { RapportWeergave } from "./useRapportWeergave";
import { Cel, Leeg, PaginaCel, Rij } from "./raster";

/*
 * De lijst met wijzigingen op papier: per plek de pagina en wat er anders is dan in de oudertak,
 * met de aanvulling van de gebruiker eronder. Het paginanummer komt er op de vellen in, net als bij
 * de inhoudsopgave (PaginaCel in raster.tsx), dus de verdeling verandert er niet door.
 */

/** Tekst die afbreekt binnen zijn kolommen, regel voor regel: de paginering verdeelt per rij. */
function Regels({ tekst, houd }: { tekst: string; houd?: boolean }) {
  const regels = tekst.split("\n").map((r) => r.trim()).filter((r) => r !== "");
  return (
    <>
      {regels.map((r, i) => (
        <Rij key={i} houd={houd || i < regels.length - 1}>
          <Cel k={3} n={8} klasse="rpa-afbreken">{r}</Cel>
        </Rij>
      ))}
    </>
  );
}

/** Eén regel van de lijst: nummer, kop en pagina, met daaronder wat er anders is. */
function Regel({ regel, w }: { regel: Wijzigingsregel; w: RapportWeergave }) {
  const plek = plekVanRegel(regel, w.knopen, w.bijlageBladen);
  const toelichting = keuzeVan(w.rapport, regel.sleutel).toelichting;
  return (
    <Fragment>
      <Rij houd>
        <Cel k={2}>{plek.nummer}</Cel>
        <Cel k={3} n={7} klasse="rpa-io-titel rpa-vet">{regelKop(regel, w.t)}</Cel>
        {plek.anker ? <PaginaCel anker={plek.anker} /> : <Cel k={10} klasse="rpa-io-pagina">{plek.pagina}</Cel>}
      </Rij>
      <Regels tekst={regelTekst(regel, w.rapport, w.t, w.taal)} houd={!!toelichting} />
      {toelichting && <Regels tekst={toelichting} />}
    </Fragment>
  );
}

/** De regels; de kop eromheen komt van de plek waar de lijst staat. */
export function WijzigingenRegels({ w }: { w: RapportWeergave }) {
  return (
    <>
      {zichtbareRegels(w.rapport).map((r) => <Regel key={r.sleutel} regel={r} w={w} />)}
    </>
  );
}

/**
 * De lijst onder de inhoudsopgave: een kop zonder nummer, de versie, en de regels. Met de keuze voor
 * een nieuwe pagina begint hij op een eigen vel (print-nieuw-vel, zie paginering.ts).
 */
export function WijzigingenBijInhoud({ knoop, w }: { knoop: Rapportknoop; w: RapportWeergave }) {
  const revisie = laatsteRevisie(w.rapport.revisies);
  return (
    <>
      {!knoop.nieuwePagina && <Leeg />}
      <h3 className={`rpa-io-kop rpa-houd${knoop.nieuwePagina ? " print-nieuw-vel" : ""}`} data-inhoud={knoop.id}>{knoop.titel}</h3>
      {revisie && (
        <p className="rpa-tekst rpa-houd">
          {w.t("afdruk.wijzigingen.versie", { code: revisie.code, datum: revisie.datum })}
          {revisie.omschrijving.trim() && `: ${revisie.omschrijving.trim()}`}
        </p>
      )}
      <WijzigingenRegels w={w} />
    </>
  );
}
