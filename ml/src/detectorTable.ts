/**
 * Precomputed detector scores for the seeded evidence set (Option C in
 * Research 06, §4 — the demo backbone).
 *
 * The detector scores in the dataset file were computed before the event
 * (or assigned by hand for the seeded set). They are NOT live inference.
 * Every signal built from this table says so, via the dataset's own
 * `labelling` string, so a reviewer can never mistake a seeded score for
 * a model that just ran.
 */
import { readFileSync } from 'node:fs';
import { makeSignal, type RiskSignal } from './types.js';

export interface DetectorScoreEntry {
  evidenceId: string;
  aiLikelihood: number;
  confidenceNote: string;
}

export interface DetectorTable {
  labelling: string;
  scores: DetectorScoreEntry[];
}

export function loadPrecomputedScores(path: string): DetectorTable {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as Partial<DetectorTable>;
  return {
    labelling:
      typeof parsed.labelling === 'string'
        ? parsed.labelling
        : 'Detector scores precomputed for the seeded evidence set.',
    scores: Array.isArray(parsed.scores) ? parsed.scores : [],
  };
}

export function detectorSignal(
  evidenceId: string,
  table: DetectorTable,
): RiskSignal {
  const entry = table.scores.find((s) => s.evidenceId === evidenceId);
  if (!entry) {
    return makeSignal({
      signal: 'ai_detector',
      score: null,
      source: 'precomputed-detector-table (seeded set)',
      explanation: `No precomputed detector score exists for evidence "${evidenceId}" in the seeded set — this check contributes no information for this item. Dataset labelling: ${table.labelling}`,
    });
  }
  return makeSignal({
    signal: 'ai_detector',
    score: entry.aiLikelihood,
    source: 'precomputed-detector-table (seeded set)',
    explanation: `Precomputed detector AI likelihood ${entry.aiLikelihood.toFixed(2)} for evidence "${evidenceId}". ${entry.confidenceNote} Labelling: ${table.labelling} These scores are precomputed for the seeded set, not live inference.`,
  });
}
