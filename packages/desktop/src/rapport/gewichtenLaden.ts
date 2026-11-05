import { verenigDelen, type Leesuitslag } from "./gewichtenBibliotheek";

/**
 * De meegeleverde bibliotheek: één JSON-bestand per categorie in library/gewichten/. De bouw maakt
 * van elk bestand een eigen stuk, en dat stuk wordt pas opgehaald als het venster opent, zodat de
 * app er bij het starten niets van merkt. Anders dan de voorbeelden in library/ gaan deze
 * gegevens wel mee in de installer: de bibliotheek werkt ook zonder verbinding.
 */
const DELEN = import.meta.glob("../../../../library/gewichten/*.json", { import: "default" });

let belofte: Promise<Leesuitslag> | null = null;

/** De hele meegeleverde bibliotheek. Eén keer per sessie; mislukt het, dan kan het opnieuw. */
export function laadMeegeleverd(): Promise<Leesuitslag> {
  belofte ??= Promise.all(Object.keys(DELEN).sort().map((pad) => DELEN[pad]()))
    .then(verenigDelen)
    .catch((err) => {
      belofte = null;
      throw err;
    });
  return belofte;
}
