/**
 * audit.ts — append-only, tamper-evident audit trail.
 *
 * Every entry links to the previous one: hash = SHA-256 hex of
 * prevHash concatenated with the canonical JSON of the entry content
 * (seq, ts, actor, action, payload, prevHash). Rewriting any earlier
 * entry breaks every later hash, so `verifyChain()` detects tampering
 * by recomputation. Entries are frozen on creation and the log only
 * ever appends — corrections are new entries, never edits.
 *
 * The clock is injectable for deterministic tests; the default is a
 * logical clock ("t1", "t2", …) so ordering never depends on wall time.
 */
import { createHash } from 'node:crypto';
import type { AuditEntry } from './types.js';

export const GENESIS_HASH = '0'.repeat(64);

function canonicalContent(entry: Omit<AuditEntry, 'hash'>): string {
  return JSON.stringify({
    seq: entry.seq,
    ts: entry.ts,
    actor: entry.actor,
    action: entry.action,
    payload: entry.payload,
    prevHash: entry.prevHash,
  });
}

function computeHash(entry: Omit<AuditEntry, 'hash'>): string {
  return createHash('sha256').update(entry.prevHash + canonicalContent(entry)).digest('hex');
}

export class AuditLog {
  readonly #entries: AuditEntry[] = [];
  readonly #clock: () => string;
  #counter = 0;

  constructor(clock?: () => string) {
    this.#clock = clock ?? (() => `t${++this.#counter}`);
  }

  /** Append an entry and return it (frozen). */
  append(actor: string, action: string, payload: Record<string, unknown>): AuditEntry {
    const prev = this.#entries[this.#entries.length - 1];
    const content: Omit<AuditEntry, 'hash'> = {
      seq: this.#entries.length + 1,
      ts: this.#clock(),
      actor,
      action,
      // Copy + freeze the payload so a caller mutating its object
      // later cannot rewrite history outside the chain.
      payload: Object.freeze({ ...payload }),
      prevHash: prev ? prev.hash : GENESIS_HASH,
    };
    const entry: AuditEntry = Object.freeze({ ...content, hash: computeHash(content) });
    this.#entries.push(entry);
    return entry;
  }

  /** All entries, in append order (frozen array of frozen entries). */
  get entries(): readonly AuditEntry[] {
    return Object.freeze([...this.#entries]);
  }

  get length(): number {
    return this.#entries.length;
  }

  /** Recompute the whole chain; true only if every link is intact. */
  verifyChain(): boolean {
    return AuditLog.verify(this.#entries);
  }

  /**
   * Verify an arbitrary list of entries (e.g. a copy loaded from
   * storage, or a suspect chain in a test). Checks sequence numbers,
   * prevHash links, and every hash.
   */
  static verify(entries: readonly AuditEntry[]): boolean {
    let prevHash = GENESIS_HASH;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) return false;
      if (entry.seq !== i + 1) return false;
      if (entry.prevHash !== prevHash) return false;
      if (entry.hash !== computeHash(entry)) return false;
      prevHash = entry.hash;
    }
    return true;
  }
}
