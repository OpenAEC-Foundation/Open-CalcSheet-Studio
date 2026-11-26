/**
 * De enige poort van de app-container (docker/app.Dockerfile): de stroom van het scherm
 * in de browser (noVNC via websockify, intern op 127.0.0.1:6080) en `GET /gezond`.
 *
 * `/gezond` geeft alleen 200 als de app echt draait: het proces leeft, zijn venster
 * staat zichtbaar op het scherm en de VNC-server luistert. Anders 503, met wat er
 * ontbreekt. De HEALTHCHECK van het image vraagt deze route.
 *
 * Draait op de Node.js van Debian, zonder afhankelijkheden.
 */
import { execFile } from "node:child_process";
import { createServer, request } from "node:http";
import { connect } from "node:net";

const POORT = Number(process.env.OCSS_POORT ?? 3000);
const STROOM = { host: "127.0.0.1", port: 6080 };
const VNC = { host: "127.0.0.1", port: 5900 };
const VENSTER = "Open CalcSheet Studio";

const uitvoer = (opdracht, args) =>
  new Promise((ja) => execFile(opdracht, args, { timeout: 3000, env: process.env }, (fout, stdout) => ja(fout ? "" : String(stdout).trim())));

const luistert = ({ host, port }) =>
  new Promise((ja) => {
    const s = connect(port, host);
    const klaar = (ok) => {
      s.destroy();
      ja(ok);
    };
    s.setTimeout(1500, () => klaar(false));
    s.once("connect", () => klaar(true));
    s.once("error", () => klaar(false));
  });

async function gezond() {
  const [proces, venster, vnc, stroom] = await Promise.all([
    uitvoer("pgrep", ["-f", "^/usr/bin/open-calcsheet-studio"]),
    uitvoer("xdotool", ["search", "--onlyvisible", "--name", VENSTER]),
    luistert(VNC),
    luistert(STROOM),
  ]);
  const mist = [
    ...(proces ? [] : ["het proces van de app"]),
    ...(venster ? [] : ["het venster van de app"]),
    ...(vnc ? [] : ["de VNC-server"]),
    ...(stroom ? [] : ["de stroom (websockify)"]),
  ];
  return { ok: mist.length === 0, mist };
}

const server = createServer(async (req, res) => {
  const pad = (req.url ?? "/").split("?")[0];
  if (pad === "/gezond") {
    const g = await gezond();
    res.writeHead(g.ok ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(g.ok ? { status: "ok" } : { status: "niet gezond", ontbreekt: g.mist }));
    return;
  }
  // De app op het hele scherm, en het scherm meteen verbonden.
  if (pad === "/") {
    res.writeHead(302, { Location: "/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=websockify" });
    res.end();
    return;
  }
  const door = request({ ...STROOM, method: req.method, path: req.url, headers: req.headers }, (antwoord) => {
    res.writeHead(antwoord.statusCode ?? 502, antwoord.headers);
    antwoord.pipe(res);
  });
  door.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(door);
});

// Een websocket (de stroom zelf) gaat ongewijzigd door naar websockify.
server.on("upgrade", (req, sok, kop) => {
  const door = connect(STROOM.port, STROOM.host, () => {
    door.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (let i = 0; i < req.rawHeaders.length; i += 2) door.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
    door.write("\r\n");
    if (kop?.length) door.write(kop);
    door.pipe(sok);
    sok.pipe(door);
  });
  const sluit = () => {
    door.destroy();
    sok.destroy();
  };
  door.on("error", sluit);
  sok.on("error", sluit);
});

server.listen(POORT, "0.0.0.0", () => console.log(`[poort] stroom en /gezond op poort ${POORT}`));
