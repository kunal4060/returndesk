/**
 * Ambient types for @impactx/ml.
 *
 * The ML package's published types point at its dist/ build, which is
 * produced by that package's own build step. Until it exists, these
 * declarations describe the exact exports the frontend consumes (the
 * runtime still loads the real package source via the webpack alias in
 * next.config.ts — only type resolution is shimmed). Signatures mirror
 * ml/src: types.ts (RiskSignal), screen.ts, gemini.ts, onnxDetector.ts,
 * detectorTable.ts. If the package's dist/ types appear, this file can
 * be deleted and a tsconfig paths entry restored.
 */
declare module "@impactx/ml" {
  export type SignalKind =
    | "ai_detector"
    | "phash_duplicate"
    | "exif_conflict"
    | "c2pa_present"
    | "exact_duplicate"
    | "file_anomaly"
    | "gemini_semantic";

  export type SignalBand = "low" | "medium" | "high";

  export interface RiskSignal {
    signal: SignalKind;
    score: number | null;
    band: SignalBand;
    source: string;
    explanation: string;
    action: "review_priority_only";
  }

  export const HONESTY_NOTICE: string;
  export const ACCURACY_LABEL: string;
  export const ONNX_MODEL_ID: string;

  export interface DetectorScoreEntry {
    evidenceId: string;
    aiLikelihood: number;
    confidenceNote: string;
  }

  export interface DetectorTable {
    labelling: string;
    scores: DetectorScoreEntry[];
  }

  export function loadPrecomputedScores(path: string): DetectorTable;
  export function detectorSignal(evidenceId: string, table: DetectorTable): RiskSignal;

  export interface ScreenEvidenceInput {
    evidenceId?: string;
    exif?: unknown;
    phashHex?: string;
    sha256Hex?: string;
    c2paPresent?: boolean;
    corpus?: unknown;
    deliveredAtISO: string;
    photoClaimedOfDeliveredItem?: boolean;
    precomputedTable?: DetectorTable;
    geminiVerdict?: unknown;
    onnxSignal?: RiskSignal;
  }

  export interface ScreenEvidenceResult {
    signals: RiskSignal[];
    priorityScore: number;
    band: SignalBand;
    automatedDecision: null;
    outcome: "route_to_human_review";
  }

  export function screenEvidence(input: ScreenEvidenceInput): ScreenEvidenceResult;

  export interface GeminiVerdict {
    itemMatch: boolean;
    damageMatch: boolean;
    inconsistencies: string[];
    aiLikelihoodNote: string;
    confidence?: number;
  }

  export interface GeminiCheckInput {
    imageBase64: string;
    mimeType: string;
    claimedItem: string;
    claimedDamage: string;
  }

  export interface GeminiCheckResult {
    mode: "mock" | "live";
    verdict?: GeminiVerdict;
    signal: RiskSignal;
  }

  export function geminiSemanticCheck(
    input: GeminiCheckInput,
    opts?: { apiKey?: string; model?: string },
  ): Promise<GeminiCheckResult>;

  export interface OnnxDetectionResult {
    score: number;
    rawLabels: { label: string; score: number }[];
    modelId: string;
    accuracyLabel: string;
  }

  export function detectAiLikelihood(
    image: string | Blob | Uint8Array,
  ): Promise<OnnxDetectionResult>;

  export function createOnnxDetector(loadPipeline?: unknown): {
    detectAiLikelihood: (image: string | Blob | Uint8Array) => Promise<OnnxDetectionResult>;
  };

  export function onnxSignal(result: OnnxDetectionResult): RiskSignal;
  export function bandForScore(score: number | null): SignalBand;
}
