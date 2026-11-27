import { rekentaalDemo } from "./rekentaal-demo";
import { balklaag } from "./balklaag";
import { ligger } from "./ligger";
import { tweepaalspoer } from "./tweepaalspoer";
import { meerpaalspoer } from "./meerpaalspoer";
import { doorsnedeSpanningen } from "./doorsnede-spanningen";

import { rapportConstructie, rapportInleiding, rapportProjectgegevens } from "./rapport-tekst";

import voorgespannenHeipaal from "./voorgespannen-heipaal.cpd?raw";

export const templates: Record<string, string> = {
  "balklaag": balklaag,
  "voorgespannen-heipaal": voorgespannenHeipaal,
  "ligger": ligger,
  "tweepaalspoer": tweepaalspoer,
  "meerpaalspoer": meerpaalspoer,
  "doorsnede-spanningen": doorsnedeSpanningen,
  "rekentaal-demo": rekentaalDemo,
  "rapport-inleiding": rapportInleiding,
  "rapport-projectgegevens": rapportProjectgegevens,
  "rapport-constructie": rapportConstructie,
};
