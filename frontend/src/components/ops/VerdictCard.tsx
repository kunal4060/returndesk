"use client";

import { StateChip, chipToneForVerdict } from "@/components/ui/StateChip";
import type { LegVerdict } from "@/lib/engine";

/**
 * VerdictCard — the reconciler's call, with its reason and the budget
 * maths shown. A verdict a reviewer cannot re-derive is not shown.
 */
export function VerdictCard({
  verdict,
  instrument,
}: {
  verdict: LegVerdict;
  instrument: string;
}) {
  const age = verdict.ageHours;
  const budget = verdict.budgetHours;
  return (
    <section className="rounded border border-rule bg-surface p-4" aria-label="Reconciler verdict">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow">Reconciler verdict</h3>
        <span className="font-mono text-[11px] text-ink-2">
          via {verdict.source === "engine" ? "engine classifyLeg" : "local fallback"}
        </span>
      </div>
      <div className="mt-3">
        <StateChip
          label={verdict.verdict.replace(/_/g, " ")}
          tone={chipToneForVerdict(verdict.verdict)}
          shape={verdict.verdict === "stuck" ? "exception" : verdict.verdict === "in_agreement" ? "done" : "current"}
        />
      </div>
      {verdict.reason && <p className="mt-2.5 text-[13.5px] leading-relaxed">{verdict.reason}</p>}
      {typeof age === "number" && typeof budget === "number" && (
        <div className="mt-3 rounded border border-rule bg-paper px-3 py-2.5 font-mono text-[12px] leading-relaxed">
          age {age.toFixed(1)}h vs latency budget {budget.toFixed(0)}h for {instrument}
          <br />
          {age <= budget
            ? `${age.toFixed(1)}h ≤ ${budget.toFixed(0)}h → still inside the expected window: waiting, no action.`
            : `${age.toFixed(1)}h > ${budget.toFixed(0)}h → the window has closed: stuck, action required.`}
        </div>
      )}
      {verdict.breakClass && (
        <p className="mt-2 text-[12.5px] text-ink-2">
          Break class: <span className="font-mono">{verdict.breakClass}</span>
        </p>
      )}
    </section>
  );
}
