/**
 * De toets of een IFCX-document (IFC5) aan de specificatie voldoet. scripts/fixtures/
 * ifcx-schemas.json is de inhoud van de bestanden op ifcx.dev. Gebruikt door
 * check-balklaag-ifcx.mjs en check-poer-ifcx.mjs.
 */
import { readFileSync } from "node:fs";

export const STANDAARD = JSON.parse(readFileSync(new URL("../fixtures/ifcx-schemas.json", import.meta.url), "utf8"));

/** Zoals ValidateAttributeValue in src/ifcx-core/schema/schema-validation.ts van de specificatie. */
function toetsWaarde(desc, v, pad, schemas) {
  if (desc.optional && v === undefined) return;
  for (const id of desc.inherits ?? []) toetsWaarde(schemas[id].value, v, pad, schemas);
  const t = desc.dataType;
  if ((t === "Boolean" && typeof v !== "boolean")
    || ((t === "String" || t === "DateTime" || t === "Enum" || t === "Reference") && typeof v !== "string")
    || ((t === "Integer" || t === "Real") && typeof v !== "number")
    || (t === "Object" && typeof v !== "object")) throw new Error(`${pad}: verwacht ${t}, staat ${JSON.stringify(v)}`);
  if (t === "Integer" && !Number.isInteger(v)) throw new Error(`${pad}: verwacht een geheel getal`);
  if (t === "Enum" && !desc.enumRestrictions.options.includes(v)) throw new Error(`${pad}: ${v} staat niet in de keuzes`);
  if (t === "Object" && desc.objectRestrictions) {
    for (const [k, d] of Object.entries(desc.objectRestrictions.values)) {
      if (d.optional && !Object.hasOwn(v, k)) continue;
      if (!Object.hasOwn(v, k)) throw new Error(`${pad}: sleutel ${k} ontbreekt`);
      toetsWaarde(d, v[k], `${pad}.${k}`, schemas);
    }
  }
  if (t === "Array") {
    if (!Array.isArray(v)) throw new Error(`${pad}: verwacht een lijst`);
    v.forEach((w, i) => toetsWaarde(desc.arrayRestrictions.value, w, `${pad}[${i}]`, schemas));
  }
}

/** Alle regels voor een geldig bestand; geeft de afwijkingen. */
export function afwijkingen(doc) {
  const uit = [];
  const hoogste = Object.keys(doc).sort().join(",");
  if (hoogste !== "data,header,imports,schemas") uit.push(`velden op het hoogste niveau: ${hoogste}`);
  for (const k of ["id", "ifcxVersion", "dataVersion", "author", "timestamp"]) {
    if (typeof doc.header?.[k] !== "string" || doc.header[k] === "") uit.push(`header.${k} ontbreekt`);
  }
  if (doc.header?.ifcxVersion !== "ifcx_alpha") uit.push(`ifcxVersion is ${doc.header?.ifcxVersion}`);
  const schemas = { ...STANDAARD, ...doc.schemas };
  const paden = new Set(doc.data.map((k) => k.path));
  const gezien = new Set();
  for (const k of doc.data) {
    if (typeof k.path !== "string" || k.path.includes("/")) uit.push(`pad met een /: ${k.path}`);
    if (gezien.has(k.path)) uit.push(`dubbel pad: ${k.path}`);
    gezien.add(k.path);
    const velden = Object.keys(k).filter((v) => !["path", "children", "inherits", "attributes"].includes(v));
    if (velden.length) uit.push(`knoop met andere velden: ${velden.join(",")}`);
    for (const veld of ["children", "inherits"]) {
      for (const [naam, doel] of Object.entries(k[veld] ?? {})) {
        if (naam.includes("/")) uit.push(`naam met een /: ${naam}`);
        if (doel !== null && !paden.has(doel.split("/")[0])) uit.push(`doel bestaat niet: ${naam} -> ${doel}`);
      }
    }
    for (const [a, w] of Object.entries(k.attributes ?? {})) {
      if (!schemas[a]) {
        uit.push(`geen schema voor ${a}`);
        continue;
      }
      try {
        toetsWaarde(schemas[a].value, w, a, schemas);
      } catch (e) {
        uit.push(e.message);
      }
    }
    const mesh = k.attributes?.["usd::usdgeom::mesh"];
    if (mesh) {
      if ("faceVertexCounts" in mesh) uit.push("mesh met faceVertexCounts: staat niet in usd@v1");
      if (!mesh.points.every((p) => Array.isArray(p) && p.length === 3)) uit.push("mesh: points zijn geen [x, y, z]");
      if (mesh.faceVertexIndices.length % 3 !== 0) uit.push("mesh: geen driehoeken");
      if (!mesh.faceVertexIndices.every((i) => Number.isInteger(i) && i >= 0 && i < mesh.points.length)) uit.push("mesh: index buiten de punten");
    }
    const t = k.attributes?.["usd::xformop"]?.transform;
    if (t && !(t.length === 4 && t.every((r) => r.length === 4))) uit.push("transform is geen 4×4");
    if (t && !(t[0][3] === 0 && t[1][3] === 0 && t[2][3] === 0 && t[3][3] === 1)) uit.push("transform: de verplaatsing hoort op de laatste rij");
  }
  // Wortels en kringen, zoals FindRootsOrCycles.
  const doelen = new Set(doc.data.flatMap((k) => [...Object.values(k.children ?? {}), ...Object.values(k.inherits ?? {})]));
  const wortels = doc.data.filter((k) => !doelen.has(k.path));
  if (wortels.length !== 1) uit.push(`${wortels.length} wortels in plaats van één`);
  return uit;
}
