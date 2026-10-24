/**
 * library.ts — the wording library.
 *
 * Single source of truth for customer-facing status copy. Every state of
 * every backend state machine maps to three slots:
 *   what   — what this state means, in plain language
 *   next   — what happens next
 *   byWhen — the expected window (an estimate, labelled simulated)
 *
 * The same entries feed the customer pages, the simulated notifications
 * and the ops console, so the three can never disagree. Copy never says
 * money "has arrived" before the credited state — requested, approved,
 * initiated and processed are four different facts from credited.
 *
 * Machine state vocabularies mirror @impactx/backend machines.ts
 * (ItemJourney, PickupAttempt, InspectionCase, RefundLeg, DisputeCase,
 * FraudReview). The /eval page checks coverage against the live machine
 * definitions exported by the backend package.
 */

export interface Wording {
  what: string;
  next: string;
  byWhen: string;
}

export type MachineName =
  | "ItemJourney"
  | "PickupAttempt"
  | "InspectionCase"
  | "RefundLeg"
  | "DisputeCase"
  | "FraudReview";

const w = (what: string, next: string, byWhen: string): Wording => ({
  what,
  next,
  byWhen,
});

export const WORDING: Record<string, Record<string, Wording>> = {
  ItemJourney: {
    requested: w(
      "Your return request has been received. Nothing has been collected yet, and no refund has started.",
      "We will offer you pickup slots for this item.",
      "Pickup slots are usually offered within a few hours (simulated).",
    ),
    pickup_scheduled: w(
      "A pickup is booked for this item. Keep the item packed with its tags and accessories, if any.",
      "The courier will visit in the booked slot and check the item at your door.",
      "In the pickup slot you chose (simulated).",
    ),
    pickup_attempted: w(
      "The courier is attempting the pickup now.",
      "Please hand over the packed item. The courier checks it at the door and gives you a handover receipt.",
      "During the current pickup slot (simulated).",
    ),
    pickup_failed: w(
      "The pickup could not be completed. Your return is not cancelled — this happens often and can be fixed.",
      "You can pick a new slot, choose a drop-off point instead, or open a dispute if you were available and the courier did not come.",
      "You can reschedule right away; new slots are usually within 1–2 days (simulated).",
    ),
    in_transit: w(
      "Your item has been collected and is on its way to the seller's warehouse.",
      "The warehouse will inspect the item when it arrives.",
      "Usually 1–3 days depending on distance (simulated).",
    ),
    received: w(
      "The warehouse has received your item. It has not been inspected yet.",
      "Inspection will check the item's condition against the snapshot taken at your door.",
      "Inspection usually starts within 24 hours of arrival (simulated).",
    ),
    inspecting: w(
      "Your item is being inspected now.",
      "If the inspection passes, your refund is approved. If something looks different from the doorstep check, we will show you both records before deciding anything.",
      "Usually within 24 hours (simulated).",
    ),
    inspection_hold: w(
      "The inspection needs more time or more evidence. Your refund is paused, not refused.",
      "The inspection team will finish the check or ask you for information. You will see the reason for the hold on this page.",
      "Holds are reviewed within 2 working days (simulated).",
    ),
    disputed: w(
      "There is a disagreement about this return — for example about the pickup or the item's condition — and it is being reviewed as a dispute.",
      "A reviewer compares both sides' evidence. You can add your side from the dispute page.",
      "Disputes are decided within 3 working days (simulated).",
    ),
    approved: w(
      "Your return is approved. The refund has been approved but the money has not been sent yet.",
      "The refund will be initiated to the same instruments you paid with.",
      "Initiation usually follows within a few hours of approval (simulated).",
    ),
    partial_refund_approved: w(
      "A partial refund has been approved because the item's condition differs from a new item. The deduction and its arithmetic are shown on this page — nothing is deducted silently.",
      "The reduced refund will be initiated to the same instruments you paid with.",
      "Initiation usually follows within a few hours of approval (simulated).",
    ),
    refund_initiated: w(
      "The refund has been initiated. The money is on its way but has not reached your account yet — each payment instrument arrives at its own speed.",
      "Watch each instrument separately below: wallet and voucher arrive fast, card refunds take several working days.",
      "Wallet about 2 hours, voucher about 1 hour, card 5–7 working days (simulated).",
    ),
    completed: w(
      "This return is complete. Every refund leg for this item has been credited.",
      "Nothing more is needed from you. The full record stays on this page.",
      "Done.",
    ),
    cancelled: w(
      "This return was cancelled, so no refund will be issued for it.",
      "If this was a mistake, you can start a new return while the item is still inside its return window.",
      "The return window is shown on the item (simulated).",
    ),
    // Seeded-dataset journey aliases (the scenario's own state names,
    // mapped to the same honest copy as their machine equivalents).
    inspection_dispute_open: w(
      "The warehouse inspection disagrees with the doorstep check that was frozen and shared with you at handover, so an inspection dispute is open. No deduction has been taken.",
      "A human reviewer compares the doorstep snapshot with the warehouse finding. If the warehouse verdict is upheld, the published condition tier applies and you will see the arithmetic and the photo proof first.",
      "Disputes are decided within 3 working days (simulated).",
    ),
    refund_in_progress: w(
      "Your refund is in progress. Each instrument is travelling at its own speed, and money counts as back only when a leg shows as credited.",
      "Watch the legs separately on this page: wallet and voucher arrive fast, card refunds take several working days.",
      "Wallet about 2 hours, voucher about 1 hour, card 5–7 working days (simulated).",
    ),
    pickup_conflict: w(
      "The courier's visit record and your account of the pickup disagree, so the case sits in a conflicting-claims state. Neither side is believed automatically.",
      "You can reschedule the pickup, choose a drop-off point instead, or add your evidence to the dispute.",
      "Rescheduling is available immediately (simulated).",
    ),
  },

  PickupAttempt: {
    scheduled: w(
      "A pickup visit is booked but the courier has not set out yet.",
      "The courier will travel to your address in the booked slot.",
      "In the booked slot (simulated).",
    ),
    en_route: w(
      "The courier is on the way to your address.",
      "Keep the item packed and your phone reachable.",
      "Within the current slot (simulated).",
    ),
    attempted: w(
      "The courier is at, or has just visited, your address.",
      "The outcome of this visit — collected, or the reason it could not be collected — is recorded with time and place evidence.",
      "Recorded immediately (simulated).",
    ),
    succeeded: w(
      "The item was collected in this visit. The courier's doorstep check was saved and shared with you — it cannot be changed later.",
      "The item travels to the warehouse for inspection.",
      "Usually 1–3 days (simulated).",
    ),
    failed: w(
      "This visit did not collect the item. The courier's recorded reason and evidence are shown next to your account of the visit.",
      "You can reschedule, switch to drop-off, or dispute the visit record.",
      "Rescheduling is available immediately (simulated).",
    ),
    rescheduled: w(
      "This visit was replaced by a new booking.",
      "The new visit follows the new slot.",
      "As per the new slot (simulated).",
    ),
  },

  InspectionCase: {
    pending: w(
      "The item has arrived but its inspection has not started.",
      "An inspector will check the item against the doorstep snapshot.",
      "Usually within 24 hours of arrival (simulated).",
    ),
    in_progress: w(
      "The inspection is under way.",
      "The result — pass, hold, or a condition finding — will appear here with photo proof.",
      "Usually within 24 hours (simulated).",
    ),
    passed: w(
      "The inspection passed: the item matches the doorstep snapshot.",
      "Your refund proceeds at the full refundable amount.",
      "Refund initiation usually follows within a few hours (simulated).",
    ),
    failed: w(
      "The warehouse inspection says the item does not match its expected condition. This is a claim, not a final decision — the doorstep snapshot is frozen evidence on your side.",
      "You can accept the finding, or dispute it. A reviewer compares the doorstep snapshot with the warehouse finding before any deduction.",
      "Disputes are decided within 3 working days (simulated).",
    ),
    hold: w(
      "The inspection is on hold for more time or evidence. No deduction has been made.",
      "The team finishes the check or asks for information; the reason is shown here.",
      "Reviewed within 2 working days (simulated).",
    ),
    disputed: w(
      "You have disputed the inspection finding and it is under human review.",
      "A reviewer compares both evidence sets and decides: full refund, partial refund, or the finding stands.",
      "Within 3 working days (simulated).",
    ),
    partial_approved: w(
      "A partial refund was approved for this inspection: a condition deduction applies, with the arithmetic and photo proof shown.",
      "The reduced amount proceeds to refund initiation.",
      "Initiation usually follows within a few hours (simulated).",
    ),
    resolved: w(
      "This inspection case is closed and its outcome is final in the record.",
      "Nothing more is needed. The full evidence and decision stay visible here.",
      "Done.",
    ),
  },

  RefundLeg: {
    requested: w(
      "This part of your refund has been requested. It has not been approved or sent yet.",
      "The refund will be approved once the return clears inspection.",
      "Approval follows the inspection result (simulated).",
    ),
    approved: w(
      "This part of your refund is approved. The money has not been sent yet.",
      "It will be initiated to the original payment instrument.",
      "Usually within a few hours of approval (simulated).",
    ),
    initiated: w(
      "This part of your refund has been initiated with the payment provider. It has not reached your account yet.",
      "The provider processes it and then credits your instrument. Each instrument has its own speed.",
      "Wallet about 2 hours, voucher about 1 hour, card 5–7 working days (simulated).",
    ),
    processed: w(
      "The payment provider has processed this refund. It is with your bank or wallet provider now, but not yet credited.",
      "It will show as credited here only when the provider confirms the credit.",
      "Card credits typically land within the 5–7 working-day window (simulated).",
    ),
    credited: w(
      "This money is back with you — the provider has confirmed the credit.",
      "Nothing more is needed for this part of the refund.",
      "Done.",
    ),
    failed: w(
      "This part of the refund failed at the provider. Your money is not lost: the amount is still owed to you and the failure is being retried safely — a retry can never pay you twice or charge you.",
      "We retry with the same refund reference, so exactly one credit can ever be issued for this leg.",
      "Retries are attempted within 24 hours (simulated).",
    ),
    reversed: w(
      "The provider reversed this refund after processing it. This is unusual and is flagged for our operations team automatically.",
      "A reviewer checks the provider record against ours and re-issues or explains the reversal. You do not need to chase it — the case is already open.",
      "Review within 2 working days (simulated).",
    ),
    requires_action: w(
      "This refund needs one action from you before it can be sent — for example, bank details for an instrument that cannot receive refunds directly.",
      "Add the requested details from this page and the refund continues from where it stopped.",
      "The refund resumes as soon as the details are supplied (simulated).",
    ),
  },

  DisputeCase: {
    opened: w(
      "Your dispute has been opened and is waiting for a reviewer.",
      "A reviewer will compare both sides' evidence.",
      "Review usually starts within 1 working day (simulated).",
    ),
    under_review: w(
      "A reviewer is comparing the evidence from both sides.",
      "You will get a decision with reasons, or a request for specific evidence.",
      "Decisions are usually made within 3 working days (simulated).",
    ),
    evidence_requested: w(
      "The reviewer needs one specific piece of evidence from you — it is named on the dispute page, nothing more.",
      "Add it from the dispute page; the review continues from the same place.",
      "The review clock pauses only for the named item (simulated).",
    ),
    escalated: w(
      "Your dispute has been escalated to a senior reviewer because the evidence conflicts.",
      "The senior reviewer decides from the full record.",
      "Within 2 working days of escalation (simulated).",
    ),
    decided_customer: w(
      "The dispute was decided in your favour.",
      "The refund outcome shown on the dispute page will now be processed.",
      "Processing follows the normal instrument timelines (simulated).",
    ),
    decided_seller: w(
      "The dispute was decided in the seller's favour. The reasons and the evidence relied on are shown on the dispute page.",
      "You can appeal once with new evidence if you have it.",
      "Appeals are reviewed within 3 working days (simulated).",
    ),
    partial_refund_decided: w(
      "The dispute was decided as a partial refund. The deduction follows the published condition tiers and its arithmetic is shown in full.",
      "The reduced amount will now be processed to your original instruments.",
      "Processing follows the normal instrument timelines (simulated).",
    ),
    closed: w(
      "This dispute is closed. Its full record — evidence, decision, reasons — stays visible here.",
      "Nothing more is needed.",
      "Done.",
    ),
  },

  FraudReview: {
    unflagged: w(
      "No extra checks apply to your returns.",
      "Returns follow the standard flow.",
      "Standard timelines apply (simulated).",
    ),
    flagged: w(
      "Your recent return pattern needs one extra check before refunds are processed. This is a verification step, not an accusation — sizing and fit returns are a normal part of shopping.",
      "The exact checks and the signals behind them are listed on this page, and you can appeal at any time.",
      "The check is explained before it applies (simulated).",
    ),
    extra_verification: w(
      "For now, returns from your account need extra photos at pickup. Refunds are not reduced and no return is refused because of this.",
      "Take the listed photos at handover; the step is removed automatically when the pattern normalises, or sooner if your appeal succeeds.",
      "Reviewed automatically after your next returns (simulated).",
    ),
    inspection_first: w(
      "For now, refunds on your returns are processed after inspection instead of at pickup. Amounts are unchanged.",
      "This step is removed automatically when the pattern normalises, or sooner if your appeal succeeds.",
      "Inspection adds about 24 hours (simulated).",
    ),
    manual_review: w(
      "A person reviews your returns before refunds are processed. Amounts are unchanged and no return is refused automatically.",
      "You can appeal and a different reviewer will look at the full record.",
      "Manual review is usually completed within 2 working days (simulated).",
    ),
    appealed: w(
      "Your appeal is with a human reviewer who was not involved in the original step.",
      "They can remove the extra step entirely or explain in writing why it stays.",
      "Appeals are decided within 3 working days (simulated).",
    ),
    cleared: w(
      "The extra checks on your account have been removed.",
      "Your returns follow the standard flow again.",
      "Effective immediately (simulated).",
    ),
    upheld: w(
      "After review, the extra verification step stays for now. The written reasons are on this page.",
      "The step is re-checked automatically as your return pattern changes, and you can appeal again with new information.",
      "Re-checked automatically (simulated).",
    ),
  },
};

/** Fallback for source-record vocabularies (seller/provider states). */
export const SOURCE_STATE_WORDING: Record<string, Wording> = {
  pending: w(
    "This source has recorded the refund as pending — it has not confirmed completion.",
    "We keep comparing this record with the other sources until they agree.",
    "Compared continuously (simulated).",
  ),
  initiated: WORDING.RefundLeg.initiated,
  processed: WORDING.RefundLeg.processed,
  credited: WORDING.RefundLeg.credited,
  reversed: WORDING.RefundLeg.reversed,
  failed: WORDING.RefundLeg.failed,
  missing: w(
    "This source has no record of the refund yet.",
    "If the record does not appear inside the expected window, the leg is flagged as stuck for a reviewer.",
    "Windows differ per instrument (simulated).",
  ),
};

export function getWording(machine: string, state: string): Wording {
  return (
    WORDING[machine]?.[state] ??
    SOURCE_STATE_WORDING[state] ?? {
      what: `This item is in state "${state}".`,
      next: "The record will be updated as the return progresses.",
      byWhen: "Timelines are estimates (simulated).",
    }
  );
}

/** Wording for any state, searching every machine (states are unique enough). */
export function getWordingForState(state: string): Wording {
  for (const machine of Object.keys(WORDING)) {
    const entry = WORDING[machine]?.[state];
    if (entry) return entry;
  }
  return getWording("", state);
}

/** Every state the library covers, per machine — used by the coverage check. */
export function libraryCoverage(): { machine: string; states: string[] }[] {
  return Object.entries(WORDING).map(([machine, states]) => ({
    machine,
    states: Object.keys(states),
  }));
}

export interface NotificationItem {
  id: string;
  state: string;
  title: string;
  body: string;
}

/**
 * Simulated notifications, derived from the library — the notification
 * text is the library's own words, so a notification can never promise
 * more than the state page does.
 */
export function notificationForState(
  machine: string,
  state: string,
  contextLabel: string,
): NotificationItem {
  const entry = getWording(machine, state);
  return {
    id: `${machine}:${state}:${contextLabel}`,
    state,
    title: `${contextLabel} — update`,
    body: `${entry.what} Next: ${entry.next}`,
  };
}
