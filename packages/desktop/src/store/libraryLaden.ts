import { getSetting, setSetting } from "../store";
import { LIBRARY_BRON, LibraryTeNieuw, haalLibrary, leesBewaardeLibrary, useLibrary } from "./library";
import { IN_WERKPLEK } from "../werkplek/werkplek";

/**
 * Bij het opstarten: eerst de laatste stand uit de instellingen, dan de Library uit de
 * repository. Mislukt dat, dan blijft de laatste stand staan en meldt het paneel het.
 * In de dev-server komt hij uit de map library/, zodat je een voorbeeld kunt nakijken
 * voor het op main staat. In de werkplek van de SuperCloud zit hij in de bundel
 * (vite.config.ts) en hoeft hij niet in de instellingen.
 */

const INSTELLING = "library";

export async function werkLibraryBij() {
  useLibrary.setState({ bezig: true, fout: null });
  try {
    const inhoud = await haalLibrary(__LIBRARY_DEV__ || LIBRARY_BRON);
    useLibrary.setState({ ...inhoud, bezig: false });
    if (!IN_WERKPLEK) void setSetting(INSTELLING, inhoud);
  } catch (err) {
    console.warn("Library:", err);
    useLibrary.setState({ bezig: false, fout: err instanceof LibraryTeNieuw ? "teNieuw" : "verbinding" });
  }
}

async function start() {
  if (IN_WERKPLEK) return werkLibraryBij();
  const bewaard = leesBewaardeLibrary(await getSetting<unknown>(INSTELLING, null));
  if (bewaard) useLibrary.setState(bewaard);
  await werkLibraryBij();
}

void start();
