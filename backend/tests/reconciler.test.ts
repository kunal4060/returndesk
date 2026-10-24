import { describe, expect, it } from 'vitest';
import { LATENCY_BUDGET_HOURS, classifyLeg } from '../src/reconciler.js';

describe('reconciler — waiting vs stuck', () => {
  it('exposes the per-instrument latency budgets', () => {
    expect(LATENCY_BUDGET_HOURS).toEqual({ wallet: 4, voucher: 1, card: 168 });
  });

  it('in_agreement: all sources agree, amounts equal', () => {
    const r = classifyLeg({
      instrument: 'card',
      ageHours: 10,
      platformState: 'processed',
      providerState: 'processed',
      sellerState: 'processed',
      platformAmountPaise: 53333,
      providerAmountPaise: 53333,
      legPresentAtProvider: true,
    });
    expect(r.verdict).toBe('in_agreement');
    expect(r.breakClass).toBeNull();
  });

  it('waiting: card leg at 48h, provider still pending (budget 168h)', () => {
    const r = classifyLeg({
      instrument: 'card',
      ageHours: 48,
      platformState: 'initiated',
      providerState: 'pending',
      sellerState: 'initiated',
      platformAmountPaise: 53333,
      providerAmountPaise: 53333,
      legPresentAtProvider: true,
    });
    expect(r.verdict).toBe('waiting');
    expect(r.breakClass).toBe('timing');
    expect(r.reason).toContain('168');
  });

  it('stuck: card leg still pending at 200h, past the 168h budget', () => {
    const r = classifyLeg({
      instrument: 'card',
      ageHours: 200,
      platformState: 'pending',
      providerState: 'pending',
      sellerState: 'pending',
      platformAmountPaise: 53333,
      providerAmountPaise: 53333,
      legPresentAtProvider: true,
    });
    expect(r.verdict).toBe('stuck');
    expect(r.breakClass).toBe('timing');
  });

  it('stuck: provider "reversed" contradicts seller "pending" (lifecycle)', () => {
    const r = classifyLeg({
      instrument: 'card',
      ageHours: 30,
      platformState: 'initiated',
      providerState: 'reversed',
      sellerState: 'pending',
      platformAmountPaise: 53333,
      providerAmountPaise: 53333,
      legPresentAtProvider: true,
    });
    expect(r.verdict).toBe('stuck');
    expect(r.breakClass).toBe('lifecycle');
  });

  it('waiting: amount mismatch of exactly 100 paise is rounding', () => {
    const r = classifyLeg({
      instrument: 'card',
      ageHours: 10,
      platformState: 'processed',
      providerState: 'processed',
      sellerState: 'processed',
      platformAmountPaise: 53333,
      providerAmountPaise: 53433,
      legPresentAtProvider: true,
    });
    expect(r.verdict).toBe('waiting');
    expect(r.breakClass).toBe('amount');
    expect(r.reason).toContain('rounding');
  });

  it('stuck: amount mismatch beyond ₹1, and missing leg past its budget', () => {
    const amount = classifyLeg({
      instrument: 'wallet',
      ageHours: 2,
      platformState: 'processed',
      providerState: 'processed',
      sellerState: 'processed',
      platformAmountPaise: 22222,
      providerAmountPaise: 22000,
      legPresentAtProvider: true,
    });
    expect(amount.verdict).toBe('stuck');
    expect(amount.breakClass).toBe('amount');

    const missing = classifyLeg({
      instrument: 'wallet',
      ageHours: 10,
      platformState: 'initiated',
      providerState: null,
      sellerState: 'initiated',
      platformAmountPaise: 22222,
      providerAmountPaise: null,
      legPresentAtProvider: false,
    });
    expect(missing.verdict).toBe('stuck');
    expect(missing.breakClass).toBe('missing_at_provider');

    const missingButYoung = classifyLeg({
      instrument: 'card',
      ageHours: 24,
      platformState: 'initiated',
      providerState: null,
      sellerState: 'initiated',
      platformAmountPaise: 53333,
      providerAmountPaise: null,
      legPresentAtProvider: false,
    });
    expect(missingButYoung.verdict).toBe('waiting');
    expect(missingButYoung.breakClass).toBe('timing');
  });
});
