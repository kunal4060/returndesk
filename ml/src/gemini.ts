/**
 * Gemini semantic-consistency signal.
 *
 * Asks a vision model a narrow, checkable question about a return-evidence
 * photo: does the item in the photo match the claimed item, and does the
 * visible damage match the claimed damage? The structured verdict is
 * converted into a RiskSignal. This is an uncalibrated second opinion —
 * a vision LLM can be wrong about both questions — so it feeds review
 * priority only, like every other signal in this package.
 *
 * Without an API key the module runs in a clearly-labelled MOCK mode with
 * a deterministic verdict. It never pretends a mock was a real call, and
 * on any live-call failure it returns a null-score signal explaining the
 * failure instead of throwing or inventing a verdict.
 *
 * Security: the API key is used only as a request parameter to Google's
 * endpoint. It is never logged, never embedded in any returned object,
 * and never included in explanations.
 */
import { makeSignal, type RiskSignal } from './types.js';

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

export interface GeminiCheckOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export interface GeminiCheckResult {
  mode: 'mock' | 'live';
  verdict?: GeminiVerdict;
  signal: RiskSignal;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

export const MOCK_VERDICT: GeminiVerdict = {
  itemMatch: true,
  damageMatch: true,
  inconsistencies: [],
  aiLikelihoodNote: 'mock mode — not a real model call',
  confidence: 0,
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Convert a verdict into a signal. The score is a confidence-weighted
 * mismatch score: item mismatch weighs most (0.5), damage mismatch next
 * (0.3), plus 0.1 per listed inconsistency (capped at 0.2) — the total
 * scaled by the model's own confidence (defaulting to 0.5 when the
 * model did not supply one).
 */
export function geminiVerdictToSignal(
  verdict: GeminiVerdict,
  source: string,
  extraExplanation = '',
): RiskSignal {
  const confidence =
    typeof verdict.confidence === 'number' ? clamp01(verdict.confidence) : 0.5;
  let mismatch = 0;
  if (!verdict.itemMatch) mismatch += 0.5;
  if (!verdict.damageMatch) mismatch += 0.3;
  mismatch += Math.min(verdict.inconsistencies.length * 0.1, 0.2);
  const score = clamp01(mismatch * Math.max(confidence, mismatch > 0 ? 0.5 : 0));

  // When nothing mismatches the score is 0 regardless of confidence.
  const finalScore = mismatch === 0 ? 0 : score;

  const parts: string[] = [];
  parts.push(
    verdict.itemMatch
      ? 'Item in the photo matches the claimed item.'
      : 'Item in the photo does NOT match the claimed item.',
  );
  parts.push(
    verdict.damageMatch
      ? 'Visible damage matches the claimed damage.'
      : 'Visible damage does NOT match the claimed damage.',
  );
  if (verdict.inconsistencies.length > 0) {
    parts.push(`Inconsistencies: ${verdict.inconsistencies.join('; ')}`);
  }
  if (verdict.aiLikelihoodNote) {
    parts.push(`AI note: ${verdict.aiLikelihoodNote}`);
  }
  if (extraExplanation) parts.push(extraExplanation);

  return makeSignal({
    signal: 'gemini_semantic',
    score: finalScore,
    source,
    explanation: parts.join(' '),
  });
}

function failureSignal(reason: string): RiskSignal {
  return makeSignal({
    signal: 'gemini_semantic',
    score: null,
    source: 'gemini-semantic (LIVE, uncalibrated second opinion)',
    explanation: `Gemini semantic check failed (${reason}) — no verdict was produced and this check contributes no score. The case is unaffected and proceeds on its other signals.`,
  });
}

function buildPrompt(input: GeminiCheckInput): string {
  return [
    'You are checking a customer return-evidence photo for semantic consistency.',
    `Claimed item: ${input.claimedItem}`,
    `Claimed damage: ${input.claimedDamage}`,
    'Look at the attached photo and answer ONLY with a strict JSON object, no markdown fences, no extra text, in exactly this shape:',
    '{"itemMatch": boolean, "damageMatch": boolean, "inconsistencies": string[], "aiLikelihoodNote": string, "confidence": number}',
    'itemMatch = the item in the photo is the claimed item. damageMatch = the visible damage matches the claimed damage. inconsistencies = short factual mismatches you can see. aiLikelihoodNote = one short sentence on anything that looks generated or edited, or "nothing obvious". confidence = your 0..1 confidence in this verdict.',
  ].join('\n');
}

function parseVerdictText(text: string): GeminiVerdict {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<GeminiVerdict>;
  return {
    itemMatch: Boolean(parsed.itemMatch),
    damageMatch: Boolean(parsed.damageMatch),
    inconsistencies: Array.isArray(parsed.inconsistencies)
      ? parsed.inconsistencies.map((s) => String(s))
      : [],
    aiLikelihoodNote:
      typeof parsed.aiLikelihoodNote === 'string'
        ? parsed.aiLikelihoodNote
        : '',
    ...(typeof parsed.confidence === 'number'
      ? { confidence: parsed.confidence }
      : {}),
  };
}

export async function geminiSemanticCheck(
  input: GeminiCheckInput,
  opts: GeminiCheckOptions = {},
): Promise<GeminiCheckResult> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  const model =
    opts.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;

  if (!apiKey) {
    const verdict: GeminiVerdict = { ...MOCK_VERDICT };
    const signal = makeSignal({
      signal: 'gemini_semantic',
      score: null,
      source: 'gemini-semantic (MOCK — no API key configured)',
      explanation:
        'Mock mode — no Gemini API key is configured, so no model was called. Deterministic placeholder verdict (itemMatch=true, damageMatch=true, no inconsistencies) shown only so the UI can render the signal shape; it carries no score and no evidential weight.',
    });
    return { mode: 'mock', verdict, signal };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  // The key goes only into this request URL. It is never logged or returned.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          { text: buildPrompt(input) },
          {
            inline_data: {
              mime_type: input.mimeType,
              data: input.imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  };

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { mode: 'live', signal: failureSignal('network error') };
  }

  if (!response.ok) {
    return {
      mode: 'live',
      signal: failureSignal(`HTTP ${response.status}`),
    };
  }

  try {
    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return { mode: 'live', signal: failureSignal('empty model response') };
    }
    const verdict = parseVerdictText(text);
    const signal = geminiVerdictToSignal(
      verdict,
      'gemini-semantic (LIVE, uncalibrated second opinion)',
    );
    return { mode: 'live', verdict, signal };
  } catch {
    return {
      mode: 'live',
      signal: failureSignal('unparseable model response'),
    };
  }
}
