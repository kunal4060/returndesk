/**
 * fraud.ts — the fraud friction ladder, with fairness built in.
 *
 * Principles (report 03): roughly 9–15% of returns industry-wide are
 * fraudulent, but bracketing/sizing returns are mostly legitimate.
 * So the ladder escalates VERIFICATION, never accusation: every level
 * is an explainable set of signals, the customer always sees why, and
 * an appeal to a human is always available.
 *
 * Fairness guardrail, encoded as a hard rule: sizing-related return
 * patterns alone can never reach Level 3. Level 3 (manual review)
 * requires non-sizing anomalies. A legitimate heavy returner — the
 * classic case is 12 sizing returns in 90 days — is capped at
 * Level 2, and a previously upheld appeal actively reduces friction.
 */

export type FrictionLevel = 0 | 1 | 2 | 3;

export const FRICTION_ACTIONS: Readonly<Record<FrictionLevel, readonly string[]>> = {
  0: ['Standard return flow — no extra friction'],
  1: ['Extra photos requested before pickup'],
  2: ['Extra photos requested before pickup', 'Inspection before refund is released'],
  3: ['Extra photos requested before pickup', 'Inspection before refund is released', 'Manual review by a human agent before the refund is released'],
};

export interface FrictionInput {
  returnsLast90Days: number;
  accountAgeDays: number;
  /** True when every recent return is a size/fit return. */
  allSizingRelated: boolean;
  /**
   * Optional graded form of the sizing signal: the share (0..1) of
   * recent returns that are sizing/fit related. A sizing-DOMINANT
   * pattern (share ≥ 0.7) earns the same fairness cap as an
   * all-sizing pattern — bracketing does not stop being legitimate
   * because 3 returns in 10 were for other reasons (seeded profile
   * HR-5: 15 returns, 73% sizing, family account — capped at L2).
   */
  sizingShare?: number;
  /** Appeals by this customer that a human previously upheld. */
  priorAppealsUpheld: number;
}

export interface FrictionAssessment {
  level: FrictionLevel;
  signals: string[];
  fairnessNote: string;
  appealAvailable: true;
}

export function assessFriction(input: FrictionInput): FrictionAssessment {
  const { returnsLast90Days, accountAgeDays, allSizingRelated, priorAppealsUpheld } = input;
  const sizingShare = input.sizingShare;
  const sizingDominant =
    allSizingRelated || (sizingShare !== undefined && sizingShare >= 0.7);
  const signals: string[] = [];

  // Volume ladder.
  let level: FrictionLevel;
  if (returnsLast90Days <= 3) level = 0;
  else if (returnsLast90Days <= 7) level = 1;
  else if (returnsLast90Days <= 11) level = 2;
  else level = sizingDominant ? 2 : 3;
  if (returnsLast90Days > 3) {
    signals.push(`Return volume: ${returnsLast90Days} returns in the last 90 days.`);
  }

  // Sizing pattern: a legitimate explanation that caps the ladder.
  if (allSizingRelated && returnsLast90Days > 3) {
    signals.push(
      'All recent returns are sizing/fit related — bracketing sizes is a known legitimate pattern, so sizing alone caps friction at Level 2 and can never trigger manual review.',
    );
  } else if (!allSizingRelated && sizingDominant && returnsLast90Days > 3) {
    signals.push(
      `${Math.round((sizingShare ?? 0) * 100)}% of recent returns are sizing/fit related — a sizing-dominant bracketing pattern, so friction is capped at Level 2 and cannot trigger manual review on volume alone.`,
    );
  }

  // Non-sizing anomaly: a very new account returning at high volume
  // for non-sizing reasons is the pattern Level 3 exists for.
  if (!sizingDominant && accountAgeDays < 30 && returnsLast90Days >= 8) {
    level = 3;
    signals.push(
      `Account is ${accountAgeDays} days old with ${returnsLast90Days} non-sizing returns in 90 days — a non-sizing anomaly that requires human review.`,
    );
  } else if (accountAgeDays < 30 && returnsLast90Days > 3) {
    signals.push(`Account is new (${accountAgeDays} days old), which adds context but is not by itself an anomaly.`);
  }

  // Upheld appeals are evidence of good faith: they lower friction.
  if (priorAppealsUpheld > 0) {
    level = Math.max(0, level - 1) as FrictionLevel;
    signals.push(
      `${priorAppealsUpheld} prior appeal(s) were upheld by a human reviewer — friction reduced by one level.`,
    );
  }

  const fairnessNote =
    level <= 2 && sizingDominant && returnsLast90Days >= 8
      ? `Proportionality: this customer is a heavy returner (${returnsLast90Days} returns in 90 days), but the pattern is sizing-dominant. Friction is therefore capped at Level 2 — extra verification (photos, inspection before refund) rather than manual review or any accusation. Level 3 is reserved for non-sizing anomalies, and any friction can be appealed to a human.`
      : 'Proportionality: friction only ever adds verification steps, never an accusation or a silent block. Every signal above is shown to the customer with its reason, and any decision can be appealed to a human reviewer.';

  return { level, signals, fairnessNote, appealAvailable: true };
}
