import { balklaagIfcxDocument, balklaagInvoerUitScope } from './balklaagIfcx.js';
import { drieDSvg } from './drieD.js';
import { ifcxNaarScene, leesIfcx } from './ifcxLezen.js';
import { jsonVoorAttribuut } from './jsAttribuut.js';
import type { EvaluatedIfcxBlok, IfcxBlokNode } from './types.js';

/**
 * Het 3D-beeld van een module, uitgelezen uit een IFCX-document: de regel
 * `@ifcx`.
 *
 *   @ifcx balklaag hoogte=340 papier={{druk_3d}}
 *
 * Eerst de bron: de generator die uit de waarden van het blad het document maakt
 * (nu alleen `balklaag`, balklaagIfcx.ts). Opties:
 *   hoogte=340     hoogte van het beeld op het scherm in px (standaard 320)
 *   papier=ja|nee  ook op de uitdraai, of `{{…}}` (0 is nee); standaard ja
 *   taal=en        de taal van de namen in het document; standaard Nederlands
 *
 * De renderer schrijft `<div class="calc-ifcx" data-ifcx="…">` met het document
 * als JSON en daarin een stilstaande projectie van wat er uit dat document te
 * lezen is. De app zet er een draaibaar beeld overheen en maakt er de afbeelding
 * voor papier van (components/calc/ifcxBlok.ts). Zowel het beeld als de afbeelding
 * lezen alleen het document: een tweede route vanuit de balklaag is er niet.
 */

export const IFCX_RE = /^@ifcx(?:\s+(.*))?$/i;

const INVULLING_RE = /\{\{([\s\S]*?)\}\}/g;

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Leest wat er achter `@ifcx` staat. Fouten worden meldingen. */
export function leesIfcxBlok(
  rest: string,
  normaliseer: (expr: string) => string,
): Pick<IfcxBlokNode, 'bron' | 'hoogte' | 'papier' | 'taal' | 'fouten'> {
  const uit: Pick<IfcxBlokNode, 'bron' | 'hoogte' | 'papier' | 'taal' | 'fouten'> = { bron: '', fouten: [] };
  const norm = (t: string) => t.replace(INVULLING_RE, (_m, e: string) => `{{${normaliseer(e.trim())}}}`);
  const delen = rest.match(/(?:\{\{[\s\S]*?\}\}|\S)+/g) ?? [];
  uit.bron = (delen.shift() ?? '').toLowerCase();
  if (!uit.bron) uit.fouten.push('IFCX-blok: geen bron; schrijf @ifcx balklaag');
  for (const deel of delen) {
    const m = deel.match(/^(hoogte|papier|taal)=(.+)$/i);
    if (!m) uit.fouten.push(`IFCX-blok: onbekende optie "${deel}" (bekend: hoogte=…, papier=…, taal=…)`);
    else if (m[1].toLowerCase() === 'hoogte') uit.hoogte = norm(m[2]);
    else if (m[1].toLowerCase() === 'taal') uit.taal = m[2].toLowerCase();
    else uit.papier = norm(m[2]);
  }
  return uit;
}

/** Wat het blok nodig heeft van de rekenkern (evaluator.ts). */
export interface IfcxBlokRekenaar {
  reken(expr: string): unknown;
  /** De waarden van het blad op deze plek. */
  scope: Record<string, unknown>;
}

function waardeVan(tekst: string, r: IfcxBlokRekenaar): unknown {
  const f = tekst.match(/^\{\{([\s\S]+)\}\}$/);
  return f ? r.reken(f[1]) : tekst;
}

/** Rekent een `@ifcx`-regel door. Gooit niet: wat misgaat, wordt een melding. */
export function bouwIfcxBlok(node: IfcxBlokNode, r: IfcxBlokRekenaar): EvaluatedIfcxBlok {
  const meldingen = [...node.fouten];

  let hoogte = 320;
  if (node.hoogte) {
    try {
      const n = Number(waardeVan(node.hoogte, r));
      if (!Number.isFinite(n)) throw new Error('is geen getal');
      hoogte = Math.round(Math.min(1200, Math.max(120, n)));
    } catch (err) {
      meldingen.push(`IFCX-blok: hoogte ${node.hoogte}: ${(err as Error).message}`);
    }
  }

  let papier = true;
  if (node.papier) {
    try {
      const v = waardeVan(node.papier, r);
      papier = typeof v === 'string' ? !/^(nee|uit|0)$/i.test(v) : Number(v) !== 0;
    } catch (err) {
      meldingen.push(`IFCX-blok: papier ${node.papier}: ${(err as Error).message}`);
    }
  }

  let document: EvaluatedIfcxBlok['document'] = null;
  if (node.bron === 'balklaag') {
    const invoer = balklaagInvoerUitScope(r.scope);
    if (invoer) document = balklaagIfcxDocument(invoer, { taal: node.taal });
    else meldingen.push('IFCX-blok: dit blad heeft geen balk met een doorsnede (b_balk en h_balk)');
  } else if (node.bron) {
    meldingen.push(`IFCX-blok: onbekende bron "${node.bron}" (bekend: balklaag)`);
  }
  return { type: 'ifcx', document, hoogte, papier, meldingen };
}

/** Het blok in de uitwerking: de meldingen, dan het beeld met het document als JSON. */
export function renderIfcxBlok(node: EvaluatedIfcxBlok): string {
  const meldingen = node.meldingen.map((m) => `<p class="calc-3d-melding">${escapeHtml(m)}</p>`).join('');
  if (!node.document) return `<div class="calc-ifcx calc-ifcx-leeg">${meldingen}</div>`;
  const gelezen = leesIfcx(node.document);
  const wortel = gelezen.elementen.length ? node.document.data.find((k) => typeof k.attributes?.['bsi::ifc::prop::Description'] === 'string') : undefined;
  const bijschrift = wortel?.attributes?.['bsi::ifc::prop::Description'] as string | undefined;
  return `<div class="calc-ifcx${node.papier ? '' : ' alleen-scherm'}" data-ifcx="${escapeHtml(jsonVoorAttribuut(node.document))}">${meldingen}`
    + `<div class="calc-ifcx-beeld" style="height:${node.hoogte}px">${drieDSvg(ifcxNaarScene(gelezen, node.hoogte))}</div>`
    + (bijschrift ? `<p class="calc-ifcx-bijschrift">${escapeHtml(bijschrift)}</p>` : '')
    + '</div>';
}
