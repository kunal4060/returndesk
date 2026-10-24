import { describe, expect, it } from 'vitest';
import {
  c2paSignal,
  findExactDuplicate,
  hasC2PA,
  sha256Hex,
} from '../src/provenance.js';

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('sha256Hex + findExactDuplicate', () => {
  it('hashes deterministically and matches the same bytes in a corpus', () => {
    const file = bytesOf('evidence-photo-bytes');
    const hash = sha256Hex(file);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(file)).toBe(hash);

    const corpus = [
      { id: 'other', sha256Hex: sha256Hex(bytesOf('something else')) },
      { id: 'first-submission', sha256Hex: hash },
    ];
    const matches = findExactDuplicate(hash, corpus);
    expect(matches).toEqual([{ id: 'first-submission', sha256Hex: hash }]);
  });

  it('returns no match for a different hash', () => {
    const corpus = [{ id: 'a', sha256Hex: sha256Hex(bytesOf('a')) }];
    expect(findExactDuplicate(sha256Hex(bytesOf('b')), corpus)).toEqual([]);
  });
});

describe('hasC2PA', () => {
  it('detects a synthetic JPEG carrying a c2pa marker segment', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe2, 0x00, 0x10,
      ...bytesOf('c2pa-manifest!'),
      0xff, 0xd9,
    ]);
    expect(hasC2PA(jpeg)).toBe(true);
  });

  it('detects the contentcredentials identifier', () => {
    expect(hasC2PA(bytesOf('xx ContentCredentials xx'))).toBe(true);
  });

  it('returns false for plain bytes', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 1, 2, 3]);
    expect(hasC2PA(jpeg)).toBe(false);
    expect(hasC2PA(new Uint8Array([]))).toBe(false);
  });
});

describe('c2paSignal', () => {
  it('present -> high score, near-conclusive wording', () => {
    const s = c2paSignal(true);
    expect(s.signal).toBe('c2pa_present');
    expect(s.score).toBe(0.95);
    expect(s.band).toBe('high');
    expect(s.explanation).toContain('near-conclusive when present');
    expect(s.action).toBe('review_priority_only');
  });

  it('absent -> null score, absence proves nothing', () => {
    const s = c2paSignal(false);
    expect(s.score).toBeNull();
    expect(s.explanation).toContain('absence proves nothing');
  });
});
