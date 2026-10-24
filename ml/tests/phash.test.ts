import { describe, expect, it } from 'vitest';
import {
  computeAHash,
  computePHash,
  findNearDuplicates,
  hammingDistanceHex,
} from '../src/phash.js';

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Smooth low-frequency pattern (the kind of content pHash reads). */
function basePattern(): number[][] {
  const img: number[][] = [];
  for (let r = 0; r < 32; r++) {
    const row: number[] = [];
    for (let c = 0; c < 32; c++) {
      row.push(
        clamp(128 + 70 * Math.sin(r / 5) + 50 * Math.cos(c / 4) + (r * c) / 24),
      );
    }
    img.push(row);
  }
  return img;
}

/** Same pattern with a small deterministic perturbation (like a re-save). */
function perturbedPattern(): number[][] {
  return basePattern().map((row, r) =>
    row.map((v, c) => clamp(v + (((r * 7 + c * 13) % 3) - 1))),
  );
}

/** A structurally different pattern: opposite gradients, different shapes. */
function differentPattern(): number[][] {
  const img: number[][] = [];
  for (let r = 0; r < 32; r++) {
    const row: number[] = [];
    for (let c = 0; c < 32; c++) {
      row.push(
        clamp(
          120 -
            80 * Math.sin(c / 3.5) +
            60 * Math.cos(r / 6) -
            (31 - r) * 2 +
            (c % 8) * 4,
        ),
      );
    }
    img.push(row);
  }
  return img;
}

describe('computePHash', () => {
  it('produces a 16-hex-char (64-bit) hash', () => {
    expect(computePHash(basePattern())).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is stable for the same input', () => {
    expect(computePHash(basePattern())).toBe(computePHash(basePattern()));
  });

  it('keeps a small perturbation within Hamming distance 5', () => {
    const a = computePHash(basePattern());
    const b = computePHash(perturbedPattern());
    expect(hammingDistanceHex(a, b)).toBeLessThanOrEqual(5);
  });

  it('puts a very different pattern beyond Hamming distance 10', () => {
    const a = computePHash(basePattern());
    const b = computePHash(differentPattern());
    expect(hammingDistanceHex(a, b)).toBeGreaterThan(10);
  });
});

describe('findNearDuplicates', () => {
  it('catches a planted cross-order near-duplicate', () => {
    const evidenceHash = computePHash(perturbedPattern());
    const corpus = [
      { id: 'order-1001-evidence', phashHex: computePHash(basePattern()) },
      { id: 'order-2002-evidence', phashHex: computePHash(differentPattern()) },
    ];
    const matches = findNearDuplicates(evidenceHash, corpus, 5);
    expect(matches.length).toBe(1);
    expect(matches[0]?.id).toBe('order-1001-evidence');
    expect(matches[0]?.distance).toBeLessThanOrEqual(5);
  });

  it('respects the threshold', () => {
    const a = computePHash(basePattern());
    const corpus = [{ id: 'far', phashHex: computePHash(differentPattern()) }];
    expect(findNearDuplicates(a, corpus, 5)).toEqual([]);
  });
});

describe('computeAHash / hammingDistanceHex', () => {
  it('aHash of an 8x8 gradient is a 16-hex string and self-distance is 0', () => {
    const img = Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => r * 8 + c * 4),
    );
    const hash = computeAHash(img);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hammingDistanceHex(hash, hash)).toBe(0);
  });

  it('counts differing bits across nibbles', () => {
    expect(hammingDistanceHex('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hammingDistanceHex('0000000000000000', '8000000000000000')).toBe(1);
  });
});
