import { describe, expect, it } from 'vitest';
import { formatINR, rupeesToPaise, splitByWeights } from '../src/money.js';

describe('money helpers', () => {
  it('converts rupees to integer paise', () => {
    expect(rupeesToPaise(888.89)).toBe(88889);
    expect(rupeesToPaise(2000)).toBe(200000);
    expect(rupeesToPaise(0.01)).toBe(1);
  });

  it('splits by largest remainder and sums exactly', () => {
    // Coupon 25000 over weights 125000 / 100000 -> 13889 / 11111.
    expect(splitByWeights(25000, [125000, 100000])).toEqual([13889, 11111]);
    expect(splitByWeights(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitByWeights(0, [5, 5])).toEqual([0, 0]);
    const parts = splitByWeights(99991, [3, 7, 11, 13]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(99991);
  });

  it('formats INR with Indian grouping', () => {
    expect(formatINR(88889)).toBe('₹888.89');
    expect(formatINR(111111)).toBe('₹1,111.11');
    expect(formatINR(200000)).toBe('₹2,000.00');
    expect(formatINR(123456789)).toBe('₹12,34,567.89');
    expect(formatINR(-7900)).toBe('-₹79.00');
    expect(formatINR(5)).toBe('₹0.05');
  });
});
