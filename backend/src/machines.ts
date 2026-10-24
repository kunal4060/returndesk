/**
 * machines.ts — six explicit, named state machines.
 *
 * Design rule (brief): no collapsed "status" field. Each machine owns
 * its vocabulary, and only the transitions listed here are legal.
 * `applyTransition` either returns the new state or throws
 * IllegalTransitionError — an illegal transition is rejected loudly
 * (and, in the app, audit-logged), never silently ignored.
 *
 * RefundLeg honesty rule: requested → approved → initiated → processed
 * → credited are five different facts. In particular `credited` is
 * terminal for the forward flow: credited → initiated is ILLEGAL (a
 * reversal is a new event into `reversed`, not a step backwards).
 */

export class IllegalTransitionError extends Error {
  readonly machine: string;
  readonly from: string;
  readonly event: string;
  constructor(machine: string, from: string, event: string) {
    super(`Illegal transition in ${machine}: event "${event}" is not allowed from state "${from}"`);
    this.name = 'IllegalTransitionError';
    this.machine = machine;
    this.from = from;
    this.event = event;
  }
}

export interface StateMachine {
  name: MachineName;
  states: readonly string[];
  /** transitions[from][event] = next state. Absent = illegal. */
  transitions: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** States with no outgoing transitions. */
  terminalStates: readonly string[];
}

export type MachineName =
  | 'ItemJourney'
  | 'PickupAttempt'
  | 'InspectionCase'
  | 'RefundLeg'
  | 'DisputeCase'
  | 'FraudReview';

function machine(
  name: MachineName,
  states: readonly string[],
  transitions: Record<string, Record<string, string>>,
  terminalStates: readonly string[],
): StateMachine {
  return { name, states, transitions, terminalStates };
}

/**
 * ItemJourney — one returned item's life.
 * Happy path: requested → pickup_scheduled → pickup_attempted →
 * in_transit → received → inspecting → approved → refund_initiated →
 * completed.
 * Branches: pickup_failed (from an attempt; reschedule loops back),
 * inspection_hold (warehouse needs more time/evidence), disputed
 * (customer contests the inspection outcome), partial_refund_approved
 * (a condition-tier deduction was agreed instead of a full refund).
 */
export const ItemJourney = machine(
  'ItemJourney',
  [
    'requested',
    'pickup_scheduled',
    'pickup_attempted',
    'in_transit',
    'received',
    'inspecting',
    'approved',
    'refund_initiated',
    'completed',
    'pickup_failed',
    'inspection_hold',
    'disputed',
    'partial_refund_approved',
    'cancelled',
  ],
  {
    requested: { schedule_pickup: 'pickup_scheduled', cancel: 'cancelled' },
    pickup_scheduled: { attempt_pickup: 'pickup_attempted', cancel: 'cancelled' },
    pickup_attempted: { picked_up: 'in_transit', fail_pickup: 'pickup_failed' },
    pickup_failed: { reschedule: 'pickup_scheduled', drop_off: 'in_transit', cancel: 'cancelled' },
    in_transit: { receive: 'received' },
    received: { start_inspection: 'inspecting' },
    inspecting: {
      approve: 'approved',
      hold: 'inspection_hold',
      dispute: 'disputed',
      partial_approve: 'partial_refund_approved',
    },
    inspection_hold: {
      resume_inspection: 'inspecting',
      approve: 'approved',
      dispute: 'disputed',
      partial_approve: 'partial_refund_approved',
    },
    disputed: {
      resolve_approve: 'approved',
      resolve_partial: 'partial_refund_approved',
      resume_inspection: 'inspecting',
    },
    approved: { initiate_refund: 'refund_initiated' },
    partial_refund_approved: { initiate_refund: 'refund_initiated' },
    refund_initiated: { complete: 'completed' },
    completed: {},
    cancelled: {},
  },
  ['completed', 'cancelled'],
);

/** PickupAttempt — one courier visit, modelled as an evidence bundle. */
export const PickupAttempt = machine(
  'PickupAttempt',
  ['scheduled', 'en_route', 'attempted', 'succeeded', 'failed', 'rescheduled'],
  {
    scheduled: { depart: 'en_route', cancel: 'rescheduled' },
    en_route: { arrive: 'attempted' },
    attempted: { collect: 'succeeded', fail: 'failed' },
    failed: { reschedule: 'rescheduled' },
    rescheduled: { schedule: 'scheduled' },
    succeeded: {},
  },
  ['succeeded'],
);

/** InspectionCase — doorstep/warehouse quality check for one item. */
export const InspectionCase = machine(
  'InspectionCase',
  ['pending', 'in_progress', 'passed', 'failed', 'hold', 'disputed', 'partial_approved', 'resolved'],
  {
    pending: { start: 'in_progress' },
    in_progress: { pass: 'passed', fail: 'failed', hold: 'hold', dispute: 'disputed' },
    hold: { resume: 'in_progress', dispute: 'disputed', partial_approve: 'partial_approved' },
    failed: { dispute: 'disputed', resolve: 'resolved' },
    disputed: { pass: 'passed', partial_approve: 'partial_approved', resolve: 'resolved' },
    partial_approved: { resolve: 'resolved' },
    passed: { resolve: 'resolved' },
    resolved: {},
  },
  ['resolved'],
);

/**
 * RefundLeg — one instrument's refund, mirroring gateway vocabularies
 * (Razorpay/Stripe in report 02, §3). `requires_action` covers rails
 * with no native refund (COD-style: the customer must supply bank
 * details). `credited` only exits via `reverse` (a bank/chargeback
 * reversal is a new fact, never a step back to `initiated`).
 */
export const RefundLeg = machine(
  'RefundLeg',
  ['requested', 'approved', 'initiated', 'processed', 'credited', 'failed', 'reversed', 'requires_action'],
  {
    requested: { approve: 'approved', reject: 'failed' },
    approved: { initiate: 'initiated' },
    initiated: { process: 'processed', fail: 'failed', require_action: 'requires_action' },
    requires_action: { action_completed: 'initiated', expire: 'failed' },
    processed: { credit: 'credited', fail: 'failed', reverse: 'reversed' },
    credited: { reverse: 'reversed' },
    failed: { retry: 'initiated' },
    reversed: {},
  },
  ['reversed'],
);

/** DisputeCase — a contested inspection/pickup outcome under review. */
export const DisputeCase = machine(
  'DisputeCase',
  [
    'opened',
    'under_review',
    'evidence_requested',
    'escalated',
    'decided_customer',
    'decided_seller',
    'partial_refund_decided',
    'closed',
  ],
  {
    opened: { start_review: 'under_review' },
    under_review: {
      request_evidence: 'evidence_requested',
      decide_customer: 'decided_customer',
      decide_seller: 'decided_seller',
      decide_partial: 'partial_refund_decided',
      escalate: 'escalated',
    },
    evidence_requested: { evidence_received: 'under_review' },
    escalated: {
      decide_customer: 'decided_customer',
      decide_seller: 'decided_seller',
      decide_partial: 'partial_refund_decided',
    },
    decided_customer: { close: 'closed' },
    decided_seller: { close: 'closed' },
    partial_refund_decided: { close: 'closed' },
    closed: {},
  },
  ['closed'],
);

/**
 * FraudReview — friction is verification, never accusation. Levels are
 * applied by fraud.ts; this machine tracks a review's progress and the
 * appeal path (appeal → overturned/cleared or upheld).
 */
export const FraudReview = machine(
  'FraudReview',
  [
    'unflagged',
    'flagged',
    'extra_verification',
    'inspection_first',
    'manual_review',
    'appealed',
    'cleared',
    'upheld',
  ],
  {
    unflagged: { flag: 'flagged', clear: 'cleared' },
    flagged: {
      require_extra_verification: 'extra_verification',
      require_inspection_first: 'inspection_first',
      require_manual_review: 'manual_review',
      clear: 'cleared',
    },
    extra_verification: {
      escalate: 'inspection_first',
      appeal: 'appealed',
      clear: 'cleared',
      uphold: 'upheld',
    },
    inspection_first: {
      escalate: 'manual_review',
      appeal: 'appealed',
      clear: 'cleared',
      uphold: 'upheld',
    },
    manual_review: { appeal: 'appealed', clear: 'cleared', uphold: 'upheld' },
    appealed: { overturn: 'cleared', uphold: 'upheld' },
    cleared: {},
    upheld: {},
  },
  ['cleared', 'upheld'],
);

export const MACHINES: Readonly<Record<MachineName, StateMachine>> = {
  ItemJourney,
  PickupAttempt,
  InspectionCase,
  RefundLeg,
  DisputeCase,
  FraudReview,
};

/**
 * Apply `event` to state `from` of the named machine.
 * Returns the new state; throws IllegalTransitionError for anything
 * the machine does not explicitly allow (including unknown states).
 */
export function applyTransition(machineName: MachineName, from: string, event: string): string {
  const m = MACHINES[machineName];
  if (!m.states.includes(from)) {
    throw new IllegalTransitionError(machineName, from, event);
  }
  const next = m.transitions[from]?.[event];
  if (next === undefined) {
    throw new IllegalTransitionError(machineName, from, event);
  }
  return next;
}

/** True when (from, event) is a legal transition of the named machine. */
export function canTransition(machineName: MachineName, from: string, event: string): boolean {
  const m = MACHINES[machineName];
  return m.states.includes(from) && m.transitions[from]?.[event] !== undefined;
}
