import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { inTaal, type Meertalig } from "../../../rapport/meertalig";
import { ROLLEN } from "../../../rapport/model";
import { opzetVan, type Inhoud, type Knoop } from "../../../rapport/opzet";
import { noemtVorigeProductnaam, VORIGE_PRODUCTNAAM } from "../../../rapport/standaardteksten";
import { BELASTING_BLOKKEN } from "./BelastingenSectie";
import { vindKnoop } from "./hulp";
import TekstVeld, { Invulvelden } from "./TekstVeld";
import { UITGANGSPUNT_BLOKKEN } from "./UitgangspuntenSectie";
import { Kop, Sectie, Veld, Vink, useRapport } from "./velden";

/** Per rekenblok zijn invoer. Berekeningen heeft een eigen sectie: daar staan de bladen. */
const BLOKKEN: Partial<Record<Inhoud, ComponentType>> = {
  rol: RolInvoer,
  ...UITGANGSPUNT_BLOKKEN,
  ...BELASTING_BLOKKEN,
};

/**
 * Hoofdstukken die geen eigen sectie hebben: per onderdeel uit de opzet zijn invoer, in de
 * volgorde en met de koppen van het rapport. Voor het ingebouwde template zijn dat hoofdstuk 1 t/m 3.
 */
export default function HoofdstukTeksten({ id, titel, knopen, metInvulvelden }: {
  id: string;
  titel: string;
  knopen: readonly Knoop[];
  /** De uitleg over de invulvelden staat één keer in het paneel. */
  metInvulvelden: boolean;
}) {
  const { t } = useTranslation("rapport");
  return (
    <Sectie id={id} titel={titel} intro={t("teksten.intro")}>
      {knopen.map((k) => <KnoopInvoer key={k.id} knoop={k} />)}
      {metInvulvelden && <Invulvelden />}
    </Sectie>
  );
}

/**
 * Eén knoop uit de opzet met zijn invoer en die van zijn kinderen. Een rekenblok heeft zijn eigen
 * formulier, op welke plek van de opzet het ook staat; een tekstonderdeel een tekstvak met
 * standaardteksten; een knoop zonder inhoud alleen zijn kop.
 */
export function KnoopInvoer({ knoop }: { knoop: Knoop }) {
  const Blok = knoop.inhoud ? BLOKKEN[knoop.inhoud] : undefined;
  return (
    <div className={`rapport-knoop rapport-niveau-${knoop.niveau}`}>
      {Blok ? <Blok /> : knoop.inhoud === "tekst" ? <TekstInvoer knoop={knoop} /> : <Kop id={knoop.id} />}
      {knoop.kinderen?.map((k) => <KnoopInvoer key={k.id} knoop={k} />)}
    </div>
  );
}

function TekstInvoer({ knoop }: { knoop: Knoop }) {
  const { t } = useTranslation("rapport");
  const tekst = useRapport().teksten[knoop.id] ?? "";
  return (
    <>
      <TekstVeld
        id={knoop.id}
        kop={<Kop id={knoop.id} />}
        placeholder={knoop.optioneel ? t("teksten.optioneelLeeg") : undefined}
        hint={
          // Een opgeslagen rapport houdt zijn tekst; wijs op de vorige naam van het programma.
          knoop.id === "rekenprogrammatuur" && noemtVorigeProductnaam(tekst)
            ? t("uitgangspunten.vorigeNaam", { naam: VORIGE_PRODUCTNAAM })
            : undefined
        }
      />
      {knoop.titelNieuwbouw && <KopNieuwbouw knoop={knoop} titelNieuwbouw={knoop.titelNieuwbouw} />}
    </>
  );
}

/**
 * De keuze of het blok Wijziging bij nieuwbouw Constructieprincipe heet
 * (rapport.opmaak.constructieprincipe). Een rapport van een eerdere versie
 * opent met de keuze uit, zodat zijn afdruk niet verandert.
 */
function KopNieuwbouw({ knoop, titelNieuwbouw }: { knoop: Knoop; titelNieuwbouw: Meertalig }) {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const aan = rapport.opmaak.constructieprincipe;
  // De koppen zelf komen uit de opzet, in de taal van het rapport, net als op papier.
  const bestaand = vindKnoop("bestaand", opzetVan(rapport));
  return (
    <Vink
      label={t("teksten.nieuwbouwKop", { titel: inTaal(titelNieuwbouw, rapport.taal) })}
      pad="opmaak.constructieprincipe"
      aan={aan}
      hint={t(aan ? "teksten.nieuwbouwAan" : "teksten.nieuwbouwUit", {
        titel: inTaal(knoop.titel, rapport.taal),
        bestaand: bestaand ? inTaal(bestaand.titel, rapport.taal) : "",
      })}
    />
  );
}

/** De rol in het project: de openingszin, de rol, bouwkundig adviseur of architect, datum van de bouwkundige onderlegger. */
function RolInvoer() {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const { rol } = rapport;
  return (
    <>
      <TekstVeld id="rol" kop={<Kop id="rol" />} hint={t("teksten.rolHint")} />
      <div className="rapport-rij">
        <Veld label={t("teksten.rol")} pad="rol.rol" waarde={rol.rol} lijst="rapport-rollen" />
        <Veld label={t("teksten.architect")} pad="rol.architect" waarde={rol.architect} />
        <Veld
          label={t("teksten.datumOnderlegger")}
          pad="rol.datumOnderlegger"
          waarde={rol.datumOnderlegger}
          placeholder={t("algemeen.datumVoorbeeld")}
        />
        <datalist id="rapport-rollen">
          {ROLLEN.map((r) => (
            <option key={r.en} value={inTaal(r, rapport.taal)} />
          ))}
        </datalist>
      </div>
    </>
  );
}
