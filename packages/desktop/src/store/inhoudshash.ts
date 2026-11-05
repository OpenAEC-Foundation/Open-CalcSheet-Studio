/**
 * De inhoudshash van een tekst: SHA-256 over de UTF-8-bytes, als hexadecimale tekst.
 *
 * Een versie wijst grote teksten aan met deze hash (store/versies.ts), zodat tien versies niet
 * tien keer dezelfde PDF opslaan. Opslaan en openen zijn synchroon, en `crypto.subtle` niet;
 * daarom hier zelf, in een vorm die een andere lezer met elk gereedschap kan narekenen.
 *
 * De constanten volgen uit de definitie (de breukdelen van de wortels van de eerste priemgetallen).
 * Zonder React en zonder stores: scripts/check-versies.mjs legt de uitkomst naast node:crypto.
 */
const K = new Uint32Array(64);
const BEGIN = new Uint32Array(8);
{
  let n = 0;
  for (let p = 2; n < 64; p++) {
    let priem = true;
    for (let d = 2; d * d <= p; d++) {
      if (p % d === 0) {
        priem = false;
        break;
      }
    }
    if (!priem) continue;
    if (n < 8) BEGIN[n] = (Math.sqrt(p) % 1) * 2 ** 32;
    K[n++] = (Math.cbrt(p) % 1) * 2 ** 32;
  }
}

const W = new Int32Array(64);

/** Eén blok van 64 bytes, vanaf `p`, in `h`. */
function blok(h: Uint32Array, d: Uint8Array, p: number) {
  for (let i = 0; i < 16; i++) {
    W[i] = (d[p + i * 4] << 24) | (d[p + i * 4 + 1] << 16) | (d[p + i * 4 + 2] << 8) | d[p + i * 4 + 3];
  }
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15];
    const b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = h[0], b = h[1], c = h[2], e = h[4], f = h[5], g = h[6], x = h[3], y = h[7];
  for (let i = 0; i < 64; i++) {
    const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (y + s1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    y = g;
    g = f;
    f = e;
    e = (x + t1) | 0;
    x = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  h[0] += a;
  h[1] += b;
  h[2] += c;
  h[3] += x;
  h[4] += e;
  h[5] += f;
  h[6] += g;
  h[7] += y;
}

/** SHA-256 van een tekst, als 64 hexadecimale tekens. */
export function sha256(tekst: string): string {
  const bytes = new TextEncoder().encode(tekst);
  const h = BEGIN.slice();
  let p = 0;
  for (; p + 64 <= bytes.length; p += 64) blok(h, bytes, p);
  const rest = bytes.length - p;
  const staart = new Uint8Array(rest < 56 ? 64 : 128);
  staart.set(bytes.subarray(p));
  staart[rest] = 0x80;
  const bits = bytes.length * 8;
  const staartLezer = new DataView(staart.buffer);
  staartLezer.setUint32(staart.length - 8, Math.floor(bits / 2 ** 32));
  staartLezer.setUint32(staart.length - 4, bits >>> 0);
  for (let q = 0; q < staart.length; q += 64) blok(h, staart, q);
  return [...h].map((n) => n.toString(16).padStart(8, "0")).join("");
}

/** Zoveel hashes blijven bewaard: opslaan vraagt elke keer dezelfde teksten na. */
const ONTHOUDEN = 64;
/** Wat korter is, is meteen uitgerekend; bewaren zou alleen de grote teksten uit de lijst duwen. */
const ONTHOUD_VANAF = 65536;
const onthouden = new Map<string, string>();

/**
 * De hash van een tekst. Het project wordt bij elke wijziging kort daarna bewaard (projectStore.ts),
 * en een PDF verandert daar zelden in: de hash van een grote tekst wordt dus onthouden.
 */
export function hashVan(tekst: string): string {
  if (tekst.length < ONTHOUD_VANAF) return sha256(tekst);
  const bekend = onthouden.get(tekst);
  if (bekend !== undefined) return bekend;
  const hash = sha256(tekst);
  if (onthouden.size >= ONTHOUDEN) onthouden.delete(onthouden.keys().next().value!);
  onthouden.set(tekst, hash);
  return hash;
}
