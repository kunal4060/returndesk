#!/usr/bin/env node
/**
 * Manual live check for the ONNX detector — NOT run in tests.
 *
 * Usage:
 *   node scripts/try-onnx.mjs <path-to-image>
 *
 * Downloads the model from Hugging Face on first run (hundreds of MB for
 * the fp32 build — run it somewhere with decent network, ideally before
 * the event, so the cache is warm). Prints the AI/fake-class score plus
 * the package's accuracy label.
 */
import { readFile } from 'node:fs/promises';

const MODEL_ID = 'onnx-community/Deep-Fake-Detector-v2-Model-ONNX';
const ACCURACY_LABEL =
  'Pretrained open-source ViT detector (Deep-Fake-Detector-v2, ONNX). Reported ~92% on its own test set; independent audits of this detector class show materially worse results on compressed real-world photos, including double-digit false-flag rates on genuine photos. Scores are uncalibrated — triage signal only, never a verdict.';

const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: node scripts/try-onnx.mjs <path-to-image>');
  process.exit(2);
}

const FAKE_HINTS = ['fake', 'ai', 'generated', 'synthetic', 'deepfake', 'artificial', 'manipulated'];
const REAL_HINTS = ['real', 'authentic', 'genuine', 'natural'];

function extractFakeScore(labels) {
  const norm = labels.map((l) => ({ label: String(l.label).toLowerCase(), score: Number(l.score) }));
  const fake = norm.find((l) => FAKE_HINTS.some((h) => l.label.includes(h)));
  if (fake) return fake.score;
  const real = norm.find((l) => REAL_HINTS.some((h) => l.label.includes(h)));
  if (real) return 1 - real.score;
  const label1 = norm.find((l) => l.label === 'label_1');
  if (label1) return label1.score;
  return norm.length ? Math.max(...norm.map((l) => l.score)) : 0;
}

const bytes = await readFile(imagePath);
const blob = new Blob([bytes]);

const { pipeline } = await import('@huggingface/transformers');
const classifier = await pipeline('image-classification', MODEL_ID);
const out = await classifier(blob);
const rawLabels = Array.isArray(out) ? out : [out];
const score = extractFakeScore(rawLabels);

console.log(`Image:        ${imagePath}`);
console.log(`Model:        ${MODEL_ID} — LIVE inference`);
console.log(`Raw labels:   ${rawLabels.map((l) => `${l.label}=${Number(l.score).toFixed(3)}`).join(', ')}`);
console.log(`AI likelihood (uncalibrated): ${score.toFixed(3)}`);
console.log(`Accuracy:     ${ACCURACY_LABEL}`);
console.log('This score is a review-priority signal only. It must never decide a refund.');
