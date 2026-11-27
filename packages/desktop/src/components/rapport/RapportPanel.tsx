import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { opzetVan, titelVan } from "../../rapport/opzet";
import { useProjectStore } from "../../store/projectStore";
import { useRapportSprong } from "../../store/rapportSprong";
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
import { hoofdstukkenUitAfdruk } from "../../rapport/hoofdstukkenAlsBladen";
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

function Sprongbalk({ groepen, naarSectie, metOpzet = true }: { groepen: readonly PaneelGroep[]; naarSectie: (id: string) => void; metOpzet?: boolean }) {
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
      {metOpzet && knop("opzet", t("secties.opzet"))}
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

/**
 * De keuze om het rapport uit de bladen van het project op te bouwen (rapport/uitBladen.ts):
 * de vaste hoofdstukken vervallen dan, en elk blad is een hoofdstuk, een paragraaf of een
 * blad in bijlage A. Wat in het formulier stond, blijft bewaard en komt terug als de keuze
 * weer uit gaat.
 */
function UitBladenKeuze() {
  const { t } = useTranslation("rapport");
  const aan = useProjectStore((s) => s.rapport.uitBladen === true);
  const aantal = useProjectStore((s) => s.exemplaren.filter((e) => s.rapport.bladRol?.[e.id]).length);
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  return (
    <section className="rapport-groep rapport-uitbladen" data-sectie="uitbladen">
      <label className="rapport-vink">
        <input
          type="checkbox"
          checked={aan}
          onChange={(e) => werkBij((r) => {
            const { uitBladen: _oud, ...rest } = r;
            return e.target.checked ? { ...rest, uitBladen: true } : rest;
          })}
        />
        <span>{t("uitBladen.keuze")}</span>
      </label>
      <p className="rapport-hint">{t(aan ? "uitBladen.uitlegAan" : "uitBladen.uitleg", { count: aantal })}</p>
    </section>
  );
}

/**
 * Zet de hoofdstukken van dit rapport om in bladen: elk hoofdstuk een blad waarvan de code
 * precies de opmaak van dat hoofdstuk is (rapport/hoofdstukkenAlsBladen.ts). Leest het
 * voorbeeld ernaast, dus dat moet opgemaakt zijn.
 */
function HoofdstukkenAlsBladen() {
  const { t } = useTranslation("rapport");
  const voegToe = useProjectStore((s) => s.voegToe);
  const selecteer = useProjectStore((s) => s.selecteer);
  const maak = () => {
    const wortel = document.querySelector<HTMLElement>(".av-meet .rpa-wortel");
    const hoofdstukken = wortel ? hoofdstukkenUitAfdruk(wortel) : [];
    if (hoofdstukken.length === 0) {
      alert(t("alsBladen.geenVoorbeeld"));
      return;
    }
    const ids = hoofdstukken.map((h) => voegToe("leeg", h.titel, h.bron));
    selecteer(ids[0]);
  };
  return (
    <div className="rapport-knoppen rapport-alsbladen">
      <button type="button" className="rapport-knop" title={t("alsBladen.uitleg")} onClick={maak}>
        {t("alsBladen.knop")}
      </button>
    </div>
  );
}

export default function RapportPanel() {
  const { t } = useTranslation("rapport");
  const paneelRef = useRef<HTMLDivElement>(null);
  const opzet = useProjectStore((s) => opzetVan(s.rapport));
  const groepen = useMemo(() => paneelGroepen(opzet), [opzet]);
  const uitBladen = useProjectStore((s) => s.rapport.uitBladen === true);

  const naarSectie = (id: string) =>
    paneelRef.current
      ?.querySelector(`[data-sectie="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Een klik op een regel van de inhoud in het zijpaneel: naar die kop. Ook als het paneel
  // daardoor pas opent: dan is de sprong van vóór het openen.
  const sprong = useRapportSprong();
  useEffect(() => {
    if (!sprong.anker) return;
    paneelRef.current
      ?.querySelector(`[data-kop="${CSS.escape(sprong.anker)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sprong.anker, sprong.teller]);

  return (
    <div className="rapport-panel" ref={paneelRef}>
      <div className="rapport-kop">
        <h1>{t("paneel.titel")}</h1>
        <p>{t("paneel.intro")}</p>
      </div>

      <OpzetBron>
        <Sprongbalk groepen={uitBladen ? [] : groepen} naarSectie={naarSectie} metOpzet={!uitBladen} />
        <UitBladenKeuze />
        <HoofdstukkenAlsBladen />
        <DocumentSectie />
        <RevisieSectie />
        {/* Uit bladen opgebouwd: de hoofdstukken zijn bladen in de projectboom, niet dit formulier. */}
        {!uitBladen && <OpzetSectie />}
        {!uitBladen && <Hoofdstukken groepen={groepen} />}
        <BijlagenSectie />
        <BureauSectie />
      </OpzetBron>

      <p className="rapport-voet">{t("paneel.voet")}</p>
    </div>
  );
}
