/**
 * Engine ↔ dataset contract test.
 *
 * The seeded dataset (../../dataset) is the ground truth the /eval page
 * scores the engine against. This test guarantees the engine reproduces
 * it to the paisa: the hero scenario's persisted allocation matrix and
 * all 10 allocation test orders' expected refunds (default goodwill
 * shipping policy, largest-remainder rounding — see allocation.ts).
 */
import { describe, expect, it } from 'vitest';
import { buildAllocationMatrix } from '../src/allocation';
import { computeRefund } from '../src/waterfall';
import ordersData from '../../dataset/test-orders.json';
import scenarioData from '../../dataset/scenario.json';

describe('dataset contract — engine reproduces the seeded ground truth', () => {
  it('hero scenario allocation matrix matches cell by cell', () => {
    const s: any = scenarioData as any;
    const order = {
      id: s.order.id,
      items: s.items,
      couponPaise: s.order.couponPaise,
      payments: s.order.payments,
    };
    const m = buildAllocationMatrix(order as any);
    for (const row of s.allocationMatrix.rows) {
      const got: any = m.rows.find((r) => r.itemId === row.itemId);
      expect(got, `row ${row.itemId}`).toBeTruthy();
      expect(got.effectivePaise).toBe(row.effectivePricePaise);
      expect(got.byInstrument).toEqual(row.legs);
    }
    expect(m.columnTotalsPaise).toEqual(s.allocationMatrix.columnTotalsPaise);
  });

  it('all 10 test orders: expected refund legs match exactly', () => {
    const mismatches: string[] = [];
    for (const o of (ordersData as any).orders) {
      const order = { id: o.id, items: o.items, couponPaise: o.couponPaise, payments: o.payments };
      const m = buildAllocationMatrix(order as any);
      const plan = computeRefund(m, order as any, o.returnItemIds, 'prorata');
      const got: Record<string, number> = {};
      for (const leg of plan.legs) got[leg.instrument] = (got[leg.instrument] ?? 0) + leg.amountPaise;
      for (const exp of o.expectedRefund.legs) {
        if ((got[exp.instrument] ?? 0) !== exp.amountPaise)
          mismatches.push(`${o.id} ${exp.instrument}: engine=${got[exp.instrument] ?? 0} expected=${exp.amountPaise}`);
      }
      if (plan.totalPaise !== o.expectedRefund.totalPaise)
        mismatches.push(`${o.id} TOTAL: engine=${plan.totalPaise} expected=${o.expectedRefund.totalPaise}`);
    }
    expect(mismatches).toEqual([]);
  });
});
