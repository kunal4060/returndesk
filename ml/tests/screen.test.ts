import { describe, expect, it } from 'vitest';
import type { DetectorTable } from '../src/detectorTable.js';
import { HONESTY_NOTICE, screenEvidence } from '../src/screen.js';
import type { GeminiVerdict } from '../src/gemini.js';

/** Recursively collect every key in an object graph. */
function allKeys(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, acc);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      acc.push(k);
      allKeys(v, acc);
    }
  }
  return acc;
}

/** Recursively assert no key matching the pattern carries a truthy value. */
function expectNoTruthyKeyMatching(value: unknown, pattern: RegExp): void {
  if (Array.isArray(value)) {
    for (const item of value) expectNoTruthyKeyMatching(item, pattern);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (pattern.test(k)) {
        expect(v, `key "${k}" must never be truthy`).toBeFalsy();
      }
      expectNoTruthyKeyMatching(v, pattern);
    }
  }
}

const TABLE: DetectorTable = {
  labelling:
    'PRECOMPUTED (seeded set): scores computed before the event, not live inference.',
  scores: [
    {
      evidenceId: 'ev-worst',
      aiLikelihood: 0.99,
      confidenceNote: 'Seeded worst-case score.',
    },
  ],
};

describe('screenEvidence — NO-AUTO-CANCEL, worst case on every channel', () => {
  it('still routes to human review with automatedDecision null', () => {
    const sharedHash = 'ab'.repeat(32);
    const sharedPHash = '0123456789abcdef';
    const geminiVerdict: GeminiVerdict = {
      itemMatch: false,
      damageMatch: false,
      inconsistencies: ['Wrong item entirely', 'No damage visible'],
      aiLikelihoodNote: 'Looks fully generated',
      confidence: 1,
    };

    const result = screenEvidence({
      evidenceId: 'ev-worst',
      exif: {
        dateTimeOriginal: '2026:01:01 08:00:00',
        model: 'TestCam X100',
      },
      phashHex: sharedPHash,
      sha256Hex: sharedHash,
      c2paPresent: true,
      corpus: [
        {
          id: 'order-999-other-customer',
          phashHex: sharedPHash,
          sha256Hex: sharedHash,
        },
      ],
      deliveredAtISO: '2026-01-20T10:00:00.000Z',
      photoClaimedOfDeliveredItem: true,
      precomputedTable: TABLE,
      geminiVerdict,
    });

    // Every deterministic + model channel fired.
    const kinds = result.signals.map((s) => s.signal);
    expect(kinds).toContain('phash_duplicate');
    expect(kinds).toContain('exact_duplicate');
    expect(kinds).toContain('exif_conflict');
    expect(kinds).toContain('c2pa_present');
    expect(kinds).toContain('ai_detector');
    expect(kinds).toContain('gemini_semantic');
    expect(result.priorityScore).toBeGreaterThan(0.9);
    expect(result.band).toBe('high');

    // …and still: no automated decision, human review, review-only actions.
    expect(result.outcome).toBe('route_to_human_review');
    expect(result.automatedDecision).toBeNull();
    for (const signal of result.signals) {
      expect(signal.action).toBe('review_priority_only');
    }
    expectNoTruthyKeyMatching(result, /cancel|deny|reject/i);
    const keys = allKeys(result);
    expect(keys).not.toContain('decision');
  });
});

describe('screenEvidence — quiet case', () => {
  it('a clean evidence item gets low priority but the same outcome', () => {
    const result = screenEvidence({
      evidenceId: 'ev-clean',
      exif: { dateTimeOriginal: '2026:01:21 09:00:00', model: 'PhoneCam' },
      phashHex: 'ffffffffffffffff',
      sha256Hex: 'cd'.repeat(32),
      c2paPresent: false,
      corpus: [
        {
          id: 'someone-else',
          phashHex: '0000000000000000',
          sha256Hex: 'ef'.repeat(32),
        },
      ],
      deliveredAtISO: '2026-01-20T10:00:00.000Z',
      photoClaimedOfDeliveredItem: true,
    });
    expect(result.outcome).toBe('route_to_human_review');
    expect(result.automatedDecision).toBeNull();
    expect(result.priorityScore).toBe(0);
    expect(result.band).toBe('low');
    // The only signal is the C2PA-absence note (null score, no information).
    expect(result.signals.every((s) => s.score === null || s.score === 0)).toBe(
      true,
    );
  });

  it('absent EXIF contributes a zero-score signal, not suspicion', () => {
    const result = screenEvidence({
      exif: null,
      deliveredAtISO: '2026-01-20T10:00:00.000Z',
    });
    const exifSignal = result.signals.find((s) => s.signal === 'exif_conflict');
    expect(exifSignal?.score).toBe(0);
    expect(result.priorityScore).toBe(0);
  });

  it('accepts a ready-made gemini RiskSignal passthrough', () => {
    const result = screenEvidence({
      deliveredAtISO: '2026-01-20T10:00:00.000Z',
      geminiVerdict: {
        signal: 'gemini_semantic',
        score: 0.5,
        band: 'medium',
        source: 'gemini-semantic (LIVE, uncalibrated second opinion)',
        explanation: 'prebuilt',
        action: 'review_priority_only',
      },
    });
    expect(result.signals.some((s) => s.signal === 'gemini_semantic')).toBe(
      true,
    );
    expect(result.outcome).toBe('route_to_human_review');
  });
});

describe('HONESTY_NOTICE', () => {
  it('states what is precomputed, what runs live, and the no-decision rule', () => {
    expect(HONESTY_NOTICE).toContain('precomputed');
    expect(HONESTY_NOTICE).toContain('run live');
    expect(HONESTY_NOTICE).toContain(
      'No automated decision is made from these signals.',
    );
  });
});
