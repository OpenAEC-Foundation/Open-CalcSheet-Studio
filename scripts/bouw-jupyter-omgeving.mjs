/**
 * Bouwt de Python-omgeving van de Jupyter- en Marimo-bladen: JupyterLite en Marimo op
 * dezelfde Pyodide met numpy, scipy, pandas en matplotlib, samen in één pakbestand
 * (`packages/desktop/src-tauri/jupyter-omgeving/omgeving.pak`). De server in
 * `src-tauri/src/jupyter_omgeving.rs` serveert daaruit; de installer neemt het mee
 * als resource, zodat Python ook werkt op een computer zonder internet.
 *
 * Marimo bepaalt de versie van Pyodide: zijn worker bevat de lader van precies die versie.
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

const MARIMO_VERSIE = "0.25.2";
const PIP = ["jupyterlite-core==0.8.7", "jupyterlite-pyodide-kernel==0.8.6", `marimo==${MARIMO_VERSIE}`];
const PYODIDE = {
  versie: "314.0.0",
  kern: "https://github.com/pyodide/pyodide/releases/download/314.0.0/pyodide-core-314.0.0.tar.bz2",
  kernSha256: "a4a568ca2ee0c8dcaaff00a714b42613a3298a7efb85b9e682a27bba0fce81f9",
  wielen: "https://cdn.jsdelivr.net/pyodide/v314.0.0/full/",
};
/** Wat in de omgeving zit, met alles waar het van afhangt uit de lijst van Pyodide. */
const PAKKETTEN = ["numpy", "scipy", "pandas", "matplotlib", "micropip", "ipython", "jedi", "parso", "pydoc-data", "msgspec", "docutils", "pygments", "pyyaml", "pyodide-http", "packaging", "narwhals"];
/**
 * Wat Marimo in de browser laadt en niet in de lijst van Pyodide staat. Zijn eigen lijst
 * staat op internet; deze regels komen daaruit, voor deze versie. Niet `sqlglot`,
 * `duckdb` en dergelijke: SQL-cellen werken dus niet.
 */
const PY = "files.pythonhosted.org/packages";
const MARIMO_WIELEN = [
  { sleutel: "marimo-base", name: "marimo", version: MARIMO_VERSIE, url: `https://${PY}/76/f7/c8c4bea1b350d200378c53d3acee11e06d29634ebde9dffe7aac7dda8120/marimo_base-0.25.2-py3-none-any.whl`, sha256: "9daea77b550c5954193b9c3f69405b4cddb5114e305d06b4a251a0c4fbaf5639", imports: [], depends: ["markdown", "narwhals", "packaging", "pymdown-extensions", "msgspec"] },
  { sleutel: "markdown", name: "Markdown", version: "3.10.2", url: `https://${PY}/de/1f/77fa3081e4f66ca3576c896ae5d31c3002ac6607f9747d2e3aa49227e464/markdown-3.10.2-py3-none-any.whl`, sha256: "e91464b71ae3ee7afd3017d9f358ef0baf158fd9a298db92f1d4761133824c36", imports: ["markdown"], depends: [] },
  { sleutel: "pymdown-extensions", name: "pymdown-extensions", version: "10.21.3", url: `https://${PY}/7e/85/545a951eecc270fcd688288c600017e2050a1aacb56c711d208586d3e470/pymdown_extensions-10.21.3-py3-none-any.whl`, sha256: "d7a5d08014fc571e80ca21dd6f854e31f94c489800350564d55d15b3c41e76b6", imports: [], depends: ["markdown", "pyyaml"] },
];
/** Een leeg notebook om de pagina van Marimo mee te laten maken; de app levert de echte code. */
const MARIMO_LEEG = `import marimo\n\n__generated_with = "${MARIMO_VERSIE}"\napp = marimo.App()\n\n\n@app.cell\ndef _():\n    return\n\n\nif __name__ == "__main__":\n    app.run()\n`;
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
  /^marimo\/(public\/|CLAUDE\.md$|\.nojekyll$|manifest\.json$|site\.webmanifest$|android-chrome-|apple-touch-icon)/,
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
  return sha256(JSON.stringify({ PIP, PYODIDE, PAKKETTEN, COMM, MARIMO_WIELEN, MARIMO_LEEG, WEG: WEG.map(String), PYODIDE_BESTANDEN, bronnen, script: sha256(readFileSync(fileURLToPath(import.meta.url))) }));
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

/** Het object dat bij `begin` in de tekst opent, als tekst: tot de bijbehorende sluitaccolade. */
function objectVanaf(tekst, begin) {
  let diepte = 0;
  let inTekst = false;
  for (let i = begin; i < tekst.length; i++) {
    const c = tekst[i];
    if (inTekst) {
      if (c === "\\") i++;
      else if (c === '"') inTekst = false;
    } else if (c === '"') inTekst = true;
    else if (c === "{") diepte++;
    else if (c === "}" && --diepte === 0) return tekst.slice(begin, i + 1);
  }
  throw new Error("Geen einde gevonden aan het object.");
}

/**
 * De pagina van Marimo voor de app. Geen inline script, net als bij JupyterLab, en de
 * start ligt bij de brug: die wacht op de code uit het project, en laadt dan pas Marimo.
 */
function maakMarimoPagina(map) {
  const pagina = join(map, "index.html");
  let html = readFileSync(pagina, "utf8");
  const merk = "__MARIMO_MOUNT_CONFIG__";
  const plek = html.indexOf(merk);
  if (plek < 0) throw new Error("marimo: geen startinstellingen gevonden; is de opbouw veranderd?");
  const basis = JSON.parse(objectVanaf(html, html.indexOf("{", html.indexOf("Object.freeze(", plek))));
  // Geen assistent (geen netwerk), en niets draait vanzelf bij het openen. Bewaren na elke
  // wijziging: het project is de enige bewaarplek.
  basis.config.ai = { ...basis.config.ai, enabled: false };
  basis.config.completion = { ...basis.config.completion, copilot: false };
  basis.config.runtime = { ...basis.config.runtime, auto_instantiate: false };
  basis.config.save = { ...basis.config.save, autosave: "after_delay", autosave_delay: 800 };
  writeFileSync(join(map, "ocss-config.js"), `window.__OCSS_MARIMO_BASIS = ${JSON.stringify({ ...basis, code: "" })};\n`);
  const start = html.match(/<script type="module"[^>]*src="(\.\/assets\/index-[^"]+\.js)"[^>]*><\/script>/);
  if (!start) throw new Error("marimo: geen hoofdscript gevonden; is de opbouw veranderd?");
  html = html.replace(start[0], "");
  const code = /<marimo-code hidden="">[\s\S]*?<\/marimo-code>/;
  if (!code.test(html)) throw new Error("marimo: geen code in de pagina; is de opbouw veranderd?");
  html = html.replace(code, "");
  if (!html.includes('<marimo-wasm hidden="">')) throw new Error("marimo: geen wasm-element; is de opbouw veranderd?");
  html = html.replace('<marimo-wasm hidden="">', '<marimo-wasm hidden="" data-pyodide-index-url="../static/pyodide/" data-pyodide-lockfile-url="../static/pyodide/pyodide-lock.json">');
  let stukken = 0;
  html = html.replace(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g, (_m, inhoud) => {
    // De startinstellingen zet de brug, en een waarschuwing voor file:// is hier niet nodig.
    if (inhoud.includes(merk) || inhoud.includes("window.location.protocol === 'file:'")) return "";
    const naam = `ocss-start-${++stukken}.js`;
    writeFileSync(join(map, naam), inhoud);
    return `<script src="${naam}"></script>`;
  });
  if (stukken === 0) throw new Error("marimo: geen inline script gevonden; is de opbouw veranderd?");
  if (!html.includes("</head>")) throw new Error("marimo: de pagina heeft geen </head>");
  html = html.replace("</head>", `<meta name="ocss-marimo-start" content="${start[1]}">\n<script src="ocss-config.js"></script>\n<script src="ocss-marimo-brug.js"></script>\n</head>`);
  writeFileSync(pagina, html);
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
  const marimoNaam = (m) => m.url.split("/").pop();
  await Promise.all(MARIMO_WIELEN.map((m) => haal(m.url, join(dl, marimoNaam(m)), m.sha256)));

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
  const extra = MARIMO_WIELEN.map((m) => {
    cpSync(join(dl, marimoNaam(m)), join(doel, marimoNaam(m)));
    return [m.sleutel, { name: m.name, version: m.version, file_name: marimoNaam(m), install_dir: "site", sha256: m.sha256, imports: m.imports, depends: m.depends }];
  });
  writeFileSync(join(doel, "pyodide-lock.json"), JSON.stringify({ ...lijst, packages: Object.fromEntries([...gekozen, ...extra]) }));

  // 5. Marimo: de pagina uit zijn eigen export, zodat de startinstellingen altijd passen
  const marimoWerk = join(WERK, "marimo");
  rmSync(marimoWerk, { recursive: true, force: true });
  mkdirSync(marimoWerk, { recursive: true });
  writeFileSync(join(marimoWerk, "leeg.py"), MARIMO_LEEG);
  draai(python, ["-m", "marimo", "export", "html-wasm", "leeg.py", "-o", "uit", "--mode", "edit", "--show-code"], {
    cwd: marimoWerk,
    env: { ...process.env, PYTHONUTF8: "1" },
  });
  const marimoSite = join(site, "marimo");
  cpSync(join(marimoWerk, "uit"), marimoSite, { recursive: true });
  maakMarimoPagina(marimoSite);
  cpSync(join(INVOER, "ocss-marimo-brug.js"), join(marimoSite, "ocss-marimo-brug.js"));
  const licentie = join(venv, process.platform === "win32" ? "Lib/site-packages" : `lib/python${spawnSync(python, ["-c", "import sys;print('%d.%d'%sys.version_info[:2])"], { encoding: "utf8" }).stdout.trim()}/site-packages`, `marimo-${MARIMO_VERSIE}.dist-info/licenses/LICENSE`);
  cpSync(licentie, join(marimoSite, "LICENSE"));

  // 6. De brug naar de app, en weg wat niet nodig is
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

  // 7. Eén pakbestand
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
