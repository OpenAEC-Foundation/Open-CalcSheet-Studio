import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "../../i18n/config";
import Modal from "../Modal";
import {
  moduleCatalogus,
  bibliotheek,
  type TreeNode,
} from "./projectTree";
import { templates } from "../../templates";
import { TEKEN_BLAD } from "../../store/tekenBlad";
import Icoon from "../Icoon";
import { useModuleKiezer, type KiezerTab } from "../../store/moduleKiezer";
import { useProjectStore } from "../../store/projectStore";
import { voegLeegMarkdownToe, voegMarkdownBestandToe } from "./markdownBlad";
import {
  useModuleBibliotheek,
  vergelijkVersie,
  bibliotheekBeeld,
  BIBLIOTHEEK_REPO,
  type CatalogusModule,
  type GeinstalleerdeModule,
  type Tweetalig,
} from "../../store/moduleBibliotheek";
import ModuleAfbeelding from "./ModuleAfbeelding";
import LokaleNormen from "./LokaleNormen";
import "../settings/SettingsDialog.css";
import "./ProjectBrowser.css";
import "./ModuleKiezer.css";

/**
 * Het scherm "Module toevoegen", geopend vanuit het lint.
 *
 * Tabbladen: de rekenmodules per materiaal, met hun status; de bibliotheek
 * met naslagbladen (normuitwerkingen, boeken, voorbeelden); de online
 * modulebibliotheek om modules te installeren of bij te werken; en de lokale
 * normbestanden. Een klik kiest, een dubbelklik of Toevoegen zet het blad in
 * het project; het scherm sluit dan en de projectlijst vraagt meteen om een naam.
 */

/** Tekst in de taal van de app, uit een tweetalig veld. */
const inTaal = (w: Tweetalig) => (i18next.language?.startsWith("en") ? w.en : w.nl) || w.nl;

type Item = Extract<TreeNode, { kind: "item" }>;
interface Groep {
  id: string;
  label: string;
  items: Item[];
  subgroepen: Groep[];
  bronUrl?: string;
}

/** De `t` van de werkruimte-vertalingen, met het catalogus-label als terugval. */
type Vertaler = (sleutel: string, opties: { defaultValue: string }) => string;

/**
 * De naam van een module of groep in de taal van de app. Een module heeft zijn
 * sleutel op sjabloon-id (net als in de projectboom), een groep op id. Zonder
 * vertaling blijft het Nederlandse label uit de catalogus staan. Een nieuw
 * blad krijgt nog altijd dat catalogus-label als naam (store/moduleKiezer.ts).
 */
function catalogusNaam(tw: Vertaler, node: TreeNode): string {
  if (node.kind === "item" && node.namen) return inTaal(node.namen);
  return node.kind === "item"
    ? tw(`catalogus.modules.${node.templateId ?? node.id}`, { defaultValue: node.label })
    : tw(`catalogus.groepen.${node.id}`, { defaultValue: node.label });
}

/** Een categorie uit de catalogus als groep: eigen items plus subcategorieën. */
function naarGroep(node: TreeNode, tw: Vertaler): Groep | null {
  if (node.kind === "item") return null;
  const items = node.children.filter((c): c is Item => c.kind === "item");
  const subgroepen = node.children.map((c) => naarGroep(c, tw)).filter((g): g is Groep => g !== null);
  return { id: node.id, label: catalogusNaam(tw, node), items, subgroepen, bronUrl: node.kind === "category" ? node.bronUrl : undefined };
}

/**
 * Zoek ook op de groepsnaam, zodat bijvoorbeeld "staal" alle staalmodules toont.
 * Gezocht wordt in de namen zoals ze in beeld staan, dus in de taal van de app.
 */
function filter(groep: Groep, zoek: string, tw: Vertaler): Groep | null {
  if (!zoek || groep.label.toLowerCase().includes(zoek)) return groep;
  const items = groep.items.filter((i) => catalogusNaam(tw, i).toLowerCase().includes(zoek));
  const subgroepen = groep.subgroepen.map((g) => filter(g, zoek, tw)).filter((g): g is Groep => g !== null);
  return items.length || subgroepen.length ? { ...groep, items, subgroepen } : null;
}

const aantal = (g: Groep): number => g.items.length + g.subgroepen.reduce((s, sg) => s + aantal(sg), 0);

async function openNormBron(url: string) {
  if ("__TAURI_INTERNALS__" in window) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** De tabbladen; hun namen staan in werkruimte.json onder kiezer.tabs. */
const TABS: readonly KiezerTab[] = ["modules", "bibliotheek", "online", "normbestanden"];
type TabId = KiezerTab;

/**
 * De catalogus met de geïnstalleerde modules uit de online bibliotheek erbij.
 * Heeft een ingebouwde module hetzelfde id, dan krijgt die tegel de versie en
 * het beeld uit de bibliotheek; een nieuwe module komt in zijn categorie, of
 * in een nieuwe groep als die categorie er nog niet is.
 */
function metBibliotheek(catalogus: TreeNode[], geinstalleerd: Record<string, GeinstalleerdeModule>): TreeNode[] {
  const lijst = Object.values(geinstalleerd);
  if (lijst.length === 0) return catalogus;
  const kopie: TreeNode[] = catalogus.map((n) =>
    n.kind === "item" ? n : { ...n, children: n.children.map((c) => (c.kind === "item" ? { ...c } : c)) },
  );
  const items = (nodes: TreeNode[]): Item[] =>
    nodes.flatMap((n) => (n.kind === "item" ? [n] : items(n.children)));
  for (const m of lijst) {
    const extra = { namen: m.naam, beeldUrl: m.beeldData, versie: m.versie, status: m.status, gepubliceerd: m.gepubliceerd };
    const bestaand = items(kopie).find((i) => i.templateId === m.id);
    if (bestaand) {
      Object.assign(bestaand, extra);
      continue;
    }
    const groepId = `cat-${m.categorie}`;
    let groep = kopie.find((n) => n.kind === "category" && n.id === groepId);
    if (!groep) {
      groep = { kind: "category", id: groepId, label: m.categorie.charAt(0).toUpperCase() + m.categorie.slice(1), children: [] };
      kopie.push(groep);
    }
    if (groep.kind === "category") {
      groep.children.push({ kind: "item", id: `bib-${m.id}`, label: m.naam.nl, templateId: m.id, ...extra });
    }
  }
  return kopie;
}

function Tegel({ item, gekozen, onKies, onVoegToe }: {
  item: Item;
  gekozen: boolean;
  onKies: () => void;
  onVoegToe: () => void;
}) {
  // De teksten van de modulestatus staan in de vertalingen (bladVersie.status
  // en .statusUitleg), dezelfde als in de kop van een geopend blad.
  const { t } = useTranslation();
  const { t: tw } = useTranslation("werkruimte");
  const beschikbaar = !!item.templateId && !!templates[item.templateId];
  const status = item.status;
  const naam = catalogusNaam(tw, item);
  // Publicatie staat los van de status: zie `gepubliceerd` in projectTree.ts.
  const uitleg = !beschikbaar
    ? tw("kiezer.nietBeschikbaar", { naam })
    : status
      ? `${naam}\n${t(`bladVersie.statusUitleg.${status}`)}\n${tw(item.gepubliceerd ? "kiezer.publicatie.gepubliceerd" : "kiezer.publicatie.onuitgegeven")}`
      : naam;
  return (
    <button
      type="button"
      className={`mk-tegel${gekozen ? " gekozen" : ""}${beschikbaar ? "" : " uit"}`}
      disabled={!beschikbaar}
      aria-pressed={gekozen}
      onClick={onKies}
      onDoubleClick={onVoegToe}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onVoegToe();
        }
      }}
      title={uitleg}
    >
      {status && item.templateId && <ModuleAfbeelding templateId={item.templateId} beeldUrl={item.beeldUrl} />}
      <span className="mk-kop">
        {status && (
          <span className={`tree-item-icon tree-status-${status}`}>{status === "concept" ? "○" : "●"}</span>
        )}
        <span className="mk-naam">{naam}</span>
      </span>
      {(status || item.gepubliceerd) && (
        <span className="mk-onder">
          {status && <span className="mk-status">{t(`bladVersie.status.${status}`)}</span>}
          {item.gepubliceerd && <span className="tree-vlag">{tw("kiezer.gepubliceerd")}</span>}
          {item.versie && <span className="mk-versie" title={tw("kiezer.online.uitBibliotheek")}>v{item.versie}</span>}
        </span>
      )}
    </button>
  );
}

function GroepBlok({ groep, niveau, gekozen, onKies, onVoegToe }: {
  groep: Groep;
  niveau: number;
  gekozen: string | null;
  onKies: (item: Item) => void;
  onVoegToe: (item: Item) => void;
}) {
  const { t: tw } = useTranslation("werkruimte");
  const Kop = niveau === 0 ? "h3" : "h4";
  return (
    <section className={`mk-groep mk-niveau-${Math.min(niveau, 2)}`}>
      <Kop>
        {groep.label} <span className="mk-aantal">{aantal(groep)}</span>
        {groep.bronUrl && (
          <button type="button" className="mk-bron" onClick={() => void openNormBron(groep.bronUrl!)}>
            {tw("kiezer.nenOverzicht")}
          </button>
        )}
      </Kop>
      {groep.id === "standards" && (
        <p className="mk-norm-uitleg">{tw("kiezer.normUitleg")}</p>
      )}
      {groep.items.length > 0 && (
        <div className="mk-tegels">
          {groep.items.map((item) => (
            <Tegel
              key={item.id}
              item={item}
              gekozen={gekozen === item.id}
              onKies={() => onKies(item)}
              onVoegToe={() => onVoegToe(item)}
            />
          ))}
        </div>
      )}
      {groep.subgroepen.map((sg) => (
        <GroepBlok key={sg.id} groep={sg} niveau={niveau + 1} gekozen={gekozen} onKies={onKies} onVoegToe={onVoegToe} />
      ))}
    </section>
  );
}

/** Bladen zonder rekentekst: nieuw of uit een bestand. Een klik voegt toe en sluit het scherm. */
function DocumentenGroep({ onKlaar }: { onKlaar: () => void }) {
  const { t: tw } = useTranslation("werkruimte");
  const voegToe = useProjectStore((s) => s.voegMarkdownToe);
  return (
    <section className="mk-groep mk-niveau-0">
      <h3>{tw("kiezer.documenten")} <span className="mk-aantal">2</span></h3>
      <div className="mk-tegels">
        <button type="button" className="mk-tegel" title={tw("markdown.toevoegenUitleg")}
          onClick={() => { voegLeegMarkdownToe(voegToe); onKlaar(); }}>
          <span className="mk-kop"><span className="mk-naam">{tw("markdown.toevoegen")}</span></span>
        </button>
        <button type="button" className="mk-tegel" title={tw("markdown.importerenUitleg")}
          onClick={() => { void voegMarkdownBestandToe(voegToe); onKlaar(); }}>
          <span className="mk-kop"><span className="mk-naam">{tw("markdown.importeren")}</span></span>
        </button>
      </div>
    </section>
  );
}

/** De keuze "lege tekening": geen module uit de catalogus, wel op dezelfde manier te kiezen. */
const LEGE_TEKENING: Item = { kind: "item", id: "leeg-tekenblad", label: "Lege tekening", templateId: TEKEN_BLAD };

/**
 * Wat je zonder module aan het rapport toevoegt: een leeg tekenblad, en straks een
 * project uit Open FEM Studio. Dat laatste staat er al wel, maar is nog uitgeschakeld.
 */
function LegeBladen({ zoek, gekozen, onKies, onVoegToe }: {
  zoek: string;
  gekozen: boolean;
  onKies: () => void;
  onVoegToe: () => void;
}) {
  const { t: tw } = useTranslation("werkruimte");
  const tekening = tw("kiezer.leeg.tekening");
  const fem = tw("kiezer.leeg.fem");
  const z = zoek.trim().toLowerCase();
  const toon = (naam: string) => !z || naam.toLowerCase().includes(z);
  if (!toon(tekening) && !toon(fem)) return null;
  return (
    <section className="mk-groep mk-niveau-0">
      <h3>{tw("kiezer.leeg.kop")}</h3>
      <div className="mk-tegels">
        {toon(tekening) && (
          <button
            type="button"
            className={`mk-tegel${gekozen ? " gekozen" : ""}`}
            aria-pressed={gekozen}
            onClick={onKies}
            onDoubleClick={onVoegToe}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onVoegToe();
              }
            }}
            title={tw("kiezer.leeg.tekeningUitleg")}
          >
            <span className="mk-kop">
              <span className="mk-leeg-icoon"><Icoon id="assistant.draw" uit="calculations" /></span>
              <span className="mk-naam">{tekening}</span>
            </span>
            <span className="mk-onder"><span className="mk-status">{tw("kiezer.leeg.tekeningOnder")}</span></span>
          </button>
        )}
        {toon(fem) && (
          <button type="button" className="mk-tegel uit" disabled aria-disabled="true" title={tw("kiezer.leeg.femUitleg")}>
            <span className="mk-kop">
              <span className="mk-leeg-icoon"><Icoon id="file.new" uit="calculations" /></span>
              <span className="mk-naam">{fem}</span>
            </span>
            <span className="mk-onder"><span className="mk-status">{tw("kiezer.leeg.femLater")}</span></span>
          </button>
        )}
      </div>
    </section>
  );
}

/** De betekenis van de statusbolletjes en van "gepubliceerd", onder in het scherm. */
function Legenda() {
  const { t } = useTranslation();
  const { t: tw } = useTranslation("werkruimte");
  return (
    <span className="mk-legenda">
      {(["gereed", "controleren", "raming", "concept"] as const).map((status) => (
        <span key={status} title={t(`bladVersie.statusUitleg.${status}`)}>
          <span className={`tree-item-icon tree-status-${status}`}>{status === "concept" ? "○" : "●"}</span>{" "}
          {t(`bladVersie.status.${status}`)}
        </span>
      ))}
      <span title={tw("kiezer.publicatie.gepubliceerd")}>
        <span className="tree-vlag">{tw("kiezer.gepubliceerd")}</span> {tw("kiezer.gepubliceerdLegenda")}
      </span>
    </span>
  );
}

export default function ModuleKiezer() {
  const open = useModuleKiezer((s) => s.open);
  const sluiten = useModuleKiezer((s) => s.sluiten);
  const voegToe = useModuleKiezer((s) => s.voegToe);
  const voegTekenbladToe = useModuleKiezer((s) => s.voegTekenbladToe);
  const startTab = useModuleKiezer((s) => s.tab);
  const geinstalleerd = useModuleBibliotheek((s) => s.geinstalleerd);
  const { t: tw } = useTranslation("werkruimte");
  const [tab, setTab] = useState<TabId>("modules");
  // Het lint kan het scherm op een bepaald tabblad openen (Uitbreidingen).
  useEffect(() => {
    if (open) setTab(startTab);
  }, [open, startTab]);
  const [zoek, setZoek] = useState("");
  const [gekozen, setGekozen] = useState<Item | null>(null);

  const catalogus = useMemo(() => metBibliotheek(moduleCatalogus, geinstalleerd), [geinstalleerd]);
  const bron = tab === "modules" ? catalogus : bibliotheek;
  // `tw` hoort erbij: bij een taalwissel krijgen de groepen hun nieuwe namen.
  const groepen = useMemo(() => {
    const z = zoek.trim().toLowerCase();
    return bron
      .map((node) => naarGroep(node, tw))
      .filter((g): g is Groep => g !== null)
      .map((g) => filter(g, z, tw))
      .filter((g): g is Groep => g !== null);
  }, [bron, zoek, tw]);

  const toevoegen = (item: Item | null) => {
    if (item?.templateId === TEKEN_BLAD) {
      voegTekenbladToe(tw("kiezer.leeg.tekening"), tw("tekenblad.viewNaam", { n: 1 }));
      setGekozen(null);
      setZoek("");
      return;
    }
    if (!item?.templateId || !templates[item.templateId]) return;
    // Het catalogus-label, niet de vertaalde naam: de naamgeving van nieuwe
    // bladen blijft zoals hij was.
    voegToe(item.templateId, item.label);
    setGekozen(null);
    setZoek("");
  };
  const afbreken = () => {
    setGekozen(null);
    setZoek("");
    sluiten();
  };

  const kiest = tab === "modules" || tab === "bibliotheek";
  // Geen module, maar wel een blad in het project: hier zoekt iemand ernaar.
  const z = zoek.trim().toLowerCase();
  const documenten = tab === "modules" && (!z || `${tw("kiezer.documenten")} markdown md`.toLowerCase().includes(z));
  const footer = (
    <>
      {kiest && <Legenda />}
      {tab === "online" && (
        <button className="mk-bron mk-bijdragen" onClick={() => void openNormBron(`${BIBLIOTHEEK_REPO}/blob/main/CONTRIBUTING.md`)}>
          {tw("kiezer.online.bijdragen")}
        </button>
      )}
      <button className="settings-btn settings-btn-secondary" onClick={afbreken}>{tw(kiest ? "common:cancel" : "common:close")}</button>
      {kiest && (
        <button
          className="settings-btn settings-btn-primary"
          disabled={!gekozen}
          onClick={() => toevoegen(gekozen)}
        >
          {tw("kiezer.toevoegen")}
        </button>
      )}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={afbreken}
      title={kiest ? tw("kiezer.titel") : tw(`kiezer.tabs.${tab}`)}
      width={Math.min(960, window.innerWidth - 32)}
      height={Math.min(720, window.innerHeight - 64)}
      className="module-kiezer"
      footer={footer}
    >
      <div className="settings-body">
        <div className="settings-sidebar">
          {TABS.map((id) => (
            <button
              key={id}
              className={`settings-tab${tab === id ? " active" : ""}`}
              onClick={() => { setTab(id); setGekozen(null); setZoek(""); }}
            >
              {tw(`kiezer.tabs.${id}`)}
            </button>
          ))}
        </div>
        <div className="settings-content mk-inhoud">
          <input
            className="mk-zoek"
            type="search"
            aria-label={tw(`kiezer.zoekLabel.${tab}`)}
            placeholder={tw(`kiezer.zoekPlaceholder.${tab}`)}
            value={zoek}
            autoFocus
            onChange={(e) => { setZoek(e.target.value); setGekozen(null); }}
          />
          {tab === "normbestanden" ? <LokaleNormen zoek={zoek} /> : tab === "online" ? <OnlineBibliotheek zoek={zoek} /> : (
            <div className="mk-lijst">
              {tab === "modules" && (
                <LegeBladen
                  zoek={zoek}
                  gekozen={gekozen?.id === LEGE_TEKENING.id}
                  onKies={() => setGekozen(LEGE_TEKENING)}
                  onVoegToe={() => toevoegen(LEGE_TEKENING)}
                />
              )}
              {groepen.length === 0 && !documenten && <p className="mk-leeg">{tw("kiezer.nietsGevonden", { zoek })}</p>}
              {groepen.map((g) => (
                <GroepBlok
                  key={g.id}
                  groep={g}
                  niveau={0}
                  gekozen={gekozen?.id ?? null}
                  onKies={setGekozen}
                  onVoegToe={toevoegen}
                />
              ))}
              {documenten && <DocumentenGroep onKlaar={afbreken} />}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}


/**
 * De online modulebibliotheek: de catalogus uit de openbare repository, met
 * per module installeren, bijwerken of verwijderen. Een geïnstalleerde module
 * staat daarna gewoon onder Modules.
 */
function OnlineBibliotheek({ zoek }: { zoek: string }) {
  const { t } = useTranslation();
  const { t: tw } = useTranslation("werkruimte");
  const { catalogus, geinstalleerd, laden, fout, bezig, haalCatalogus, installeer, verwijder } = useModuleBibliotheek();

  useEffect(() => {
    if (catalogus === null && !laden && !fout) void haalCatalogus();
  }, [catalogus, laden, fout, haalCatalogus]);

  const z = zoek.trim().toLowerCase();
  const lijst = (catalogus ?? []).filter((m: CatalogusModule) =>
    !z || [inTaal(m.naam), inTaal(m.omschrijving), m.categorie, ...m.normen].some((x) => x.toLowerCase().includes(z)));

  return (
    <div className="mk-online">
      <p className="mk-norm-uitleg">{tw("kiezer.online.uitleg")}</p>
      {laden && <p className="mk-leeg">{tw("kiezer.online.laden")}</p>}
      {fout && (
        <p className="mk-online-fout">
          {tw("kiezer.online.fout", { fout })}{" "}
          <button className="mk-bron" onClick={() => void haalCatalogus()}>{tw("kiezer.online.opnieuw")}</button>
        </p>
      )}
      {!laden && catalogus && lijst.length === 0 && <p className="mk-leeg">{tw("kiezer.nietsGevonden", { zoek })}</p>}
      {lijst.map((m) => {
        const eigen = geinstalleerd[m.id];
        const nieuwer = !!eigen && vergelijkVersie(eigen.versie, m.versie) < 0;
        return (
          <div key={m.id} className="mk-online-rij">
            <ModuleAfbeelding templateId={m.id} beeldUrl={eigen?.beeldData ?? bibliotheekBeeld(m)} />
            <div className="mk-online-tekst">
              <strong>{inTaal(m.naam)}</strong>
              <span>{inTaal(m.omschrijving)}</span>
              <span className="mk-online-meta">
                <span className="mk-online-status">
                  <span className={`pb-stip pb-status-${m.status}`} aria-hidden="true" />
                  {t(`bladVersie.status.${m.status}`)}
                </span>
                <span>· v{m.versie}</span>
                {m.normen.length > 0 && <span>· {m.normen.join(", ")}</span>}
                {m.gepubliceerd && <span className="tree-vlag">{tw("kiezer.gepubliceerd")}</span>}
              </span>
            </div>
            <div className="mk-online-acties">
              {(!eigen || nieuwer) && (
                <button className="settings-btn settings-btn-primary" disabled={bezig === m.id} onClick={() => void installeer(m)}>
                  {bezig === m.id
                    ? tw("kiezer.online.bezig")
                    : eigen ? tw("kiezer.online.bijwerken", { versie: m.versie }) : tw("kiezer.online.installeren")}
                </button>
              )}
              {eigen && !nieuwer && <span className="mk-online-klaar">{tw("kiezer.online.geinstalleerd", { versie: eigen.versie })}</span>}
              {eigen && (
                <button className="settings-btn settings-btn-secondary" onClick={() => verwijder(m.id)}>
                  {tw("kiezer.online.verwijderen")}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
