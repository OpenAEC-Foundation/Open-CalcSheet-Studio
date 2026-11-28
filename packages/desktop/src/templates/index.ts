import { rekentaalDemo } from "./rekentaal-demo";
import { balklaag } from "./balklaag";
import { ligger } from "./ligger";
import { tweepaalspoer } from "./tweepaalspoer";
import { meerpaalspoer } from "./meerpaalspoer";
import { doorsnedeSpanningen } from "./doorsnede-spanningen";

import voorgespannenHeipaal from "./voorgespannen-heipaal.cpd?raw";
import vloerOpPalen from "./vloer-op-palen.cpd?raw";

export const templates: Record<string, string> = {
  "balklaag": balklaag,
  "voorgespannen-heipaal": voorgespannenHeipaal,
  "vloer-op-palen": vloerOpPalen,
  "ligger": ligger,
  "tweepaalspoer": tweepaalspoer,
  "meerpaalspoer": meerpaalspoer,
  "doorsnede-spanningen": doorsnedeSpanningen,
  "rekentaal-demo": rekentaalDemo,
};
