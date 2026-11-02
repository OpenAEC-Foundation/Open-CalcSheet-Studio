/**
 * De vorm van een IFCX-bestand zoals buildingSMART hem vastlegt
 * (IFC5-development, schema/ifcx.tsp). Alleen deze vier velden staan op het
 * hoogste niveau; alles wat een programma daarnaast kwijt wil, staat als
 * attribuut op een knoop, met een beschrijving onder `schemas`.
 */

/**
 * Eén knoop uit `data`. `path` is de identiteit (in de voorbeelden van
 * buildingSMART een UUID). Dezelfde `path` mag vaker voorkomen: bij het
 * samenstellen wint de laatste, per attribuut.
 *
 * `children` en `inherits` wijzen op naam naar een andere `path`. Een naam mag
 * geen `/` bevatten: het samenstellen leest dat als een pad de boom in.
 */
export interface IfcxKnoop {
  path: string;
  children?: Record<string, string | null>;
  inherits?: Record<string, string | null>;
  attributes?: Record<string, unknown>;
}

export interface IfcxKop {
  /** Naam of pad van de dataset. */
  id: string;
  /** Versie van het IFCX-formaat zelf; nu `ifcx_alpha`. */
  ifcxVersion: string;
  /** Versie van deze dataset; bij een projectbestand de formaatversie. */
  dataVersion: string;
  author: string;
  /** ISO 8601. */
  timestamp: string;
}

export type IfcxDataType =
  | 'Real'
  | 'Boolean'
  | 'Integer'
  | 'String'
  | 'DateTime'
  | 'Enum'
  | 'Array'
  | 'Object'
  | 'Reference'
  | 'Blob';

export type IfcxGrootheid =
  | 'Plane angle'
  | 'Thermodynamic temperature'
  | 'Electric current'
  | 'Time'
  | 'Frequency'
  | 'Mass'
  | 'Length'
  | 'Linear velocity'
  | 'Force'
  | 'Pressure'
  | 'Area'
  | 'Energy'
  | 'Power'
  | 'Volume';

export interface IfcxWaarde {
  dataType: IfcxDataType;
  optional?: boolean;
  inherits?: string[];
  quantityKind?: IfcxGrootheid;
  enumRestrictions?: { options: string[] };
  arrayRestrictions?: { min?: number; max?: number; value: IfcxWaarde };
  objectRestrictions?: { values: Record<string, IfcxWaarde> };
}

export interface IfcxSchema {
  uri?: string;
  value: IfcxWaarde;
}

export interface IfcxImport {
  uri: string;
  integrity?: string;
}

/** Een compleet IFCX-bestand. */
export interface IfcxBestand {
  header: IfcxKop;
  imports: IfcxImport[];
  schemas: Record<string, IfcxSchema>;
  data: IfcxKnoop[];
}
