/**
 * Rooktest van de app-container (docker/app.Dockerfile), in de release-workflow vóór het
 * publiceren, en met de hand:
 *
 *   node scripts/rooktest-app-image.mjs <adres van de stroom> <schermafbeelding.png> [--mcp <adres> --token <token>]
 *
 *   • GET /gezond wordt binnen 120 s 200: het proces van de app leeft, zijn venster staat
 *     op het scherm, en de VNC-server en de stroom luisteren (docker/app/poort.mjs);
 *   • de stroom in headless Chromium: de pagina verbindt, het scherm komt binnen en is
 *     niet leeg; daarvan een schermafbeelding;
 *   • met --mcp: de MCP-server en REST-API van de app op de interne poort (3001), met het
 *     token uit OCSS_MCP_TOKEN.
 */
import { existsSync, writeFileSync } from "node:fs";
import { CHROMIUM_PADEN, startChromium } from "../packages/headless/src/pdf.mjs";

const args = process.argv.slice(2);
const optie = (naam) => {
  const i = args.indexOf(naam);
  return i >= 0 ? args[i + 1] : undefined;
};
const [adres, beeld] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!adres || !beeld) {
  console.error("gebruik: node scripts/rooktest-app-image.mjs <adres> <schermafbeelding.png> [--mcp <adres> --token <token>]");
  process.exit(2);
}
const basis = adres.replace(/\/+$/, "");
let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + String(detail).slice(0, 400)}`);
};
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

let gezond = null;
let laatste = "";
const t0 = Date.now();
while (Date.now() - t0 < 120_000 && !gezond) {
  try {
    const r = await fetch(`${basis}/gezond`, { signal: AbortSignal.timeout(5000) });
    laatste = await r.text();
    if (r.ok) gezond = JSON.parse(laatste);
  } catch (e) {
    laatste = e.message;
  }
  if (!gezond) await wacht(1000);
}
meld(gezond?.status === "ok", `GET /gezond na ${((Date.now() - t0) / 1000).toFixed(0)} s: de app draait met zijn venster op het scherm`, laatste);
if (!gezond) process.exit(1);

// De stroom bekijken zoals een gebruiker: noVNC in een browser.
const pad = process.env.REKENDIENST_CHROMIUM || CHROMIUM_PADEN.find((p) => existsSync(p));
if (!pad) {
  meld(false, "geen Chrome of Chromium voor de schermafbeelding");
} else {
  const browser = await startChromium(pad, { taal: "en", zonderSandbox: process.env.CI === "true" });
  try {
    const { cdp } = browser;
    const { targetId } = await cdp.stuur("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.stuur("Target.attachToTarget", { targetId, flatten: true });
    const p = (m, a) => cdp.stuur(m, a, sessionId);
    await p("Page.enable");
    await p("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await p("Page.navigate", { url: `${basis}/` });
    // Het scherm is binnen als het canvas van noVNC meer dan één kleur heeft.
    let kleuren = 0;
    for (let i = 0; i < 60 && kleuren < 2; i++) {
      await wacht(1000);
      const r = await p("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
          const c = document.querySelector("canvas");
          if (!c || !c.width) return 0;
          const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
          const gezien = new Set();
          for (let j = 0; j < d.length; j += 4 * 97) gezien.add((d[j] << 16) | (d[j + 1] << 8) | d[j + 2]);
          return gezien.size;
        })()`,
      });
      kleuren = r.result?.value ?? 0;
    }
    meld(kleuren >= 2, `de stroom verbindt en toont het scherm (${kleuren} kleuren in een steekproef)`);
    const { data } = await p("Page.captureScreenshot", { format: "png" });
    writeFileSync(beeld, Buffer.from(data, "base64"));
    console.log(`  schermafbeelding: ${beeld}`);
  } finally {
    browser.stop();
  }
}

const mcp = optie("--mcp");
if (mcp) {
  const token = optie("--token") ?? "";
  const spec = await fetch(`${mcp.replace(/\/+$/, "")}/api/v1/openapi.json`).then((r) => r.json()).catch((e) => ({ fout: e.message }));
  meld(spec.openapi === "3.1.0", "de REST-API van de app is bereikbaar op de interne poort", JSON.stringify(spec).slice(0, 200));
  const project = await fetch(`${mcp.replace(/\/+$/, "")}/api/v1/project`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => ({ status: r.status }));
  meld(project.status === 200, "met het token uit OCSS_MCP_TOKEN: GET /api/v1/project", project.status);
}

console.log(fouten === 0 ? "\nRooktest geslaagd." : `\nRooktest gezakt: ${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
