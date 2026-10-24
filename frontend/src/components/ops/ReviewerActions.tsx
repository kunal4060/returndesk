"use client";

import { useState } from "react";
import { useSim } from "@/state/SimProvider";

const ACTIONS = [
  { id: "mark_timing_difference", label: "Mark timing difference", hint: "The sources disagree only because one is slower; no money is at risk." },
  { id: "escalate", label: "Escalate", hint: "Hand this leg to a senior reviewer with the full record attached." },
  { id: "force_recheck", label: "Force re-check", hint: "Re-run the three-way comparison against the freshest records." },
] as const;

/**
 * ReviewerActions — few and explicit, and every action requires a
 * written reason. Each submission lands in the audit ledger with the
 * reviewer, the leg, and the reason.
 */
export function ReviewerActions({ returnId, legId }: { returnId: string; legId: string }) {
  const sim = useSim();
  const [selected, setSelected] = useState<string>(ACTIONS[0].id);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string>("");

  const submit = () => {
    if (!reason.trim()) return;
    sim.appendAudit("ops-reviewer", `reviewer_${selected}`, {
      returnId,
      legId,
      reason: reason.trim(),
    });
    setDone(`Recorded in the audit ledger: ${selected.replace(/_/g, " ")} — "${reason.trim()}"`);
    setReason("");
  };

  return (
    <section className="rounded border border-rule bg-surface p-4" aria-label="Reviewer actions">
      <h3 className="eyebrow">Reviewer actions</h3>
      <div className="mt-3 flex flex-col gap-2">
        {ACTIONS.map((a) => (
          <label
            key={a.id}
            className={`cursor-pointer rounded border px-3 py-2.5 ${selected === a.id ? "border-accent bg-paper" : "border-rule"}`}
          >
            <span className="flex items-center gap-2 text-[13.5px] font-medium">
              <input
                type="radio"
                name="reviewer-action"
                value={a.id}
                checked={selected === a.id}
                onChange={() => setSelected(a.id)}
                className="accent-[#9A6B1F]"
              />
              {a.label}
            </span>
            <span className="mt-0.5 block pl-6 text-[12.5px] text-ink-2">{a.hint}</span>
          </label>
        ))}
      </div>
      <label className="mt-3 block">
        <span className="eyebrow">Reason (required)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Why is this the right call? This text goes into the audit ledger."
          className="mt-1.5 w-full rounded border border-rule bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-accent"
        />
      </label>
      <button
        onClick={submit}
        disabled={!reason.trim()}
        className="mt-3 rounded bg-ink px-4 py-2 text-[13px] font-semibold text-paper disabled:opacity-40"
      >
        Record action
      </button>
      {done && <p className="mt-2.5 text-[13px] text-ok">{done}</p>}
    </section>
  );
}
