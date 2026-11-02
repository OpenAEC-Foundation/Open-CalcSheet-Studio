/**
 * Identiteiten voor IFCX en STEP.
 *
 * Een knoop in IFCX heet naar een UUID en een object in STEP naar een GlobalId:
 * twee schrijfwijzen van hetzelfde getal van 128 bits. Elke knoop krijgt hier
 * een vaste UUID, afgeleid van zijn plek in het project, zodat twee keer
 * opslaan dezelfde paden geeft. De GlobalId in de STEP is daarvan de korte
 * vorm: wie beide bestanden naast elkaar legt, kan de objecten aan elkaar
 * koppelen.
 */

const GUID_TEKENS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** De naamruimte van de UUID's van dit programma (zelf gekozen, verder willekeurig). */
const NAAMRUIMTE = 'f3a1c6de-7b42-5e09-9d31-0c5a8e2b7f64';

const UUID_VORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUID_VORM = /^[0-3][0-9A-Za-z_$]{21}$/;

function sha1(data: Uint8Array): Uint8Array {
  const lengte = data.length;
  const blokken = (((lengte + 8) >>> 6) + 1) * 16;
  const w = new Uint32Array(blokken);
  for (let i = 0; i < lengte; i++) w[i >>> 2] |= data[i] << (24 - (i % 4) * 8);
  w[lengte >>> 2] |= 0x80 << (24 - (lengte % 4) * 8);
  w[blokken - 2] = Math.floor((lengte * 8) / 0x100000000);
  w[blokken - 1] = (lengte * 8) >>> 0;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const r = new Uint32Array(80);
  for (let b = 0; b < blokken; b += 16) {
    for (let t = 0; t < 16; t++) r[t] = w[b + t];
    for (let t = 16; t < 80; t++) {
      const x = r[t - 3] ^ r[t - 8] ^ r[t - 14] ^ r[t - 16];
      r[t] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let bb = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t++) {
      const f =
        t < 20 ? ((bb & c) | (~bb & d)) + 0x5a827999
        : t < 40 ? (bb ^ c ^ d) + 0x6ed9eba1
        : t < 60 ? ((bb & c) | (bb & d) | (c & d)) + 0x8f1bbcdc
        : (bb ^ c ^ d) + 0xca62c1d6;
      const tijdelijk = (((a << 5) | (a >>> 27)) + f + e + r[t]) | 0;
      e = d;
      d = c;
      c = (bb << 30) | (bb >>> 2);
      bb = a;
      a = tijdelijk;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + bb) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  const uit = new Uint8Array(20);
  [h0, h1, h2, h3, h4].forEach((h, i) => {
    uit[i * 4] = h >>> 24;
    uit[i * 4 + 1] = (h >>> 16) & 0xff;
    uit[i * 4 + 2] = (h >>> 8) & 0xff;
    uit[i * 4 + 3] = h & 0xff;
  });
  return uit;
}

function uuidBytes(uuid: string): number[] {
  const hex = uuid.replace(/-/g, '');
  const uit: number[] = [];
  for (let i = 0; i < 32; i += 2) uit.push(parseInt(hex.slice(i, i + 2), 16));
  return uit;
}

function bytesUuid(b: ArrayLike<number>): string {
  let hex = '';
  for (let i = 0; i < 16; i++) hex += (b[i] & 0xff).toString(16).padStart(2, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Een vaste UUID (versie 5) bij een tekst: dezelfde tekst, dezelfde UUID. */
export function uuidVan(tekst: string): string {
  const naam = new TextEncoder().encode(tekst);
  const data = new Uint8Array(16 + naam.length);
  data.set(uuidBytes(NAAMRUIMTE));
  data.set(naam, 16);
  const hash = sha1(data);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesUuid(hash);
}

export function isUuid(tekst: string): boolean {
  return UUID_VORM.test(tekst);
}

export function isIfcGuid(tekst: string): boolean {
  return GUID_VORM.test(tekst);
}

/** De GlobalId van een UUID. Ook de STEP-kant van een knoop met een ander pad: die krijgt eerst een UUID. */
export function ifcGuid(pad: string): string {
  const b = uuidBytes(isUuid(pad) ? pad : uuidVan(pad));
  const blok = (v: number, lengte: number) => {
    let uit = '';
    for (let i = lengte - 1; i >= 0; i--) uit += GUID_TEKENS[Math.floor(v / 64 ** i) % 64];
    return uit;
  };
  let guid = blok(b[0], 2);
  for (let i = 1; i < 16; i += 3) guid += blok((b[i] << 16) + (b[i + 1] << 8) + b[i + 2], 4);
  return guid;
}

/** De UUID bij een GlobalId. */
export function uuidUitIfcGuid(guid: string): string {
  const getal = (t: string) => {
    let v = 0;
    for (const c of t) v = v * 64 + GUID_TEKENS.indexOf(c);
    return v;
  };
  const b: number[] = [getal(guid.slice(0, 2))];
  for (let i = 0; i < 5; i++) {
    const d = getal(guid.slice(2 + 4 * i, 6 + 4 * i));
    b.push((d >>> 16) & 0xff, (d >>> 8) & 0xff, d & 0xff);
  }
  return bytesUuid(b);
}

/**
 * Het IFCX-pad van een element in een bronmodel. Een GlobalId wordt zijn UUID,
 * want zo heet hetzelfde element in de IFCX van dat model; een UUID of ander
 * bruikbaar pad blijft staan. Bij het samenstellen met het bronmodel komen de
 * attributen zo op het echte element terecht.
 */
export function padVanElement(id: string): string {
  const t = id.trim();
  if (isIfcGuid(t)) return uuidUitIfcGuid(t);
  if (/^[A-Za-z0-9_.:-]+$/.test(t)) return t;
  return uuidVan(`element/${t}`);
}
