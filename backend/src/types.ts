/**
 * types.ts — core domain types for the return/refund engine.
 *
 * All money fields are integer paise (suffix `Paise`). There is no ML
 * or risk-signal type in this package on purpose: fraud friction lives
 * in fraud.ts as an explainable rule output, not a black-box score.
 */

export type Instrument = 'card' | 'wallet' | 'voucher';

export interface OrderItem {
  id: string;
  name: string;
  sellerId: string;
  /** List (pre-coupon) price in integer paise. */
  listPricePaise: number;
}

export interface PaymentComponent {
  instrument: Instrument;
  /** Amount this instrument contributed to the payment, integer paise. */
  amountPaise: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  /** Cart-level coupon total in integer paise (0 when no coupon). */
  couponPaise: number;
  payments: PaymentComponent[];
}

/** One row of the allocation matrix: a single item split across instruments. */
export interface AllocationRow {
  itemId: string;
  name: string;
  sellerId: string;
  listPricePaise: number;
  /** This item's pro-rata share of the cart coupon (integer paise). */
  couponSharePaise: number;
  /** listPricePaise − couponSharePaise. This is the refundable base. */
  effectivePaise: number;
  /** Effective price split across instruments; sums exactly to effectivePaise. */
  byInstrument: Record<Instrument, number>;
}

/**
 * The persisted checkout allocation matrix (item × instrument).
 * Built once at checkout; refunds read it, they never re-derive it.
 * Plain JSON-serialisable object so it can be stored as-is.
 */
export interface AllocationMatrix {
  orderId: string;
  rows: AllocationRow[];
  /** Per-instrument column totals; each equals the payment total for it. */
  columnTotalsPaise: Record<Instrument, number>;
  totalListPaise: number;
  couponPaise: number;
  /** Sum of item effective prices = totalListPaise − couponPaise. */
  totalEffectivePaise: number;
}

/** One leg of a refund: money going back to one instrument. */
export interface RefundLeg {
  instrument: Instrument;
  amountPaise: number;
  /** Where the money goes, in customer-facing words. */
  destination: string;
  /** Per-instrument expected latency, in customer-facing words. */
  etaText: string;
  /** Voucher legs only: the re-issued voucher's expiry terms. */
  expiryNote?: string;
}

/** A fully explained refund computation for a set of returned items. */
export interface RefundPlan {
  orderId: string;
  itemIds: string[];
  mode: 'prorata' | 'priority';
  legs: RefundLeg[];
  /** Refundable value of the returned items before any clawback. */
  grossPaise: number;
  /** Free-shipping benefit reversed by this return (0 when it stands). */
  clawbackPaise: number;
  /** grossPaise − clawbackPaise, floored at 0. Equals the sum of legs. */
  totalPaise: number;
  /** Line-by-line explanation, suitable for showing to the customer. */
  explanation: string[];
}

/** One source's view of a refund leg (seller / platform / provider). */
export interface SourceRecord {
  source: 'platform' | 'provider' | 'seller';
  state: string;
  amountPaise: number | null;
  /** ISO timestamp or logical clock value when this record was observed. */
  recordedAt: string;
}

/** One entry of the tamper-evident audit chain (see audit.ts). */
export interface AuditEntry {
  seq: number;
  /** Timestamp from the audit log's injectable clock. */
  ts: string;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
  /** SHA-256 hex of the previous entry ('0'×64 for the genesis entry). */
  prevHash: string;
  /** SHA-256 hex of prevHash + canonical JSON of this entry's content. */
  hash: string;
}
