import { describe, expect, it } from 'vitest';
import { buildAllocationMatrix, getAllocationRow } from '../src/allocation.js';
import { computeRefund } from '../src/waterfall.js';
import type { Order } from '../src/types.js';

/**
 * The worked example from research report 02, §6 — asserted paisa by paisa.
 * Order: A list ₹1,250, B list ₹1,000, coupon ₹250,
 * paid card ₹1,200 / wallet ₹500 / voucher ₹300 (= ₹2,000 payable).
 */
const demoOrder: Order = {
  id: 'RET-DEMO-1',
  items: [
    { id: 'A', name: 'Shoes', sellerId: 'seller-1', listPricePaise: 125000 },
    { id: 'B', name: 'T-shirt', sellerId: 'seller-2', listPricePaise: 100000 },
  ],
  couponPaise: 25000,
  payments: [
    { instrument: 'card', amountPaise: 120000 },
    { instrument: 'wallet', amountPaise: 50000 },
    { instrument: 'voucher', amountPaise: 30000 },
  ],
};

describe('allocation matrix — worked example', () => {
  const matrix = buildAllocationMatrix(demoOrder);

  it('allocates the coupon pro-rata and computes effective prices exactly', () => {
    const a = getAllocationRow(matrix, 'A');
    const b = getAllocationRow(matrix, 'B');
    expect(a.couponSharePaise).toBe(13889);
    expect(b.couponSharePaise).toBe(11111);
    expect(a.effectivePaise).toBe(111111);
    expect(b.effectivePaise).toBe(88889);
  });

  it('matches the persisted matrix cell by cell', () => {
    // Largest-remainder splits (the canonical rule — see allocation.ts):
    // A: 66666.60 / 27777.75 / 16666.65 → residuals to wallet, then voucher.
    // B: 53333.40 / 22222.25 / 13333.35 → residual to card.
    // (Report 02's printed table placed these residual paise differently;
    // its prose specifies largest-remainder, which the engine and the
    // seeded dataset both follow so they agree to the paisa.)
    const a = getAllocationRow(matrix, 'A');
    const b = getAllocationRow(matrix, 'B');
    expect(a.byInstrument).toEqual({ card: 66666, wallet: 27778, voucher: 16667 });
    expect(b.byInstrument).toEqual({ card: 53334, wallet: 22222, voucher: 13333 });
  });

  it('column sums equal the payment totals exactly', () => {
    expect(matrix.columnTotalsPaise).toEqual({ card: 120000, wallet: 50000, voucher: 30000 });
    expect(matrix.totalEffectivePaise).toBe(200000);
  });
});

describe('waterfall — worked example, returning item B', () => {
  const matrix = buildAllocationMatrix(demoOrder);

  it('pro-rata refund of B refunds B\'s matrix row exactly', () => {
    const plan = computeRefund(matrix, demoOrder, ['B'], 'prorata');
    const byInstrument = Object.fromEntries(plan.legs.map((l) => [l.instrument, l.amountPaise]));
    expect(byInstrument).toEqual({ card: 53334, wallet: 22222, voucher: 13333 });
    expect(plan.totalPaise).toBe(88889);
    expect(plan.grossPaise).toBe(88889);
    expect(plan.clawbackPaise).toBe(0);
  });

  it('priority refund of B drains voucher, then wallet, then card', () => {
    const plan = computeRefund(matrix, demoOrder, ['B'], 'priority');
    expect(plan.legs.map((l) => [l.instrument, l.amountPaise])).toEqual([
      ['voucher', 30000],
      ['wallet', 50000],
      ['card', 8889],
    ]);
    expect(plan.totalPaise).toBe(88889);
  });

  it('voucher leg is a re-issue (never bank) and carries an expiry note', () => {
    const plan = computeRefund(matrix, demoOrder, ['B'], 'prorata');
    const voucher = plan.legs.find((l) => l.instrument === 'voucher');
    expect(voucher?.destination).toBe('voucher re-issue (never bank)');
    expect(voucher?.expiryNote).toBeTruthy();
    const card = plan.legs.find((l) => l.instrument === 'card');
    expect(card?.destination).toBe('original card');
    expect(card?.etaText).toContain('5–7 working days');
  });

  it('explanation mentions the vanishing coupon share and the standing shipping benefit', () => {
    const plan = computeRefund(matrix, demoOrder, ['B'], 'prorata');
    const text = plan.explanation.join('\n');
    expect(text).toContain('coupon share');
    expect(text).toContain('vanishes');
    expect(text).toContain('Free-shipping benefit stands');
  });
});

describe('waterfall — free-shipping threshold policies', () => {
  // Kept item effective ₹850 (< ₹999) after returning the ₹200 item of
  // a ₹1,050 order that had qualified for free shipping.
  const order: Order = {
    id: 'CLAW-1',
    items: [
      { id: 'K', name: 'Kept', sellerId: 's1', listPricePaise: 85000 },
      { id: 'R', name: 'Returned', sellerId: 's1', listPricePaise: 20000 },
    ],
    couponPaise: 0,
    payments: [{ instrument: 'card', amountPaise: 105000 }],
  };
  const matrix = buildAllocationMatrix(order);

  it('goodwill policy (the default, and the seeded dataset configuration): no deduction, legs unchanged', () => {
    const plan = computeRefund(matrix, order, ['R'], 'prorata');
    expect(plan.shippingPolicy).toBe('goodwill');
    expect(plan.grossPaise).toBe(20000);
    expect(plan.clawbackPaise).toBe(0);
    expect(plan.totalPaise).toBe(20000);
    expect(plan.explanation.join('\n')).toContain('goodwill');
    expect(plan.explanation.join('\n')).toContain('NOT deducted');
  });

  it('clawback policy (explicitly configured): reverses the ₹79 benefit', () => {
    const plan = computeRefund(matrix, order, ['R'], 'prorata', { shippingPolicy: 'clawback' });
    expect(plan.shippingPolicy).toBe('clawback');
    expect(plan.grossPaise).toBe(20000);
    expect(plan.clawbackPaise).toBe(7900);
    expect(plan.totalPaise).toBe(12100);
    expect(plan.legs.reduce((a, l) => a + l.amountPaise, 0)).toBe(12100);
    expect(plan.explanation.join('\n')).toContain('Free-shipping benefit reversed −₹79');
  });
});
