import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  detectorSignal,
  loadPrecomputedScores,
  type DetectorTable,
} from '../src/detectorTable.js';

const FIXTURE: DetectorTable = {
  labelling:
    'PRECOMPUTED (seeded set): scores computed before the event, not live inference.',
  scores: [
    {
      evidenceId: 'ev-ai-damage',
      aiLikelihood: 0.93,
      confidenceNote: 'Uncalibrated score.',
    },
    {
      evidenceId: 'ev-real-lowlight',
      aiLikelihood: 0.61,
      confidenceNote: 'Known false-flag risk on compressed photos.',
    },
  ],
};

describe('detectorTable', () => {
  it('loads a table from disk and builds a signal that discloses precomputation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'impactx-ml-'));
    const path = join(dir, 'detector-scores.json');
    writeFileSync(path, JSON.stringify(FIXTURE), 'utf8');

    const table = loadPrecomputedScores(path);
    expect(table.labelling).toContain('PRECOMPUTED');

    const signal = detectorSignal('ev-ai-damage', table);
    expect(signal.signal).toBe('ai_detector');
    expect(signal.score).toBe(0.93);
    expect(signal.source).toBe('precomputed-detector-table (seeded set)');
    expect(signal.explanation).toContain('precomputed');
    expect(signal.explanation).toContain('not live inference');
    expect(signal.explanation).toContain(FIXTURE.labelling);
    expect(signal.action).toBe('review_priority_only');
  });

  it('returns a null-score signal for an evidence id outside the seeded set', () => {
    const signal = detectorSignal('ev-unknown', FIXTURE);
    expect(signal.score).toBeNull();
    expect(signal.explanation).toContain('precomputed');
  });

  it('loads the real seeded dataset file when it exists', () => {
    const candidates = [
      fileURLToPath(new URL('../../dataset/detector-scores.json', import.meta.url)),
      fileURLToPath(new URL('../dataset/detector-scores.json', import.meta.url)),
    ];
    const realPath = candidates.find((p) => existsSync(p));
    if (!realPath) {
      // Dataset not seeded yet — the inline fixture above covers the logic.
      expect(realPath).toBeUndefined();
      return;
    }
    const table = loadPrecomputedScores(realPath);
    expect(Array.isArray(table.scores)).toBe(true);
    expect(typeof table.labelling).toBe('string');
    if (table.scores.length > 0) {
      const first = table.scores[0];
      if (first) {
        const signal = detectorSignal(first.evidenceId, table);
        expect(signal.explanation.toLowerCase()).toContain('precomputed');
      }
    }
  });
});
