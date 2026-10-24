/**
 * money.ts — integer-paise money helpers.
 *
 * Every amount in this engine is an integer number of paise
 * (₹1 = 100 paise). Floats are never used to represent money; the only
 * place a fractional value appears is inside the largest-remainder
 * calculation, where it is a dimensionless share that is immediately
 * rounded back to integer paise with an exact-sum guarantee.
 */

/** Convert a rupee amount (e.g. 888.89) to integer paise (88889). */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) {
    throw new Error(`rupeesToPaise: not a finite number: ${rupees}`);
  }
  return Math.round(rupees * 100);
}

/** Convert integer paise back to a rupee number for display maths only. */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** Sum integer paise amounts exactly. */
export function sumPaise(amounts: readonly number[]): number {
  let total = 0;
  for (const a of amounts) {
    if (!Number.isInteger(a)) {
      throw new Error(`sumPaise: amount is not integer paise: ${a}`);
    }
    total += a;
  }
  return total;
}

/**
 * Split `totalPaise` across `weights` using the largest-remainder method.
 *
 * Guarantees:
 *  - every part is an integer number of paise,
 *  - the parts sum EXACTLY to `totalPaise`,
 *  - each part is within 1 paisa of its exact proportional share,
 *  - residual paise go to the largest fractional remainders first;
 *    ties break toward the larger weight, then toward the lower index
 *    (deterministic — the same split is reproducible in tests and audits).
 */
export function splitByWeights(totalPaise: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(totalPaise)) {
    throw new Error(`splitByWeights: total is not integer paise: ${totalPaise}`);
  }
  if (weights.length === 0) {
    if (totalPaise !== 0) {
      throw new Error('splitByWeights: cannot split a non-zero total across zero weights');
    }
    return [];
  }
  for (const w of weights) {
    if (!Number.isFinite(w) || w < 0) {
      throw new Error(`splitByWeights: weights must be non-negative numbers, got ${w}`);
    }
  }
  if (totalPaise < 0) {
    // Split the magnitude, then re-apply the sign so parts still sum exactly.
    return splitByWeights(-totalPaise, weights).map((p) => -p);
  }
  if (totalPaise === 0) {
    return weights.map(() => 0);
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) {
    throw new Error('splitByWeights: weights sum to zero but total is non-zero');
  }

  const exact = weights.map((w) => (totalPaise * w) / weightSum);
  const parts = exact.map((x) => Math.floor(x));
  let remainder = totalPaise - parts.reduce((a, b) => a + b, 0);

  // Rank indices by fractional remainder (desc), then weight (desc), then index (asc).
  const ranked = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x), w: weights[i] ?? 0 }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);

  for (const { i } of ranked) {
    if (remainder <= 0) break;
    parts[i] = (parts[i] ?? 0) + 1;
    remainder -= 1;
  }

  // Defensive invariant: the split must be exact, never approximate.
  const check = parts.reduce((a, b) => a + b, 0);
  if (check !== totalPaise) {
    throw new Error(`splitByWeights: internal error — parts sum ${check} !== total ${totalPaise}`);
  }
  return parts;
}

/**
 * Format integer paise as an Indian-rupee string with Indian digit
 * grouping (last three digits, then pairs): 111111 -> "₹1,111.11".
 */
export function formatINR(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new Error(`formatINR: amount is not integer paise: ${paise}`);
  }
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;

  const digits = String(rupees);
  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const last3 = digits.slice(-3);
    let rest = digits.slice(0, -3);
    const pairs: string[] = [];
    while (rest.length > 2) {
      pairs.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest.length > 0) pairs.unshift(rest);
    grouped = [...pairs, last3].join(',');
  }
  return `${sign}₹${grouped}.${String(rem).padStart(2, '0')}`;
}
