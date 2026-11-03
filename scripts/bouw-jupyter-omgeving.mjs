/**
 * Bouwt de Jupyter-omgeving van de Jupyter-bladen: JupyterLite met een
 * Pyodide-kernel en numpy, scipy, pandas en matplotlib, samen in één pakbestand
 * (`packages/desktop/src-tauri/jupyter-omgeving/omgeving.pak`). De server in
 * `src-tauri/src/jupyter_omgeving.rs` serveert daaruit; de installer neemt het mee
 * als resource, zodat Python ook werkt op een computer zonder internet.
 *
 * Alles staat hieronder vast op versie en hash. Internet en Python (3.10 of nieuwer)
 * zijn alleen bij het bouwen nodig, niet bij de gebruiker.
 *
 *   node scripts/bouw-jupyter-omgeving.mjs            altijd bouwen
 *   node scripts/bouw-jupyter-omgeving.mjs --als-nodig  niets doen als het pakbestand klopt
 *
 * De tussenstappen staan in een tijdelijke map met een kort pad; de pip-pakketten
 * halen op Windows anders de grens van 260 tekens.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const INVOER = join(hier, "../packages/desktop/jupyter-omgeving");
const UITMAP = join(hier, "../packages/desktop/src-tauri/jupyter-omgeving");
const PAK = join(UITMAP, "omgeving.pak");
const STEMPEL = join(UITMAP, "omgeving.stempel");
const WERK = join(tmpdir(), "ocss-jupyter-bouw");

const PIP = ["jupyterlite-core==0.8.7", "jupyterlite-pyodide-kernel==0.8.6"];
const PYODIDE = {
  versie: "314.0.6",
  kern: "https://github.com/pyodide/pyodide/releases/download/314.0.6/pyodide-core-314.0.6.tar.bz2",
  kernSha256: "1016c31e39ce3764d9a418cbb491a392c802c1b86ccc1367f009f5c59bf8f5fd",
  wielen: "https://cdn.jsdelivr.net/pyodide/v314.0.6/full/",
};
/** Wat in de omgeving zit, met alles waar het van afhangt uit de lijst van Pyodide. */
const PAKKETTEN = ["numpy", "scipy", "pandas", "matplotlib", "micropip", "ipython", "jedi", "parso", "pydoc-data"];
/** De kernel vraagt deze ook; hij staat niet in de lijst van Pyodide. BSD-3-Clause. */
const COMM = {
  naam: "comm-0.2.3-py3-none-any.whl",
  url: "https://files.pythonhosted.org/packages/60/97/891a0971e1e4a8c5d2b20bbe0e524dc04548d2307fee33cdeba148fd4fc7/comm-0.2.3-py3-none-any.whl",
  sha256: "c615d91d75f7f04f095b30d1c1711babd43bdc6419c1be9886a85f2f4e489417",
};
/** Uit de site: bouwgereedschap, voorbeelden en lettertypes in oude vormen. */
const WEG = [
  /^rspack\.config.*\.js$/, /^doc\//, /^package\.json$/, /(^|\/)jupyter-lite\.ipynb$/, /\.map$/,
  /^build\/fa-[a-z-]+-\d+\.(svg|eot|ttf)$/,
];
/** Uit de Pyodide-kern: alleen nodig om hem los op de opdrachtregel te draaien. */
const PYODIDE_BESTANDEN = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip"];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function draai(opdracht, args, opties = {}) {
  const r = spawnSync(opdracht, args, { stdio: "inherit", ...opties });
  if (r.status !== 0) throw new Error(`${opdracht} ${args.join(" ")} faalde (${r.error?.message ?? r.status})`);
}

/** De invoer die de uitkomst bepaalt; verandert die, dan bouwt `--als-nodig` opnieuw. */
function stempel() {
  const bronnen = readdirSync(INVOER).sort().map((n) => `${n}:${sha256(readFileSync(join(INVOER, n)))}`);
  return sha256(JSON.stringify({ PIP, PYODIDE, PAKKETTEN, COMM, WEG: WEG.map(String), PYODIDE_BESTANDEN, bronnen, script: sha256(readFileSync(fileURLToPath(import.meta.url))) }));
}

async function haal(url, doel, verwacht) {
  if (existsSync(doel) && (!verwacht || sha256(readFileSync(doel)) === verwacht)) return readFileSync(doel);
  const antwoord = await fetch(url);
  if (!antwoord.ok) throw new Error(`${url}: ${antwoord.status}`);
  const bytes = Buffer.from(await antwoord.arrayBuffer());
  if (verwacht && sha256(bytes) !== verwacht) throw new Error(`${url}: hash klopt niet (${sha256(bytes)})`);
  writeFileSync(doel, bytes);
  return bytes;
}

const normaal = (n) => n.replace(/[-_.]+/g, "-").toLowerCase();

/** De pakketten met alles waar ze van afhangen, uit de lijst van Pyodide. */
function sluiting(lijst, wens) {
  const index = new Map(Object.entries(lijst.packages).map(([k, v]) => [normaal(k), [k, v]]));
  const gezien = new Map();
  const voeg = (naam) => {
    const n = normaal(naam);
    if (gezien.has(n)) return;
    const gevonden = index.get(n);
    if (!gevonden) throw new Error(`${naam} staat niet in de lijst van Pyodide ${PYODIDE.versie}`);
    gezien.set(n, gevonden);
    gevonden[1].depends.forEach(voeg);
  };
  wens.forEach(voeg);
  return [...gezien.values()];
}

function alleBestanden(map) {
  return readdirSync(map, { withFileTypes: true }).flatMap((e) => {
    const pad = join(map, e.name);
    return e.isDirectory() ? alleBestanden(pad) : [pad];
  });
}

/** Schrijft het pakbestand; de indeling staat in jupyter_omgeving.rs. */
function schrijfPak(site, doel) {
  const namen = alleBestanden(site).map((p) => relative(site, p).split(sep).join("/")).sort();
  const index = {};
  let plek = 0;
  for (const naam of namen) {
    const lengte = statSync(join(site, naam)).size;
    index[naam] = [plek, lengte];
    plek += lengte;
  }
  const json = Buffer.from(JSON.stringify(index));
  const kop = Buffer.alloc(16);
  kop.write("OCSSPAK1", 0, "ascii");
  kop.writeBigUInt64LE(BigInt(json.length), 8);
  const tijdelijk = `${doel}.tmp`;
  const f = openSync(tijdelijk, "w");
  writeSync(f, kop);
  writeSync(f, json);
  for (const naam of namen) writeSync(f, readFileSync(join(site, naam)));
  closeSync(f);
  renameSync(tijdelijk, doel);
  return { aantal: namen.length, bytes: kop.length + json.length + plek };
}

async function bouw() {
  mkdirSync(WERK, { recursive: true });
  mkdirSync(UITMAP, { recursive: true });

  // 1. JupyterLite met de Pyodide-kernel
  const venv = join(WERK, "v");
  const bin = join(venv, process.platform === "win32" ? "Scripts" : "bin");
  const python = join(bin, process.platform === "win32" ? "python.exe" : "python");
  if (!existsSync(python)) {
    const r = spawnSync("python", ["--version"]);
    draai(r.status === 0 ? "python" : "python3", ["-m", "venv", venv]);
  }
  draai(python, ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", ...PIP]);

  // 2. Pyodide: de kern en de pakketten, gecontroleerd op hun hash
  const dl = join(WERK, "dl");
  mkdirSync(dl, { recursive: true });
  const kernTar = join(dl, `pyodide-core-${PYODIDE.versie}.tar.bz2`);
  await haal(PYODIDE.kern, kernTar, PYODIDE.kernSha256);
  const kern = join(WERK, "kern");
  rmSync(kern, { recursive: true, force: true });
  mkdirSync(kern, { recursive: true });
  draai(python, ["-c", "import sys,tarfile;tarfile.open(sys.argv[1]).extractall(sys.argv[2],filter='data')", kernTar, kern]);
  const lijst = JSON.parse(readFileSync(join(kern, "pyodide/pyodide-lock.json"), "utf8"));
  const gekozen = sluiting(lijst, PAKKETTEN);
  await Promise.all(gekozen.map(([, p]) => haal(PYODIDE.wielen + p.file_name, join(dl, p.file_name), p.sha256)));
  await haal(COMM.url, join(dl, COMM.naam), COMM.sha256);

  // 3. De site
  const lite = join(WERK, "lite");
  const site = join(WERK, "site");
  rmSync(lite, { recursive: true, force: true });
  rmSync(site, { recursive: true, force: true });
  mkdirSync(lite, { recursive: true });
  for (const n of ["jupyter-lite.json", "overrides.json"]) cpSync(join(INVOER, n), join(lite, n));
  writeFileSync(join(lite, "jupyter_lite_config.json"), JSON.stringify({
    LiteBuildConfig: { apps: ["lab"], output_dir: "../site", no_sourcemaps: true, no_unused_shared_packages: true },
    PipliteAddon: { piplite_urls: [join(dl, COMM.naam).split(sep).join("/")] },
  }));
  draai(join(bin, "jupyter-lite"), ["build"], {
    cwd: lite,
    env: { ...process.env, PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}` },
  });

  // 4. Pyodide erin, de lijst teruggebracht tot wat er echt staat: een ander pakket
  //    geeft zo een gewone ImportError in plaats van een mislukte download.
  const doel = join(site, "static/pyodide");
  mkdirSync(doel, { recursive: true });
  for (const n of PYODIDE_BESTANDEN) cpSync(join(kern, "pyodide", n), join(doel, n));
  for (const [, p] of gekozen) cpSync(join(dl, p.file_name), join(doel, p.file_name));
  writeFileSync(join(doel, "pyodide-lock.json"), JSON.stringify({ ...lijst, packages: Object.fromEntries(gekozen) }));

  // 5. De brug naar de app, en weg wat niet nodig is
  cpSync(join(INVOER, "ocss-brug.js"), join(site, "ocss-brug.js"));
  cpSync(join(INVOER, "ocss-thema.css"), join(site, "ocss-thema.css"));
  cpSync(join(INVOER, "LICENTIES.md"), join(site, "LICENTIES.md"));
  const labPagina = join(site, "lab/index.html");
  const html = readFileSync(labPagina, "utf8");
  if (!html.includes("</head>")) throw new Error("lab/index.html heeft geen </head>");
  // Geen inline script: de CSP staat dat niet toe, juist om script uit de uitvoer van een
  // cel tegen te houden (jupyter_omgeving.rs). De config-blokken zijn data en mogen blijven.
  let stukken = 0;
  const zonderInline = html.replace(/<script(?![^>]*\ssrc=)(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g, (_m, code) => {
    const naam = `ocss-start-${++stukken}.js`;
    writeFileSync(join(site, "lab", naam), code);
    return `<script src="${naam}"></script>`;
  });
  if (stukken === 0) throw new Error("lab/index.html: geen inline script gevonden; is de opbouw veranderd?");
  writeFileSync(labPagina, zonderInline.replace("</head>", `<link rel="stylesheet" href="../ocss-thema.css">\n<script src="../ocss-brug.js"></script>\n</head>`));
  for (const pad of alleBestanden(site)) {
    const naam = relative(site, pad).split(sep).join("/");
    if (WEG.some((r) => r.test(naam))) rmSync(pad);
  }

  // 6. Eén pakbestand
  const { aantal, bytes } = schrijfPak(site, PAK);
  writeFileSync(STEMPEL, stempel());
  const wielen = gekozen.reduce((som, [, p]) => som + statSync(join(doel, p.file_name)).size, 0);
  console.log(`\nOmgeving: ${PAK}`);
  console.log(`  ${aantal} bestanden, ${(bytes / 1e6).toFixed(1)} MB, waarvan ${(wielen / 1e6).toFixed(1)} MB pakketten (${gekozen.map(([k]) => k).join(", ")})`);
}

if (process.argv.includes("--als-nodig") && existsSync(PAK) && existsSync(STEMPEL) && readFileSync(STEMPEL, "utf8") === stempel()) {
  console.log("Jupyter-omgeving is bij.");
} else {
  await bouw();
}
