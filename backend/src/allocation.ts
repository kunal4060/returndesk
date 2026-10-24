/**
 * allocation.ts — the persisted checkout allocation matrix.
 *
 * Two-step build (report 02, §1.3 / §2.1):
 *  1. The cart coupon is allocated to items pro-rata by list price with
 *     a largest-remainder pass (splitByWeights), so coupon shares sum
 *     exactly to the coupon and effective prices sum exactly to the
 *     amount actually paid.
 *  2. Each item's effective price is split across payment instruments
 *     pro-rata by the instruments' shares of the payment, using the
 *     same largest-remainder rule (splitByWeights): residual paise go
 *     to the largest fractional remainders first. This is the single
 *     canonical rounding rule for the whole engine AND the seeded
 *     dataset (dataset/test-orders.json notes state it per order) —
 *     report 02's prose specifies largest-remainder; its printed
 *     worked-example table placed two residual paise differently, and
 *     we follow the stated rule so engine and dataset agree to the
 *     paisa on every seeded order. After all rows are built, a
 *     column-repair pass (a safety net that is a no-op whenever
 *     per-row largest-remainder already reconciles the columns, as it
 *     does for every seeded order) moves single paise between rows
 *     until each column total equals the payment total for that
 *     instrument exactly. Both invariants are asserted before the
 *     matrix is returned — a matrix that does not reconcile to the
 *     paisa is never handed out.
 */
import { splitByWeights, sumPaise } from './money.js';
import type { AllocationMatrix, AllocationRow, Instrument, Order } from './types.js';

export const INSTRUMENTS: readonly Instrument[] = ['card', 'wallet', 'voucher'];

function emptyInstrumentRecord(): Record<Instrument, number> {
  return { card: 0, wallet: 0, voucher: 0 };
}

/**
 * Instruments actually used by this order, in payment order.
 * If an instrument appears twice in `payments`, its amounts are merged.
 */
export function paymentTotalsByInstrument(order: Order): {
  order: Instrument[];
  totals: Record<Instrument, number>;
  totalPaise: number;
} {
  const totals = emptyInstrumentRecord();
  const order_: Instrument[] = [];
  for (const p of order.payments) {
    if (!Number.isInteger(p.amountPaise) || p.amountPaise < 0) {
      throw new Error(`payment amount for ${p.instrument} is not non-negative integer paise: ${p.amountPaise}`);
    }
    if (!(p.instrument in totals)) {
      throw new Error(`unknown instrument: ${String(p.instrument)}`);
    }
    if (totals[p.instrument] === 0 && !order_.includes(p.instrument)) {
      order_.push(p.instrument);
    }
    totals[p.instrument] += p.amountPaise;
  }
  // An instrument with a zero total still counts as "used" if listed;
  // the loop above only registers it when first seen with any amount,
  // so re-check: register every listed instrument in first-seen order.
  const seen: Instrument[] = [];
  for (const p of order.payments) {
    if (!seen.includes(p.instrument)) seen.push(p.instrument);
  }
  return { order: seen, totals, totalPaise: sumPaise(order.payments.map((p) => p.amountPaise)) };
}

/** Build the persisted allocation matrix for an order. */
export function buildAllocationMatrix(order: Order): AllocationMatrix {
  if (order.items.length === 0) throw new Error('order has no items');
  const listTotal = sumPaise(order.items.map((i) => i.listPricePaise));
  for (const item of order.items) {
    if (!Number.isInteger(item.listPricePaise) || item.listPricePaise < 0) {
      throw new Error(`item ${item.id} list price is not non-negative integer paise`);
    }
  }
  if (!Number.isInteger(order.couponPaise) || order.couponPaise < 0 || order.couponPaise > listTotal) {
    throw new Error(`coupon ${order.couponPaise} must be integer paise between 0 and the list total ${listTotal}`);
  }
  const { order: instrumentOrder, totals: paymentTotals, totalPaise: paidTotal } = paymentTotalsByInstrument(order);
  const effectiveTotal = listTotal - order.couponPaise;
  if (paidTotal !== effectiveTotal) {
    throw new Error(
      `payments (${paidTotal}) do not equal list total minus coupon (${effectiveTotal}) — refusing to build a matrix that cannot reconcile`,
    );
  }

  // Step 1 — coupon shares by largest remainder over list prices.
  const couponShares =
    order.couponPaise === 0
      ? order.items.map(() => 0)
      : splitByWeights(order.couponPaise, order.items.map((i) => i.listPricePaise));

  // Step 2 — per-row instrument split: largest remainder (splitByWeights),
  // the same canonical rule as the coupon split and the seeded dataset.
  const rows: AllocationRow[] = order.items.map((item, idx) => {
    const couponSharePaise = couponShares[idx] ?? 0;
    const effectivePaise = item.listPricePaise - couponSharePaise;
    const byInstrument = emptyInstrumentRecord();
    if (effectiveTotal > 0 && effectivePaise > 0) {
      const parts = splitByWeights(
        effectivePaise,
        instrumentOrder.map((i) => paymentTotals[i] ?? 0),
      );
      instrumentOrder.forEach((instrument, j) => {
        byInstrument[instrument] = parts[j] ?? 0;
      });
    }
    return {
      itemId: item.id,
      name: item.name ?? item.id,
      sellerId: item.sellerId ?? '',
      listPricePaise: item.listPricePaise,
      couponSharePaise,
      effectivePaise,
      byInstrument,
    };
  });

  // Step 3 — column repair. Row sums are already exact; the grand total
  // equals the sum of payment totals, so fixing every non-last column by
  // moving paise against the last column (within a row) makes the last
  // column exact automatically. A transfer picks, deterministically,
  // the row where the donating cell is largest (over-allocation) or the
  // receiving headroom is largest (under-allocation).
  const lastInstrument = instrumentOrder[instrumentOrder.length - 1];
  if (lastInstrument !== undefined && instrumentOrder.length > 1) {
    for (const instrument of instrumentOrder.slice(0, -1)) {
      let error = sumPaise(rows.map((r) => r.byInstrument[instrument])) - (paymentTotals[instrument] ?? 0);
      let guard = 0;
      while (error !== 0) {
        guard += 1;
        if (guard > 100000) throw new Error('allocation column repair did not converge');
        if (error > 0) {
          // Column is over: move 1 paisa from this column to the last
          // column in the row with the largest cell in this column.
          const row = [...rows]
            .filter((r) => r.byInstrument[instrument] > 0)
            .sort((a, b) => b.byInstrument[instrument] - a.byInstrument[instrument] || a.itemId.localeCompare(b.itemId))[0];
          if (!row) throw new Error(`allocation repair: no row can donate a paisa to fix column ${instrument}`);
          row.byInstrument[instrument] -= 1;
          row.byInstrument[lastInstrument] += 1;
          error -= 1;
        } else {
          // Column is under: move 1 paisa from the last column into this
          // column in the row with the largest last-column cell.
          const row = [...rows]
            .filter((r) => r.byInstrument[lastInstrument] > 0)
            .sort(
              (a, b) => b.byInstrument[lastInstrument] - a.byInstrument[lastInstrument] || a.itemId.localeCompare(b.itemId),
            )[0];
          if (!row) throw new Error(`allocation repair: no row can receive a paisa to fix column ${instrument}`);
          row.byInstrument[lastInstrument] -= 1;
          row.byInstrument[instrument] += 1;
          error += 1;
        }
      }
    }
  }

  // Invariants — asserted, never assumed.
  const columnTotalsPaise = emptyInstrumentRecord();
  for (const row of rows) {
    const rowSum = sumPaise(INSTRUMENTS.map((i) => row.byInstrument[i]));
    if (rowSum !== row.effectivePaise) {
      throw new Error(`allocation row ${row.itemId} sums to ${rowSum}, expected effective ${row.effectivePaise}`);
    }
    for (const i of INSTRUMENTS) columnTotalsPaise[i] += row.byInstrument[i];
  }
  for (const i of INSTRUMENTS) {
    if (columnTotalsPaise[i] !== paymentTotals[i]) {
      throw new Error(`allocation column ${i} sums to ${columnTotalsPaise[i]}, expected payment total ${paymentTotals[i]}`);
    }
  }
  if (sumPaise(rows.map((r) => r.effectivePaise)) !== effectiveTotal) {
    throw new Error('allocation effective total does not equal list total minus coupon');
  }

  return {
    orderId: order.id,
    rows,
    columnTotalsPaise,
    totalListPaise: listTotal,
    couponPaise: order.couponPaise,
    totalEffectivePaise: effectiveTotal,
  };
}

/** Look up one item's matrix row (throws for an unknown item id). */
export function getAllocationRow(matrix: AllocationMatrix, itemId: string): AllocationRow {
  const row = matrix.rows.find((r) => r.itemId === itemId);
  if (!row) throw new Error(`no allocation row for item ${itemId} in order ${matrix.orderId}`);
  return row;
}
