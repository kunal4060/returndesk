# @impactx/ml — evidence screening for IMPACTX 2026, Challenge 15

Screening signals for customer-submitted return-evidence photos. Every
check in this package emits the shared `RiskSignal` shape from Research 06:

```ts
{
  signal: 'ai_detector' | 'phash_duplicate' | 'exif_conflict' | 'c2pa_present'
        | 'exact_duplicate' | 'file_anomaly' | 'gemini_semantic',
  score: number | null,          // 0..1, or null = "no information"
  band: 'low' | 'medium' | 'high',
  source: string,                // model / rule / labelled data source
  explanation: string,           // shown verbatim to the human reviewer
  action: 'review_priority_only' // ALWAYS this literal
}
```

## The one rule

**No code path in this package — or in anything built on it — runs from a
score to a cancelled, denied or rejected refund.** Signals only reorder a
human review queue. `screenEvidence()` returns
`automatedDecision: null` and `outcome: 'route_to_human_review'` for every
input, including the worst case on every channel (a test proves this).
Why: independent audits (NewsGuard, May 2026) found leading AI detectors
collectively flagging 13.33% of *real* photos as AI-generated, and JPEG
compression pushing fake-detection accuracy toward zero — auto-deciding
on these scores would punish honest customers at a double-digit rate and
still miss real fakes.

Reviewer-facing honesty notice (exported as `HONESTY_NOTICE`):

> Demo dataset: detector scores precomputed for this seeded evidence set;
> deterministic checks (duplicate hash, metadata, provenance) run live.
> Live model signals (ONNX detector, Gemini) are uncalibrated second
> opinions. No automated decision is made from these signals.

## What runs live vs precomputed

| Module | Signal(s) | Live or precomputed |
|---|---|---|
| `phash.ts` | `phash_duplicate` | **Live**, computed from pixels in code |
| `exif.ts` | `exif_conflict` | **Live**, parsed from the file in code |
| `provenance.ts` | `exact_duplicate`, `c2pa_present` | **Live**, computed from bytes in code |
| `detectorTable.ts` | `ai_detector` | **Precomputed** for the seeded evidence set; every explanation says so and quotes the dataset's own `labelling` |
| `onnxDetector.ts` | `ai_detector` | **Live inference**, on demand only (lazy model download) |
| `gemini.ts` | `gemini_semantic` | **Live API call** when a key is configured; clearly-labelled **MOCK** otherwise |
| `screen.ts` | — (combiner) | Combines whatever signals are supplied |

## Modules

### `phash.ts` — perceptual hash duplicate search
`computePHash(gray32)` takes a 32×32 grayscale matrix, runs a separable
DCT-II, takes the low-frequency 8×8 block, thresholds by its median
(excluding the DC coefficient) → 64-bit hash as 16 hex chars.
`computeAHash(gray8)`, `hammingDistanceHex(a, b)`,
`findNearDuplicates(hash, corpus, threshold = 5)`.

Catches the classic evidence-fraud pattern: the same "damaged item" photo
reused across orders, including re-saves/re-encodes.
**Limits:** misses crops, rotations, flips, overlays and screenshots /
photos of the photo; photos of the same product model on similar
backgrounds can collide at loose thresholds — hence threshold 5 and
human confirmation.

### `exif.ts` — EXIF timeline consistency
`parseExif(bytes)` is a minimal JPEG parser (APP1 `Exif\0\0`, TIFF in both
endiannesses, IFD0 tag `0x0110` Model, ExifIFD via `0x8769` → tag
`0x9003` DateTimeOriginal). It never throws on malformed input.
`checkExifConsistency(meta, { deliveredAtISO, photoClaimedOfDeliveredItem })`:

- EXIF datetime **before** delivery, photo claimed to be of the delivered
  item → `exif_conflict`, score 0.9 — a logic contradiction, not a guess.
- No EXIF → score **0** signal: *"No EXIF metadata — contributes zero:
  messaging platforms strip EXIF from honest uploads too."* Absence is
  never treated as suspicious.

### `provenance.ts` — exact duplicates + C2PA
`sha256Hex(bytes)` (node:crypto), `findExactDuplicate(hash, corpus)`,
`hasC2PA(bytes)` (scans JPEG bytes case-insensitively for `c2pa` /
`contentcredentials` markers — presence only, no signature validation),
`c2paSignal(present)`:

- Present → score 0.95, "near-conclusive when present".
- Absent → score `null`, "absence proves nothing" (most generators don't
  sign; one re-save strips it).

### `detectorTable.ts` — precomputed detector scores (demo backbone)
`loadPrecomputedScores(path)` reads the seeded dataset's
`detector-scores.json` (`{ labelling, scores: [{ evidenceId, aiLikelihood,
confidenceNote }] }`). `detectorSignal(evidenceId, table)` builds an
`ai_detector` signal whose `source` is
`precomputed-detector-table (seeded set)` and whose explanation includes
the dataset's `labelling` and states the scores are **precomputed for the
seeded set, not live inference**.

### `onnxDetector.ts` — LIVE pretrained detector
Uses `@huggingface/transformers`, lazily (dynamic import on first call;
the model is downloaded from Hugging Face then), pipeline
`image-classification` with `onnx-community/Deep-Fake-Detector-v2-Model-ONNX`.

```ts
const detector = createOnnxDetector(optionalInjectedPipelineLoader);
const result = await detector.detectAiLikelihood(image); // string | Blob | Uint8Array
// { score, rawLabels, modelId, accuracyLabel }
const signal = onnxSignal(result); // source: "<modelId> — LIVE inference"
```

The fake-class probability is extracted defensively from whatever labels
the model returns (fake/ai/generated/synthetic hints → that score;
real/authentic hints → 1 − score; `LABEL_1` fallback). The pipeline
loader is injectable specifically so unit tests never download the model.

Every result carries `ACCURACY_LABEL`:

> Pretrained open-source ViT detector (Deep-Fake-Detector-v2, ONNX).
> Reported ~92% on its own test set; independent audits of this detector
> class show materially worse results on compressed real-world photos,
> including double-digit false-flag rates on genuine photos. Scores are
> uncalibrated — triage signal only, never a verdict.

Manual live check (not part of the test suite):

```bash
node scripts/try-onnx.mjs path/to/photo.jpg
```

### `gemini.ts` — Gemini semantic-consistency check
`geminiSemanticCheck({ imageBase64, mimeType, claimedItem, claimedDamage },
{ apiKey?, model?, fetchImpl? })` asks Gemini for a strict-JSON verdict
`{ itemMatch, damageMatch, inconsistencies[], aiLikelihoodNote, confidence }`:
does the photo show the claimed item, and the claimed damage?

- **No key** (`GEMINI_API_KEY` unset): returns `mode: 'mock'` with a
  deterministic placeholder verdict and a null-score signal whose source
  is `gemini-semantic (MOCK — no API key configured)`. A mock is never
  dressed up as a real call.
- **Key present**: POSTs to
  `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  (default model `gemini-2.0-flash`, override with `GEMINI_MODEL` or
  `opts.model`). Fences are stripped and JSON parsed defensively. Signal
  source: `gemini-semantic (LIVE, uncalibrated second opinion)`; score is
  a confidence-weighted mismatch score (item mismatch 0.5, damage
  mismatch 0.3, +0.1 per inconsistency capped at 0.2).
- **Any failure** (network, HTTP, unparseable): returns a **null-score**
  signal explaining the failure. It never throws and never invents a
  verdict.
- The API key is used only in the request; it is never logged and never
  appears in any returned object or explanation.

Setup: copy `.env.example` to `.env` and fill in `GEMINI_API_KEY`
(the coordinator manages the real key — never commit it). The module
itself reads `process.env` at call time; the host app / runner is
responsible for loading `.env` into the environment (e.g.
`node --env-file=.env`, Next.js env loading, or an exported variable).

### `screen.ts` — combiner
`screenEvidence({ exif, phashHex, sha256Hex, c2paPresent, corpus,
deliveredAtISO, photoClaimedOfDeliveredItem?, evidenceId?,
precomputedTable?, geminiVerdict?, onnxSignal? })` runs the deterministic
checks live, attaches the optional precomputed / Gemini / ONNX signals,
and returns `{ signals, priorityScore, band, automatedDecision: null,
outcome: 'route_to_human_review' }`.

Priority is a weighted noisy-OR, `1 − Π(1 − wᵢ·sᵢ)`, so the strongest
signal dominates while independent corroboration still raises priority.
Weights: exact_duplicate 1.00, c2pa_present 1.00, exif_conflict 0.95,
phash_duplicate 0.90, ai_detector 0.60, gemini_semantic 0.60,
file_anomaly 0.40. Null scores contribute 0.

## Tests

```bash
npm install
npx vitest run
```

Coverage includes: pHash near-duplicate vs different-pattern distances;
a hand-built synthetic JPEG+EXIF whose pre-delivery timestamp fires the
conflict signal; C2PA marker detection; exact-duplicate SHA matching;
precomputed-table labelling disclosure; Gemini request shape / mock-mode
labelling / failure paths with an injected fetch; ONNX label handling
with an injected fake pipeline (no model download); and the extended
no-auto-cancel test — worst case on **every** channel still returns
`route_to_human_review`, `automatedDecision: null`, all actions
`review_priority_only`, and no truthy key matching
`/cancel|deny|reject/i` anywhere in the result.

## Our fine-tune (experimental)

An additional, clearly-labelled **experimental** signal — not a
replacement for the pretrained detector above, which remains the
primary live detector.

**What it is:** transfer learning with a frozen base. The script
`finetune/finetune.py` loads
`prithivMLmods/Deep-Fake-Detector-v2-Model` (the PyTorch source of the
ONNX detector used live) via `AutoImageProcessor` +
`AutoModelForImageClassification`, freezes every parameter, extracts
the frozen ViT embedding (last hidden state, CLS token, 768-d) for
each image in `../../dataset/finetune/`, and trains an sklearn
`LogisticRegression(max_iter=1000, class_weight='balanced')` head on
the train embeddings (originals + augmentations, split by base
image). Probabilities from the head are P(ai).

**Measured numbers (real run, 2026-10-24, from
`finetune/results.json` — not estimates):**

| Metric | Value |
|---|---|
| Base model actually used | `prithivMLmods/Deep-Fake-Detector-v2-Model` (primary; no fallback was needed) |
| Train images / bases | 69 images / 23 bases |
| Test set | 11 base originals only (5 real, 6 ai) |
| **Held-out accuracy** | **0.818 (9/11)** |
| Real class | precision 0.714, recall 1.000 |
| AI class | precision 1.000, recall 0.667 |
| Confusion matrix (rows = true [real, ai]) | [[5, 0], [2, 4]] |
| Frozen base model, zero-shot, same test set | 0.545 |
| Runtime | 169.46 s (CPU) |

Artifacts: `finetune/results.json` (metrics), `finetune/head.json`
(head coefficients + classes `[real, ai]` + `vit-cls-768` embedding
note), `finetune/predictions.json` (per-test-image scores),
`finetune/run.log`.

**Small-sample caveat:** the test set is n=11, so the confidence
interval around 0.818 is wide — one image is ~9 points. This is a
working demonstration of a fine-tuning pipeline on local data, not a
generalisable accuracy claim.

**Where it plugs in:** `src/finetuned.ts` provides
`loadFinetuneResults(path)`, `loadFinetunePredictions(path)` and
`finetunedSignal(score, results)` (signal kind `finetuned_detector`,
source `our fine-tune (experimental) — logistic head on frozen
Deep-Fake-Detector-v2 ViT embeddings`). The explanation quotes the
measured held-out accuracy and test n read from `results.json`; if
that file is missing or unparseable the factory returns a null-score
signal instead of fabricating numbers. `screen.ts` accepts an optional
`finetunedScore` input and combines it in the noisy-OR at weight
**0.55**.

**Standing rule (unchanged):** this signal, like every other signal in
this package, can only reorder the human review queue. It can never
auto-cancel, deny or reject a refund — `screenEvidence()` still
returns `automatedDecision: null` and
`outcome: 'route_to_human_review'` even with `finetunedScore: 1.0`
(a test proves this).
