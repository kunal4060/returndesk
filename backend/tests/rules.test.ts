import { describe, expect, it } from 'vitest';
import { partialRefund, scorePickupBundle } from '../src/disputes.js';
import { evaluateEligibility } from '../src/eligibility.js';
import { FRICTION_ACTIONS, assessFriction } from '../src/fraud.js';

describe('partialRefund — condition tiers', () => {
  it('"used" tier on 88889 paise refunds exactly half (round half up)', () => {
    const r = partialRefund(88889, 'used', true);
    // Math.round(88889 * 0.5) = Math.round(44444.5) = 44445.
    expect(r.refundPaise).toBe(44445);
    expect(r.deductionPaise).toBe(44444);
    expect(r.refundPaise + r.deductionPaise).toBe(88889);
    expect(r.tierLabel).toContain('50%');
  });

  it('full tiers need no photo proof; deduction tiers do', () => {
    expect(partialRefund(88889, 'as_described', false).refundPaise).toBe(88889);
    expect(partialRefund(88889, 'seller_fault', false).refundPaise).toBe(88889);
    expect(() => partialRefund(88889, 'used', false)).toThrow(/photo proof/);
    expect(() => partialRefund(88889, 'minor_damage', false)).toThrow(/photo proof/);
    expect(() => partialRefund(88889, 'opened_late', false)).toThrow(/photo proof/);
  });

  it('other tiers compute exactly', () => {
    expect(partialRefund(88889, 'opened_late', true)).toMatchObject({ refundPaise: 71111, deductionPaise: 17778 });
    expect(partialRefund(88889, 'minor_damage', true)).toMatchObject({ refundPaise: 66667, deductionPaise: 22222 });
  });
});

describe('scorePickupBundle — courier evidence completeness', () => {
  it('a full bundle is strong; a thin bundle is weak', () => {
    const full = scorePickupBundle({
      reasonCode: 'customer_unavailable',
      timestamp: '2026-10-24T05:00:00Z',
      gps: true,
      callLog: true,
      doorstepPhoto: true,
    });
    expect(full.completeness).toBe(1);
    expect(full.claimStrength).toBe('strong');
    expect(full.missing).toEqual([]);

    const thin = scorePickupBundle({
      reasonCode: 'customer_unavailable',
      timestamp: null,
      gps: true,
      callLog: false,
      doorstepPhoto: false,
    });
    expect(thin.completeness).toBe(0.4);
    expect(thin.claimStrength).toBe('weak');
    expect(thin.missing).toContain('doorstep photo');
  });
});

describe('evaluateEligibility', () => {
  const base = {
    category: 'footwear',
    daysSinceDelivery: 5,
    returnWindowDays: 15,
    conditionDeclared: 'unused',
    isFreeGift: false,
    qualifiesBundle: false,
  };

  it('eligible inside the window, with preview lines', () => {
    const r = evaluateEligibility(base);
    expect(r.eligible).toBe(true);
    expect(r.previewLines.length).toBeGreaterThan(0);
  });

  it('free gift is not refundable and previews the clawback policy', () => {
    const r = evaluateEligibility({ ...base, isFreeGift: true });
    expect(r.eligible).toBe(false);
    expect(r.previewLines.join('\n')).toContain('Free gift');
    expect(r.previewLines.join('\n').toLowerCase()).toContain('clawback');
  });

  it('outside the window is ineligible; a seller exception overrides it', () => {
    const out = evaluateEligibility({ ...base, daysSinceDelivery: 40 });
    expect(out.eligible).toBe(false);
    const excepted = evaluateEligibility({
      ...base,
      daysSinceDelivery: 40,
      sellerException: 'Seller approved a late return for the Diwali exchange rush',
    });
    expect(excepted.eligible).toBe(true);
    expect(excepted.reasons.join('\n')).toContain('seller exception');
  });

  it('bundle items preview the repricing effect', () => {
    const r = evaluateEligibility({ ...base, qualifiesBundle: true });
    expect(r.previewLines.join('\n')).toContain('Bundle');
  });
});

describe('assessFriction — fairness for the legit heavy returner', () => {
  it('12 sizing returns stay at level ≤ 2, with appeal and a fairness note', () => {
    const r = assessFriction({
      returnsLast90Days: 12,
      accountAgeDays: 400,
      allSizingRelated: true,
      priorAppealsUpheld: 0,
    });
    expect(r.level).toBeLessThanOrEqual(2);
    expect(r.appealAvailable).toBe(true);
    expect(r.fairnessNote.toLowerCase()).toContain('sizing');
    expect(r.signals.join('\n').toLowerCase()).toContain('sizing');
  });

  it('non-sizing anomalies on a new account reach manual review (level 3)', () => {
    const r = assessFriction({
      returnsLast90Days: 12,
      accountAgeDays: 10,
      allSizingRelated: false,
      priorAppealsUpheld: 0,
    });
    expect(r.level).toBe(3);
  });

  it('quiet customers get no friction; upheld appeals reduce it', () => {
    expect(
      assessFriction({ returnsLast90Days: 1, accountAgeDays: 400, allSizingRelated: false, priorAppealsUpheld: 0 }).level,
    ).toBe(0);
    const reduced = assessFriction({
      returnsLast90Days: 6,
      accountAgeDays: 400,
      allSizingRelated: false,
      priorAppealsUpheld: 1,
    });
    expect(reduced.level).toBe(0);
  });

  it('publishes friction actions per level', () => {
    expect(FRICTION_ACTIONS[1].join(' ')).toContain('Extra photos');
    expect(FRICTION_ACTIONS[2].join(' ')).toContain('Inspection before refund');
    expect(FRICTION_ACTIONS[3].join(' ')).toContain('Manual review');
  });
});
