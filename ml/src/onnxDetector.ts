/**
 * LIVE pretrained AI-image detector via @huggingface/transformers (ONNX).
 *
 * Model: onnx-community/Deep-Fake-Detector-v2-Model-ONNX — a ViT detector
 * loaded lazily on first use (the import and the model download are both
 * deferred, so importing this module is cheap and tests never download
 * anything: the pipeline loader is injectable).
 *
 * Honesty label (ACCURACY_LABEL below, Research 06 §1.1/§2): the model's
 * own ~92% figure is on its own test set. Independent audits of this
 * detector class show materially worse results on compressed real-world
 * photos, including double-digit false-flag rates on genuine photos.
 * Scores are uncalibrated probabilities from a research model — a triage
 * signal only, never a verdict.
 */
import { makeSignal, type RiskSignal } from './types.js';

export const ONNX_MODEL_ID =
  'onnx-community/Deep-Fake-Detector-v2-Model-ONNX';

export const ACCURACY_LABEL =
  'Pretrained open-source ViT detector (Deep-Fake-Detector-v2, ONNX). Reported ~92% on its own test set; independent audits of this detector class show materially worse results on compressed real-world photos, including double-digit false-flag rates on genuine photos. Scores are uncalibrated — triage signal only, never a verdict.';

export interface RawLabel {
  label: string;
  score: number;
}

export interface OnnxDetectionResult {
  /** Probability assigned to the AI / fake class, 0..1 (uncalibrated). */
  score: number;
  rawLabels: RawLabel[];
  modelId: string;
  accuracyLabel: string;
}

/** A callable image-classification pipeline: image in, label scores out. */
export type ImageClassificationPipeline = (
  image: string | Blob | Uint8Array,
) => Promise<RawLabel[]>;

const FAKE_LABEL_HINTS = [
  'fake',
  'ai',
  'generated',
  'synthetic',
  'deepfake',
  'deep-fake',
  'artificial',
  'manipulated',
];
const REAL_LABEL_HINTS = ['real', 'authentic', 'genuine', 'natural'];

/**
 * Identify the AI/fake-class probability from raw model labels,
 * defensively: model cards rename labels between revisions, so we match
 * on meaning rather than one exact string.
 * - A fake-ish label -> its score.
 * - Only a real-ish label -> 1 - its score.
 * - Generic LABEL_0 / LABEL_1 pair -> LABEL_1 (the positive class by the
 *   usual convention for this model family).
 * - Nothing recognised at all -> the top-scored label's score, as a last
 *   resort (documented fallback; the raw labels ride along on the result
 *   so a reviewer can see exactly what the model said).
 */
export function extractFakeScore(rawLabels: RawLabel[]): number {
  if (rawLabels.length === 0) return 0;
  const normalised = rawLabels.map((l) => ({
    label: l.label.toLowerCase(),
    score: l.score,
  }));

  const fake = normalised.find((l) =>
    FAKE_LABEL_HINTS.some((hint) => l.label.includes(hint)),
  );
  if (fake) return fake.score;

  const real = normalised.find((l) =>
    REAL_LABEL_HINTS.some((hint) => l.label.includes(hint)),
  );
  if (real) return 1 - real.score;

  const label1 = normalised.find((l) => l.label === 'label_1');
  if (label1) return label1.score;

  const top = [...normalised].sort((a, b) => b.score - a.score)[0];
  return top ? top.score : 0;
}

async function defaultLoadPipeline(): Promise<ImageClassificationPipeline> {
  // Lazy dynamic import: keeps this (large) dependency out of module load
  // and out of every test run. Typed loosely on purpose — the pipeline
  // surface we use is one call.
  const mod = (await import('@huggingface/transformers')) as unknown as {
    pipeline: (
      task: string,
      model: string,
    ) => Promise<(image: string | Blob | Uint8Array) => Promise<unknown>>;
  };
  const pipe = await mod.pipeline('image-classification', ONNX_MODEL_ID);
  return async (image: string | Blob | Uint8Array) => {
    const out = (await pipe(image)) as RawLabel[] | RawLabel;
    return Array.isArray(out) ? out : [out];
  };
}

export function createOnnxDetector(
  loadPipeline: () => Promise<ImageClassificationPipeline> = defaultLoadPipeline,
) {
  let cached: Promise<ImageClassificationPipeline> | null = null;

  async function detectAiLikelihood(
    image: string | Blob | Uint8Array,
  ): Promise<OnnxDetectionResult> {
    if (!cached) cached = loadPipeline();
    const pipeline = await cached;
    const rawLabels = await pipeline(image);
    return {
      score: extractFakeScore(rawLabels),
      rawLabels,
      modelId: ONNX_MODEL_ID,
      accuracyLabel: ACCURACY_LABEL,
    };
  }

  return { detectAiLikelihood };
}

const defaultDetector = createOnnxDetector();

export async function detectAiLikelihood(
  image: string | Blob | Uint8Array,
): Promise<OnnxDetectionResult> {
  return defaultDetector.detectAiLikelihood(image);
}

export function onnxSignal(result: OnnxDetectionResult): RiskSignal {
  return makeSignal({
    signal: 'ai_detector',
    score: result.score,
    source: `${result.modelId} — LIVE inference`,
    explanation: `Live ONNX detector AI likelihood ${result.score.toFixed(2)} (uncalibrated). Raw labels: ${result.rawLabels
      .map((l) => `${l.label}=${l.score.toFixed(3)}`)
      .join(', ')}. ${result.accuracyLabel}`,
  });
}
