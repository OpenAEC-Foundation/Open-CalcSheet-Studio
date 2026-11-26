/**
 * FEM Studio voor de rekendienst: de meegeleverde server van Open FEM Studio als
 * kindproces, met MCP over stdin/stdout, één JSON-RPC-bericht per regel. Dezelfde
 * afspraken als de desktop-app (packages/desktop/src-tauri/fem-brug/src/lib.rs):
 *
 *   • starten met `initialize` en `notifications/initialized`; 30 s voor het starten en
 *     de lijst met tools, 300 s voor één toets;
 *   • de antwoorden komen niet op volgorde: ze gaan op id naar wie erop wacht;
 *   • alleen reken- en opzoektools (toetsToolToegestaan uit de kern, dezelfde lijst als de
 *     app), en geen argumenten die naar een bestand wijzen;
 *   • stopt het proces, dan krijgt elke wachtende aanroep een fout en start de volgende
 *     aanroep het opnieuw.
 *
 * De server valt onder de AGPL-3.0; hij draait als apart programma (docs/ontwikkelen.md).
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { toetsToolToegestaan } from "@ifc-calc/core";

const PROTOCOL = "2025-06-18";
const TIJD_START = 30_000;
const TIJD_AANROEP = 300_000;
const GESTOPT = "FEM Studio is gestopt.";
const PADEN = ["path", "project_path", "project", "pad", "output_path", "uitvoerpad", "save_as", "projectbestand"];

/** De uitkomst van `tools/call`: structuredContent, of de tekst als JSON; bij isError een fout. */
function toolresultaat(r) {
  const tekst = r?.content?.[0]?.text ?? "";
  if (r?.isError === true) throw new Error(tekst.replace(/^Error: /, ""));
  if (r?.structuredContent != null) return r.structuredContent;
  try {
    return JSON.parse(tekst);
  } catch {
    throw new Error(`Onleesbaar antwoord van FEM Studio: ${tekst}`);
  }
}

class Proces {
  constructor(pad, versieClient) {
    this.pad = pad;
    this.versieClient = versieClient;
    this.volgende = 0;
    this.wachtend = new Map();
    this.levend = false;
    this.versie = "";
  }

  async start() {
    this.kind = spawn(this.pad, [], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    this.levend = true;
    const gestopt = () => {
      this.levend = false;
      for (const w of this.wachtend.values()) w.nee(new Error(GESTOPT));
      this.wachtend.clear();
    };
    this.kind.on("exit", gestopt);
    this.kind.on("error", (e) => {
      this.startfout = e;
      gestopt();
    });
    this.kind.stdin.on("error", () => {});
    createInterface({ input: this.kind.stdout }).on("line", (regel) => {
      let b;
      try {
        b = JSON.parse(regel);
      } catch {
        return;
      }
      if (typeof b?.id !== "number") return;
      const w = this.wachtend.get(b.id);
      if (!w) return;
      this.wachtend.delete(b.id);
      if (b.error) w.nee(new Error(b.error.message ?? "onbekende fout"));
      else w.ja(b.result ?? null);
    });
    const start = await this.roep("initialize", {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "open-calcsheet-studio-api", version: this.versieClient },
    }, TIJD_START);
    this.versie = start?.serverInfo?.version ?? "";
    this.schrijf({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  schrijf(bericht) {
    if (!this.levend) throw new Error(this.startfout ? `FEM Studio kon niet starten (${this.pad}): ${this.startfout.message}` : GESTOPT);
    this.kind.stdin.write(`${JSON.stringify(bericht)}\n`);
  }

  roep(methode, params, tijd) {
    return new Promise((ja, nee) => {
      const id = ++this.volgende;
      const klok = setTimeout(() => {
        this.wachtend.delete(id);
        nee(new Error(`FEM Studio gaf binnen ${tijd / 1000} s geen antwoord.`));
      }, tijd);
      this.wachtend.set(id, {
        ja: (w) => {
          clearTimeout(klok);
          ja(w);
        },
        nee: (e) => {
          clearTimeout(klok);
          nee(e);
        },
      });
      try {
        this.schrijf({ jsonrpc: "2.0", id, method: methode, params });
      } catch (e) {
        this.wachtend.delete(id);
        clearTimeout(klok);
        nee(e);
      }
    });
  }

  stop() {
    try {
      this.kind?.kill();
    } catch {
      // al weg
    }
  }
}

/**
 * FEM Studio op `pad`, of null als daar geen server staat. Het proces start bij de eerste
 * vraag, niet hier.
 */
export function maakFem(pad, versieClient) {
  if (!pad || !existsSync(pad)) return null;
  let proces = null;
  let starten = null;
  let sha256;
  const levendProces = async () => {
    if (proces?.levend) return proces;
    starten ??= (async () => {
      const p = new Proces(pad, versieClient);
      try {
        await p.start();
        proces = p;
        return p;
      } catch (e) {
        p.stop();
        throw e;
      } finally {
        starten = null;
      }
    })();
    return starten;
  };
  return {
    pad,
    async status() {
      try {
        const p = await levendProces();
        sha256 ??= createHash("sha256").update(readFileSync(pad)).digest("hex");
        return { beschikbaar: true, versie: p.versie, sha256 };
      } catch (e) {
        return { beschikbaar: false, reden: e.message };
      }
    },
    async tools() {
      return (await levendProces()).roep("tools/list", {}, TIJD_START);
    },
    async aanroep(tool, argumenten) {
      if (!toetsToolToegestaan(tool)) throw new Error(`De tool "${tool}" van FEM Studio is in CalcSheet niet toegestaan.`);
      if (argumenten && typeof argumenten === "object" && Object.keys(argumenten).some((k) => PADEN.includes(k))) {
        throw new Error("Een toets krijgt zijn model in het verzoek, niet als pad naar een bestand.");
      }
      const p = await levendProces();
      return toolresultaat(await p.roep("tools/call", { name: tool, arguments: argumenten ?? {} }, TIJD_AANROEP));
    },
    stop() {
      proces?.stop();
      proces = null;
    },
  };
}
