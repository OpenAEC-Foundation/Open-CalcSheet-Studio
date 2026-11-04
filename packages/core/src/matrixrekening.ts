/**
 * Numerieke matrixrekening voor de rekentaal-functies lsolve, msolve, rank,
 * eigenvals en eigenvecs. Kale getallen; de eenheden regelt evaluator.ts.
 *
 * Een matrix is hier een lijst rijen (number[][]), zoals in de rekentaal: element
 * (i, j) is rij i, kolom j.
 */

/**
 * Lost A·X = B op met LU-ontbinding met rijpivotering (Gauss). B heeft per
 * rij één waarde per rechterlid: n × k. Werkt voor elke vierkante,
 * niet-singuliere matrix, symmetrisch of niet. Een singuliere of bijna
 * singuliere matrix geeft een foutmelding in plaats van een stil fout
 * antwoord.
 */
export function losStelselOp(A: number[][], B: number[][], functie = 'lsolve'): number[][] {
  const n = A.length;
  if (n === 0) throw new Error(`${functie}: de matrix is leeg`);
  if (A.some((r) => r.length !== n)) {
    throw new Error(`${functie}: de matrix moet vierkant zijn (${n} × ${Math.max(...A.map((r) => r.length))})`);
  }
  if (B.length !== n) {
    throw new Error(`${functie}: het rechterlid heeft ${B.length} rijen, de matrix ${n}`);
  }
  const k = B[0]?.length ?? 0;
  const a = A.map((r) => r.slice());
  const b = B.map((r) => r.slice());

  let schaal = 0;
  for (const r of a) for (const v of r) {
    if (!Number.isFinite(v)) throw new Error(`${functie}: de matrix bevat een element dat geen getal is`);
    schaal = Math.max(schaal, Math.abs(v));
  }
  if (!(schaal > 0)) throw new Error(`${functie}: de matrix is singulier (alle elementen nul)`);
  const grens = schaal * 1e-14;

  for (let kol = 0; kol < n; kol++) {
    let p = kol;
    for (let r = kol + 1; r < n; r++) if (Math.abs(a[r][kol]) > Math.abs(a[p][kol])) p = r;
    if (Math.abs(a[p][kol]) <= grens) throw new Error(`${functie}: de matrix is singulier of slecht geconditioneerd`);
    if (p !== kol) {
      [a[p], a[kol]] = [a[kol], a[p]];
      [b[p], b[kol]] = [b[kol], b[p]];
    }
    const piv = a[kol][kol];
    for (let r = kol + 1; r < n; r++) {
      const f = a[r][kol] / piv;
      if (f === 0) continue;
      a[r][kol] = 0;
      for (let c = kol + 1; c < n; c++) a[r][c] -= f * a[kol][c];
      for (let c = 0; c < k; c++) b[r][c] -= f * b[kol][c];
    }
  }

  const x: number[][] = Array.from({ length: n }, () => new Array<number>(k).fill(0));
  for (let c = 0; c < k; c++) {
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r][c];
      for (let j = r + 1; j < n; j++) s -= a[r][j] * x[j][c];
      x[r][c] = s / a[r][r];
    }
  }
  return x;
}

/** Rang: het aantal lineair onafhankelijke rijen (Gauss met volledige pivotering). */
export function rangVan(A: number[][]): number {
  const m = A.length;
  if (m === 0) return 0;
  const n = Math.max(...A.map((r) => r.length));
  const a = A.map((r) => Array.from({ length: n }, (_, j) => r[j] ?? 0));
  let schaal = 0;
  for (const r of a) for (const v of r) schaal = Math.max(schaal, Math.abs(v));
  if (!(schaal > 0)) return 0;
  const grens = schaal * Math.max(m, n) * 1e-13;
  let rang = 0;
  const rijGebruikt = new Array<boolean>(m).fill(false);
  for (let kol = 0; kol < n && rang < m; kol++) {
    let p = -1;
    for (let r = 0; r < m; r++) {
      if (!rijGebruikt[r] && (p === -1 || Math.abs(a[r][kol]) > Math.abs(a[p][kol]))) p = r;
    }
    if (p === -1 || Math.abs(a[p][kol]) <= grens) continue;
    rijGebruikt[p] = true;
    rang++;
    for (let r = 0; r < m; r++) {
      if (r === p) continue;
      const f = a[r][kol] / a[p][kol];
      if (f === 0) continue;
      for (let c = kol; c < n; c++) a[r][c] -= f * a[p][c];
    }
  }
  return rang;
}

/**
 * Eigenwaarden en eigenvectoren van een symmetrische matrix (Jacobi). De
 * waarden oplopend; elke vector is een rij, genormeerd op lengte 1, in de
 * volgorde van de waarden — zoals eigenvals en eigenvecs in de rekentaal.
 */
export function eigenSymmetrisch(A: number[][], functie = 'eigenvals'): { waarden: number[]; vectoren: number[][] } {
  const n = A.length;
  if (n === 0 || A.some((r) => r.length !== n)) throw new Error(`${functie}: de matrix moet vierkant zijn`);
  let schaal = 0;
  for (const r of A) for (const v of r) schaal = Math.max(schaal, Math.abs(v));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (Math.abs(A[i][j] - A[j][i]) > 1e-10 * Math.max(schaal, 1e-300)) {
      throw new Error(`${functie}: de matrix moet symmetrisch zijn`);
    }
  }
  const a = A.map((r) => r.slice());
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let ronde = 0; ronde < 100; ronde++) {
    let buiten = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) buiten += a[i][j] * a[i][j];
    if (buiten <= 1e-30 * Math.max(schaal * schaal, 1e-300)) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (a[p][q] === 0) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const volgorde = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[x][x] - a[y][y]);
  return {
    waarden: volgorde.map((i) => a[i][i]),
    // Kolom i van v is de eigenvector bij a[i][i]; hier als rij.
    vectoren: volgorde.map((i) => v.map((rij) => rij[i])),
  };
}
