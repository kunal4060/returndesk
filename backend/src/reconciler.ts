/**
 * reconciler.ts — three-way reconciliation verdicts for one refund leg.
 *
 * A leg is compared across the platform ledger, the provider report
 * and the seller record. The classifier answers one question —
 * "is this difference expected (waiting) or an exception (stuck)?" —
 * using the break taxonomy of report 02, §5.2 and the ageing rule of
 * §5.3: a mismatch fully explained by the instrument's known latency
 * budget is WAITING; a crossed deadline, a missing leg, an amount gap
 * beyond rounding tolerance, or a terminal-state contradiction is
 * STUCK and carries its break class.
 *
 * Latency budgets (hours): wallet ≈ 2h in gateway docs — we budget 4h
 * of slack; voucher re-issue is near-instant — 1h; card refunds run
 * 5–7 WORKING days, and 7 working days is ≈ 168 wall-clock hours once
 * a weekend is inside the window, so the card budget is 168h.
 *
 * Rule order is deterministic (first match wins) and each rule is
 * numbered in the comments so a verdict can be traced in review.
 * Break classes not detectable from a single leg's inputs
 * (missing_in_ledger, duplicate, fee, bank, restatement) belong to the
 * batch-level matcher and are part of the taxonomy type only.
 */
import type { Instrument } from './types.js';

export const LATENCY_BUDGET_HOURS: Record<Instrument, number> = {
  wallet: 4,
  voucher: 1,
  card: 168,
};

/** Amount gaps up to ₹1 (100 paise) are rounding, never a real break. */
export const AMOUNT_TOLERANCE_PAISE = 100;

export type BreakClass =
  | 'missing_at_provider'
  | 'missing_in_ledger'
  | 'amount'
  | 'timing'
  | 'lifecycle'
  | 'fee'
  | 'duplicate'
  | 'bank'
  | 'restatement';

export type ReconVerdict = 'in_agreement' | 'waiting' | 'stuck';

export interface ClassifyLegInput {
  instrument: Instrument;
  /** Hours since the refund leg was initiated. */
  ageHours: number;
  platformState: string;
  providerState: string | null;
  sellerState: string | null;
  platformAmountPaise: number;
  providerAmountPaise: number | null;
  /** False when the provider report has no record of this leg at all. */
  legPresentAtProvider: boolean;
}

export interface ClassifyLegResult {
  verdict: ReconVerdict;
  breakClass: BreakClass | null;
  reason: string;
}

const TERMINAL_FAILURE_STATES: ReadonlySet<string> = new Set(['failed', 'reversed']);
const TERMINAL_STATES: ReadonlySet<string> = new Set(['credited', 'processed', 'failed', 'reversed', 'succeeded']);

/**
 * Canonical state for cross-source comparison. The three sources
 * stamp DIFFERENT events for the same fact (report 02, §5.1): the
 * provider's success-terminal is "processed", while the platform
 * ledger and the seller record say "credited" once the money has
 * landed. Those are one settled fact in three vocabularies, so
 * agreement is judged on canonical states, not raw strings.
 */
function canonState(state: string): string {
  if (state === 'processed' || state === 'succeeded') return 'credited';
  return state;
}

export function classifyLeg(input: ClassifyLegInput): ClassifyLegResult {
  const budget = LATENCY_BUDGET_HOURS[input.instrument];
  const { ageHours, platformState, providerState, sellerState } = input;

  const statesAgree =
    providerState !== null &&
    canonState(providerState) === canonState(platformState) &&
    (sellerState === null || canonState(sellerState) === canonState(platformState));
  const amountDelta =
    input.providerAmountPaise === null ? null : Math.abs(input.providerAmountPaise - input.platformAmountPaise);
  const amountsEqual = amountDelta === null || amountDelta === 0;

  // Rule 1 — agreement: all sources tell the same story (in canonical
  // vocabulary), amounts match, and the agreed state is TERMINAL —
  // the leg has settled (or terminally failed) the same way
  // everywhere. Agreement on a NON-terminal state is not agreement
  // yet: the leg is still in flight, which is "waiting" (Rule 5.5) —
  // the same label the seeded dataset uses for agreeing in-flight
  // legs (e.g. the hero voucher leg, all sources "pending").
  if (statesAgree && amountsEqual && TERMINAL_STATES.has(platformState)) {
    return {
      verdict: 'in_agreement',
      breakClass: null,
      reason: `Platform, provider and seller agree on the same terminal state (platform "${platformState}") and the amount matches exactly.`,
    };
  }

  // Rule 2 — lifecycle contradiction: the provider has reached a
  // terminal failure state that the platform/seller states contradict.
  // A reversal is a separate later event the other systems never
  // modelled (report 02, §3.4) — this never resolves by waiting.
  if (
    providerState !== null &&
    TERMINAL_FAILURE_STATES.has(providerState) &&
    (platformState !== providerState || (sellerState !== null && sellerState !== providerState))
  ) {
    return {
      verdict: 'stuck',
      breakClass: 'lifecycle',
      reason: `Provider state "${providerState}" is terminal, but platform says "${platformState}"${sellerState !== null ? ` and seller says "${sellerState}"` : ''} — a lifecycle contradiction that waiting will not fix.`,
    };
  }

  // Rule 3 — leg missing at the provider: expected while the leg may
  // still be in flight (inside budget), a break once the budget is
  // crossed and the provider still has never seen it.
  if (!input.legPresentAtProvider) {
    if (ageHours > budget) {
      return {
        verdict: 'stuck',
        breakClass: 'missing_at_provider',
        reason: `Leg is absent from the provider report after ${ageHours}h, beyond the ${input.instrument} latency budget of ${budget}h — the refund may never have been sent.`,
      };
    }
    return {
      verdict: 'waiting',
      breakClass: 'timing',
      reason: `Leg is not in the provider report yet, but at ${ageHours}h it is inside the ${input.instrument} latency budget of ${budget}h — still in flight.`,
    };
  }

  // Rule 4 — amount mismatch: |Δ| ≤ ₹1 is rounding (waiting);
  // anything larger is a real break (stuck). The tolerance is a fixed
  // paise cap, never a percentage that could hide a large gap.
  if (amountDelta !== null && amountDelta > 0) {
    if (amountDelta > AMOUNT_TOLERANCE_PAISE) {
      return {
        verdict: 'stuck',
        breakClass: 'amount',
        reason: `Provider amount differs from the platform amount by ${amountDelta} paise, beyond the ${AMOUNT_TOLERANCE_PAISE}-paise rounding tolerance.`,
      };
    }
    return {
      verdict: 'waiting',
      breakClass: 'amount',
      reason: `Provider amount differs by only ${amountDelta} paise — within the ${AMOUNT_TOLERANCE_PAISE}-paise (₹1) rounding tolerance; expected to settle on restatement.`,
    };
  }

  // Rule 5 — budget crossed with no terminal resolution: a leg still
  // pending (or otherwise non-terminal) after its latency budget is
  // stuck on timing, even if every source currently agrees it is
  // pending.
  if (ageHours > budget) {
    return {
      verdict: 'stuck',
      breakClass: 'timing',
      reason: `Leg is ${ageHours}h old in state "${platformState}", beyond the ${input.instrument} latency budget of ${budget}h, with no terminal outcome — escalate.`,
    };
  }

  // Rule 5.5 — in-flight agreement: every source agrees the leg is
  // still moving (canonical states equal, non-terminal) and we are
  // inside the budget (Rule 5 already handled over-budget). Nothing
  // is broken; the leg is simply not settled yet — waiting.
  if (statesAgree && amountsEqual) {
    return {
      verdict: 'waiting',
      breakClass: 'timing',
      reason: `All three sources agree the leg is still in flight ("${platformState}") at ${ageHours}h, inside the ${input.instrument} latency budget of ${budget}h — waiting, not stuck. It counts as in agreement only once it settles.`,
    };
  }

  // Rule 6 — inside the budget, sources merely lag each other. If the
  // provider matches the platform and only the seller trails, that is
  // a lifecycle lag; otherwise the provider leg itself is still in
  // its expected transit window (timing).
  if (providerState !== null && providerState === platformState && sellerState !== null && sellerState !== platformState) {
    return {
      verdict: 'waiting',
      breakClass: 'lifecycle',
      reason: `Provider agrees with the platform ("${platformState}"); the seller record ("${sellerState}") is lagging — normal report/webhook delay inside the ${budget}h budget (${ageHours}h elapsed).`,
    };
  }
  return {
    verdict: 'waiting',
    breakClass: 'timing',
    reason: `States have not converged yet (platform "${platformState}", provider ${providerState === null ? 'no record yet' : `"${providerState}"`}), but at ${ageHours}h the leg is inside the ${input.instrument} latency budget of ${budget}h — expected latency, no action yet.`,
  };
}
