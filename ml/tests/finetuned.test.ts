import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  finetunedSignal,
  loadFinetunePredictions,
  loadFinetuneResults,
  type FinetuneResults,
} from '../src/finetuned.js';

const FIXTURE: FinetuneResults = {
  baseModel: 'prithivMLmods/Deep-Fake-Detector-v2-Model',
  nTrainImages: 69,
  nTrainBases: 23,
  nTest: 11,
  accuracy: 0.7272727272727273,
  perClass: {
    real: { precision: 0.75, recall: 0.6, f1: 0.6667, support: 5 },
    ai: { precision: 0.714, recall: 0.833, f1: 0.769, support: 6 },
  },
  confusionMatrix: [
    [3, 2],
    [1, 5],
  ],
  baseModelZeroShotAccuracy: 0.5454545454545454,
  splitRule: 'sort base ids; index % 3 == 2 -> test',
  trainedAt: '2026-10-24T00:00:00.000Z',
  runtimeSeconds: 42,
};

describe('finetunedSignal', () => {
  it('carries the measured accuracy text from a fixture results object', () => {
    const signal = finetunedSignal(0.87, FIXTURE);
    expect(signal.signal).toBe('finetuned_detector');
    expect(signal.score).toBe(0.87);
    expect(signal.source).toBe(
      'our fine-tune (experimental) — logistic head on frozen Deep-Fake-Detector-v2 ViT embeddings',
    );
    expect(signal.explanation).toContain('0.727');
    expect(signal.explanation).toContain('n=11');
    expect(signal.explanation).toContain('experimental');
    expect(signal.explanation.toLowerCase()).toContain(
      'small local dataset',
    );
    expect(signal.action).toBe('review_priority_only');
  });

  it('missing results -> null score, no fabricated numbers', () => {
    const signal = finetunedSignal(0.87, null);
    expect(signal.signal).toBe('finetuned_detector');
    expect(signal.score).toBeNull();
    expect(signal.explanation).toContain('unavailable');
    expect(signal.explanation).not.toContain('0.727');
    expect(signal.action).toBe('review_priority_only');
  });

  it('a failed run in results -> null score', () => {
    const signal = finetunedSignal(0.5, {
      ...FIXTURE,
      accuracy: null,
      error: 'RuntimeError: boom',
    });
    expect(signal.score).toBeNull();
    expect(signal.explanation).toContain('boom');
  });
});

describe('finetune loaders', () => {
  it('loads results and predictions from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'impactx-finetune-'));
    const resultsPath = join(dir, 'results.json');
    const predsPath = join(dir, 'predictions.json');
    writeFileSync(resultsPath, JSON.stringify(FIXTURE), 'utf8');
    writeFileSync(
      predsPath,
      JSON.stringify([
        { file: 'ai-03.jpg', base_id: 'ai-03', label: 'ai', finetunedAiScore: 0.91 },
      ]),
      'utf8',
    );
    const results = loadFinetuneResults(resultsPath);
    expect(results?.accuracy).toBe(FIXTURE.accuracy);
    expect(results?.nTest).toBe(11);
    const preds = loadFinetunePredictions(predsPath);
    expect(preds).toHaveLength(1);
    expect(preds[0]?.finetunedAiScore).toBe(0.91);
  });

  it('missing files -> null results and empty predictions, never throws', () => {
    expect(loadFinetuneResults('/no/such/results.json')).toBeNull();
    expect(loadFinetunePredictions('/no/such/predictions.json')).toEqual([]);
  });

  it('unparseable results -> null', () => {
    const dir = mkdtempSync(join(tmpdir(), 'impactx-finetune-'));
    const path = join(dir, 'results.json');
    writeFileSync(path, 'not json{', 'utf8');
    expect(loadFinetuneResults(path)).toBeNull();
  });
});
