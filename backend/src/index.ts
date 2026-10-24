/**
 * @impactx/backend — return/refund engine public surface.
 *
 * Name note: `RefundLeg` exists twice by design — the refund-leg
 * data type (types.ts) and the RefundLeg state machine (machines.ts).
 * From this index, `RefundLeg` is the TYPE; the machine is exported
 * as `RefundLegMachine` (and is also inside `MACHINES.RefundLeg`).
 * Import from the module files directly if you need both unaliased.
 */
export * from './money.js';
export * from './types.js';
export * from './allocation.js';
export * from './waterfall.js';
export * from './idempotency.js';
export * from './audit.js';
export * from './reconciler.js';
export * from './eligibility.js';
export * from './disputes.js';
export * from './fraud.js';
export {
  DisputeCase,
  FraudReview,
  IllegalTransitionError,
  InspectionCase,
  ItemJourney,
  MACHINES,
  PickupAttempt,
  RefundLeg as RefundLegMachine,
  applyTransition,
  canTransition,
} from './machines.js';
export type { MachineName, StateMachine } from './machines.js';
