/**
 * De afbeelding van een IFCX-document voor op papier. Gelezen uit het document, met
 * dezelfde tekenaar als `@3d` (drieDWeergave.ts): three.js is hiervoor genoeg, de
 * viewer van ifcxWeergave.ts hoeft er niet voor geladen te worden.
 */
import { ifcxNaarScene, leesIfcx } from "@ifc-calc/core";
import { naarAfbeelding } from "./drieDWeergave";

export function ifcxAfbeelding(json: string, breedte: number, hoogte: number): Promise<string> {
  return naarAfbeelding(ifcxNaarScene(leesIfcx(JSON.parse(json)), hoogte), breedte, hoogte);
}
