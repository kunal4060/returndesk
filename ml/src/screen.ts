/**
 * screenEvidence — combine every available check into a review-priority
 * ordering for ONE piece of evidence.
 *
 * HARD RULE (product rule, Research 06 + build plan §6): the output never
 * contains an automated decision. `automatedDecision` is always null and
 * `outcome` is always 'route_to_human_review', regardless of how high
 * any individual score or the combined priority climbs. Signals only
 * reorder the human review queue.
 *
 * Priority combination — weights (documented, deliberate):
 * each firing signal contributes through a noisy-OR over weighted scores,
 *   priority = 1 - Π (1 - w_i * s_i)
 * so the strongest signal dominates (max-ish behaviour) while independent
 * corroborating signals still push priority up. Null scores contribute 0.
 * Weights reflect how conclusive a signal is when it fires:
 *   exact_duplicate 1.00 — byte-identical reuse is conclusive for reuse
 *   c2pa_present    1.00 — signed provenance, conclusive when present
 *   exif_conflict   0.95 — a logic contradiction, when EXIF exists
 *   phash_duplicate 0.90 — near-duplicate reuse, small collision chance
 *   ai_detector     0.60 — uncalibrated model / precomputed score
 *   gemini_semantic 0.60 — uncalibrated vision-LLM second opinion
 *   file_anomaly    0.40 — corroborating only
 */
import { checkExifConsistency, type ExifMeta } from './exif.js';
import { detectorSignal, type DetectorTable } from './detectorTable.js';
import { geminiVerdictToSignal, type GeminiVerdict } from './gemini.js';
import { findNearDuplicates, type PHashCorpusEntry } from './phash.js';
import {
  c2paSignal,
  exactDuplicateSignal,
  type ShaCorpusEntry,
} from './provenance.js';
import {
  bandForScore,
  makeSignal,
  type RiskSignal,
  type SignalBand,
  type SignalKind,
} from './types.js';

export const HONESTY_NOTICE =
  'Demo dataset: detector scores precomputed for this seeded evidence set; deterministic checks (duplicate hash, metadata, provenance) run live. Live model signals (ONNX detector, Gemini) are uncalibrated second opinions. No automated decision is made from these signals.';

const SIGNAL_WEIGHTS: Record<SignalKind, number> = {
  exact_duplicate: 1.0,
  c2pa_present: 1.0,
  exif_conflict: 0.95,
  phash_duplicate: 0.9,
  ai_detector: 0.6,
  gemini_semantic: 0.6,
  file_anomaly: 0.4,
};

export interface CorpusEntry {
  id: string;
  phashHex?: string;
  sha256Hex?: string;
  hash?: string;
}

export type ScreenCorpus =
  | CorpusEntry[]
  | {
      entries?: CorpusEntry[];
      phashCorpus?: PHashCorpusEntry[];
      shaCorpus?: ShaCorpusEntry[];
    };

export interface ScreenEvidenceInput {
  evidenceId?: string;
  /** EXIF extracted from the evidence file (or null/absent metadata). */
  exif?: ExifMeta | null;
  phashHex?: string;
  sha256Hex?: string;
  c2paPresent?: boolean;
  corpus?: ScreenCorpus;
  deliveredAtISO: string;
  photoClaimedOfDeliveredItem?: boolean;
  precomputedTable?: DetectorTable;
  /** A plain Gemini verdict, a {verdict} wrapper, or a ready RiskSignal. */
  geminiVerdict?:
    | GeminiVerdict
    | { verdict: GeminiVerdict }
    | RiskSignal;
  /** Optional live ONNX signal, if the caller already ran the detector. */
  onnxSignal?: RiskSignal;
}

export interface ScreenEvidenceResult {
  signals: RiskSignal[];
  priorityScore: number;
  band: SignalBand;
  automatedDecision: null;
  outcome: 'route_to_human_review';
}

function normaliseCorpus(corpus: ScreenCorpus | undefined): {
  phashCorpus: PHashCorpusEntry[];
  shaCorpus: ShaCorpusEntry[];
} {
  if (!corpus) return { phashCorpus: [], shaCorpus: [] };
  if (Array.isArray(corpus)) {
    return {
      phashCorpus: corpus
        .filter((e): e is CorpusEntry & { phashHex: string } =>
          Boolean(e.phashHex),
        )
        .map((e) => ({ id: e.id, phashHex: e.phashHex })),
      shaCorpus: corpus.filter((e) => Boolean(e.sha256Hex ?? e.hash)),
    };
  }
  const entries = corpus.entries ?? [];
  return {
    phashCorpus: [
      ...(corpus.phashCorpus ?? []),
      ...entries
        .filter((e): e is CorpusEntry & { phashHex: string } =>
          Boolean(e.phashHex),
        )
        .map((e) => ({ id: e.id, phashHex: e.phashHex })),
    ],
    shaCorpus: [
      ...(corpus.shaCorpus ?? []),
      ...entries.filter((e) => Boolean(e.sha256Hex ?? e.hash)),
    ],
  };
}

function isRiskSignal(value: unknown): value is RiskSignal {
  return (
    typeof value === 'object' &&
    value !== null &&
    'signal' in value &&
    'action' in value
  );
}

export function screenEvidence(
  input: ScreenEvidenceInput,
): ScreenEvidenceResult {
  const signals: RiskSignal[] = [];
  const { phashCorpus, shaCorpus } = normaliseCorpus(input.corpus);
  const claimed = input.photoClaimedOfDeliveredItem ?? true;

  // --- Deterministic checks (computed live) ---

  if (input.phashHex && phashCorpus.length > 0) {
    // Exclude a corpus entry that is this very evidence item.
    const others = input.evidenceId
      ? phashCorpus.filter((e) => e.id !== input.evidenceId)
      : phashCorpus;
    const matches = findNearDuplicates(input.phashHex, others, 5);
    const best = matches[0];
    if (best) {
      const score = Math.max(0.6, 0.97 - best.distance * 0.05);
      signals.push(
        makeSignal({
          signal: 'phash_duplicate',
          score,
          source: 'phash-near-duplicate-search',
          explanation: `Perceptual-hash near-duplicate of evidence "${best.id}" (Hamming distance ${best.distance}/64, threshold 5) — the same or a re-saved version of a photo already submitted. Reused evidence photos are hard to explain innocently, but a human must confirm the match.`,
        }),
      );
    }
  }

  if (input.sha256Hex && shaCorpus.length > 0) {
    const others = input.evidenceId
      ? shaCorpus.filter((e) => e.id !== input.evidenceId)
      : shaCorpus;
    const signal = exactDuplicateSignal(input.sha256Hex, others);
    if (signal) signals.push(signal);
  }

  const exifSignal = checkExifConsistency(input.exif ?? null, {
    deliveredAtISO: input.deliveredAtISO,
    photoClaimedOfDeliveredItem: claimed,
  });
  if (exifSignal) signals.push(exifSignal);

  if (typeof input.c2paPresent === 'boolean') {
    signals.push(c2paSignal(input.c2paPresent));
  }

  // --- Model signals (precomputed and/or live second opinions) ---

  if (input.precomputedTable && input.evidenceId) {
    signals.push(detectorSignal(input.evidenceId, input.precomputedTable));
  }

  if (input.onnxSignal) {
    signals.push(input.onnxSignal);
  }

  if (input.geminiVerdict) {
    if (isRiskSignal(input.geminiVerdict)) {
      signals.push(input.geminiVerdict);
    } else {
      const verdict =
        'verdict' in input.geminiVerdict
          ? input.geminiVerdict.verdict
          : input.geminiVerdict;
      signals.push(
        geminiVerdictToSignal(
          verdict,
          'gemini-semantic (LIVE, uncalibrated second opinion)',
        ),
      );
    }
  }

  // --- Priority: weighted noisy-OR (see weights documented above) ---
  let survival = 1;
  for (const signal of signals) {
    if (signal.score === null) continue;
    const weight = SIGNAL_WEIGHTS[signal.signal] ?? 0.5;
    survival *= 1 - weight * Math.min(1, Math.max(0, signal.score));
  }
  const priorityScore = Math.min(1, Math.max(0, 1 - survival));

  return {
    signals,
    priorityScore,
    band: bandForScore(priorityScore),
    automatedDecision: null,
    outcome: 'route_to_human_review',
  };
}
