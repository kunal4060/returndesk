/**
 * disputes.ts — inspection disputes: condition-tier partial refunds
 * and courier evidence-bundle scoring.
 *
 * Partial refunds use the published condition tiers (report 02/03):
 * as described 100%, opened/late 80% (≤20% deduction), minor damage
 * 75% (≤25%), used 50% (≤50%), seller's fault 100%. The fairness
 * invariant: ANY deduction requires photo proof. A deduction asserted
 * without evidence is a bug, so it throws instead of computing.
 */

export type ConditionVerdict = 'as_described' | 'opened_late' | 'minor_damage' | 'used' | 'seller_fault';

export const CONDITION_TIERS: Readonly<Record<ConditionVerdict, { percent: number; tierLabel: string }>> = {
  as_described: { percent: 100, tierLabel: 'As described — full refund (100%)' },
  opened_late: { percent: 80, tierLabel: 'Opened / late return — 20% deduction (80% refunded)' },
  minor_damage: { percent: 75, tierLabel: 'Minor damage — 25% deduction (75% refunded)' },
  used: { percent: 50, tierLabel: 'Used — 50% deduction (50% refunded)' },
  seller_fault: { percent: 100, tierLabel: "Seller's fault — full refund (100%)" },
};

export interface PartialRefundResult {
  refundPaise: number;
  deductionPaise: number;
  tierLabel: string;
  explanation: string;
}

/**
 * Compute a condition-tier partial refund of an item's effective price.
 * Percentages are applied with round-half-up (Math.round on positive
 * paise) so refund + deduction always equals the effective price.
 * Throws when a deduction tier is claimed without photo proof.
 */
export function partialRefund(
  effectivePaise: number,
  verdict: ConditionVerdict,
  hasPhotoProof: boolean,
): PartialRefundResult {
  if (!Number.isInteger(effectivePaise) || effectivePaise < 0) {
    throw new Error(`partialRefund: effective price must be non-negative integer paise, got ${effectivePaise}`);
  }
  const tier = CONDITION_TIERS[verdict];
  if (!tier) throw new Error(`partialRefund: unknown condition verdict "${String(verdict)}"`);
  if (tier.percent < 100 && !hasPhotoProof) {
    throw new Error(
      `partialRefund: a deduction under tier "${verdict}" requires photo proof — no deduction may be taken on assertion alone`,
    );
  }
  const refundPaise = Math.round((effectivePaise * tier.percent) / 100);
  const deductionPaise = effectivePaise - refundPaise;
  const explanation =
    deductionPaise === 0
      ? `${tier.tierLabel}: the full effective price is refunded, no deduction.`
      : `${tier.tierLabel}: ${deductionPaise} paise deducted from the effective price, supported by photo proof; the customer sees the proof and this arithmetic in the dispute view.`;
  return { refundPaise, deductionPaise, tierLabel: tier.tierLabel, explanation };
}

/** A courier's pickup-attempt evidence bundle (booleans = present). */
export interface PickupBundle {
  reasonCode: boolean | string | null | undefined;
  timestamp: boolean | string | null | undefined;
  gps: boolean | null | undefined;
  callLog: boolean | null | undefined;
  doorstepPhoto: boolean | null | undefined;
}

export interface PickupBundleScore {
  /** Fraction of the five evidence elements present, 0..1. */
  completeness: number;
  missing: string[];
  claimStrength: 'strong' | 'weak';
}

const BUNDLE_FIELDS: ReadonlyArray<{ key: keyof PickupBundle; label: string }> = [
  { key: 'reasonCode', label: 'reason code' },
  { key: 'timestamp', label: 'timestamp' },
  { key: 'gps', label: 'GPS fix' },
  { key: 'callLog', label: 'call log' },
  { key: 'doorstepPhoto', label: 'doorstep photo' },
];

/**
 * Score a courier evidence bundle. An attempt is evidence, not an
 * assertion: a bundle missing more than one of its five elements is a
 * weak claim and cannot on its own override the customer's account —
 * the case goes to the conflicting-claims state instead.
 */
export function scorePickupBundle(bundle: PickupBundle): PickupBundleScore {
  const missing: string[] = [];
  for (const { key, label } of BUNDLE_FIELDS) {
    const value = bundle[key];
    const present = typeof value === 'string' ? value.trim().length > 0 : value === true;
    if (!present) missing.push(label);
  }
  const completeness = (BUNDLE_FIELDS.length - missing.length) / BUNDLE_FIELDS.length;
  return {
    completeness,
    missing,
    claimStrength: completeness >= 0.8 ? 'strong' : 'weak',
  };
}
