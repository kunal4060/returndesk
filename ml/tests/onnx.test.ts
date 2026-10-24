import { describe, expect, it } from 'vitest';
import {
  ACCURACY_LABEL,
  createOnnxDetector,
  extractFakeScore,
  onnxSignal,
  ONNX_MODEL_ID,
} from '../src/onnxDetector.js';

describe('extractFakeScore', () => {
  it('picks the Fake label score', () => {
    expect(
      extractFakeScore([
        { label: 'Real', score: 0.13 },
        { label: 'Fake', score: 0.87 },
      ]),
    ).toBe(0.87);
  });

  it('derives the fake score from a Real-only style output', () => {
    expect(extractFakeScore([{ label: 'real', score: 0.9 }])).toBeCloseTo(0.1);
  });

  it('recognises AI-generated phrasing', () => {
    expect(
      extractFakeScore([
        { label: 'ai-generated', score: 0.72 },
        { label: 'authentic', score: 0.28 },
      ]),
    ).toBe(0.72);
  });

  it('falls back to LABEL_1 for generic labels', () => {
    expect(
      extractFakeScore([
        { label: 'LABEL_0', score: 0.2 },
        { label: 'LABEL_1', score: 0.8 },
      ]),
    ).toBe(0.8);
  });

  it('returns 0 for no labels', () => {
    expect(extractFakeScore([])).toBe(0);
  });
});

describe('createOnnxDetector (injected fake pipeline — no model download)', () => {
  it('runs the injected pipeline and maps its output', async () => {
    const detector = createOnnxDetector(async () => {
      return async () => [
        { label: 'Fake', score: 0.91 },
        { label: 'Real', score: 0.09 },
      ];
    });
    const result = await detector.detectAiLikelihood('fake-image-ref');
    expect(result.score).toBe(0.91);
    expect(result.modelId).toBe(ONNX_MODEL_ID);
    expect(result.accuracyLabel).toBe(ACCURACY_LABEL);
    expect(result.rawLabels).toHaveLength(2);
  });

  it('only loads the pipeline once across calls', async () => {
    let loads = 0;
    const detector = createOnnxDetector(async () => {
      loads += 1;
      return async () => [{ label: 'Real', score: 0.99 }];
    });
    await detector.detectAiLikelihood('a');
    await detector.detectAiLikelihood('b');
    expect(loads).toBe(1);
  });
});

describe('onnxSignal', () => {
  it('maps a result to a LIVE ai_detector signal with the accuracy label', () => {
    const signal = onnxSignal({
      score: 0.91,
      rawLabels: [{ label: 'Fake', score: 0.91 }],
      modelId: ONNX_MODEL_ID,
      accuracyLabel: ACCURACY_LABEL,
    });
    expect(signal.signal).toBe('ai_detector');
    expect(signal.score).toBe(0.91);
    expect(signal.band).toBe('high');
    expect(signal.source).toBe(`${ONNX_MODEL_ID} — LIVE inference`);
    expect(signal.explanation).toContain(ACCURACY_LABEL);
    expect(signal.action).toBe('review_priority_only');
  });

  it('accuracy label discloses the false-flag risk', () => {
    expect(ACCURACY_LABEL).toContain('false-flag');
    expect(ACCURACY_LABEL).toContain('never a verdict');
  });
});
