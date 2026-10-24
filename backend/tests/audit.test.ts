import { describe, expect, it } from 'vitest';
import { AuditLog } from '../src/audit.js';

describe('AuditLog — hash-chained, tamper-evident', () => {
  it('appends chained entries and verifies', () => {
    const log = new AuditLog();
    const e1 = log.append('customer', 'return.requested', { itemId: 'B' });
    const e2 = log.append('ops', 'refund.issued', { intentId: 'RI-B-0001', totalPaise: 88889 });
    const e3 = log.append('ops', 'webhook.duplicate_ignored', { eventId: 'evt_123' });

    expect([e1.seq, e2.seq, e3.seq]).toEqual([1, 2, 3]);
    expect(e2.prevHash).toBe(e1.hash);
    expect(e3.prevHash).toBe(e2.hash);
    expect(e1.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(log.verifyChain()).toBe(true);
    expect(Object.isFrozen(e1)).toBe(true);
  });

  it('tampering with a copied chain is detected', () => {
    const log = new AuditLog();
    log.append('customer', 'return.requested', { itemId: 'B' });
    log.append('ops', 'refund.issued', { totalPaise: 88889 });
    log.append('ops', 'refund.credited', { leg: 'card' });
    expect(AuditLog.verify(log.entries)).toBe(true);

    // Attacker rewrites the issued amount in a copy.
    const tampered = log.entries.map((e) =>
      e.seq === 2 ? { ...e, payload: { totalPaise: 1 } } : e,
    );
    expect(AuditLog.verify(tampered)).toBe(false);

    // Attacker swaps two entries.
    const swapped = [log.entries[1]!, log.entries[0]!, log.entries[2]!];
    expect(AuditLog.verify(swapped)).toBe(false);
  });

  it('supports an injectable clock', () => {
    let n = 0;
    const log = new AuditLog(() => `2026-10-24T00:00:0${++n}Z`);
    const e = log.append('system', 'test', {});
    expect(e.ts).toBe('2026-10-24T00:00:01Z');
    expect(log.verifyChain()).toBe(true);
  });
});
