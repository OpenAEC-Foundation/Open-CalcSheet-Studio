import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { alleenInTaal, inTaal, inTaalGezet } from "../../../rapport/meertalig";
import { heeftEigenHuisstijl, type Rapport } from "../../../rapport/model";
import { heeftBerekeningen, isRekenblok, opzetVan, titelVan, type Inhoud, type Knoop } from "../../../rapport/opzet";
import {
  hernoemKnoop,
  INGEBOUWD_NAAM,
  leesTemplate,
  ongeplaatsteBlokken,
  pasTemplateToe,
  plaatsBlok,
  schrijfTemplate,
  springKnoop,
  templateUitRapport,
  terugNaarIngebouwd,
  vergeetKnoop,
  verplaatsKnoop,
  verwijderKnoop,
  voegKnoopToe,
  zetKnoopTerug,
  type Template,
  type TemplateMelding,
} from "../../../rapport/template";
import { useProjectStore } from "../../../store/projectStore";
import { useTemplateStore } from "../../../store/rapportTemplates";
import { bewaarTemplateBestand, openTemplateBestand } from "../../../tauri/templateBestand";
import ThemedSelect from "../../ThemedSelect";
import "../../ThemedSelect.css";
import { useRapportBureau } from "../afdruk/useRapportWeergave";
import { Sectie, useOpzetStand, useRapport } from "./velden";

/**
 * Sectie Report structure: het format van dit rapport, om aan te passen en te bewaren als eigen
 * template. De bewerkingen staan in rapport/template.ts. Elke knop vraagt daar of hij iets zou
 * doen: wat niet kan, staat grijs. De nummers komen van bouwOpzet, net als op papier.
 */
export default function OpzetSectie() {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const heeftBladen = useProjectStore((s) => s.exemplaren.length > 0);
  const opzet = opzetVan(rapport);
  return (
    <Sectie id="opzet" titel={t("secties.opzet")} intro={t("opzet.intro")}>
      <TemplateBalk />
      {heeftBladen && !heeftBerekeningen(rapport) && <p className="rapport-melding-blok">{t("opzet.geenBerekeningen")}</p>}
      <h6 className="rapport-subkop">{t("opzet.indeling")}</h6>
      <div className="rapport-opzet">
        {opzet.map((k) => <OpzetRegel key={k.id} knoop={k} />)}
      </div>
      <ToevoegMenu ouder={null} />
      <Weggehaald />
    </Sectie>
  );
}

// ─── Template: openen, bewaren, standaard ──────────────────────────────

/** Wat een van de knoppen te melden heeft; zo blijft het staan tot de volgende klik. */
interface Bericht {
  fout?: boolean;
  tekst: string;
  details?: string[];
}

/** Waar de naam om wordt gevraagd: om in een bestand te bewaren, of om als standaard in te stellen. */
type NaamVoor = "bestand" | "standaard";

/** Hoeveel herstelmeldingen er in beeld komen; de rest wordt geteld. */
const MAX_DETAILS = 8;

function TemplateBalk() {
  const { t, i18n } = useTranslation("rapport");
  const rapport = useRapport();
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  const huisstijl = useRapportBureau().huisstijl;
  const lijst = useTemplateStore((s) => s.lijst);
  const standaard = useTemplateStore((s) => s.standaard);
  const bewaar = useTemplateStore((s) => s.bewaar);
  const verwijder = useTemplateStore((s) => s.verwijder);
  const zetStandaard = useTemplateStore((s) => s.zetStandaard);

  const [bericht, setBericht] = useState<Bericht | null>(null);
  const [naamVoor, setNaamVoor] = useState<NaamVoor | null>(null);
  const [naam, setNaam] = useState("");

  const naamVan = (template: Template) => inTaal(template.naam, i18n.language);
  const meldingTekst = (m: TemplateMelding) => t(`opzet.meldingen.${m.soort}`, { id: m.id ?? "", waarde: m.waarde ?? "" });

  const open = async () => {
    setBericht(null);
    try {
      const gekozen = await openTemplateBestand();
      if (!gekozen) return;
      const u = leesTemplate(gekozen.raw, gekozen.naam);
      if (!u.ok) {
        setBericht({ fout: true, tekst: t(`opzet.fouten.${u.fout}`, { bestand: gekozen.naam }) });
        return;
      }
      bewaar(u.template);
      werkBij((r) => pasTemplateToe(r, u.template));
      const details = u.meldingen.slice(0, MAX_DETAILS).map(meldingTekst);
      if (u.meldingen.length > MAX_DETAILS) details.push(t("opzet.meerMeldingen", { aantal: u.meldingen.length - MAX_DETAILS }));
      setBericht({ tekst: t("opzet.geopend", { naam: naamVan(u.template) }), details });
    } catch (err) {
      console.error("Template openen mislukt:", err);
      setBericht({ fout: true, tekst: t("opzet.fouten.lezen", { fout: (err as Error)?.message ?? String(err) }) });
    }
  };

  /** Vraagt om de naam, met als begin de naam van het template van dit rapport. */
  const vraagNaam = (voor: NaamVoor) => {
    setBericht(null);
    setNaam(rapport.template ? inTaal(rapport.template.naam, rapport.taal) : t("opzet.eigenNaam"));
    setNaamVoor(voor);
  };

  // De getypte naam hoort bij de taal van het rapport, net als een getypte kop.
  const maakTemplate = (getypt: string) =>
    templateUitRapport(
      rapport,
      rapport.template ? inTaalGezet(rapport.template.naam, rapport.taal, getypt) : alleenInTaal(getypt, rapport.taal),
      heeftEigenHuisstijl(huisstijl) ? huisstijl : undefined,
    );

  const bevestigNaam = async () => {
    const getypt = naam.trim();
    if (getypt === "") return;
    const voor = naamVoor;
    setNaamVoor(null);
    if (voor === "standaard") {
      zetStandaard(bewaar(maakTemplate(getypt)));
      setBericht({ tekst: t("opzet.alsStandaard", { naam: getypt }) });
      return;
    }
    try {
      const bestand = await bewaarTemplateBestand(schrijfTemplate(maakTemplate(getypt)), getypt);
      if (bestand) setBericht({ tekst: t("opzet.bewaard", { bestand }) });
    } catch (err) {
      console.error("Template bewaren mislukt:", err);
      setBericht({ fout: true, tekst: t("opzet.fouten.bewaren", { fout: (err as Error)?.message ?? String(err) }) });
    }
  };

  const ingebouwd = !rapport.opzet && !rapport.varianten && !rapport.template && !rapport.huisstijl;
  const terug = () => {
    if (!confirm(t("opzet.terugVraag", { naam: inTaal(INGEBOUWD_NAAM, i18n.language) }))) return;
    setBericht(null);
    werkBij(terugNaarIngebouwd);
  };

  const status = rapport.template
    ? t("opzet.statusTemplate", { naam: inTaal(rapport.template.naam, i18n.language) })
    : rapport.opzet
      ? t("opzet.statusEigen", { naam: inTaal(INGEBOUWD_NAAM, i18n.language) })
      : t("opzet.statusIngebouwd", { naam: inTaal(INGEBOUWD_NAAM, i18n.language) });

  return (
    <>
      <p className="rapport-melding-blok rustig">
        {status}
        {rapport.huisstijl && ` ${t("opzet.huisstijlUitTemplate")}`}
      </p>
      <div className="rapport-knoppen">
        <button type="button" className="rapport-knop" title={t("opzet.openenUitleg")} onClick={() => void open()}>{t("opzet.openen")}</button>
        <button type="button" className="rapport-knop" title={t("opzet.bewarenUitleg")} onClick={() => vraagNaam("bestand")}>{t("opzet.bewaren")}</button>
        <button type="button" className="rapport-knop" title={t("opzet.standaardUitleg")} onClick={() => vraagNaam("standaard")}>{t("opzet.standaardInstellen")}</button>
        <button type="button" className="rapport-knop" disabled={ingebouwd} title={t("opzet.terugUitleg")} onClick={terug}>{t("opzet.terug")}</button>
      </div>
      {naamVoor !== null && (
        <div className="rapport-bewaar">
          <input
            type="text"
            autoFocus
            aria-label={t("opzet.naam")}
            placeholder={t("opzet.naam")}
            onFocus={(e) => e.currentTarget.select()}
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void bevestigNaam();
              if (e.key === "Escape") setNaamVoor(null);
            }}
          />
          <button type="button" className="rapport-knop rapport-knop-primair" disabled={naam.trim() === ""} onClick={() => void bevestigNaam()}>
            {t("algemeen.bewaar")}
          </button>
          <button type="button" className="rapport-knop" onClick={() => setNaamVoor(null)}>{t("algemeen.annuleer")}</button>
        </div>
      )}
      {bericht && (
        <div className={`rapport-melding-blok rapport-opzet-bericht${bericht.fout ? " fout" : ""}`}>
          {bericht.tekst}
          {bericht.details && bericht.details.length > 0 && (
            <ul>
              {bericht.details.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="rapport-veld rapport-opzet-standaard">
        <span className="rapport-label">{t("opzet.standaardVoorNieuw")}</span>
        <ThemedSelect
          value={standaard ?? ""}
          options={[
            { value: "", label: inTaal(INGEBOUWD_NAAM, i18n.language) },
            ...lijst.map((e) => ({ value: e.id, label: naamVan(e.template) })),
          ]}
          onChange={(id) => zetStandaard(id === "" ? null : id)}
        />
        <span className="rapport-hint">{t("opzet.standaardHint")}</span>
      </div>
      {lijst.length > 0 && (
        <>
          <h6 className="rapport-subkop">{t("opzet.eigenTemplates")}</h6>
          <ul className="rapport-opzet-lijst">
            {lijst.map((e) => (
              <li key={e.id}>
                <span className="rapport-kaart-titel">{naamVan(e.template)}</span>
                <button
                  type="button"
                  className="rapport-knop"
                  title={t("opzet.toepassenUitleg")}
                  onClick={() => {
                    werkBij((r) => pasTemplateToe(r, e.template));
                    setBericht({ tekst: t("opzet.toegepast", { naam: naamVan(e.template) }) });
                  }}
                >
                  {t("opzet.toepassen")}
                </button>
                <button
                  type="button"
                  className="rapport-icoon"
                  title={t("opzet.templateVerwijderen")}
                  aria-label={t("opzet.templateVerwijderen")}
                  onClick={() => {
                    if (confirm(t("opzet.templateVerwijderenVraag", { naam: naamVan(e.template) }))) verwijder(e.id);
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// ─── De indeling ───────────────────────────────────────────────────────

/** Eén onderdeel van de opzet: nummer, titel, pagina en de knoppen. Zijn kinderen staan eronder. */
function OpzetRegel({ knoop }: { knoop: Knoop }) {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const stand = useOpzetStand();
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  const zet = useProjectStore((s) => s.zetRapportVeld);
  const titel = titelVan(knoop, rapport);
  const pagina = rapport.nieuwePagina[knoop.id] ?? knoop.nieuwePagina ?? false;

  /** Een knop om de opzet te bewerken; wat niets zou doen, staat grijs. */
  const knop = (teken: string, label: string, stap: (r: Rapport) => Rapport) => (
    <button
      type="button"
      className="rapport-icoon"
      title={label}
      aria-label={label}
      disabled={stap(rapport) === rapport}
      onClick={() => werkBij(stap)}
    >
      {teken}
    </button>
  );

  return (
    <>
      <div className="rapport-opzet-regel" style={{ paddingLeft: `${(knoop.niveau - 1) * 16}px` }}>
        <span className="rapport-nummer rapport-opzet-nummer">{stand.nummer(knoop.id)}</span>
        {/* Doortypen is één stap in ongedaan maken, zoals in een veld. */}
        <input
          type="text"
          value={titel}
          aria-label={t("opzet.titel")}
          onChange={(e) => {
            const nieuw = e.target.value;
            werkBij((r) => hernoemKnoop(r, knoop.id, nieuw), `rapport:opzet:${knoop.id}`);
          }}
        />
        {isRekenblok(knoop) && (
          <span className="rapport-soort" title={t(knoop.inhoud === "wijzigingen" && knoop.niveau === 1 ? "opzet.wijzigingenUitleg" : "opzet.rekenblokUitleg")}>
            {t("opzet.rekenblok")}
          </span>
        )}
        {stand.valtWeg(knoop.id) && <span className="rapport-weg" title={t("velden.onderdeelValtWeg")}>{t("velden.valtWeg")}</span>}
        <label className="rapport-vink" title={t("velden.nieuwePagina")}>
          <input
            type="checkbox"
            checked={pagina}
            aria-label={t("velden.nieuwePagina")}
            onChange={(e) => zet(`nieuwePagina.${knoop.id}`, e.target.checked)}
          />
          {t("opzet.pagina")}
        </label>
        {knop("↑", t("algemeen.omhoog"), (r) => verplaatsKnoop(r, knoop.id, -1))}
        {knop("↓", t("algemeen.omlaag"), (r) => verplaatsKnoop(r, knoop.id, 1))}
        {knop("←", t("opzet.hoger"), (r) => springKnoop(r, knoop.id, -1))}
        {knop("→", t("opzet.dieper"), (r) => springKnoop(r, knoop.id, 1))}
        {!isRekenblok(knoop) && knoop.niveau < 4
          ? <ToevoegMenu ouder={knoop} />
          : <span className="rapport-icoon" aria-hidden="true" />}
        {knop("✕", t("opzet.verwijderen"), (r) => verwijderKnoop(r, knoop.id))}
      </div>
      {knoop.kinderen?.map((k) => <OpzetRegel key={k.id} knoop={k} />)}
    </>
  );
}

/** Een menu dat dichtgaat bij een klik erbuiten of Escape, zoals de standaardteksten. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const klik = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", toets);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/**
 * Iets toevoegen: een nieuw tekstonderdeel of een rekenblok uit de lijst. Onder een onderdeel een
 * klein plusje; onder de hele indeling een knop, voor een nieuw hoofdstuk. Berekeningen staat
 * alleen in dat laatste menu: dat hoort op het hoogste niveau.
 */
function ToevoegMenu({ ouder }: { ouder: Knoop | null }) {
  const { t, i18n } = useTranslation("rapport");
  const rapport = useRapport();
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  const { open, setOpen, ref } = useMenu();
  const ouderId = ouder?.id ?? null;
  const blokken = ongeplaatsteBlokken(rapport).filter((b) => ouder === null || b.inhoud !== "berekeningen");
  const nieuw = ouder === null ? t("opzet.nieuwHoofdstuk") : ouder.niveau === 1 ? t("opzet.nieuweParagraaf") : t("opzet.nieuwTekstblok");

  const kies = (stap: (r: Rapport) => Rapport) => {
    werkBij(stap);
    setOpen(false);
  };
  const item = (sleutel: string, inhoud: ReactNode, stap: (r: Rapport) => Rapport) => (
    <button key={sleutel} type="button" role="menuitem" className="rapport-menu-item" onClick={() => kies(stap)}>
      <span className="rapport-menu-label">{inhoud}</span>
    </button>
  );

  return (
    <div className={ouder ? "rapport-opzet-plus" : "rapport-menu-anker rapport-opzet-erbij"} ref={ref}>
      <button
        type="button"
        className={ouder ? "rapport-icoon" : "rapport-knop"}
        title={ouder ? t("opzet.toevoegenAan", { titel: titelVan(ouder, rapport) }) : undefined}
        aria-label={ouder ? t("opzet.toevoegenAan", { titel: titelVan(ouder, rapport) }) : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {ouder ? "+" : `+ ${t("opzet.toevoegen")}`}
      </button>
      {open && (
        <div className="rapport-menu" role="menu">
          {item("nieuw", nieuw, (r) => voegKnoopToe(r, ouderId))}
          {blokken.length > 0 && <div className="rapport-menu-groep">{t("opzet.rekenblokken")}</div>}
          {blokken.map((b) => item(b.id, inTaal(b.titel, i18n.language), (r) => plaatsBlok(r, b.inhoud as Inhoud, ouderId)))}
        </div>
      )}
    </div>
  );
}

/** Wat uit de indeling is gehaald. De tekst staat nog in het rapport en komt mee terug. */
function Weggehaald() {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  const lijst = rapport.weggehaald ?? [];
  if (lijst.length === 0) return null;
  return (
    <>
      <h6 className="rapport-subkop">{t("opzet.weggehaald")}</h6>
      <p className="rapport-hint">{t("opzet.weggehaaldUitleg")}</p>
      <ul className="rapport-opzet-lijst">
        {lijst.map((w) => {
          const titel = inTaal(w.knoop.titel, rapport.taal);
          return (
            <li key={w.knoop.id}>
              <span className="rapport-kaart-titel">{titel}</span>
              <button type="button" className="rapport-knop" onClick={() => werkBij((r) => zetKnoopTerug(r, w.knoop.id))}>
                {t("opzet.terugzetten")}
              </button>
              <button
                type="button"
                className="rapport-icoon"
                title={t("opzet.vergeten")}
                aria-label={t("opzet.vergeten")}
                onClick={() => {
                  if (confirm(t("opzet.vergetenVraag", { titel }))) werkBij((r) => vergeetKnoop(r, w.knoop.id));
                }}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
