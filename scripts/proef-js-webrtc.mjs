/**
 * Proef van de afscherming tegen WebRTC in het echte venster: een Tauri-build, WebView2 en
 * een echt `@js`-blok, gestart met de knop. Vraagt een build en een bureaublad, en draait
 * dus niet mee in check-alles; zie scripts/check-js-blok.mjs voor wat zonder venster kan.
 *
 * WebRTC kent geen CSP: `connect-src 'none'` houdt een STUN-pakket niet tegen. Daarom probeert
 * het blok hier elke route naar een `RTCPeerConnection` die het kan bedenken: zijn eigen
 * venster, elk soort venster dat het zelf maakt, en elke manier om daar script in te laten
 * draaien, ook met een host uit `netwerk=`. Elke route heeft een eigen UDP- en TCP-poort op
 * de luisterpost, zodat elk pakket aan een route is toe te wijzen. De proef slaagt als geen
 * enkele route een verbinding kan maken en er niets aankomt.
 *
 * Een blok dat niets probeert, moet gewoon blijven werken: met `calc` en `bibliotheek=three`.
 *
 * Nul pakketten zegt pas iets als de luisterpost ze zou horen. Daarom maakt de proef ook een
 * verbinding in een eigen wereld van het hoofdvenster (via de debugpoort, voor een blok niet
 * bereikbaar): daar is WebRTC er nog, en die pakketten moeten wel aankomen.
 *
 * Bouwen, met een eigen doelmap en vooral een eigen identifier: de opgeslagen appstaat hangt
 * aan de identifier, en deze proef opent een project.
 *   CARGO_TARGET_DIR=<map> npm run tauri build -- --debug --no-bundle
 *     -c "{\"identifier\":\"studio.openstructuralcalculation.proef\"}"
 *
 * Draaien (vraagt openssl voor het certificaat van de host uit `netwerk=`):
 *   node scripts/proef-js-webrtc.mjs <pad-naar-exe> <map-voor-uitvoer> [extra browservlaggen]
 *
 * De app start met een eigen opslagmap en debugpoort; een draaiende app merkt er niets van.
 */
import { spawn, spawnSync } from "node:child_process";
import { createSocket } from "node:dgram";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as maakHttps } from "node:https";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { bouwProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";

const [exe, uitMap, ...vlaggen] = process.argv.slice(2);
if (!exe || !uitMap) {
  console.error("Gebruik: node scripts/proef-js-webrtc.mjs <pad-naar-exe> <map-voor-uitvoer> [extra browservlaggen]");
  process.exit(2);
}
const UIT = resolve(uitMap);
const OPSLAG = join(UIT, "opslag");
rmSync(OPSLAG, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
mkdirSync(UIT, { recursive: true });
const DEBUGPOORT = 9417;

let fouten = 0;
function meld(ok, tekst, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${extra ? `  (${extra})` : ""}`);
  if (!ok) fouten++;
}
const kop = (t) => console.log(`\n${t}`);
const wacht = (ms) => new Promise((klaar) => setTimeout(klaar, ms));

// ── De luisterpost ───────────────────────────────────────────────────────────
/** Een UDP- en een TCP-poort voor één route; telt wat er aankomt, op alle adressen. */
async function post() {
  const p = { udp: 0, tcp: 0, stun: 0 };
  const u = createSocket("udp4");
  u.on("message", (b) => {
    p.udp++;
    // Een STUN-bericht: het magische getal op byte 4 (RFC 5389).
    if (b.length >= 8 && b.readUInt32BE(4) === 0x2112a442) p.stun++;
  });
  await new Promise((k) => u.bind(0, "0.0.0.0", k));
  const t = createServer((s) => {
    p.tcp++;
    s.on("error", () => {});
    s.destroy();
  });
  await new Promise((k) => t.listen(0, "0.0.0.0", k));
  p.poortUdp = u.address().port;
  p.poortTcp = t.address().port;
  p.sluit = () => {
    u.close();
    t.close();
  };
  return p;
}
const lan = Object.values(networkInterfaces()).flat().find((i) => i.family === "IPv4" && !i.internal)?.address ?? null;

/** De ICE-servers van een route: STUN over UDP, en TURN over UDP en TCP. */
function servers(p) {
  const urls = [`stun:127.0.0.1:${p.poortUdp}`, `turn:127.0.0.1:${p.poortUdp}?transport=udp`, `turn:127.0.0.1:${p.poortTcp}?transport=tcp`];
  if (lan) urls.push(`stun:${lan}:${p.poortUdp}`, `turn:${lan}:${p.poortTcp}?transport=tcp`);
  return [{ urls, username: "proef", credential: "proef" }];
}

// ── De host uit netwerk= ─────────────────────────────────────────────────────
// Een echte https-host die script mag leveren. `*.localhost` komt altijd op deze computer
// uit; het certificaat is van deze proef en telt door --ignore-certificate-errors.
const HOSTNAAM = "proef.localhost";
const sleutelPad = join(UIT, "sleutel.pem");
const certPad = join(UIT, "cert.pem");
const openssl = ["openssl", "C:/Program Files/Git/usr/bin/openssl.exe"].find((p) => !spawnSync(p, ["version"]).error);
if (!openssl) throw new Error("openssl niet gevonden: nodig voor het certificaat van de host uit netwerk=.");
spawnSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", sleutelPad, "-out", certPad, "-days", "2", "-subj", `/CN=${HOSTNAAM}`], { stdio: "ignore" });
if (!existsSync(certPad)) throw new Error("Het certificaat is niet gemaakt.");
/** Het script dat de host levert, per adres. */
const hostScripts = new Map();
const hostHits = [];
const host = maakHttps({ key: readFileSync(sleutelPad), cert: readFileSync(certPad) }, (req, res) => {
  hostHits.push(req.url);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "text/javascript");
  res.end(hostScripts.get(req.url) ?? "");
});
await new Promise((k) => host.listen(0, "127.0.0.1", k));
const HOST = `${HOSTNAAM}:${host.address().port}`;

// ── De routes ────────────────────────────────────────────────────────────────
/** Routes die een venster geven: `poging` probeert daarin van buitenaf een verbinding. */
const ROUTES = `{
  "eigen venster": () => window,
  "lege iframe": () => frame().contentWindow,
  "lege iframe via zijn document": () => frame().contentDocument.defaultView,
  "iframe via innerHTML en window[n]": () => {
    const d = document.createElement("div");
    d.innerHTML = "<iframe></iframe>";
    document.body.appendChild(d);
    return window[window.length - 1];
  },
  "iframe via insertAdjacentHTML en frames": () => {
    document.body.insertAdjacentHTML("beforeend", "<iframe></iframe>");
    return window.frames[window.frames.length - 1];
  },
  "iframe uit een geparst document": () => {
    const f = new DOMParser().parseFromString("<iframe></iframe>", "text/html").querySelector("iframe");
    document.body.appendChild(document.adoptNode(f));
    return f.contentWindow;
  },
  "iframe in svg": () => {
    const NS = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(NS, "svg");
    const o = document.createElementNS(NS, "foreignObject");
    const f = document.createElement("iframe");
    o.appendChild(f);
    s.appendChild(o);
    document.body.appendChild(s);
    return f.contentWindow;
  },
  "iframe in een shadow root": () => {
    const h = document.createElement("div");
    document.body.appendChild(h);
    const f = document.createElement("iframe");
    h.attachShadow({ mode: "open" }).appendChild(f);
    return f.contentWindow;
  },
  "frame-element": () => frame("frame").contentWindow,
  "iframe in een iframe": () => frame("iframe", frame().contentDocument.body).contentWindow,
  "iframe met document.write": () => {
    const f = frame();
    const d = f.contentDocument;
    d.open();
    d.write("<!doctype html><p>x</p>");
    d.close();
    return f.contentWindow;
  },
  "iframe opnieuw ingevoegd": () => {
    const f = frame();
    f.remove();
    document.body.appendChild(f);
    return f.contentWindow;
  },
  "src=about:blank, na load": async () => {
    const f = frame("iframe", document.body, (e) => { e.src = "about:blank"; });
    await geladen(f);
    return f.contentWindow;
  },
  "srcdoc, meteen": () => frame("iframe", document.body, (e) => { e.srcdoc = "<p>x</p>"; }).contentWindow,
  "srcdoc, na load": async () => {
    const f = frame("iframe", document.body, (e) => { e.srcdoc = "<p>x</p>"; });
    await geladen(f);
    return f.contentWindow;
  },
  "srcdoc, tijdens het laden": async () => {
    const f = frame("iframe", document.body, (e) => { e.srcdoc = "<p>x</p>"; });
    const eind = performance.now() + 500;
    while (performance.now() < eind) {
      if (f.contentWindow.RTCPeerConnection) break;
      await new Promise((k) => setTimeout(k, 0));
    }
    return f.contentWindow;
  },
  "srcdoc achteraf gezet": async () => {
    const f = frame();
    f.srcdoc = "<p>x</p>";
    await geladen(f);
    return f.contentWindow;
  },
  "object": async () => {
    const o = document.createElement("object");
    o.data = "about:blank";
    document.body.appendChild(o);
    await geladen(o);
    return o.contentWindow;
  },
  "embed": async () => {
    const o = document.createElement("embed");
    o.src = "about:blank";
    document.body.appendChild(o);
    await geladen(o);
    return o.contentWindow ?? o.getSVGDocument?.()?.defaultView;
  },
  "window.open": () => window.open("about:blank"),
  "beeld-in-beeld": () => window.documentPictureInPicture.requestWindow(),
  "los document": () => document.implementation.createHTMLDocument("x").defaultView,
}`;

/** Routes die script in een nieuw venster proberen te krijgen; dat probeert dan zelf een verbinding. */
const KIND_ROUTES = `{
  "srcdoc met inline script": (c) => pagina(SCRIPT(c)),
  "srcdoc met script uit een blob": (c) => pagina('<script src="' + blob(c) + '">' + EIND),
  "srcdoc met module uit een blob": (c) => pagina('<script type="module" src="' + blob(c) + '">' + EIND),
  "srcdoc met svg-script uit een blob": (c) => pagina('<svg xmlns="http://www.w3.org/2000/svg"><script href="' + blob(c) + '">' + EIND + "</svg>"),
  "srcdoc met onerror": (c) => pagina('<img src="data:," onerror="' + attr(c) + '">'),
  "srcdoc met javascript-adres": (c) => pagina('<iframe src="javascript:' + attr(encodeURI(c)) + '"></iframe>'),
  "srcdoc met script van de host": (c, adres) => pagina('<script src="' + adres + '">' + EIND),
  "srcdoc in een srcdoc met script van de host": (c, adres) => pagina('<iframe srcdoc="' + attr('<script src="' + adres + '">' + EIND) + '"></iframe>'),
  "javascript-adres bij het maken": (c) => frame("iframe", document.body, (e) => { e.src = "javascript:" + encodeURI(c); }),
  "javascript-adres op een bestaande iframe": (c) => { frame().src = "javascript:" + encodeURI(c); },
  "blob-pagina met script": (c) => frame("iframe", document.body, (e) => { e.src = blob(SCRIPT(c), "text/html"); }),
  "data-pagina met script": (c) => frame("iframe", document.body, (e) => { e.src = "data:text/html," + encodeURIComponent(SCRIPT(c)); }),
  "object met blob-pagina": (c) => { const o = document.createElement("object"); o.data = blob(SCRIPT(c), "text/html"); document.body.appendChild(o); },
  "embed met blob-pagina": (c) => { const o = document.createElement("embed"); o.src = blob(SCRIPT(c), "text/html"); document.body.appendChild(o); },
}`;
const namenVan = (routes) => [...routes.matchAll(/^ {2}"([^"]+)":/gm)].map((m) => m[1]);
const ROUTE_NAMEN = namenVan(ROUTES);
const KIND_NAMEN = namenVan(KIND_ROUTES);

/** Wat in een nieuw venster draait: zeggen dat het draait, en een verbinding proberen. */
function kindCode(blad, route, p) {
  return `(function () {
  var u = { blad: ${JSON.stringify(blad)}, route: ${JSON.stringify(route)}, draait: true };
  try {
    u.rtc = typeof RTCPeerConnection;
    u.webkit = typeof webkitRTCPeerConnection;
    u.namen = Object.getOwnPropertyNames(window).filter(function (n) { return /^(webkit)?RTC/.test(n); }).join();
    var C = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (C) {
      var p = new C({ iceServers: ${JSON.stringify(servers(p))} });
      p.createDataChannel("x");
      p.createOffer().then(function (o) { return p.setLocalDescription(o); });
      window.__p = p;
      u.gemaakt = true;
    }
  } catch (e) {
    u.fout = String(e && e.message || e).slice(0, 160);
  }
  top.postMessage({ soort: "proef", uit: u }, "*");
})();`;
}

/** De code van een blok dat alle routes probeert. Antwoorden gaan rechtstreeks naar het hoofdvenster. */
function aanval(blad, posten) {
  const SERVERS = Object.fromEntries(ROUTE_NAMEN.map((r) => [r, servers(posten.get(r))]));
  const KIND = {};
  const ADRES = {};
  KIND_NAMEN.forEach((r, i) => {
    KIND[r] = kindCode(blad, r, posten.get(r));
    const pad = `/kind/${encodeURIComponent(blad)}/${i}.js`;
    hostScripts.set(pad, KIND[r]);
    ADRES[r] = `https://${HOST}${pad}`;
  });
  return `(async () => {
  const BLAD = ${JSON.stringify(blad)};
  const SERVERS = ${JSON.stringify(SERVERS)};
  const KIND = ${JSON.stringify(KIND)};
  const ADRES = ${JSON.stringify(ADRES)};
  const EIND = "</scr" + "ipt>";
  const SCRIPT = (c) => "<scr" + "ipt>" + c + EIND;
  const attr = (t) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const blob = (t, soort = "text/javascript") => URL.createObjectURL(new Blob([t], { type: soort }));
  const antwoord = (x) => top.postMessage({ soort: "proef", uit: { blad: BLAD, ...x } }, "*");
  const bewaard = [];
  const frame = (soort = "iframe", ouder = document.body, zet) => {
    const f = ouder.ownerDocument.createElement(soort);
    zet?.(f);
    ouder.appendChild(f);
    return f;
  };
  const pagina = (html) => frame("iframe", document.body, (e) => { e.srcdoc = html; });
  const geladen = (f) => new Promise((k) => { f.addEventListener("load", k, { once: true }); f.addEventListener("error", k, { once: true }); setTimeout(k, 800); });
  function poging(route, W) {
    const uit = { route };
    try {
      uit.rtc = typeof W.RTCPeerConnection;
      uit.webkit = typeof W.webkitRTCPeerConnection;
      uit.tauri = typeof W.__TAURI_INTERNALS__;
      uit.namen = Object.getOwnPropertyNames(W).filter((n) => /^(webkit)?RTC|^(UDP|TCP|TCPServer)Socket$/.test(n)).join();
      const C = W.RTCPeerConnection || W.webkitRTCPeerConnection;
      if (C) {
        const p = new C({ iceServers: SERVERS[route] });
        p.createDataChannel("x");
        p.createOffer().then((o) => p.setLocalDescription(o)).catch(() => {});
        bewaard.push(p);
        uit.gemaakt = true;
      }
    } catch (e) {
      uit.fout = String(e && e.message || e).slice(0, 160);
    }
    antwoord(uit);
  }
  const routes = ${ROUTES};
  for (const [naam, fn] of Object.entries(routes)) {
    try {
      poging(naam, await fn());
    } catch (e) {
      antwoord({ route: naam, fout: String(e && e.message || e).slice(0, 160) });
    }
  }
  const kindRoutes = ${KIND_ROUTES};
  for (const [naam, fn] of Object.entries(kindRoutes)) {
    try {
      fn(KIND[naam], ADRES[naam]);
      antwoord({ route: naam, geprobeerd: true });
    } catch (e) {
      antwoord({ route: naam, fout: String(e && e.message || e).slice(0, 160) });
    }
    await new Promise((k) => setTimeout(k, 500));
  }
  // De host zelf: is hij voor dit blad bereikbaar?
  const ping = await fetch("https://${HOST}/ping").then(() => "bereikbaar", (e) => "geweigerd");
  antwoord({ route: "host", ping });
  // HTTP/3 gaat ook over UDP; dat valt wel onder connect-src.
  try {
    const t = new WebTransport("https://127.0.0.1:" + ${posten.get("WebTransport").poortUdp} + "/");
    t.closed.catch(() => {});
    const uit = await Promise.race([t.ready.then(() => "open", () => "geweigerd"), new Promise((k) => setTimeout(() => k("geen antwoord"), 2000))]);
    antwoord({ route: "WebTransport", uitkomst: uit });
  } catch (e) {
    antwoord({ route: "WebTransport", uitkomst: String(e && e.message || e).slice(0, 160) });
  }
  window.__bewaard = bewaard;
  antwoord({ klaar: true });
})();`;
}

// ── Het project ──────────────────────────────────────────────────────────────
const BLADEN = [
  { naam: "Zonder netwerk", regel: "@js", netwerk: false },
  { naam: "Met netwerk", regel: `@js netwerk=${HOST}`, netwerk: true },
];
/** Per blad: route → post. */
const postenPerBlad = new Map();
for (const { naam } of BLADEN) {
  const m = new Map();
  for (const route of [...ROUTE_NAMEN, ...KIND_NAMEN, "WebTransport"]) m.set(route, await post());
  postenPerBlad.set(naam, m);
}
const WEG = [
  { naam: "Weg naar een blob-pagina", adres: `location.href = URL.createObjectURL(new Blob([PAGINA], { type: "text/html" }));` },
  { naam: "Weg naar een data-pagina", adres: `location.href = "data:text/html," + encodeURIComponent(PAGINA);` },
  { naam: "Weg met een link", adres: `const a = document.createElement("a"); a.href = "data:text/html," + encodeURIComponent(PAGINA); document.body.appendChild(a); a.click();` },
];
const wegPosten = new Map();
for (const { naam } of WEG) wegPosten.set(naam, await post());
const controlePost = await post();
const GEWOON = "Gewoon blok";
const GEWOON_CODE = `const w = calc.wereld3d();
w.doos([0, 0, 0], [calc.getal("L", "mm"), 100, 200]);
w.teken();
top.postMessage({ soort: "proef", uit: { blad: ${JSON.stringify(GEWOON)}, L: calc.getal("L", "mm"), canvas: document.querySelectorAll("canvas").length, driehoeken: w.renderer.info.render.triangles } }, "*");`;

const blad = (i, naam, source) => ({ id: `ex-${i}`, naam, templateId: "proef", waarden: {}, elementen: [], source });
const project = {
  versie: PROJECT_FORMAAT_VERSIE,
  naam: "Proef WebRTC",
  gegevens: legeGegevens(),
  rapport: undefined,
  exemplaren: [
    ...BLADEN.map(({ naam, regel }, i) => blad(i, naam, `"${naam}\n${regel}\n${aanval(naam, postenPerBlad.get(naam))}\n@end\n`)),
    ...WEG.map(({ naam, adres }, i) => blad(BLADEN.length + i, naam, `"${naam}\n@js\nconst PAGINA = "<scr" + "ipt>" + ${JSON.stringify(kindCode(naam, "wegnavigeren", wegPosten.get(naam)))} + "</scr" + "ipt>";\n${adres}\n@end\n`)),
    blad(BLADEN.length + WEG.length, GEWOON, `"${GEWOON}\nL = 5 m\n@js bibliotheek=three\n${GEWOON_CODE}\n@end\n`),
  ],
};
const PROJECT = join(UIT, "proef-webrtc.ifccalculation");
writeFileSync(PROJECT, bouwProjectBestand(project, bladenVoorIfc(project)));

// ── Het venster ──────────────────────────────────────────────────────────────
const proces = spawn(exe, [PROJECT], {
  stdio: "ignore",
  env: {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: OPSLAG,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: [`--remote-debugging-port=${DEBUGPOORT}`, "--ignore-certificate-errors", ...vlaggen].join(" "),
  },
});
let doel = null;
for (let i = 0; i < 120 && !doel; i++) {
  await wacht(500);
  try {
    const lijst = await (await fetch(`http://127.0.0.1:${DEBUGPOORT}/json`)).json();
    doel = lijst.find((t) => t.type === "page" && !t.url.startsWith("devtools"));
  } catch {
    // Het venster is er nog niet.
  }
}
if (!doel) {
  proces.kill();
  throw new Error("Het venster verscheen niet.");
}
const ws = await new Promise((klaar, mis) => {
  const w = new WebSocket(doel.webSocketDebuggerUrl);
  w.onopen = () => klaar(w);
  w.onerror = (e) => mis(new Error(`WebSocket: ${e.message ?? e.type}`));
});
let teller = 0;
const open = new Map();
ws.onmessage = (e) => {
  const b = JSON.parse(e.data);
  if (b.id && open.has(b.id)) {
    const { klaar, mis } = open.get(b.id);
    open.delete(b.id);
    if (b.error) mis(new Error(b.error.message));
    else klaar(b.result);
  }
};
const stuur = (method, params = {}) => new Promise((klaar, mis) => {
  const id = ++teller;
  open.set(id, { klaar, mis });
  ws.send(JSON.stringify({ id, method, params }));
});
async function voerUit(expression, contextId) {
  const r = await stuur("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true, ...(contextId ? { contextId } : {}) });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function wachtOp(fn, tekst, ms = 60000) {
  const eind = Date.now() + ms;
  let laatste;
  while (Date.now() < eind) {
    try {
      laatste = await fn();
      if (laatste) return laatste;
    } catch (err) {
      laatste = err;
    }
    await wacht(250);
  }
  throw new Error(`Wachten op ${tekst} duurde te lang (${laatste?.message ?? laatste}).`);
}
const kiesBlad = (naam) => voerUit(`window.__proef.length = 0; [...document.querySelectorAll('.pb-naam')].find((e) => e.textContent.includes(${JSON.stringify(naam)})).closest('button').click()`);
const voerBlokUit = async () => {
  await wachtOp(() => voerUit(`document.querySelector('.calc-iframe-laden') ? 1 : 0`), "de knop Uitvoeren");
  // Een project dat nog laadt, vergeet de klik (jsBlok.ts): dan komt de knop terug.
  await wachtOp(async () => {
    await voerUit(`document.querySelector('.calc-iframe-laden')?.click()`);
    await wacht(1000);
    return voerUit(`document.querySelector('.calc-iframe-laden') ? 0 : 1`);
  }, "een blok dat start");
};
const antwoorden = () => voerUit(`window.__proef.slice()`);

/** Hoe een antwoord op een regel past. */
function beschrijf(lijst, p) {
  const delen = [];
  for (const a of lijst) {
    if (a.draait) delen.push("SCRIPT DRAAIT IN HET NIEUWE VENSTER");
    if (a.rtc) delen.push(`RTCPeerConnection: ${a.rtc}`);
    if (a.webkit === "function") delen.push("webkit-naam: function");
    if (a.tauri) delen.push(`opstartscript ${a.tauri === "undefined" ? "NIET gedraaid" : "gedraaid"}`);
    if (a.namen) delen.push(`namen: ${a.namen}`);
    if (a.gemaakt) delen.push("VERBINDING GEMAAKT");
    if (a.uitkomst) delen.push(a.uitkomst);
    if (a.fout) delen.push(/cross-origin/.test(a.fout) ? "andere herkomst" : a.fout);
  }
  delen.push(`udp ${p.udp}, tcp ${p.tcp}`);
  return delen.join("; ");
}
const lek = (lijst, p) => lijst.some((a) => a.gemaakt || a.rtc === "function" || a.webkit === "function" || a.namen) || p.udp > 0 || p.tcp > 0;

try {
  await stuur("Runtime.enable");
  await stuur("Page.enable");
  await wachtOp(() => voerUit(`[...document.querySelectorAll('.pb-naam')].some((e) => e.textContent.includes(${JSON.stringify(BLADEN[0].naam)})) ? 1 : 0`), "de projectboom");
  await voerUit(`document.querySelector('.welkom-paneel button[aria-label]')?.click()`);
  await voerUit(`window.__proef = []; window.addEventListener("message", (e) => {
    if (e.data && e.data.soort === "proef") window.__proef.push(e.data.uit);
  }); 1`);

  kop(`WebView2 ${await voerUit("navigator.userAgent.match(/Edg\\/([0-9.]+)/)?.[1] ?? navigator.userAgent")}`);
  const hoofd = await voerUit(`Object.getOwnPropertyNames(window).filter((n) => /^(webkit)?RTC/.test(n)).join()`);
  meld(hoofd === "", "het hoofdvenster heeft geen namen met RTC", hoofd);

  // De tegenproef: in een eigen wereld is WebRTC er nog, en de post moet dat horen.
  kop("Tegenproef: hoort de luisterpost het als WebRTC wel draait?");
  const boom = await stuur("Page.getFrameTree");
  const wereld = await stuur("Page.createIsolatedWorld", { frameId: boom.frameTree.frame.id, worldName: "proef-webrtc" });
  const controle = await voerUit(`(() => {
    if (typeof RTCPeerConnection !== "function") return "geen RTCPeerConnection in deze wereld";
    const p = new RTCPeerConnection({ iceServers: ${JSON.stringify(servers(controlePost))} });
    p.createDataChannel("x");
    p.createOffer().then((o) => p.setLocalDescription(o));
    window.__controle = p;
    return "gemaakt";
  })()`, wereld.executionContextId);
  await wachtOp(() => controlePost.stun > 0 && controlePost.tcp > 0, "pakketten van de tegenproef", 15000).catch(() => {});
  meld(controle === "gemaakt" && controlePost.stun > 0, "de post hoort STUN uit een echte verbinding", `${controle}; ${controlePost.stun} STUN-pakketten`);
  meld(controlePost.tcp > 0, "en TCP, via TURN", `${controlePost.tcp} verbindingen`);

  for (const { naam, netwerk } of BLADEN) {
    kop(`Blad "${naam}"`);
    const posten = postenPerBlad.get(naam);
    const hitsVoor = hostHits.length;
    await kiesBlad(naam);
    await voerBlokUit();
    await wachtOp(async () => (await antwoorden()).some((a) => a.klaar && a.blad === naam), "de routes", 90000).catch(async (e) => {
      console.log(`     tot dan: ${JSON.stringify(await antwoorden()).slice(-600)}`);
      console.log(`     melding: ${await voerUit(`document.querySelector('.calc-js-fout')?.textContent ?? 'geen'`)}`);
      console.log(`     vensters: ${await voerUit(`document.querySelectorAll('iframe').length + ' iframes, ' + document.querySelectorAll('.calc-js').length + ' blokken, ' + document.querySelectorAll('.calc-iframe-laden').length + ' knoppen'`)}`);
      const f = await stuur("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(UIT, "vast.png"), Buffer.from(f.data, "base64"));
      throw e;
    });
    // STUN herhaalt zich een paar seconden, en TURN wacht daar op.
    await wacht(8000);
    const alle = (await antwoorden()).filter((a) => a.blad === naam);
    for (const route of [...ROUTE_NAMEN, ...KIND_NAMEN, "WebTransport"]) {
      const lijst = alle.filter((a) => a.route === route);
      const p = posten.get(route);
      meld(lijst.length > 0 && !lek(lijst, p), route, lijst.length ? beschrijf(lijst, p) : "geen antwoord");
    }
    const ping = alle.find((a) => a.route === "host")?.ping;
    meld(ping === (netwerk ? "bereikbaar" : "geweigerd"), netwerk ? "de host uit netwerk= is bereikbaar, dus de route via de host telt mee" : "de host is zonder netwerk= niet bereikbaar", String(ping));
    const hits = hostHits.slice(hitsVoor);
    if (!netwerk) meld(hits.length === 0, "de host heeft niets ontvangen", hits.join(" "));
    else console.log(`     de host leverde: ${hits.join(" ") || "niets"}`);
    const totaal = [...posten.values()].reduce((s, p) => s + p.udp + p.tcp, 0);
    meld(totaal === 0, "de luisterpost heeft van dit blad niets ontvangen", `${totaal} pakketten en verbindingen`);
    const foto = await stuur("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(UIT, `${naam.replace(/\s+/g, "-").toLowerCase()}.png`), Buffer.from(foto.data, "base64"));
  }

  kop("Het venster zelf wegsturen, naar een pagina die een verbinding probeert");
  for (const { naam } of WEG) {
    await kiesBlad(naam);
    await voerBlokUit();
    await wacht(6000);
    const lijst = (await antwoorden()).filter((a) => a.blad === naam);
    const p = wegPosten.get(naam);
    meld(!lek(lijst, p), naam, beschrijf(lijst, p));
  }

  kop("Een gewoon blok");
  await kiesBlad(GEWOON);
  await voerBlokUit();
  const gewoon = await wachtOp(async () => (await antwoorden()).find((a) => a.blad === GEWOON), "het gewone blok", 30000).catch(() => null);
  meld(gewoon?.L === 5000, "calc rekent: L = 5 m is 5000 mm", String(gewoon?.L));
  meld(gewoon?.canvas === 1 && gewoon?.driehoeken > 0, "en three tekent een model", `${gewoon?.canvas} canvas, ${gewoon?.driehoeken} driehoeken`);
  meld((await voerUit(`document.querySelector('.calc-js-fout')?.textContent ?? ''`)) === "", "zonder melding in beeld");
  const foto = await stuur("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(UIT, "gewoon-blok.png"), Buffer.from(foto.data, "base64"));
} finally {
  ws.close();
  proces.kill();
  host.close();
  for (const m of [...postenPerBlad.values(), wegPosten]) for (const p of m.values()) p.sluit();
  controlePost.sluit();
}

console.log(fouten === 0 ? "\nAlles klopt: geen enkele route, en niets op de luisterpost." : `\n${fouten} punt(en) kloppen niet.`);
process.exit(fouten === 0 ? 0 : 1);
