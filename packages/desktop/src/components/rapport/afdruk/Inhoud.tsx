import type { RapportWeergave } from "./useRapportWeergave";
import { bijlageAnker, type Inhoudsregel } from "../../../rapport/opzet";
import { Cel, PaginaCel, Rij, Vlak } from "./raster";

/** Een paragraaf, blad of kop uit een blad: nummer, titel en paginanummer. */
function Regel({ regel, klasse }: { regel: Inhoudsregel; klasse?: string }) {
  return (
    <Rij klasse={klasse}>
      <Cel k={2}>{regel.nummer}</Cel>
      <Cel k={3} n={7} klasse={regel.niveau === 3 ? "rpa-io-titel rpa-io-kop3" : "rpa-io-titel"}>{regel.titel}</Cel>
      <PaginaCel anker={regel.anker} />
    </Rij>
  );
}

/**
 * De inhoudsopgave: hoofdstukken (vet, accentkleur, met een lege regel
 * ervoor) en paragrafen, daarna de bijlagen. Het paginanummer rechts vult het
 * afdrukvoorbeeld in als de vellen zijn verdeeld (PaginaCel in raster.tsx). Een
 * eigen bijlage heeft geen nummer: het document zelf zit niet in dit rapport.
 *
 * Met opmaak.bladenInInhoud staan ook de bladen erin (w.inhoud, w.inhoudBijlage),
 * op de plek waar hun uitwerking staat.
 */
export default function Inhoud({ w }: { w: RapportWeergave }) {
  return (
    <section className="rpa-sectie rpa-inhoud">
      <Vlak>
        <h1 className="rpa-h1">Inhoud</h1>
        {w.inhoud.map((r, i) => (
          <Regel key={r.anker} regel={r} klasse={r.niveau === 1 ? (i === 0 ? "rpa-io1" : "rpa-io1 rpa-voor") : undefined} />
        ))}
        {w.bijlagen.flatMap((b, i) => {
          const heeftInhoud = b.letter === "A";
          return [
            <Rij key={b.letter} klasse={i === 0 ? "rpa-voor" : undefined}>
              <Cel k={2} klasse="rpa-vet">Bijlage {b.letter}</Cel>
              <Cel k={3} n={7} klasse="rpa-io-titel">{b.titel}</Cel>
              {heeftInhoud && <PaginaCel anker={bijlageAnker(b.letter)} />}
            </Rij>,
            ...(heeftInhoud ? w.inhoudBijlage.map((r) => <Regel key={r.anker} regel={r} />) : []),
          ];
        })}
      </Vlak>
    </section>
  );
}
