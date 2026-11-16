/**
 * Proef met de echte server van Open FEM Studio: rekent de bladen met een staafwerk uit
 * scripts/fixtures/fem/staven-bladen.mjs door, precies zoals de app dat doet (het verzoek
 * uit de werkruimte, femVerzoekArgumenten, `tools/call`, femBewaar; daarna de ronde van
 * de houttoets), en legt met `--bewaar` de antwoorden vast in scripts/fixtures/fem/.
 * scripts/check-fem-staven.mjs rekent daarmee verder, ook zonder server (in CI).
 *
 * Met `--bewaar` schrijft de proef ook:
 *   • solve_open_fem_3d_batch.schema.json en check_timber_beams.schema.json: het
 *     inputSchema uit tools/list, zonder de teksten;
 *   • tools-<versie>.json: de namen van alle tools van deze server;
 *   • staven-ruw.json: de ligger met het antwoord zoals het kwam (de velden die
 *     femStaafBewaar leest), om het bewaren na te rekenen.
 *
 * Met `--zonder-node` start de proef de server in een omgeving zonder Node (een PATH
 * zonder Node, en OPENAEC_NODE naar een pad dat niet bestaat: de server zoekt Node anders
 * ook op de gewone installatieplek) en laat zien welke tools dan nog rekenen. CalcSheet
 * levert geen Node mee, dus de weg van een staafwerk moet zonder kunnen.
 *
 * Waar de server staat: OCSS_FEM_SERVER, anders de vastgezette server van CalcSheet
 * (packages/desktop/src-tauri/fem-studio, op te halen met scripts/haal-fem-server.mjs).
 *
 * Draaien:  node scripts/proef-fem-staven.mjs [--bewaar] [--zonder-node]
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { alsAntwoord, evaluate, femBewaar, femVerzoekArgumenten, parse, schemaHash } from "../packages/core/dist/index.js";
import { SERVER as VASTGEZET } from "./haal-fem-server.mjs";
import { LIGGER, STAVEN_BLADEN } from "./fixtures/fem/staven-bladen.mjs";

const bewaar = process.argv.includes("--bewaar");
const zonderNode = process.argv.includes("--zonder-node");
const server = [process.env.OCSS_FEM_SERVER, VASTGEZET].filter(Boolean).find((p) => existsSync(p));
if (!server) {
  console.log("Geen server van FEM Studio gevonden: zet OCSS_FEM_SERVER of draai node scripts/haal-fem-server.mjs.");
  process.exit(1);
}

/** De omgeving voor de server; zonder Node als dat gevraagd is. */
function omgeving() {
  if (!zonderNode) return process.env;
  const kaal = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(path|node.*|npm.*|nvm.*|volta.*|fnm.*)$/i.test(k)) kaal[k] = v;
  const systeem = process.env.SystemRoot;
  kaal.PATH = systeem ? `${systeem}\\System32;${systeem}` : "/usr/bin:/bin";
  kaal.OPENAEC_NODE = process.platform === "win32" ? "C:\\bestaat-niet\\node.exe" : "/bestaat-niet/node";
  return kaal;
}

/** Eén server over stdin/stdout: één JSON-RPC-bericht per regel, antwoorden op id. */
function start(pad) {
  const kind = spawn(pad, [], { stdio: ["pipe", "pipe", "ignore"], env: omgeving() });
  const wacht = new Map();
  let buffer = "";
  kind.stdout.on("data", (d) => {
    buffer += d.toString("utf8");
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const regel = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!regel) continue;
      let v;
      try {
        v = JSON.parse(regel);
      } catch {
        continue;
      }
      if (v.id != null && wacht.has(v.id)) {
        wacht.get(v.id)(v);
        wacht.delete(v.id);
      }
    }
  });
  let id = 0;
  const roep = (method, params) =>
    new Promise((klaar) => {
      const n = ++id;
      wacht.set(n, klaar);
      kind.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
    });
  return { roep, stop: () => kind.kill() };
}

const fem = start(server);
const init = await fem.roep("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "proef-fem-staven", version: "1" } });
const versie = init.result?.serverInfo?.version ?? "";
const sha256 = createHash("sha256").update(readFileSync(server)).digest("hex");
const lijst = await fem.roep("tools/list", {});
const tools = lijst.result?.tools ?? [];
console.log(`FEM Studio ${versie} (${tools.length} tools)${zonderNode ? ", in een omgeving zonder Node" : ""}`);

async function reken(tool, args) {
  const t0 = Date.now();
  const r = await fem.roep("tools/call", { name: tool, arguments: args });
  const ms = Date.now() - t0;
  if (r.error) throw new Error(r.error.message);
  if (r.result?.isError) throw new Error(r.result.content?.[0]?.text ?? "fout");
  return { ruw: r.result.structuredContent ?? JSON.parse(r.result.content[0].text), ms };
}
const herkomst = (tool) => ({ versie, sha256, schema: schemaHash(tools.find((t) => t.name === tool)?.inputSchema) });

let fouten = 0;
if (zonderNode) {
  // Welke tools rekenen zonder Node? De status zegt het zelf; daarna de proef op de som.
  const status = await reken("fem_solver_status", {}).then((x) => x.ruw, (e) => ({ fout: e.message }));
  console.log(`  fem_solver_status: available ${status.available}, ${status.error_code ?? "geen fout"}, node ${status.node_path ?? "niet gevonden"}`);
  if (status.available !== false) {
    console.log("  De server vond toch een Node: dit is geen proef zonder Node.");
    fouten++;
  }
  for (const tool of ["validate_fem_model", "solve_fem_model", "check_fem_model"]) {
    const uit = await reken(tool, { model: {} }).then(() => "rekent", (e) => (/NODE_ONTBREEKT/.test(e.message) ? "NODE_ONTBREEKT" : `fout: ${e.message.slice(0, 80)}`));
    console.log(`  ${tool}: ${uit}`);
  }
}

const vanSoort = (nodes, soort) => nodes.flatMap((n) => [n, ...(n.children ?? [])]).filter((n) => soort.includes(n.type));
const map = new URL("./fixtures/fem/", import.meta.url);
const schrijf = (naam, data) => {
  writeFileSync(new URL(naam, map), JSON.stringify(data) + "\n");
  console.log(`  geschreven: scripts/fixtures/fem/${naam}`);
};

for (const [naam, bron] of Object.entries(STAVEN_BLADEN)) {
  const toetsingen = {};
  // In rondes, zoals de werkruimte: eerst het staafwerk, dan wat ervan afhangt.
  for (let ronde = 0; ronde < 4; ronde++) {
    const antwoorden = Object.fromEntries(Object.entries(toetsingen).map(([h, v]) => [h, alsAntwoord(v)]));
    const blokken = vanSoort(evaluate(parse(bron), {}, {}, { toetsModus: "vragen", toetsingen: antwoorden }), ["fem", "toets"]);
    const verzoeken = blokken.flatMap((b) => b.verzoeken ?? (b.verzoek ? [b.verzoek] : []));
    // Een toets die op het staafwerk wacht, geeft tot dan een fout: pas als er niets meer
    // te vragen valt, is een fout echt een fout.
    const fout = blokken.find((b) => b.status === "fout" && (b.type === "fem" || !verzoeken.length));
    if (fout) {
      console.log(`${naam}: ${fout.type} ${fout.naam}: ${fout.melding}`);
      fouten++;
      break;
    }
    if (!verzoeken.length) break;
    for (const v of verzoeken) {
      try {
        const { ruw, ms } = await reken(v.tool, femVerzoekArgumenten(v));
        const uitkomst = v.bewaar ? femBewaar(v.bewaar, ruw) : ruw;
        toetsingen[v.hash] = { tool: v.tool, verzoek: v.bewaar ?? v.argumenten, uitkomst, datum: new Date().toISOString(), herkomst: herkomst(v.tool) };
        if (v.bewaar) {
          const m = v.bewaar;
          const evenwicht = uitkomst.gevallen.every((g) => g.evenwicht.ok) ? "goed" : "FOUT";
          console.log(`${naam}: ${v.tool}, ${m.staven.length} staven, ${m.x.length} knopen, ${m.gevallen.length} rekengevallen (${m.gevallen.map((g) => g.naam).join(", ")}), ${ms} ms, evenwicht ${evenwicht}`);
          if (evenwicht !== "goed") fouten++;
        } else {
          const r = ruw.results?.[0];
          console.log(`${naam}: ${v.tool}, ${ms} ms, UC ${r?.uc_max} (${r?.governing_check_id}), ${r?.status}`);
        }
      } catch (e) {
        console.log(`${naam}: ${v.tool}: ${e.message}`);
        fouten++;
      }
    }
  }
  if (bewaar && !zonderNode) schrijf(`staven-${naam}.json`, { versie, toetsingen });
}

if (bewaar && !zonderNode) {
  // De ligger met het antwoord zoals het kwam: alleen wat femStaafBewaar leest.
  const v = vanSoort(evaluate(parse(LIGGER), {}, {}, { toetsModus: "vragen" }), ["fem"])[0].verzoeken[0];
  const argumenten = femVerzoekArgumenten(v);
  const { ruw } = await reken(v.tool, argumenten);
  const kern = (r) => ({
    result: {
      displacements: r.result.displacements, reactions: r.result.reactions, diagrams: r.result.diagrams,
      buckling: r.result.buckling, equilibrium: r.result.equilibrium, inactiveMembers: r.result.inactiveMembers,
    },
  });
  schrijf("staven-ruw.json", { versie, model: v.bewaar, argumenten, ruw: { results: ruw.results.map(kern) } });
  // De schema's zonder de teksten (description, default): de structuur is wat telt.
  const kaal = (s) => (Array.isArray(s) ? s.map(kaal) : s && typeof s === "object"
    ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== "description" && k !== "default").map(([k, w]) => [k, k === "properties" ? Object.fromEntries(Object.entries(w).map(([p, x]) => [p, kaal(x)])) : kaal(w)]))
    : s);
  for (const tool of ["solve_open_fem_3d_batch", "check_timber_beams"]) schrijf(`${tool}.schema.json`, kaal(tools.find((t) => t.name === tool).inputSchema));
  schrijf(`tools-${versie}.json`, tools.map((t) => t.name));
}
fem.stop();
console.log(fouten ? `\n${fouten} fout(en).` : zonderNode ? "\nZonder Node: het staafwerk en de houttoets rekenen." : "\nKlaar.");
process.exit(fouten ? 1 : 0);
