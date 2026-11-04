/*
 * De brug tussen de app en Marimo. Komt met een script-tag in marimo/index.html
 * (scripts/bouw-jupyter-omgeving.mjs) en draait dus in de iframe van een Marimo-blad, niet
 * in de app. Marimo start pas als de code uit het project er is; zie
 * components/calc/MarimoVenster.tsx aan de andere kant.
 *
 * Van de app:     laad { code, donker }, vraagStand { id }
 * Naar de app:    gereed, geladen, gewijzigd, stand { id, code, uitvoer }, opslaan, fout { melding }
 *
 * Code in deze pagina kan dezelfde berichten sturen. De app behandelt ze daarom als
 * invoer van buiten: ze raken alleen dit blad.
 */
(function () {
  "use strict";

  const BRON = "ocss-marimo";
  /** Waar Marimo een opgeslagen notebook neerzet in de opslag van de pagina. */
  const SLEUTEL = "marimo:file";
  const MAX_UITVOER = 5 * 1024 * 1024;
  /** Zo lang wacht opslaan op Marimo: de eerste keer start er nog een hulpproces. */
  const OPSLAG_WACHT_MS = 6000;

  let appHerkomst = "*";
  let gestart = false;
  let laatsteCode = null;
  /** Is er getypt sinds Marimo voor het laatst bewaarde? Klikken bewaart Marimo zelf na een korte pauze. */
  let onbewaard = false;
  const wachtOpOpslag = new Set();

  function stuur(bericht) {
    window.top.postMessage({ bron: BRON, ...bericht }, appHerkomst);
  }

  // Het project is de enige bewaarplek: geen oude stand uit de opslag van de webview.
  try {
    localStorage.removeItem(SLEUTEL);
  } catch {
    // Geen opslag: dan is er ook niets ouds.
  }

  /** Marimo bewaart via de opslag van de pagina: daar lezen we het mee. */
  const zetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (sleutel, waarde) {
    zetItem.call(this, sleutel, waarde);
    if (this !== window.localStorage || sleutel !== SLEUTEL) return;
    let code = waarde;
    try {
      code = JSON.parse(waarde);
    } catch {
      // Geen JSON: dan is het de tekst zelf.
    }
    if (typeof code !== "string") return;
    const anders = code !== laatsteCode;
    laatsteCode = code;
    onbewaard = false;
    for (const klaar of wachtOpOpslag) klaar();
    if (anders) stuur({ soort: "gewijzigd" });
  };

  const NIET_OP_PAPIER = new Set(["style", "link", "script", "noscript", "template", "button"]);

  /** Een eigenschap die op papier niets doet, maar soms de hele afbeelding nog een keer bevat. */
  const isOverbodig = (naam) => naam === "class" || naam === "id" || naam === "role" || naam === "tabindex"
    || naam === "contenteditable" || naam.startsWith("data-") || naam.startsWith("aria-") || naam.startsWith("on");

  const tekstVak = (tekst) => {
    const vak = document.createElement("span");
    vak.textContent = ` ${tekst} `;
    return vak;
  };

  /**
   * Eén knoop zoals hij op het scherm staat, zonder schaduw-DOM: een grafiek en een schuif
   * staan daarin, en kopieert de browser niet mee. Een invoer komt op papier als zijn waarde.
   */
  function plat(knoop) {
    if (knoop.nodeType === Node.TEXT_NODE) return document.createTextNode(knoop.textContent);
    if (knoop.nodeType !== Node.ELEMENT_NODE) return null;
    const naam = knoop.localName;
    if (NIET_OP_PAPIER.has(naam)) return null;
    if (knoop.getAttribute("role") === "slider") return tekstVak(knoop.getAttribute("aria-valuenow") ?? "");
    if (naam === "input" || naam === "textarea") {
      return tekstVak(knoop.type === "checkbox" || knoop.type === "radio" ? (knoop.checked ? "☑" : "☐") : knoop.value);
    }
    if (naam === "select") return tekstVak(knoop.selectedOptions[0]?.textContent ?? "");
    if (naam === "canvas") {
      const beeld = document.createElement("img");
      try {
        beeld.src = knoop.toDataURL("image/png");
      } catch {
        return null;
      }
      return beeld;
    }
    // Een eigen element van Marimo zou bij het kopiëren zichzelf opnieuw opbouwen.
    const kopie = naam.includes("-") ? document.createElement("div") : knoop.cloneNode(false);
    for (const { name } of [...kopie.attributes]) {
      if (isOverbodig(name)) kopie.removeAttribute(name);
    }
    const kinderen = naam === "slot" && knoop.assignedNodes({ flatten: true }).length > 0
      ? knoop.assignedNodes({ flatten: true })
      : (knoop.shadowRoot ?? knoop).childNodes;
    for (const kind of kinderen) {
      const uit = plat(kind);
      if (uit) kopie.append(uit);
    }
    return kopie;
  }

  function zonderSchaduw(bron) {
    return plat(bron)?.innerHTML ?? "";
  }

  /** De uitvoer per cel, in de volgorde van het notebook. */
  function uitvoerNu() {
    let totaal = 0;
    return [...document.querySelectorAll("[data-cell-id]")].map((cel) => {
      const vak = cel.querySelector(".output-area, [data-testid='cell-output']");
      if (!vak) return "";
      const html = zonderSchaduw(vak);
      totaal += html.length;
      return totaal > MAX_UITVOER ? "" : html;
    });
  }

  /**
   * Laat Marimo bewaren wat er nog niet bewaard is, en wacht daarop. Zonder getypte tekst
   * gebeurt er niets, en blijft een notebook dat alleen geopend is precies zoals het was.
   * Lukt het niet op tijd, dan bewaart Marimo het zelf en volgt er een bericht `gewijzigd`.
   */
  function vraagOpslag() {
    if (!onbewaard) return Promise.resolve();
    return new Promise((klaar) => {
      const af = () => {
        clearTimeout(tijd);
        wachtOpOpslag.delete(af);
        klaar();
      };
      const tijd = setTimeout(af, OPSLAG_WACHT_MS);
      wachtOpOpslag.add(af);
      document.querySelector('[data-testid="save-button"]')?.click();
    });
  }

  async function stand({ id }) {
    await vraagOpslag();
    stuur({ soort: "stand", id, code: laatsteCode, uitvoer: uitvoerNu() });
  }

  function start({ code, donker }) {
    if (gestart || typeof code !== "string") return;
    gestart = true;
    laatsteCode = code;
    const basis = window.__OCSS_MARIMO_BASIS;
    const config = { ...basis.config, display: { ...basis.config.display, theme: donker ? "dark" : "light" } };
    Object.defineProperty(window, "__MARIMO_MOUNT_CONFIG__", {
      value: Object.freeze({ ...basis, config, code }),
      writable: false,
      configurable: false,
    });
    const element = document.createElement("marimo-code");
    element.hidden = true;
    element.textContent = encodeURIComponent(code);
    document.head.append(element);

    const script = document.createElement("script");
    script.type = "module";
    script.src = document.querySelector('meta[name="ocss-marimo-start"]').content;
    script.onerror = () => stuur({ soort: "fout", melding: "Marimo kon niet starten." });
    document.head.append(script);

    // Klaar zodra de cellen er staan: de kernel start op de achtergrond verder.
    const kijk = setInterval(() => {
      if (document.querySelector("[data-cell-id]")) {
        clearInterval(kijk);
        stuur({ soort: "geladen" });
      }
    }, 200);
  }

  window.addEventListener("message", (e) => {
    const b = e.data;
    if (e.source !== window.top || !b || b.bron !== BRON) return;
    appHerkomst = e.origin;
    if (b.soort === "laad") start(b);
    else if (b.soort === "vraagStand") {
      stand(b).catch((err) => {
        console.error("Marimo-brug:", err);
        stuur({ soort: "fout", id: b.id, melding: String(err?.message ?? err) });
      });
    }
  });

  // Ctrl+S bewaart ook het project, zoals overal in de app.
  window.addEventListener("keydown", (e) => {
    if (!e.isTrusted) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") stuur({ soort: "opslaan" });
    else onbewaard = true;
  }, true);
  window.addEventListener("beforeinput", () => {
    onbewaard = true;
  }, true);

  stuur({ soort: "gereed" });
})();
