import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { opzetVan, titelVan } from "../../rapport/opzet";
import { useProjectStore } from "../../store/projectStore";
import DocumentSectie from "./paneel/DocumentSectie";
import HoofdstukTeksten, { KnoopInvoer } from "./paneel/HoofdstukTeksten";
import UitgangspuntenSectie from "./paneel/UitgangspuntenSectie";
import BelastingenSectie from "./paneel/BelastingenSectie";
import BerekeningenSectie from "./paneel/BerekeningenSectie";
import BijlagenSectie from "./paneel/BijlagenSectie";
import BureauSectie from "./paneel/BureauSectie";
import OpzetSectie from "./paneel/OpzetSectie";
import RevisieSectie from "./paneel/RevisieSectie";
import { paneelGroepen, type PaneelGroep } from "./paneel/hulp";
import { Invulvelden } from "./paneel/TekstVeld";
import { OpzetBron, useOpzetStand, useRapport } from "./paneel/velden";
import "./RapportPanel.css";

/**
 * Het rapportpaneel: één scrollend formulier met alles wat in het
 * constructierapport komt en niet al in de projectgegevens of de rekenbladen
 * staat. De hoofdstukken staan in de volgorde van de opzet van dit rapport.
 *
 * Wat je hier invult hoort bij het project: het gaat mee in het
 * projectbestand en in ongedaan maken. Grijze waarden volgen uit de
 * projectgegevens of de norm en worden pas bij het opmaken berekend, zodat
 * rapport en rekenbladen nooit uit de pas lopen. De tab Afdrukvoorbeeld
 * ernaast toont het hele rapport.
 */

/** De plek van een groep in het paneel, voor de sprongbalk. */
const groepId = (g: PaneelGroep) => (g.soort === "teksten" ? `teksten-${g.knopen[0].id}` : g.soort);

/** De kop van een groep: de nummers van de hoofdstukken, of het hoofdstuk zoals het in dit rapport heet. */
function useGroepTitel() {
  const { t } = useTranslation("rapport");
  const stand = useOpzetStand();
  const rapport = useRapport();
  return (g: PaneelGroep, kort = false): string => {
    if (g.soort === "teksten") {
      const nummers = g.knopen.map((k) => stand.nummer(k.id)).filter((n) => n !== "");
      if (nummers.length === 0) return t("secties.hoofdstukken");
      if (nummers.length === 1) return t("secties.hoofdstuk", { nummer: nummers[0] });
      return t(kort ? "secties.tekstenKort" : "secties.teksten", { van: nummers[0], tot: nummers[nummers.length - 1] });
    }
    // Zonder eigen opzet de naam in de taal van de app; met eigen opzet heet het hoofdstuk zoals in het rapport.
    return rapport.opzet ? titelVan(g.knoop, rapport) : t(`secties.${g.soort}`);
  };
}

function Sprongbalk({ groepen, naarSectie }: { groepen: readonly PaneelGroep[]; naarSectie: (id: string) => void }) {
  const { t } = useTranslation("rapport");
  const groepTitel = useGroepTitel();
  const knop = (id: string, label: string) => (
    <button key={id} type="button" onClick={() => naarSectie(id)}>
      {label}
    </button>
  );
  return (
    <nav className="rapport-nav" aria-label={t("paneel.navLabel")}>
      {knop("document", t("secties.document"))}
      {knop("revisies", t("secties.revisies"))}
      {knop("opzet", t("secties.opzet"))}
      {groepen.map((g) => knop(groepId(g), groepTitel(g, true)))}
      {knop("bijlagen", t("secties.bijlagen"))}
      {knop("bureau", t("secties.bureau"))}
    </nav>
  );
}

/** De hoofdstukken van dit rapport, elk in zijn sectie. */
function Hoofdstukken({ groepen }: { groepen: readonly PaneelGroep[] }) {
  const groepTitel = useGroepTitel();
  const eersteTekst = groepen.find((g) => g.soort === "teksten");
  return (
    <>
      {/* De invulvelden staan bij de teksten; zonder teksthoofdstuk blijven ze hier in beeld. */}
      {!eersteTekst && <Invulvelden />}
      {groepen.map((g) => {
        const titel = groepTitel(g);
        const kinderen = g.soort === "teksten" ? [] : g.knoop.kinderen ?? [];
        switch (g.soort) {
          case "teksten":
            return <HoofdstukTeksten key={groepId(g)} id={groepId(g)} titel={titel} knopen={g.knopen} metInvulvelden={g === eersteTekst} />;
          case "uitgangspunten":
            return (
              <UitgangspuntenSectie key={g.soort} knoop={g.knoop} titel={titel}>
                {kinderen.map((k) => <KnoopInvoer key={k.id} knoop={k} />)}
              </UitgangspuntenSectie>
            );
          case "belastingen":
            return (
              <BelastingenSectie key={g.soort} knoop={g.knoop} titel={titel}>
                {kinderen.map((k) => <KnoopInvoer key={k.id} knoop={k} />)}
              </BelastingenSectie>
            );
          case "berekeningen":
            return <BerekeningenSectie key={g.soort} knoop={g.knoop} titel={titel} />;
        }
      })}
    </>
  );
}

export default function RapportPanel() {
  const { t } = useTranslation("rapport");
  const paneelRef = useRef<HTMLDivElement>(null);
  const opzet = useProjectStore((s) => opzetVan(s.rapport));
  const groepen = useMemo(() => paneelGroepen(opzet), [opzet]);

  const naarSectie = (id: string) =>
    paneelRef.current
      ?.querySelector(`[data-sectie="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="rapport-panel" ref={paneelRef}>
      <div className="rapport-kop">
        <h1>{t("paneel.titel")}</h1>
        <p>{t("paneel.intro")}</p>
      </div>

      <OpzetBron>
        <Sprongbalk groepen={groepen} naarSectie={naarSectie} />
        <DocumentSectie />
        <RevisieSectie />
        <OpzetSectie />
        <Hoofdstukken groepen={groepen} />
        <BijlagenSectie />
        <BureauSectie />
      </OpzetBron>

      <p className="rapport-voet">{t("paneel.voet")}</p>
    </div>
  );
}
