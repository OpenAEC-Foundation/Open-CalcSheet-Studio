import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useActieveBron, useZetActieveBron } from "../../store/actiefBlad";
import "./HelpPanel.css";

/**
 * Shown in the preview pane when the editor is empty. A short
 * "How it works" reference card so users discover the language without
 * leaving the app. Sections with a `+` prefix can be expanded.
 *
 * Clicking an inline snippet inserts it into the editor.
 */

/**
 * Zichtbare tekst: letterlijk (code, tekens; in elke taal gelijk) of een
 * sleutel onder rekentaal:help. Het fragment in `insert` is rekentaal en wordt
 * nooit vertaald.
 */
type Tekst = string | { sleutel: string };
const vt = (sleutel: string): Tekst => ({ sleutel });

interface Section {
  /** Sleutel van de titel (rekentaal:help.sectie.…); ook de React-key. */
  id: string;
  /** When set, items render as a collapsible list. */
  items?: Item[];
  /** When set, render as a single paragraph / inline list (no toggle). */
  inline?: { label: Tekst; insert?: string; isCode?: boolean }[];
  /** Plain-text body shown after the title (no inserts). */
  description?: Tekst;
}

interface Item {
  label: Tekst;
  insert?: string;
  description?: Tekst;
}

const SECTIONS: Section[] = [
  {
    id: "hoeHetWerkt",
    description: vt("uitleg.hoeHetWerkt"),
  },
  {
    id: "getallen",
    inline: [
      { label: vt("item.reeel"), insert: "1.5", isCode: true },
      { label: vt("item.complex"), insert: "3 - 2i", isCode: true },
      { label: vt("item.vector"), insert: "[v_1; v_2; v_3]", isCode: true },
      { label: vt("item.matrix"), insert: "[a; b | c; d]", isCode: true },
    ],
  },
  {
    id: "variabelen",
    items: [
      { label: vt("item.eenvoudig"), insert: "b = 300 mm", description: vt("omschrijving.eenvoudig") },
      { label: vt("item.subscript"), insert: "V_b,0 = 27 m/s", description: vt("omschrijving.subscript") },
      { label: vt("item.griekseLetter"), insert: "γ_Q = 1.5", description: "γ, σ, ψ, μ, π …" },
    ],
  },
  {
    id: "constanten",
    inline: [
      { label: "π", insert: "pi" },
      { label: "e", insert: "e" },
      { label: "φ", insert: "phi" },
      { label: "γc · γs · γa · γw", insert: "γ_c" },
    ],
  },
  {
    id: "operatoren",
    inline: [
      { label: "+ − × ÷", insert: "+", isCode: true },
      { label: "^", insert: "^", isCode: true },
      { label: "%", insert: "%", isCode: true },
      { label: "≡ ≠ ≤ ≥", insert: "≤", isCode: true },
      { label: "and · or · not", insert: "and(a; b)" },
    ],
  },
  {
    id: "functies",
    items: [
      { label: "f(x) = …", insert: "f(x) = x^2 + 1", description: vt("omschrijving.eigenFunctie") },
      { label: "sin / cos / tan", insert: "sin(θ)" },
      { label: "log / log10 / lg", insert: "log10(x)" },
      { label: "sqrt / sqr / abs", insert: "sqrt(x)" },
      { label: "min / max / round / floor / ceil", insert: "max(a; b)" },
      { label: "if (ternary)", insert: "if(cond; t; f)" },
      { label: "take / hlookup / vlookup", insert: "take(1; vec)" },
    ],
  },
  {
    id: "voorwaarden",
    items: [
      { label: "#if … #end if", insert: "#if cond\n\t…\n#end if" },
      { label: "#if … #else if … #else … #end if", insert: "#if a > 0\n\t…\n#else if a == 0\n\t…\n#else\n\t…\n#end if" },
    ],
  },
  {
    id: "lussen",
    items: [
      { label: "#repeat n … #loop", insert: "#repeat 10\n\t…\n#loop" },
      { label: "#while cond … #loop", insert: "#while i < 10\n\t…\n#loop" },
      { label: "#for var = lo : hi … #loop", insert: "#for i = 1 : 9\n\t…\n#loop" },
      { label: vt("item.break"), insert: "#break" },
    ],
  },
  {
    id: "macros",
    items: [
      { label: "#def name(args) … #end def", insert: "#def line$(x1$; y1$; x2$; y2$)\n\t'<line x1=\"'x1$'\" y1=\"'y1$'\" .../>\n#end def" },
      { label: vt("item.defConstante"), insert: "#def style1$ = \"stroke:black\"" },
      { label: vt("item.include"), insert: "#include bestand.cpd" },
    ],
  },
  {
    id: "tekeningen",
    items: [
      { label: vt("item.svg"), insert: "@svg\n\t<rect width=\"100\" height=\"50\"/>\n@end" },
      {
        label: vt("item.drieD"),
        insert: "@3d\n\tkolom 0 0 0 3000 200 200\n\tkolom 5000 0 0 3000 200 200\n\tbalk 0 0 3150 5000 0 3150 200 300 hout\n@end",
        description: vt("omschrijving.drieD"),
      },
      {
        label: vt("item.iframe"),
        insert: "@iframe https:// hoogte=120mm",
        description: vt("omschrijving.iframe"),
      },
      {
        label: vt("item.js"),
        insert: "@js hoogte=80mm titel=\"Waarden uit het blad\"\nfunction toon() {\n  document.body.textContent = calc.namen().map(calc.tekst).join(\", \");\n}\ntoon();\ncalc.bijWijziging(toon);\n@end",
        description: vt("omschrijving.js"),
      },
      { label: vt("item.imgPng"), insert: "@img(detail.png)" },
      { label: vt("item.imgSvg"), insert: "@img(detail.svg)" },
      { label: "$Plot{ f(x) @ x = lo : hi }", insert: "$Plot{f(x) @ x = -10 : 10}" },
    ],
  },
  {
    id: "tekst",
    items: [
      { label: vt("item.titel"), insert: "\"Project Titel" },
      { label: vt("item.vet"), insert: "'<b>Vetgedrukt</b>" },
      { label: vt("item.hoofdstuk"), insert: "# 1. Invoer" },
      { label: vt("item.commentaar"), insert: "// commentaar" },
    ],
  },
  {
    id: "hoekeenheden",
    inline: [
      { label: "#deg", insert: "#deg" },
      { label: "#rad", insert: "#rad" },
      { label: "#gra", insert: "#gra" },
    ],
  },
  {
    id: "eenheden",
    description: vt("uitleg.eenheden"),
  },
];

export default function HelpPanel() {
  const { t } = useTranslation("rekentaal");
  const tekst = (x: Tekst) => (typeof x === "string" ? x : t(`help.${x.sleutel}`));
  const source = useActieveBron();
  const setSource = useZetActieveBron();
  // First two sections always open; rest start collapsed.
  const [open, setOpen] = useState<Set<number>>(new Set([0, 1, 2]));

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const insert = (snippet: string) => {
    const sep = source.length === 0 || source.endsWith("\n") ? "" : "\n";
    setSource(source + sep + snippet + "\n");
  };

  return (
    <div className="help-panel">
      <header className="help-panel-header">
        <h2 className="help-panel-title">{t("help.titel")}</h2>
        <p className="help-panel-subtitle">{t("help.ondertitel")}</p>
      </header>
      <div className="help-panel-body">
        {SECTIONS.map((sec, i) => {
          const isCollapsible = !!(sec.items && sec.items.length > 0);
          const isOpen = !isCollapsible || open.has(i);
          return (
            <section key={sec.id} className={`help-section${isOpen ? " open" : ""}`}>
              <button
                type="button"
                className="help-section-header"
                onClick={() => isCollapsible && toggle(i)}
                aria-expanded={isOpen}
                aria-disabled={!isCollapsible}
              >
                {isCollapsible && (
                  <span className="help-section-toggle" aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                )}
                <span className="help-section-title">{t(`help.sectie.${sec.id}`)}</span>
              </button>
              {isOpen && (
                <div className="help-section-content">
                  {sec.description && <p className="help-section-desc">{tekst(sec.description)}</p>}
                  {sec.inline && (
                    <div className="help-section-inline">
                      {sec.inline.map((it, j) => (
                        <button
                          key={j}
                          type="button"
                          className={`help-chip${it.isCode ? " is-code" : ""}`}
                          onClick={() => it.insert && insert(it.insert)}
                          title={it.insert ? t("help.voegIn", { fragment: it.insert }) : undefined}
                        >
                          {tekst(it.label)}
                        </button>
                      ))}
                    </div>
                  )}
                  {sec.items && (
                    <ul className="help-section-items">
                      {sec.items.map((it, j) => (
                        <li key={j}>
                          <button
                            type="button"
                            className="help-item"
                            onClick={() => it.insert && insert(it.insert)}
                            title={it.insert ? t("help.klikOmInTeVoegen") : undefined}
                          >
                            <span className="help-item-label">{tekst(it.label)}</span>
                            {it.description && (
                              <span className="help-item-desc"> — {tekst(it.description)}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
