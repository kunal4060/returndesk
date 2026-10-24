/**
 * waterfall.ts — how a refund is split back across payment instruments.
 *
 * Two modes (report 02, §1.2):
 *  - 'prorata'  (default): refund exactly the returned items' rows of the
 *    persisted allocation matrix — every instrument gets back the same
 *    proportion it contributed to those items.
 *  - 'priority': drain instruments in the fixed policy order
 *    voucher → wallet → card, each capped by that instrument's remaining
 *    refundable balance for the payment (its payment total here, since
 *    this function is given no prior-refund history). Voucher drains
 *    first because it expires first and can only be re-spent in-platform.
 *
 * Hard rules modelled here:
 *  - Refund-to-source only; a leg never exceeds what its instrument paid.
 *  - Voucher money returns as a re-issued voucher, NEVER to a bank
 *    account, and the leg carries its expiry terms.
 *  - The coupon share attached to a returned item is not refundable
 *    cash — it vanishes with the item (policy §2.2-1), and the
 *    explanation says so line by line.
 *  - Free-shipping threshold: if this return drops the kept items'
 *    effective total below FREE_SHIP_THRESHOLD after the order had
 *    qualified, the effect is ALWAYS an explicit, explained policy
 *    line in the preview — never silent. What the line does to the
 *    money is the configured shipping policy: 'goodwill' (default;
 *    the seeded dataset's configuration) deducts nothing, while
 *    'clawback' reverses the waived fee ("Free-shipping benefit
 *    reversed −₹79", floored at ₹0).
 */
import { getAllocationRow, paymentTotalsByInstrument } from './allocation.js';
import { formatINR } from './money.js';
import type { AllocationMatrix, Instrument, Order, RefundLeg, RefundPlan } from './types.js';

/** Orders at or above this effective total shipped free: ₹999. */
export const FREE_SHIP_THRESHOLD_PAISE = 99900;
/** The shipping fee that was waived by the free-shipping benefit: ₹79. */
export const SHIPPING_FEE_PAISE = 7900;
/** Spec-named aliases. */
export const FREE_SHIP_THRESHOLD = FREE_SHIP_THRESHOLD_PAISE;
export const SHIPPING_FEE = SHIPPING_FEE_PAISE;

/** Priority waterfall drain order (policy configuration, not a formula). */
export const PRIORITY_ORDER: readonly Instrument[] = ['voucher', 'wallet', 'card'];

const DESTINATION: Record<Instrument, string> = {
  card: 'original card',
  wallet: 'platform wallet',
  voucher: 'voucher re-issue (never bank)',
};

const ETA_TEXT: Record<Instrument, string> = {
  card: '5–7 working days via the payment gateway',
  wallet: 'about 2 hours after approval',
  voucher: 'about 1 hour — re-issued as a voucher',
};

export const VOUCHER_EXPIRY_NOTE =
  'Re-issued voucher keeps the original voucher expiry date; voucher value can only be re-spent on the platform and is never paid out to a bank account.';

function makeLeg(instrument: Instrument, amountPaise: number): RefundLeg {
  const leg: RefundLeg = {
    instrument,
    amountPaise,
    destination: DESTINATION[instrument],
    etaText: ETA_TEXT[instrument],
  };
  if (instrument === 'voucher') leg.expiryNote = VOUCHER_EXPIRY_NOTE;
  return leg;
}

export type ShippingPolicy = 'goodwill' | 'clawback';

/**
 * Compute the refund plan for returning `itemIds` of `order`.
 * `matrix` must be the persisted allocation matrix for that order.
 *
 * `opts.shippingPolicy` decides what happens when a return drops the
 * kept items below the free-shipping threshold (report 02 §2.2: the
 * threshold effect is a policy decision, surfaced as an explicit
 * preview line — never a silent deduction):
 *  - 'goodwill' (DEFAULT, and the policy configured for the seeded
 *    dataset — see dataset/data-card.md and the C-05 note): the waived
 *    fee is NOT deducted; refund legs are the unchanged matrix rows.
 *  - 'clawback': the waived ₹79 fee is reversed from the refund.
 */
export function computeRefund(
  matrix: AllocationMatrix,
  order: Order,
  itemIds: readonly string[],
  mode: 'prorata' | 'priority',
  opts?: { shippingPolicy?: ShippingPolicy },
): RefundPlan {
  const shippingPolicy: ShippingPolicy = opts?.shippingPolicy ?? 'goodwill';
  if (matrix.orderId !== order.id) {
    throw new Error(`allocation matrix is for order ${matrix.orderId}, not ${order.id}`);
  }
  if (itemIds.length === 0) throw new Error('computeRefund: no items selected for return');
  const uniqueIds = [...new Set(itemIds)];
  const rows = uniqueIds.map((id) => getAllocationRow(matrix, id));
  const returnedIds = new Set(uniqueIds);
  const keptRows = matrix.rows.filter((r) => !returnedIds.has(r.itemId));

  const grossPaise = rows.reduce((a, r) => a + r.effectivePaise, 0);
  const keptEffectivePaise = keptRows.reduce((a, r) => a + r.effectivePaise, 0);

  const explanation: string[] = [];

  // Per-item arithmetic, including the vanishing coupon share.
  for (const row of rows) {
    explanation.push(
      `${row.name} (${row.itemId}): list ${formatINR(row.listPricePaise)} − coupon share ${formatINR(row.couponSharePaise)} = effective ${formatINR(row.effectivePaise)} refundable.`,
    );
    if (row.couponSharePaise > 0) {
      explanation.push(
        `The ${formatINR(row.couponSharePaise)} coupon share attached to ${row.name} vanishes with the return — a coupon share is not refundable cash, and kept items keep their own coupon shares unchanged.`,
      );
    }
  }

  // Free-shipping threshold check (only when the benefit was granted).
  // The effect is ALWAYS an explicit, explained preview line; whether
  // it also reduces the refund is the configured shipping policy.
  let clawbackPaise = 0;
  const benefitWasGranted = matrix.totalEffectivePaise >= FREE_SHIP_THRESHOLD_PAISE;
  if (benefitWasGranted && keptEffectivePaise < FREE_SHIP_THRESHOLD_PAISE) {
    if (shippingPolicy === 'clawback') {
      clawbackPaise = Math.min(SHIPPING_FEE_PAISE, grossPaise);
      explanation.push(
        `Free-shipping benefit reversed −${formatINR(SHIPPING_FEE_PAISE)}: kept items total ${formatINR(keptEffectivePaise)}, below the ${formatINR(FREE_SHIP_THRESHOLD_PAISE)} free-shipping threshold, so the waived shipping fee is deducted from this refund.`,
      );
    } else {
      explanation.push(
        `Free-shipping threshold effect: kept items total ${formatINR(keptEffectivePaise)}, below the ${formatINR(FREE_SHIP_THRESHOLD_PAISE)} free-shipping threshold. Configured policy: goodwill — the waived ${formatINR(SHIPPING_FEE_PAISE)} shipping fee is NOT deducted, and the refund legs below follow the original allocation unchanged.`,
      );
    }
  } else if (benefitWasGranted) {
    explanation.push(
      `Free-shipping benefit stands: kept items total ${formatINR(keptEffectivePaise)}, still at or above the ${formatINR(FREE_SHIP_THRESHOLD_PAISE)} threshold — no clawback.`,
    );
  } else {
    explanation.push(
      `No free-shipping benefit was granted on this order (order total ${formatINR(matrix.totalEffectivePaise)} < ${formatINR(FREE_SHIP_THRESHOLD_PAISE)}), so there is nothing to reverse.`,
    );
  }

  const netPaise = Math.max(0, grossPaise - clawbackPaise);

  // Build the legs for the gross amount under the chosen mode.
  let legs: RefundLeg[] = [];
  if (mode === 'prorata') {
    const { order: instrumentOrder } = paymentTotalsByInstrument(order);
    for (const instrument of instrumentOrder) {
      const amount = rows.reduce((a, r) => a + r.byInstrument[instrument], 0);
      if (amount > 0) legs.push(makeLeg(instrument, amount));
    }
    explanation.push(
      'Split mode: pro-rata — each instrument is refunded exactly the share it contributed to the returned items, read from the persisted allocation matrix.',
    );
  } else {
    const { totals } = paymentTotalsByInstrument(order);
    let remaining = grossPaise;
    for (const instrument of PRIORITY_ORDER) {
      if (remaining <= 0) break;
      const cap = totals[instrument];
      if (cap <= 0) continue;
      const amount = Math.min(cap, remaining);
      legs.push(makeLeg(instrument, amount));
      remaining -= amount;
    }
    if (remaining > 0) {
      throw new Error(`priority waterfall could not place ${remaining} paise within the payment caps`);
    }
    explanation.push(
      'Split mode: priority waterfall — instruments drain in the order voucher → wallet → card, each capped at its remaining refundable balance for this payment.',
    );
  }

  // Apply the shipping clawback against real-money legs first
  // (card, then wallet, then voucher), so a re-issued voucher is the
  // last thing reduced. Legs stay non-negative and sum to the net.
  if (clawbackPaise > 0) {
    let toDeduct = clawbackPaise;
    const deductionOrder: Instrument[] = ['card', 'wallet', 'voucher'];
    const sorted = [...legs].sort(
      (a, b) => deductionOrder.indexOf(a.instrument) - deductionOrder.indexOf(b.instrument),
    );
    for (const leg of sorted) {
      if (toDeduct <= 0) break;
      const cut = Math.min(leg.amountPaise, toDeduct);
      leg.amountPaise -= cut;
      toDeduct -= cut;
    }
    legs = legs.filter((l) => l.amountPaise > 0);
    explanation.push(
      `The ${formatINR(clawbackPaise)} shipping reversal is taken from the card leg first, then wallet, then voucher.`,
    );
  }

  for (const leg of legs) {
    explanation.push(
      `${leg.instrument} leg: ${formatINR(leg.amountPaise)} → ${leg.destination} (${leg.etaText}).`,
    );
    if (leg.expiryNote) explanation.push(`Voucher terms: ${leg.expiryNote}`);
  }
  explanation.push(`Total refund: ${formatINR(netPaise)}.`);

  const legSum = legs.reduce((a, l) => a + l.amountPaise, 0);
  if (legSum !== netPaise) {
    throw new Error(`refund legs sum to ${legSum}, expected net refund ${netPaise}`);
  }

  return {
    orderId: order.id,
    itemIds: uniqueIds,
    mode,
    legs,
    grossPaise,
    clawbackPaise,
    shippingPolicy,
    totalPaise: netPaise,
    explanation,
  };
}
