/**
 * Our fine-tune (EXPERIMENTAL) — an additional signal, never the primary
 * detector.
 *
 * A logistic-regression head trained on frozen Deep-Fake-Detector-v2 ViT
 * embeddings over a small local labelled dataset (see
 * dataset/finetune/ and ml/finetune/finetune.py). The pretrained model
 * remains the primary live detector; this head is a clearly-labelled
 * experimental extra.
 *
 * Honesty rules, same as every other module in this package:
 * - The explanation quotes the MEASURED held-out accuracy and test n
 *   read from ml/finetune/results.json — numbers are never hardcoded
 *   or fabricated here.
 * - If results are missing/unparseable (an explicit null), the signal
 *   factory returns a null-score signal explaining that, instead of
 *   inventing metrics.
 * - The signal can only reorder a human review queue: its action is
 *   always 'review_priority_only'.
 */
import { readFileSync } from 'node:fs';
import { makeSignal, type RiskSignal } from './types.js';

export interface FinetunePerClass {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface FinetuneResults {
  baseModel: string | null;
  nTrainImages: number;
  nTrainBases: number;
  nTest: number;
  accuracy: number | null;
  perClass: { real: FinetunePerClass; ai: FinetunePerClass } | null;
  confusionMatrix: number[][] | null;
  baseModelZeroShotAccuracy: number | null;
  splitRule: string;
  trainedAt: string;
  runtimeSeconds: number | null;
  error?: string;
}

export interface FinetunePrediction {
  file: string;
  base_id: string;
  label: string;
  finetunedAiScore: number;
}

export const FINETUNED_SOURCE =
  'our fine-tune (experimental) — logistic head on frozen Deep-Fake-Detector-v2 ViT embeddings';

/**
 * Load ml/finetune/results.json. Returns null when the file is missing
 * or unparseable — callers must not fabricate metrics in that case.
 */
export function loadFinetuneResults(path: string): FinetuneResults | null {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<FinetuneResults>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      baseModel:
        typeof parsed.baseModel === 'string' ? parsed.baseModel : null,
      nTrainImages:
        typeof parsed.nTrainImages === 'number' ? parsed.nTrainImages : 0,
      nTrainBases:
        typeof parsed.nTrainBases === 'number' ? parsed.nTrainBases : 0,
      nTest: typeof parsed.nTest === 'number' ? parsed.nTest : 0,
      accuracy: typeof parsed.accuracy === 'number' ? parsed.accuracy : null,
      perClass: (parsed.perClass as FinetuneResults['perClass']) ?? null,
      confusionMatrix: Array.isArray(parsed.confusionMatrix)
        ? parsed.confusionMatrix
        : null,
      baseModelZeroShotAccuracy:
        typeof parsed.baseModelZeroShotAccuracy === 'number'
          ? parsed.baseModelZeroShotAccuracy
          : null,
      splitRule: typeof parsed.splitRule === 'string' ? parsed.splitRule : '',
      trainedAt: typeof parsed.trainedAt === 'string' ? parsed.trainedAt : '',
      runtimeSeconds:
        typeof parsed.runtimeSeconds === 'number'
          ? parsed.runtimeSeconds
          : null,
      ...(typeof parsed.error === 'string' ? { error: parsed.error } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Load ml/finetune/predictions.json (per-test-image fine-tuned scores).
 * Returns an empty array when the file is missing or unparseable.
 */
export function loadFinetunePredictions(path: string): FinetunePrediction[] {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is FinetunePrediction =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as FinetunePrediction).file === 'string' &&
        typeof (p as FinetunePrediction).finetunedAiScore === 'number',
    );
  } catch {
    return [];
  }
}

/**
 * Build the experimental fine-tune signal.
 *
 * - `results === null`: the results file was missing/unparseable (or the
 *   run failed) — returns a null-score signal explaining that; no
 *   numbers are fabricated.
 * - `results === undefined`: no results were loaded by the caller —
 *   the supplied score is preserved, but the explanation states that
 *   held-out metrics were not loaded and fabricates none.
 * - otherwise: the explanation quotes the measured held-out accuracy
 *   and test n from the results object.
 */
export function finetunedSignal(
  score: number | null,
  results?: FinetuneResults | null,
): RiskSignal {
  if (results === null) {
    return makeSignal({
      signal: 'finetuned_detector',
      score: null,
      source: FINETUNED_SOURCE,
      explanation:
        'Our fine-tune (experimental) results are unavailable — ml/finetune/results.json is missing or unparseable, so no measured held-out accuracy can be quoted and this check contributes no score. Experimental — small local dataset.',
    });
  }
  if (results && (typeof results.accuracy !== 'number' || results.error)) {
    return makeSignal({
      signal: 'finetuned_detector',
      score: null,
      source: FINETUNED_SOURCE,
      explanation: `Our fine-tune (experimental) run did not produce usable metrics${results.error ? ` (${results.error})` : ''} — this check contributes no score and no accuracy is quoted. Experimental — small local dataset.`,
    });
  }
  if (!results) {
    return makeSignal({
      signal: 'finetuned_detector',
      score,
      source: FINETUNED_SOURCE,
      explanation: `Our fine-tune (experimental) AI score ${score === null ? 'unavailable' : score.toFixed(2)}. Held-out metrics were not loaded with this signal, so no accuracy is quoted. Experimental — small local dataset; this signal only reorders the human review queue.`,
    });
  }
  if (typeof results.accuracy !== 'number') {
    return makeSignal({
      signal: 'finetuned_detector',
      score: null,
      source: FINETUNED_SOURCE,
      explanation:
        'Our fine-tune (experimental) results carry no measured accuracy — this check contributes no score and no accuracy is quoted. Experimental — small local dataset.',
    });
  }
  const accuracy: number = results.accuracy;
  return makeSignal({
    signal: 'finetuned_detector',
    score,
    source: FINETUNED_SOURCE,
    explanation: `Our fine-tune (experimental) AI score ${score === null ? 'unavailable' : score.toFixed(2)} from a logistic head on frozen ${results.baseModel ?? 'ViT'} embeddings. Measured held-out accuracy ${accuracy.toFixed(3)} on n=${results.nTest} test originals (split by base image). Experimental — small local dataset, so this accuracy has a wide confidence interval; this signal only reorders the human review queue.`,
  });
}
