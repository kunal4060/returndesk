/**
 * idempotency.ts — exactly-once refund issuance (report 02, §4).
 *
 * The rule that makes retries safe: the idempotency key IS the refund
 * intent id. It is minted once when the refund is accepted, passed
 * through to the provider, and NEVER re-minted or released on a
 * timeout — a timeout means "unknown", not "failed", so a retry
 * re-presents the same intentId and gets the stored receipt back
 * without money moving again. (There is deliberately no separate
 * timeout API: `issue` with the same intentId *is* the timeout retry.)
 *
 * Idempotency alone is not enough: a *different* intent could still
 * ask for the same money twice. So issuance is also gated by a
 * refundable-balance ledger per payment — captured minus already
 * issued — checked on every first issuance.
 */

export interface IssuanceLeg {
  instrument: string;
  amountPaise: number;
}

export interface RefundReceipt {
  intentId: string;
  /** Deterministic per intent: `iss_<intentId>` — identical on replays. */
  issuanceId: string;
  totalPaise: number;
  status: 'issued';
}

interface IntentRecord {
  receipt: RefundReceipt;
  paymentId: string;
  /** Canonical fingerprint of the legs, to detect intent reuse with different parameters. */
  fingerprint: string;
  attempts: number;
}

export class LedgerGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerGuardError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export class RefundIssuer {
  readonly #balances = new Map<string, number>();
  readonly #intents = new Map<string, IntentRecord>();
  #totalIssuedPaise = 0;

  /** @param refundableBalances paymentId -> refundable balance, integer paise. */
  constructor(refundableBalances: Record<string, number>) {
    for (const [paymentId, balance] of Object.entries(refundableBalances)) {
      if (!Number.isInteger(balance) || balance < 0) {
        throw new Error(`refundable balance for ${paymentId} must be non-negative integer paise`);
      }
      this.#balances.set(paymentId, balance);
    }
  }

  /** Total money actually issued across all intents (replays excluded). */
  get totalIssuedPaise(): number {
    return this.#totalIssuedPaise;
  }

  /** Remaining refundable balance for a payment (integer paise). */
  refundableBalance(paymentId: string): number {
    const b = this.#balances.get(paymentId);
    if (b === undefined) throw new Error(`unknown paymentId: ${paymentId}`);
    return b;
  }

  /** How many times `issue` was called for this intent (1 = no retries). */
  attemptsFor(intentId: string): number {
    return this.#intents.get(intentId)?.attempts ?? 0;
  }

  /** How many of those calls were replays that moved no money. */
  duplicateAttemptsFor(intentId: string): number {
    const attempts = this.attemptsFor(intentId);
    return attempts === 0 ? 0 : attempts - 1;
  }

  /**
   * Issue a refund under a stable intent id.
   *
   * First call: validates the legs against the payment's refundable
   * balance (ledger guard), records the issuance, moves money once.
   * Any later call with the same intentId and the same legs returns
   * the SAME receipt values, increments the attempts counter, and
   * moves NO money. Reusing an intentId with different legs/payment
   * throws IdempotencyConflictError (the Stripe behaviour: never guess).
   */
  issue(intentId: string, paymentId: string, legs: readonly IssuanceLeg[]): RefundReceipt {
    if (!intentId) throw new Error('issue: intentId must be a non-empty stable id');
    for (const leg of legs) {
      if (!Number.isInteger(leg.amountPaise) || leg.amountPaise < 0) {
        throw new Error(`issue: leg amount for ${leg.instrument} is not non-negative integer paise`);
      }
    }
    const totalPaise = legs.reduce((a, l) => a + l.amountPaise, 0);
    if (totalPaise <= 0) throw new Error('issue: refund legs must total more than 0 paise');
    const fingerprint = legs
      .map((l) => `${l.instrument}:${l.amountPaise}`)
      .sort()
      .join('|');

    const existing = this.#intents.get(intentId);
    if (existing) {
      if (existing.paymentId !== paymentId || existing.fingerprint !== fingerprint) {
        throw new IdempotencyConflictError(
          `intent ${intentId} was already issued with different legs/payment — refusing to guess`,
        );
      }
      existing.attempts += 1;
      return existing.receipt;
    }

    const balance = this.#balances.get(paymentId);
    if (balance === undefined) throw new Error(`unknown paymentId: ${paymentId}`);
    if (totalPaise > balance) {
      throw new LedgerGuardError(
        `refund of ${totalPaise} paise exceeds remaining refundable balance ${balance} paise for payment ${paymentId}`,
      );
    }

    const receipt: RefundReceipt = Object.freeze({
      intentId,
      issuanceId: `iss_${intentId}`,
      totalPaise,
      status: 'issued' as const,
    });
    this.#balances.set(paymentId, balance - totalPaise);
    this.#intents.set(intentId, { receipt, paymentId, fingerprint, attempts: 1 });
    this.#totalIssuedPaise += totalPaise;
    return receipt;
  }
}

/**
 * WebhookInbox — provider webhooks are at-least-once, so consumption
 * is deduped by provider event id: the handler runs on first delivery
 * and never again for the same event id. A handler that throws does
 * NOT mark the event processed, so a genuine redelivery can retry it.
 */
export class WebhookInbox {
  readonly #seen = new Set<string>();

  receive(eventId: string, handler: () => void): 'processed' | 'duplicate' {
    if (!eventId) throw new Error('receive: eventId must be non-empty');
    if (this.#seen.has(eventId)) return 'duplicate';
    handler();
    this.#seen.add(eventId);
    return 'processed';
  }

  hasSeen(eventId: string): boolean {
    return this.#seen.has(eventId);
  }
}
