/**
 * Perceptual hashing (pHash / aHash) for evidence-reuse detection.
 *
 * What this catches: the same "damaged item" photo re-submitted across
 * orders or users, including re-saves, re-encodes and modest resizes
 * (Hamming distance 0 = identical, 1-5 = near-duplicate, >10 = different).
 *
 * Honest limits (Research 06, §3, signal 1): pHash does NOT reliably catch
 * crops, rotations, flips, overlays / text annotations, or a screenshot /
 * photograph of the photo — those change the low-frequency content or its
 * alignment. Two different photos of the same product model on a similar
 * background can also collide if the threshold is loosened too far, which
 * is why the default threshold here is conservative (5 / 64 bits) and a
 * match is a review-priority signal only, never a verdict.
 */

/** One-dimensional DCT-II (unnormalised; scale is irrelevant for median thresholding). */
function dct1d(input: number[]): number[] {
  const n = input.length;
  const out = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = input[i] ?? 0;
      sum += v * Math.cos((Math.PI * (2 * i + 1) * k) / (2 * n));
    }
    out[k] = sum;
  }
  return out;
}

/** Separable 2-D DCT-II: DCT every row, then DCT every column of the result. */
function dct2d(matrix: number[][]): number[][] {
  const size = matrix.length;
  const rowTransformed = matrix.map((row) => dct1d(row));
  const out: number[][] = Array.from({ length: size }, () =>
    new Array<number>(size).fill(0),
  );
  for (let col = 0; col < size; col++) {
    const column = rowTransformed.map((row) => row[col] ?? 0);
    const transformed = dct1d(column);
    for (let row = 0; row < size; row++) {
      const target = out[row];
      if (target) target[col] = transformed[row] ?? 0;
    }
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Pack 64 bits (row-major, most-significant first) as 16 hex characters. */
function bitsToHex(bits: boolean[]): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) {
      nibble = (nibble << 1) | (bits[i + j] ? 1 : 0);
    }
    hex += nibble.toString(16);
  }
  return hex.padStart(16, '0');
}

/**
 * Compute a 64-bit perceptual hash from a 32x32 grayscale image
 * (values 0-255, row-major: gray32[row][col]).
 *
 * Algorithm: separable DCT-II over rows and columns, take the low-frequency
 * 8x8 block, compute the median of that block excluding the DC (0,0)
 * coefficient (the DC term tracks overall brightness and would dominate
 * the median), then set one bit per coefficient that exceeds the median.
 */
export function computePHash(gray32: number[][]): string {
  if (gray32.length !== 32 || gray32.some((row) => row.length !== 32)) {
    throw new Error('computePHash expects a 32x32 grayscale matrix');
  }
  const coeffs = dct2d(gray32);

  const block: number[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      block.push(coeffs[r]?.[c] ?? 0);
    }
  }
  // Median excludes the DC coefficient at index 0.
  const threshold = median(block.slice(1));

  const bits = block.map((value) => value > threshold);
  return bitsToHex(bits);
}

/**
 * Average hash from an 8x8 grayscale image: one bit per pixel above the
 * mean. Cruder than pHash (no frequency analysis) but nearly free, and
 * useful as a cheap first-pass filter.
 */
export function computeAHash(gray8: number[][]): string {
  const flat: number[] = [];
  for (const row of gray8) for (const v of row) flat.push(v);
  if (flat.length !== 64) {
    throw new Error('computeAHash expects an 8x8 grayscale matrix (64 values)');
  }
  const mean = flat.reduce((a, b) => a + b, 0) / flat.length;
  return bitsToHex(flat.map((v) => v > mean));
}

const NIBBLE_POPCOUNT: Record<string, number> = {
  '0': 0, '1': 1, '2': 1, '3': 2, '4': 1, '5': 2, '6': 2, '7': 3,
  '8': 1, '9': 2, a: 2, b: 3, c: 2, d: 3, e: 3, f: 4,
};

/** Hamming distance between two equal-length hex hash strings. */
export function hammingDistanceHex(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left.length !== right.length) {
    throw new Error(
      `hammingDistanceHex expects equal-length hashes (got ${left.length} and ${right.length})`,
    );
  }
  let distance = 0;
  for (let i = 0; i < left.length; i++) {
    const xor = (
      parseInt(left[i] ?? '0', 16) ^ parseInt(right[i] ?? '0', 16)
    ).toString(16);
    distance += NIBBLE_POPCOUNT[xor] ?? 0;
  }
  return distance;
}

export interface PHashCorpusEntry {
  id: string;
  phashHex: string;
}

export interface PHashMatch extends PHashCorpusEntry {
  distance: number;
}

/**
 * Find corpus entries whose pHash is within `threshold` bits (default 5)
 * of `hashHex`. Results are sorted by ascending distance.
 */
export function findNearDuplicates(
  hashHex: string,
  corpus: PHashCorpusEntry[],
  threshold = 5,
): PHashMatch[] {
  const matches: PHashMatch[] = [];
  for (const entry of corpus) {
    if (entry.phashHex.length !== hashHex.length) continue;
    const distance = hammingDistanceHex(hashHex, entry.phashHex);
    if (distance <= threshold) {
      matches.push({ ...entry, distance });
    }
  }
  return matches.sort((x, y) => x.distance - y.distance);
}
