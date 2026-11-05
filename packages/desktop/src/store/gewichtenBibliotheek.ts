import { create } from "zustand";
import { getSetting, setSetting } from "../store";
import {
  bibliotheekAlsTekst,
  leesBibliotheek,
  openBestand,
  samenvoegenBestand,
  verwijderRegel,
  voegRegelToe,
  voegSamen,
  BIBLIOTHEEK_FORMAAT,
  BIBLIOTHEEK_VERSIE,
  type Bestandsuitslag,
  type Bibliotheek,
  type EigenStand,
  type Gewichtregel,
} from "../rapport/gewichtenBibliotheek";
import { bewaarBibliotheekBestand, kiesBibliotheekBestand, type Dialoogtekst } from "../rapport/gewichtenBestand";
import { laadMeegeleverd } from "../rapport/gewichtenLaden";

/**
 * De stand van de gewichtenbibliotheek: wat de app meelevert en de eigen bibliotheek van de
 * gebruiker. Dit is een instelling, geen projectgegeven: een rapport houdt zijn eigen kopie van
 * de getallen. In een browser zonder Tauri is er geen opslag (zie store.ts); daar geldt de eigen
 * bibliotheek alleen voor deze sessie en is het bestand de plek om hem te bewaren.
 *
 * Alles wordt pas gelezen als het venster opent: de app start er niet trager van.
 */

const INSTELLING = "gewichtenEigen";

interface GewichtenStand extends EigenStand {
  /** null zolang de meegeleverde bibliotheek nog niet geladen is. */
  meegeleverd: Gewichtregel[] | null;
  laadFout: boolean;
}

export const useGewichten = create<GewichtenStand>(() => ({
  meegeleverd: null,
  laadFout: false,
  eigen: null,
  gewijzigd: false,
}));

const eigenStand = (): EigenStand => {
  const { eigen, gewijzigd } = useGewichten.getState();
  return { eigen, gewijzigd };
};

function zet(stand: EigenStand) {
  useGewichten.setState(stand);
  void setSetting(INSTELLING, stand);
}

let geladen: Promise<void> | null = null;

/** Eén keer per sessie; mislukt de meegeleverde bibliotheek, dan probeert het venster het opnieuw. */
export function laadGewichten(): Promise<void> {
  geladen ??= (async () => {
    // Een bewaarde stand is ook invoer: klopt hij niet meer, dan begint de gebruiker leeg.
    const bewaard = await getSetting<{ eigen?: unknown; gewijzigd?: unknown } | null>(INSTELLING, null);
    if (bewaard?.eigen) {
      const u = leesBibliotheek(bewaard.eigen);
      if (u.ok && useGewichten.getState().eigen === null) {
        useGewichten.setState({ eigen: u.bibliotheek, gewijzigd: bewaard.gewijzigd === true });
      }
    }
    const uit = await laadMeegeleverd();
    if (!uit.ok) throw new Error(JSON.stringify(uit.fout));
    useGewichten.setState({ meegeleverd: uit.bibliotheek.regels, laadFout: false });
  })().catch((err) => {
    console.warn("Gewichtenbibliotheek:", err);
    geladen = null;
    useGewichten.setState({ laadFout: true });
  });
  return geladen;
}

/** Kiest een bestand en opent het als eigen bibliotheek; null als de gebruiker annuleert. */
export async function openEigen(tekst: Dialoogtekst): Promise<Bestandsuitslag | null> {
  const inhoud = await kiesBibliotheekBestand(tekst);
  if (inhoud === null) return null;
  const u = openBestand(eigenStand(), inhoud);
  if (u.fout === null) zet(u.stand);
  return u;
}

/** Kiest een bestand en voegt het samen met de eigen bibliotheek. */
export async function voegBestandSamen(tekst: Dialoogtekst): Promise<Bestandsuitslag | null> {
  const inhoud = await kiesBibliotheekBestand(tekst);
  if (inhoud === null) return null;
  const u = samenvoegenBestand(eigenStand(), inhoud);
  if (u.fout === null) zet(u.stand);
  return u;
}

export function voegEigenRegelToe(regel: Gewichtregel) {
  zet(voegRegelToe(eigenStand(), regel));
}

export function verwijderEigenRegel(id: string) {
  zet(verwijderRegel(eigenStand(), id));
}

export function sluitEigen() {
  zet({ eigen: null, gewijzigd: false });
}

export type BewaarKeuze = "alles" | "meegeleverd" | "eigen";

/**
 * Wat er in een bestand komt. `eigen` is de eigen bibliotheek; `meegeleverd` is wat de app meelevert;
 * `alles` is die twee samen, en met een eigen versie van een regel gaat die voor.
 */
function teBewaren(keuze: BewaarKeuze, naam: Bibliotheek["naam"]): Bibliotheek {
  const { meegeleverd, eigen } = useGewichten.getState();
  const mee: Bibliotheek = { formaat: BIBLIOTHEEK_FORMAAT, versie: BIBLIOTHEEK_VERSIE, naam, regels: meegeleverd ?? [] };
  if (keuze === "meegeleverd" || !eigen) return mee;
  if (keuze === "eigen") return eigen;
  const eigenIds = new Set(eigen.regels.map((r) => r.id));
  return voegSamen(eigen, { ...mee, regels: mee.regels.filter((r) => !eigenIds.has(r.id)) }).bibliotheek;
}

/** Schrijft weg via een dialoog. Geeft het aantal regels, of null als de gebruiker annuleert. */
export async function bewaarBestand(keuze: BewaarKeuze, naamMeegeleverd: Bibliotheek["naam"], taal: string, tekst: Dialoogtekst): Promise<number | null> {
  const b = teBewaren(keuze, naamMeegeleverd);
  const gelukt = await bewaarBibliotheekBestand(bibliotheekAlsTekst(b), b.naam[taal] ?? b.naam.en, tekst);
  if (!gelukt) return null;
  // Alleen wat de eigen bibliotheek bevat, telt als bewaard.
  if (keuze !== "meegeleverd" && useGewichten.getState().eigen) zet({ eigen: useGewichten.getState().eigen, gewijzigd: false });
  return b.regels.length;
}
