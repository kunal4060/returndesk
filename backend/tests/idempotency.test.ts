import { describe, expect, it } from 'vitest';
import { LedgerGuardError, RefundIssuer, WebhookInbox } from '../src/idempotency.js';

const legs = [
  { instrument: 'card', amountPaise: 53333 },
  { instrument: 'wallet', amountPaise: 22222 },
  { instrument: 'voucher', amountPaise: 13334 },
];

describe('RefundIssuer — exactly-once under retries', () => {
  it('issuing the same intent 3 times moves money once', () => {
    const issuer = new RefundIssuer({ 'pay-1': 200000 });
    const r1 = issuer.issue('RI-B-0001', 'pay-1', legs);
    const r2 = issuer.issue('RI-B-0001', 'pay-1', legs);
    const r3 = issuer.issue('RI-B-0001', 'pay-1', legs);

    expect(r1.totalPaise).toBe(88889);
    expect(r2.issuanceId).toBe(r1.issuanceId);
    expect(r3.issuanceId).toBe(r1.issuanceId);
    expect(r2).toEqual(r1);
    expect(issuer.totalIssuedPaise).toBe(88889);
    expect(issuer.attemptsFor('RI-B-0001')).toBe(3);
    expect(issuer.duplicateAttemptsFor('RI-B-0001')).toBe(2);
    expect(issuer.refundableBalance('pay-1')).toBe(200000 - 88889);
  });

  it('ledger guard: issuing beyond the refundable balance throws', () => {
    const issuer = new RefundIssuer({ 'pay-1': 50000 });
    expect(() => issuer.issue('RI-X', 'pay-1', legs)).toThrow(LedgerGuardError);
    // The failed attempt consumed nothing: a smaller valid refund works.
    const ok = issuer.issue('RI-Y', 'pay-1', [{ instrument: 'card', amountPaise: 50000 }]);
    expect(ok.totalPaise).toBe(50000);
    expect(() => issuer.issue('RI-Z', 'pay-1', [{ instrument: 'card', amountPaise: 1 }])).toThrow(LedgerGuardError);
  });

  it('reusing an intent id with different legs throws instead of guessing', () => {
    const issuer = new RefundIssuer({ 'pay-1': 200000 });
    issuer.issue('RI-B-0001', 'pay-1', legs);
    expect(() => issuer.issue('RI-B-0001', 'pay-1', [{ instrument: 'card', amountPaise: 1 }])).toThrow();
    expect(issuer.totalIssuedPaise).toBe(88889);
  });
});

describe('WebhookInbox — at-least-once delivery, exactly-once handling', () => {
  it('runs the handler once; the second delivery is a duplicate', () => {
    const inbox = new WebhookInbox();
    let runs = 0;
    const handler = () => {
      runs += 1;
    };
    expect(inbox.receive('evt_123', handler)).toBe('processed');
    expect(inbox.receive('evt_123', handler)).toBe('duplicate');
    expect(runs).toBe(1);
  });

  it('a handler that throws does not mark the event processed', () => {
    const inbox = new WebhookInbox();
    expect(() =>
      inbox.receive('evt_bad', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    let runs = 0;
    expect(
      inbox.receive('evt_bad', () => {
        runs += 1;
      }),
    ).toBe('processed');
    expect(runs).toBe(1);
  });
});
