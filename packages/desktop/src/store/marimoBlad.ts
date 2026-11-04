/**
 * Een Marimo-blad: een reactief Python-notebook als blad in het project. Bewerken en rekenen
 * gebeurt in de Python-omgeving (components/calc/MarimoVenster.tsx); hier staat het notebook
 * zelf: één `.py`-bestand als tekst, plus de laatste uitvoer voor op papier.
 *
 * Een Marimo-blad is een gewoon exemplaar (store/projectStore.ts) met `templateId`
 * MARIMO_BLAD, een lege `source` en geen invoer. Een notebook bewaart zelf geen uitvoer,
 * dus die bewaart de app apart. Die uitvoer is html uit de omgeving: invoer van buiten, die
 * pas op papier komt na dezelfde opschoning als de uitwerking van een rekenblad.
 *
 * Puur en zonder React: projectBestand.ts gebruikt dit bestand, en de controlescripts
 * laden dat rechtstreeks in Node.
 */

/** `templateId` van een Marimo-blad. Geen module: er is geen sjabloon met deze naam. */
export const MARIMO_BLAD = "marimo";

/** Boven deze omvang weigert de app een notebook: het is dan geen tekst om te lezen meer. */
export const MARIMO_MAX_TEKENS = 5 * 1024 * 1024;
/** Zoveel uitvoer bewaart de app hoogstens per blad, in tekens html. */
export const MARIMO_MAX_UITVOER = 8 * 1024 * 1024;

/** Zoveel regels code staan er hoogstens in één blok op papier. */
const REGELS_PER_BLOK = 45;

/** Het notebook van een Marimo-blad. */
export interface MarimoNotebook {
  /** De naam waaronder het notebook is ingelezen; leeg bij een nieuw blad. */
  bestandsnaam: string;
  /** Het notebook: Python-code, zoals in het `.py`-bestand. */
  code: string;
  /** Gaat de code mee op papier, of alleen de uitvoer? */
  metCode: boolean;
  /** De laatste uitvoer per cel, als html, in de volgorde van het notebook. */
  uitvoer: string[];
}

/** Is dit blad een Marimo-blad? Ook als het notebook ontbreekt. */
export function isMarimoBlad(ex: { templateId?: string }): boolean {
  return ex.templateId === MARIMO_BLAD;
}

/** Past dit binnen wat de app bewaart? Anders blijft de vorige uitvoer staan. */
export function geldigeUitvoer(x: unknown): string[] | null {
  if (!Array.isArray(x) || !x.every((u) => typeof u === "string")) return null;
  const totaal = (x as string[]).reduce((som, u) => som + u.length, 0);
  return totaal <= MARIMO_MAX_UITVOER ? (x as string[]) : null;
}

/** Het notebook uit een bestand of de opgeslagen staat van de app. */
export function leesMarimoNotebook(x: unknown): MarimoNotebook | undefined {
  if (!x || typeof x !== "object") return undefined;
  const n = x as { bestandsnaam?: unknown; code?: unknown; metCode?: unknown; uitvoer?: unknown };
  if (typeof n.code !== "string" || n.code.length > MARIMO_MAX_TEKENS) return undefined;
  return {
    bestandsnaam: typeof n.bestandsnaam === "string" ? n.bestandsnaam : "",
    code: n.code,
    metCode: n.metCode !== false,
    uitvoer: geldigeUitvoer(n.uitvoer) ?? [],
  };
}

/** Lijkt deze tekst op een Marimo-notebook? Een gewoon Python-script start daar niet in. */
export function isMarimoCode(code: string): boolean {
  return /^\s*import marimo\b/m.test(code) && /\bmarimo\.App\(/.test(code);
}

/** Een cel uit het notebook: de code zonder functie eromheen. */
export interface MarimoCel {
  code: string;
  /** De code staat verborgen in het notebook: ook niet op papier. */
  verborgen: boolean;
}

/**
 * De cellen uit de tekst van een notebook, in de volgorde van het bestand. Marimo schrijft
 * elke cel als functie onder `@app.cell`; de `return` eronder is alleen boekhouding van
 * de variabelen, en hoort niet bij wat de lezer geschreven heeft.
 */
export function marimoCellen(code: string): MarimoCel[] {
  const regels = code.replace(/\r\n?/g, "\n").split("\n");
  const uit: MarimoCel[] = [];
  for (let i = 0; i < regels.length; i++) {
    const kop = regels[i];
    if (!/^(@app\.cell|with app\.setup)\b/.test(kop)) continue;
    const verborgen = /hide_code\s*=\s*True/.test(kop);
    if (kop.startsWith("@app.cell")) {
      // Naar de eerste regel na de functiekop; die kan over meer regels lopen.
      i++;
      while (i < regels.length && !/:\s*(#.*)?$/.test(regels[i])) i++;
    }
    const romp: string[] = [];
    for (i += 1; i < regels.length; i++) {
      if (regels[i].trim() !== "" && !/^\s/.test(regels[i])) break;
      romp.push(regels[i].replace(/^ {4}/, ""));
    }
    i--;
    while (romp.length > 0 && romp[romp.length - 1].trim() === "") romp.pop();
    if (romp.length > 0 && /^return\b/.test(romp[romp.length - 1])) romp.pop();
    while (romp.length > 0 && romp[romp.length - 1].trim() === "") romp.pop();
    uit.push({ code: romp.join("\n"), verborgen });
  }
  return uit;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Het notebook op papier: per cel de code en de laatste uitvoer. De kernel komt er niet aan
 * te pas. Elk los element is een blok voor de paginering (paginering.ts); de html gaat
 * nog door UitwerkingHtml, en wordt daar geschoond.
 */
export function marimoNaarHtml(nb: MarimoNotebook): string {
  const uit: string[] = [];
  marimoCellen(nb.code).forEach((cel, i) => {
    if (nb.metCode && !cel.verborgen && cel.code.trim()) {
      const regels = cel.code.split("\n");
      for (let r = 0; r < regels.length; r += REGELS_PER_BLOK) {
        uit.push(`<pre class="nb-code">${escape(regels.slice(r, r + REGELS_PER_BLOK).join("\n"))}</pre>`);
      }
    }
    const uitvoer = nb.uitvoer[i];
    if (uitvoer && uitvoer.trim()) uit.push(`<div class="nb-md">${uitvoer}</div>`);
  });
  return uit.join("\n");
}

/** De naam van een nieuw blad uit de bestandsnaam: zonder map en extensie. */
export function bladnaamVoorMarimo(bestandsnaam: string): string {
  const los = bestandsnaam.split(/[\\/]/).pop() ?? bestandsnaam;
  return los.replace(/\.py$/i, "").trim() || "Marimo";
}

/** Teksten van het notebook in een nieuw blad; in de taal van de app. */
export interface MarimoStartTeksten {
  kop: string;
  uitleg: string;
}

/**
 * Een nieuw notebook: een ligger met twee schuiven, zodat meteen te zien is wat reactief
 * betekent. Niets draait uit zichzelf: de gebruiker start het met Run.
 */
export function marimoStartCode(t: MarimoStartTeksten): string {
  const tekst = `${t.kop}\n\n    ${t.uitleg}`.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');
  return `import marimo

__generated_with = "0.25.2"
app = marimo.App()


@app.cell
def _():
    import marimo as mo
    import numpy as np
    import matplotlib.pyplot as plt
    return mo, np, plt


@app.cell
def _(mo):
    mo.md("""
    # ${tekst}
    """)
    return


@app.cell
def _(mo):
    overspanning = mo.ui.slider(2, 12, value=6, step=0.5, label="L (m)")
    last = mo.ui.slider(1, 20, value=5, step=0.5, label="q (kN/m)")
    mo.vstack([overspanning, last])
    return last, overspanning


@app.cell
def _(last, mo, np, overspanning, plt):
    L = overspanning.value
    q = last.value
    x = np.linspace(0, L, 101)
    plt.figure(figsize=(6, 2.4))
    plt.plot(x, q * x * (L - x) / 2)
    plt.gca().invert_yaxis()
    plt.xlabel("x (m)")
    plt.ylabel("M (kNm)")
    mo.vstack([mo.md(f"M_max = **{q * L**2 / 8:.1f} kNm**"), plt.gca()])
    return


if __name__ == "__main__":
    app.run()
`;
}
