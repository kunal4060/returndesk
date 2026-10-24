/**
 * Shared risk-signal schema (Research 06, §4).
 *
 * Every screening check in this package emits this shape so deterministic
 * checks, precomputed detector scores, a live ONNX detector and a Gemini
 * semantic check can be mixed without changing the product surface.
 *
 * `action` is ALWAYS the literal 'review_priority_only': a signal may only
 * change where a case sits in a human review queue. There is deliberately
 * no variant of this type that carries an automated decision.
 */
export type SignalKind =
  | 'ai_detector'
  | 'phash_duplicate'
  | 'exif_conflict'
  | 'c2pa_present'
  | 'exact_duplicate'
  | 'file_anomaly'
  | 'finetuned_detector'
  | 'gemini_semantic';

export type SignalBand = 'low' | 'medium' | 'high';

export interface RiskSignal {
  signal: SignalKind;
  /** 0..1, or null when the check yields no information (absence is not evidence). */
  score: number | null;
  band: SignalBand;
  /** Model name + version, rule id, or labelled data source. */
  source: string;
  /** Human-readable reason shown to the reviewer. */
  explanation: string;
  action: 'review_priority_only';
}

/** Map a numeric score to a band. Null (no information) is always 'low'. */
export function bandForScore(score: number | null): SignalBand {
  if (score === null || Number.isNaN(score)) return 'low';
  if (score >= 0.7) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
}

export function makeSignal(input: {
  signal: SignalKind;
  score: number | null;
  source: string;
  explanation: string;
  band?: SignalBand;
}): RiskSignal {
  const score =
    input.score === null ? null : Math.min(1, Math.max(0, input.score));
  return {
    signal: input.signal,
    score,
    band: input.band ?? bandForScore(score),
    source: input.source,
    explanation: input.explanation,
    action: 'review_priority_only',
  };
}
