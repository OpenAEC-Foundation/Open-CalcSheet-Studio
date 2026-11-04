import { rekentaalDemo } from "./rekentaal-demo";
import { balklaag } from "./balklaag";
import { ligger } from "./ligger";
import { tweepaalspoer } from "./tweepaalspoer";
import { doorsnedeSpanningen } from "./doorsnede-spanningen";

export const templates: Record<string, string> = {
  "balklaag": balklaag,
  "ligger": ligger,
  "tweepaalspoer": tweepaalspoer,
  "doorsnede-spanningen": doorsnedeSpanningen,
  "rekentaal-demo": rekentaalDemo,
};
