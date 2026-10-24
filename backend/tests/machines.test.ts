import { describe, expect, it } from 'vitest';
import { IllegalTransitionError, MACHINES, applyTransition } from '../src/machines.js';

describe('state machines', () => {
  it('exposes all six named machines with states and transitions', () => {
    expect(Object.keys(MACHINES).sort()).toEqual(
      ['DisputeCase', 'FraudReview', 'InspectionCase', 'ItemJourney', 'PickupAttempt', 'RefundLeg'].sort(),
    );
    for (const m of Object.values(MACHINES)) {
      expect(m.states.length).toBeGreaterThan(3);
    }
  });

  it('RefundLeg: credited → initiated is ILLEGAL and throws', () => {
    expect(() => applyTransition('RefundLeg', 'credited', 'initiate')).toThrow(IllegalTransitionError);
    // No event at all may take a credited leg back to initiated.
    for (const event of ['initiate', 'retry', 'approve', 'process']) {
      expect(() => applyTransition('RefundLeg', 'credited', event)).toThrow(IllegalTransitionError);
    }
  });

  it('RefundLeg: the legal path works end to end', () => {
    let s = 'requested';
    s = applyTransition('RefundLeg', s, 'approve');
    expect(s).toBe('approved');
    s = applyTransition('RefundLeg', s, 'initiate');
    expect(s).toBe('initiated');
    s = applyTransition('RefundLeg', s, 'process');
    expect(s).toBe('processed');
    s = applyTransition('RefundLeg', s, 'credit');
    expect(s).toBe('credited');
    // A reversal after credit is a new fact, not a step backwards.
    expect(applyTransition('RefundLeg', 'credited', 'reverse')).toBe('reversed');
    // Failure + retry branch.
    expect(applyTransition('RefundLeg', 'initiated', 'fail')).toBe('failed');
    expect(applyTransition('RefundLeg', 'failed', 'retry')).toBe('initiated');
  });

  it('ItemJourney: happy path plus failed-pickup and dispute branches', () => {
    let s = 'requested';
    s = applyTransition('ItemJourney', s, 'schedule_pickup');
    s = applyTransition('ItemJourney', s, 'attempt_pickup');
    s = applyTransition('ItemJourney', s, 'fail_pickup');
    expect(s).toBe('pickup_failed');
    s = applyTransition('ItemJourney', s, 'reschedule');
    s = applyTransition('ItemJourney', s, 'attempt_pickup');
    s = applyTransition('ItemJourney', s, 'picked_up');
    s = applyTransition('ItemJourney', s, 'receive');
    s = applyTransition('ItemJourney', s, 'start_inspection');
    s = applyTransition('ItemJourney', s, 'hold');
    expect(s).toBe('inspection_hold');
    s = applyTransition('ItemJourney', s, 'dispute');
    expect(s).toBe('disputed');
    s = applyTransition('ItemJourney', s, 'resolve_partial');
    expect(s).toBe('partial_refund_approved');
    s = applyTransition('ItemJourney', s, 'initiate_refund');
    s = applyTransition('ItemJourney', s, 'complete');
    expect(s).toBe('completed');
    expect(() => applyTransition('ItemJourney', 'completed', 'schedule_pickup')).toThrow(IllegalTransitionError);
    expect(() => applyTransition('ItemJourney', 'requested', 'complete')).toThrow(IllegalTransitionError);
  });

  it('unknown states are rejected, not silently accepted', () => {
    expect(() => applyTransition('DisputeCase', 'nonsense', 'close')).toThrow(IllegalTransitionError);
  });
});
