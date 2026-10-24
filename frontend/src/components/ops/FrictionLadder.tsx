"use client";

import { useState } from "react";
import { StateChip } from "@/components/ui/StateChip";
import { FRICTION_ACTIONS, type FrictionResult } from "@/lib/engine";
import { useSim } from "@/state/SimProvider";

/**
 * FrictionLadder — the fraud friction ladder for one profile: every
 * signal shown with its explanation, the current level on the ladder,
 * the fairness note, and the appeal path. Friction escalates
 * verification, never accusation — and a human can overturn it, which
 * is itself written to the audit ledger.
 */
export function FrictionLadder({
  profileId,
  assessment,
}: {
  profileId: string;
  assessment: FrictionResult;
}) {
  const sim = useSim();
  const [appealNote, setAppealNote] = useState("");
  const [status, setStatus] = useState<string>("");

  const numericLevel =
    typeof assessment.level === "number"
      ? assessment.level
      : Number.parseInt(String(assessment.level).replace(/[^0-9]/g, ""), 10) || 0;

  const appeal = () => {
    sim.appendAudit("customer", "friction_appeal_filed", {
      profileId,
      level: assessment.level,
      note: appealNote.trim() || "Appeal filed from the friction page.",
    });
    setStatus("Appeal filed and audit-logged. A reviewer who was not involved in the original step will decide it.");
  };

  const overturn = () => {
    sim.appendAudit("ops-reviewer", "friction_overturned", {
      profileId,
      fromLevel: assessment.level,
      note: "Reviewer overturned the friction step after appeal; profile returns to the standard flow.",
    });
    setStatus("Overturned by a human reviewer and audit-logged. The profile is back to L0 — no extra checks.");
  };

  return (
    <section className="rounded border border-rule bg-surface p-5" aria-label="Friction ladder">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">
          Profile <span className="font-mono">{profileId}</span>
        </h3>
        <span className="font-mono text-[11px] text-ink-2">
          assessment via {assessment.source === "engine" ? "engine assessFriction" : "engine unavailable"}
        </span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[220px_1fr]">
        <div>
          <div className="eyebrow mb-2">Friction ladder</div>
          <ol className="flex flex-col gap-1.5">
            {FRICTION_ACTIONS.map((action, i) => {
              const active = i === numericLevel;
              const passed = i < numericLevel;
              return (
                <li
                  key={action}
                  className={`rounded border px-3 py-2 text-[12.5px] ${
                    active ? "border-accent bg-paper font-semibold" : passed ? "border-rule text-ink-2" : "border-rule text-ink-2 opacity-70"
                  }`}
                >
                  {action}
                  {active && <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-accent">Current</span>}
                </li>
              );
            })}
          </ol>
          {assessment.levelLabel && (
            <p className="mt-2 text-[12.5px] text-ink-2">{assessment.levelLabel}</p>
          )}
        </div>

        <div>
          <div className="eyebrow mb-2">Signals — each one explained</div>
          {assessment.signals.length === 0 ? (
            <p className="text-[13px] text-ink-2">No signals were returned for this profile.</p>
          ) : (
            <ul className="flex flex-col">
              {assessment.signals.map((s, i) => (
                <li key={i} className="flex items-start justify-between gap-3 border-b border-rule py-2">
                  <span className="text-[13.5px] font-medium">{s.label}</span>
                  <span className="max-w-[55%] text-right text-[12.5px] text-ink-2">{s.detail}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 rounded border border-rule bg-paper px-3.5 py-3">
            <div className="eyebrow">Fairness note</div>
            <p className="mt-1 text-[13px] leading-relaxed">
              {assessment.fairnessNote ||
                "Sizing and fit returns are a normal part of shopping. This ladder can only add verification steps — it never reduces a refund, refuses a return, or accuses the customer."}
            </p>
          </div>

          <div className="mt-4">
            <label className="block">
              <span className="eyebrow">Appeal — the customer&apos;s words</span>
              <textarea
                value={appealNote}
                onChange={(e) => setAppealNote(e.target.value)}
                rows={2}
                placeholder="e.g. These were shoe-size exchanges for my family; every item came back with tags on."
                className="mt-1.5 w-full rounded border border-rule bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-accent"
              />
            </label>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button onClick={appeal} className="rounded border border-accent px-3.5 py-2 text-[13px] font-semibold text-accent hover:bg-paper">
                File appeal
              </button>
              <button onClick={overturn} className="rounded bg-ink px-3.5 py-2 text-[13px] font-semibold text-paper hover:bg-accent">
                Reviewer: overturn friction
              </button>
              <StateChip label="Human decision, audit-logged" tone="ok" shape="done" />
            </div>
            {status && <p className="mt-2.5 text-[13px] text-ok">{status}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
