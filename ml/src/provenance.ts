/**
 * Provenance checks: SHA-256 exact duplicates and C2PA presence.
 *
 * C2PA is one-directional (Research 06, §1.3): present + valid is close to
 * conclusive evidence of a signing tool's involvement; absent proves
 * nothing, because most generators do not sign and a single re-save or
 * screenshot strips the manifest.
 */
import { createHash } from 'node:crypto';
import { makeSignal, type RiskSignal } from './types.js';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface ShaCorpusEntry {
  id: string;
  sha256Hex?: string;
  hash?: string;
}

export interface ExactDuplicateMatch {
  id: string;
  sha256Hex: string;
}

/** Find corpus entries with a byte-identical SHA-256 hash. */
export function findExactDuplicate(
  hash: string,
  corpus: ShaCorpusEntry[],
): ExactDuplicateMatch[] {
  const target = hash.toLowerCase();
  const matches: ExactDuplicateMatch[] = [];
  for (const entry of corpus) {
    const candidate = (entry.sha256Hex ?? entry.hash ?? '').toLowerCase();
    if (candidate && candidate === target) {
      matches.push({ id: entry.id, sha256Hex: candidate });
    }
  }
  return matches;
}

/** Build the exact-duplicate signal for a matched hash (or null if none). */
export function exactDuplicateSignal(
  hash: string,
  corpus: ShaCorpusEntry[],
): RiskSignal | null {
  const matches = findExactDuplicate(hash, corpus);
  const first = matches[0];
  if (!first) return null;
  return makeSignal({
    signal: 'exact_duplicate',
    score: 0.99,
    source: 'sha256-exact-match',
    explanation: `Byte-identical file (SHA-256 match) already present in the evidence corpus as "${first.id}" — the same file was submitted more than once.`,
  });
}

/**
 * Heuristic C2PA presence check: scans the raw bytes (which covers JPEG
 * APP segments, XMP packets and embedded manifests) case-insensitively
 * for the 'c2pa' box/manifest markers and 'contentcredentials'
 * identifiers. This is a presence check only — it does not validate the
 * manifest's cryptographic signature.
 */
export function hasC2PA(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  // Decode as latin1 so every byte maps to one char for substring search.
  let text = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    text += String.fromCharCode(...slice);
  }
  const haystack = text.toLowerCase();
  return haystack.includes('c2pa') || haystack.includes('contentcredentials');
}

export function c2paSignal(present: boolean): RiskSignal {
  if (present) {
    return makeSignal({
      signal: 'c2pa_present',
      score: 0.95,
      source: 'c2pa-presence-check',
      explanation:
        'C2PA Content Credentials manifest detected in the file — a signed provenance record from a content-creation tool. Presence is near-conclusive when present: the file declares a creation/edit history that a reviewer should inspect.',
    });
  }
  return makeSignal({
    signal: 'c2pa_present',
    score: null,
    source: 'c2pa-presence-check',
    explanation:
      'No C2PA Content Credentials manifest found — absence proves nothing: most tools do not sign, and a re-save or screenshot strips the manifest.',
  });
}
