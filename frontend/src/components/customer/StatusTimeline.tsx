"use client";

import Link from "next/link";
import { StateChip } from "@/components/ui/StateChip";

export interface Beat {
  label: string;
  status: "done" | "current" | "future" | "exception";
  note?: string;
}

const BEAT_LABELS = ["Requested", "Pickup", "Inspection", "Refund approved", "Money back"];

/** Map an ItemJourney state onto the 5 macro beats. */
export function beatsForState(state: string): Beat[] {
  const mk = (statuses: Beat["status"][], noteIdx = -1, note = ""): Beat[] =>
    BEAT_LABELS.map((label, i) => ({
      label,
      status: statuses[i] ?? "future",
      note: i === noteIdx ? note : undefined,
    }));
  switch (state) {
    case "requested":
      return mk(["done", "current", "future", "future", "future"]);
    case "pickup_scheduled":
    case "pickup_attempted":
      return mk(["done", "current", "future", "future", "future"]);
    case "pickup_failed":
      return mk(["done", "exception", "future", "future", "future"], 1, "Pickup failed — reschedule, drop off, or dispute");
    case "in_transit":
    case "received":
      return mk(["done", "done", "current", "future", "future"]);
    case "inspecting":
      return mk(["done", "done", "current", "future", "future"]);
    case "inspection_hold":
      return mk(["done", "done", "exception", "future", "future"], 2, "Inspection on hold — paused, not refused");
    case "disputed":
    case "inspection_dispute_open":
      return mk(["done", "done", "exception", "future", "future"], 2, "Inspection dispute open — a reviewer is comparing the doorstep snapshot with the warehouse finding");
    case "refund_in_progress":
      return mk(["done", "done", "done", "done", "current"], 4, "In progress — not yet credited; each instrument arrives at its own speed");
    case "approved":
      return mk(["done", "done", "done", "done", "current"]);
    case "partial_refund_approved":
      return mk(["done", "done", "done", "done", "current"], 3, "Partial refund approved — deduction arithmetic shown below");
    case "refund_initiated":
      return mk(["done", "done", "done", "done", "current"], 4, "Initiated — not yet credited; each instrument arrives at its own speed");
    case "completed":
      return mk(["done", "done", "done", "done", "done"]);
    case "cancelled":
      return mk(["exception", "future", "future", "future", "future"], 0, "Return cancelled");
    default:
      return mk(["current", "future", "future", "future", "future"]);
  }
}

const SHAPE = { done: "done", current: "current", future: "future", exception: "exception" } as const;
const TONE = { done: "ok", current: "accent", future: "neutral", exception: "stuck" } as const;

/**
 * StatusTimeline — the item's macro journey. Exception beats are
 * flagged on the timeline itself, with the dispute action attached.
 */
export function StatusTimeline({
  state,
  disputeHref,
}: {
  state: string;
  disputeHref?: string;
}) {
  const beats = beatsForState(state);
  return (
    <div>
      <ol className="flex flex-wrap items-start gap-y-3" aria-label={`Return progress: ${state.replace(/_/g, " ")}`}>
        {beats.map((beat, i) => (
          <li key={beat.label} className="flex min-w-[108px] flex-1 items-start">
            <div className="flex flex-col">
              <StateChip label={beat.label} tone={TONE[beat.status]} shape={SHAPE[beat.status]} />
              {beat.note && (
                <span className="mt-1 max-w-[180px] text-[12px] leading-snug text-stuck">{beat.note}</span>
              )}
              {beat.status === "exception" && disputeHref && (
                <Link href={disputeHref} className="mt-1 text-[12px] font-medium text-accent underline underline-offset-2">
                  Open dispute
                </Link>
              )}
            </div>
            {i < beats.length - 1 && <span className="mx-2 mt-[5px] h-px flex-1 bg-rule" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <p className="mt-2 font-mono text-[11px] text-ink-2">state: {state}</p>
    </div>
  );
}
