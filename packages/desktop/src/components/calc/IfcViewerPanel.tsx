import { ucTekst } from "./bladLezen";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { PROJECT_FORMAAT_VERSIE } from "../../store/projectBestand";
import { projectIfcx } from "../../store/projectIfcx";
import { bouwProjectStep, IFCX_ATTR, platteKnopen, type BladUitkomstGegevens, type IfcxBestand, type IfcxKnoop } from "@ifc-calc/core";
import i18next from "../../i18n/config";
import { useIfcInhoud } from "../../store/ifcInhoud";
import "./IfcViewerPanel.css";
import { rapportVoorBestand } from "../../store/versies";

/** Tooltip bij een IFC-type: een link naar de documentatie. Opgezocht bij het tekenen. */
const docsTitel = (type: string) => i18next.t("werkruimte:ifc.docs", { type });

// ── BuildingSMART documentation links ─────────────────────────

const IFC4_DOCS_BASE = "https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/";
function getIfcDocsUrl(entityType: string): string {
  const normalized = entityType.startsWith("IFC")
    ? "Ifc" + entityType.slice(3).toLowerCase().replace(/(^|_)(\w)/g, (_m, _p, c) => c.toUpperCase())
    : entityType;
  return `${IFC4_DOCS_BASE}${normalized}.htm`;
}

function openIfcDocs(entityType: string, e: React.MouseEvent) {
  e.stopPropagation();
  const url = getIfcDocsUrl(entityType);
  import("@tauri-apps/plugin-opener").then(({ openUrl }) => {
    openUrl(url);
  }).catch(() => {
    window.open(url, "_blank", "noopener");
  });
}

// ── Syntax highlighting for IFC4 STEP ─────────────────────────

const STEP_KEYWORDS = new Set([
  "ISO-10303-21", "HEADER", "ENDSEC", "DATA", "END-ISO-10303-21",
  "FILE_DESCRIPTION", "FILE_NAME", "FILE_SCHEMA",
]);

function highlightStepLine(text: string): React.ReactNode {
  const tokens: React.ReactNode[] = [];
  const re = /(#\d+)|(IFC[A-Z][A-Z0-9_]+)|([A-Z_][A-Z_0-9]{3,})|('(?:[^']|'')*')|(\.[A-Z_]+\.)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) tokens.push(text.slice(last, match.index));
    const [full] = match;
    if (match[1]) {
      tokens.push(<span key={key++} className="step-entity-ref">{full}</span>);
    } else if (match[2]) {
      tokens.push(
        <a
          key={key++}
          className="step-entity-type step-link"
          title={docsTitel(full)}
          onClick={(e) => openIfcDocs(full, e)}
        >
          {full}
        </a>
      );
    } else if (STEP_KEYWORDS.has(full)) {
      tokens.push(<span key={key++} className="step-keyword">{full}</span>);
    } else if (match[4]) {
      tokens.push(<span key={key++} className="step-string">{full}</span>);
    } else if (match[5]) {
      tokens.push(<span key={key++} className="step-enum">{full}</span>);
    } else {
      tokens.push(full);
    }
    last = match.index + full.length;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return <>{tokens}</>;
}

// ── Syntax highlighting for IFCX JSON ─────────────────────────

function highlightJson(json: string): React.ReactNode {
  const tokens: React.ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(true|false|null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(json)) !== null) {
    if (match.index > last) tokens.push(json.slice(last, match.index));
    const [full] = match;
    if (match[1]) {
      tokens.push(<span key={key++} className="step-entity-type">{full}</span>);
    } else if (match[2]) {
      const inner = full.slice(1, -1);
      if (/^Ifc[A-Z][a-zA-Z]+$/.test(inner)) {
        tokens.push(
          <a
            key={key++}
            className="step-string step-link"
            title={docsTitel(inner)}
            onClick={(e) => openIfcDocs(inner, e)}
          >
            {full}
          </a>
        );
      } else {
        tokens.push(<span key={key++} className="step-string">{full}</span>);
      }
    } else if (match[3]) {
      tokens.push(<span key={key++} className="step-enum">{full}</span>);
    } else if (match[4]) {
      tokens.push(<span key={key++} className="step-entity-ref">{full}</span>);
    } else if (match[5]) {
      tokens.push(<span key={key++} className="step-keyword">{full}</span>);
    } else {
      tokens.push(full);
    }
    last = match.index + full.length;
  }
  if (last < json.length) tokens.push(json.slice(last));
  return <>{tokens}</>;
}

// ── Wat in beeld past ─────────────────────────────────────────

/** Boven deze lengte toont het paneel een tekst ingekort; de export bevat altijd alles. */
const MAX_TEKST = 400;
/** Boven zoveel tekens of regels stopt de kleuring en het opmaken: dat zou het venster laten haperen. */
const MAX_KLEUR = 400_000;
const MAX_REGELS = 6000;

function grootte(tekens: number): string {
  return tekens < 1024 ? `${tekens} B` : tekens < 1024 * 1024 ? `${(tekens / 1024).toFixed(1)} KB` : `${(tekens / (1024 * 1024)).toFixed(1)} MB`;
}

/** Een kopie om te tonen: lange teksten (rekentekst, PDF) ingekort, de rest gelijk. */
function verkort(w: unknown): unknown {
  if (typeof w === "string") {
    return w.length > MAX_TEKST ? `${w.slice(0, MAX_TEKST)}… (${grootte(w.length)})` : w;
  }
  if (Array.isArray(w)) return w.map(verkort);
  if (w && typeof w === "object") {
    return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, verkort(v)]));
  }
  return w;
}

// ── Spatial tree ─────────────────────────────────────────────

interface TreeNode {
  pad: string;
  /** De IFC-klasse, of het soort knoop zonder klasse. */
  type: string;
  name: string;
  children: TreeNode[];
}

const TYPE_COLORS: Record<string, string> = {
  IfcProject: "#c084fc",
  IfcSite: "#34d399",
  IfcBuilding: "#60a5fa",
  IfcBuildingStorey: "#fbbf24",
  IfcWall: "#fb923c",
  IfcSlab: "#f472b6",
  IfcBeam: "#a78bfa",
  IfcColumn: "#38bdf8",
  IfcSpace: "#4ade80",
  IfcPile: "#f87171",
  IfcFooting: "#ef4444",
  IfcMember: "#fdba74",
  IfcGroup: "#22d3ee",
};

function typeVan(k: IfcxKnoop): string {
  const a = k.attributes ?? {};
  const klasse = (a[IFCX_ATTR.klasse] as { code?: string } | undefined)?.code;
  if (klasse) return klasse;
  if (a[IFCX_ATTR.figuur]) return `${(a[IFCX_ATTR.figuur] as { soort?: string }).soort ?? ""}`.toUpperCase() || "Figuur";
  if (a[IFCX_ATTR.rapport]) return "Rapport";
  if (a[IFCX_ATTR.mesh]) return "Mesh";
  return "—";
}

/** De hele boom vanaf het project, zoals IFCX hem samenstelt uit `children`. */
function bouwBoom(doc: IfcxBestand): TreeNode | null {
  const knopen = platteKnopen(doc.data);
  const wortel = doc.data.find((k) => k.attributes?.[IFCX_ATTR.project]) ?? doc.data[0];
  if (!wortel) return null;
  const loop = (pad: string, naamInOuder: string, bezig: Set<string>): TreeNode => {
    const k = knopen.get(pad);
    const naam = k?.attributes?.[IFCX_ATTR.naam];
    const nu = new Set(bezig).add(pad);
    return {
      pad,
      type: k ? typeVan(k) : "—",
      name: typeof naam === "string" && naam ? naam : naamInOuder,
      children: Object.entries(k?.children ?? {}).flatMap(([n, d]) =>
        typeof d === "string" && !nu.has(d) ? [loop(d, n, nu)] : [],
      ),
    };
  };
  return loop(wortel.path, "Project", new Set());
}

function TreeItem({ node, depth = 0, gekozen, kies }: { node: TreeNode; depth?: number; gekozen: string; kies: (pad: string) => void }) {
  const [expanded, setExpanded] = useState(depth < 4);
  const hasChildren = node.children.length > 0;
  const color = TYPE_COLORS[node.type] || "var(--theme-text-secondary)";

  return (
    <div className="ifc-tree-item">
      <button
        className={`ifc-tree-row${gekozen === node.pad ? " is-gekozen" : ""}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          kies(node.pad);
          if (hasChildren && (gekozen === node.pad || !expanded)) setExpanded(!expanded);
        }}
      >
        {hasChildren ? (
          <svg className={`ifc-tree-chevron${expanded ? " open" : ""}`} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="3,2 7,5 3,8" />
          </svg>
        ) : (
          <span className="ifc-tree-dot" style={{ background: color }} />
        )}
        {node.type.startsWith("Ifc") ? (
          <a
            className="ifc-tree-type step-link"
            title={docsTitel(node.type)}
            onClick={(e) => openIfcDocs(node.type, e)}
          >{node.type}</a>
        ) : (
          <span className="ifc-tree-type">{node.type}</span>
        )}
        <span className="ifc-tree-name">{node.name}</span>
      </button>
      {expanded && hasChildren && (
        <div className="ifc-tree-children">
          {node.children.map((child, i) => (
            <TreeItem key={`${child.pad}-${i}`} node={child} depth={depth + 1} gekozen={gekozen} kies={kies} />
          ))}
        </div>
      )}
    </div>
  );
}

function StructureBrowser({ tree, gekozen, kies }: { tree: TreeNode | null; gekozen: string; kies: (pad: string) => void }) {
  const { t } = useTranslation("ribbon");
  return (
    <div className="ifc-structure-pane">
      <div className="ifc-viewer-toolbar">
        <span className="ifc-viewer-label">{t("ifc.structure")}</span>
      </div>
      <div className="ifc-structure-tree">
        {tree && <TreeItem node={tree} gekozen={gekozen} kies={kies} />}
      </div>
    </div>
  );
}

// ── De inhoud van de gekozen knoop ───────────────────────────

/** De uitkomst van een blad als tabel: wat een andere lezer er ook uit kan halen. */
function UitkomstTabel({ u }: { u: BladUitkomstGegevens }) {
  const { t } = useTranslation("werkruimte");
  return (
    <div className="ifc-uitkomst">
      <div className="ifc-uitkomst-kop">
        <span className={`ifc-status is-${u.status}`}>{t(`ifc.status.${u.status}`)}</span>
        {u.uc !== undefined && <span className="ifc-uitkomst-uc">UC {ucTekst(u.uc)}</span>}
        {u.ucTekst && <span className="ifc-uitkomst-uc">UC {u.ucTekst}</span>}
        {u.norm && <span className="ifc-uitkomst-norm">{u.norm}</span>}
      </div>
      {u.fout && <p className="ifc-uitkomst-fout">{u.fout}</p>}
      {u.variabelen.length > 0 && (
        <table className="ifc-uitkomst-tabel">
          <thead>
            <tr>
              <th>{t("ifc.variabele")}</th>
              <th>{t("ifc.waarde")}</th>
              <th>{t("ifc.formule")}</th>
            </tr>
          </thead>
          <tbody>
            {u.variabelen.map((v) => (
              <tr key={v.naam}>
                <td>{v.naam}</td>
                <td>{v.tekst}</td>
                <td>{v.formule ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function KnoopInhoud({ knoop }: { knoop: IfcxKnoop | undefined }) {
  const { t } = useTranslation("werkruimte");
  return (
    <div className="ifc-viewer-pane">
      <div className="ifc-viewer-toolbar">
        <span className="ifc-viewer-label">{t("ifc.attributen")}</span>
      </div>
      <div className="ifc-inhoud">
        {knoop && <div className="ifc-inhoud-pad">{knoop.path}</div>}
        {Object.entries(knoop?.attributes ?? {}).map(([naam, w]) => (
          <section key={naam} className="ifc-inhoud-attribuut">
            <h4>{naam}</h4>
            {naam === IFCX_ATTR.uitkomst ? (
              <UitkomstTabel u={w as BladUitkomstGegevens} />
            ) : naam === IFCX_ATTR.rekentekst ? (
              <pre className="ifc-inhoud-tekst">{String(w)}</pre>
            ) : (
              <pre className="ifc-viewer-json ifc-inhoud-json">{highlightJson(JSON.stringify(verkort(w), null, 2))}</pre>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

// ── Viewer panes ─────────────────────────────────────────────

// Exporteren en kopiëren gaan via het lint (tab IFC, ribbon/IfcTab.tsx).
function StepViewer({ content }: { content: string }) {
  const { t } = useTranslation("ribbon");
  const { t: tw } = useTranslation("werkruimte");

  const alle = useMemo(() => content.split("\n"), [content]);
  const lines = alle.slice(0, MAX_REGELS);

  return (
    <>
      <span className="ifc-viewer-stats">{alle.length} {t("ifc.lines")} &middot; {grootte(content.length)}</span>
      <div className="ifc-viewer-code">
        <table className="ifc-viewer-table">
          <tbody>
            {lines.map((text, i) => (
              <tr key={i}>
                <td className="ifc-viewer-linenum">{i + 1}</td>
                <td className="ifc-viewer-text">{highlightStepLine(text)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {alle.length > lines.length && <p className="ifc-viewer-noot">{tw("ifc.ingekort")}</p>}
      </div>
    </>
  );
}

function IfcxViewer({ doc, volledig }: { doc: IfcxBestand; volledig: number }) {
  const { t } = useTranslation("werkruimte");
  const tekst = useMemo(() => JSON.stringify(verkort(doc), null, 2), [doc]);

  return (
    <>
      <span className="ifc-viewer-stats">{grootte(volledig)}</span>
      <div className="ifc-viewer-code">
        <p className="ifc-viewer-noot">{t("ifc.ingekort")}</p>
        <pre className="ifc-viewer-json">{tekst.length > MAX_KLEUR ? tekst : highlightJson(tekst)}</pre>
      </div>
    </>
  );
}

// ── Main panel ───────────────────────────────────────────────

interface GebouwdeIfc {
  doc: IfcxBestand;
  ifcx: string;
  step: string;
}

/**
 * De IFC van het héle project: hetzelfde document als het projectbestand, en de
 * STEP die eruit volgt. Dit rekent elk gewijzigd blad door, en dat kan even
 * duren; daarom pas nadat het paneel er staat, en niet bij elke toetsaanslag.
 */
function useProjectIfc(): GebouwdeIfc | null | "fout" {
  const projectNaam = useProjectStore((s) => s.projectNaam);
  const gegevens = useProjectStore((s) => s.gegevens);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const rapport = useProjectStore((s) => s.rapport);
  const verborgen = useProjectStore((s) => s.verborgen);
  const [uit, setUit] = useState<GebouwdeIfc | null | "fout">(null);

  useEffect(() => {
    const klok = setTimeout(() => {
      try {
        const doc = projectIfcx({
          versie: PROJECT_FORMAAT_VERSIE,
          naam: projectNaam,
          gegevens,
          exemplaren,
          rapport: rapportVoorBestand(rapport),
          verborgen,
        });
        setUit({ doc, ifcx: JSON.stringify(doc, null, 2), step: bouwProjectStep(doc) });
      } catch (err) {
        console.error("IFC van het project kon niet worden opgebouwd:", err);
        setUit("fout");
      }
    }, 150);
    return () => clearTimeout(klok);
  }, [projectNaam, gegevens, exemplaren, rapport, verborgen]);

  return uit;
}

export default function IfcViewerPanel() {
  const { t } = useTranslation("werkruimte");
  const gebouwd = useProjectIfc();
  const klaar = gebouwd && gebouwd !== "fout" ? gebouwd : null;
  const tree = useMemo(() => (klaar ? bouwBoom(klaar.doc) : null), [klaar]);
  const knopen = useMemo(() => (klaar ? platteKnopen(klaar.doc.data) : null), [klaar]);
  const [gekozen, setGekozen] = useState("");
  const [tab, setTab] = useState<"ifcx" | "step">("ifcx");

  // Voor de knoppen in het lint; weg zodra de IFC-weergave sluit.
  const step = klaar?.step ?? "";
  const ifcx = klaar?.ifcx ?? "";
  useEffect(() => {
    useIfcInhoud.setState({ step, ifcx });
    return () => useIfcInhoud.setState({ step: "", ifcx: "" });
  }, [step, ifcx]);

  if (!klaar) {
    return (
      <div className="ifc-viewer-panel ifc-viewer-melding">
        {gebouwd === "fout" ? t("ifc.mislukt") : t("ifc.bezig")}
      </div>
    );
  }

  const huidig = knopen?.get(gekozen) ?? (tree ? knopen?.get(tree.pad) : undefined);

  return (
    <div className="ifc-viewer-panel">
      <StructureBrowser tree={tree} gekozen={huidig?.path ?? ""} kies={setGekozen} />
      <div className="ifc-viewer-divider" />
      <KnoopInhoud knoop={huidig} />
      <div className="ifc-viewer-divider" />
      <div className="ifc-viewer-pane">
        <div className="ifc-viewer-toolbar" role="tablist">
          <button role="tab" aria-selected={tab === "ifcx"} className={`ifc-viewer-tab${tab === "ifcx" ? " is-actief" : ""}`} onClick={() => setTab("ifcx")}>IFCX JSON</button>
          <button role="tab" aria-selected={tab === "step"} className={`ifc-viewer-tab${tab === "step" ? " is-actief" : ""}`} onClick={() => setTab("step")}>IFC4x3 STEP</button>
        </div>
        {tab === "ifcx" ? <IfcxViewer doc={klaar.doc} volledig={klaar.ifcx.length} /> : <StepViewer content={klaar.step} />}
      </div>
    </div>
  );
}
