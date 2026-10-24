"use client";

import { useMemo } from "react";
import { MetricPulse } from "@/components/ops/MetricPulse";
import { ExceptionQueue, type QueueRow } from "@/components/ops/ExceptionQueue";
import { Money } from "@/components/ui/Money";
import { classifyInputForLeg, classifyLeg } from "@/lib/engine";
import { getAllLegs, getReturns } from "@/lib/data";
import { useSim } from "@/state/SimProvider";

export default function OpsConsolePage() {
  const sim = useSim();
  const legs = getAllLegs();
  const returns = getReturns();

  const rows: QueueRow[] = useMemo(
    () =>
      legs.map((leg) => {
        const input = classifyInputForLeg({
          ...leg,
          ageHours: leg.ageHours + sim.clockOffsetHours,
        });
        return { id: `${leg.returnId}-${leg.instrument}`, leg, verdict: classifyLeg(input) };
      }),
    [legs, sim.clockOffsetHours],
  );

  const stuckLegs = rows.filter((r) => r.verdict.verdict === "stuck");
  const stuckPaise = stuckLegs.reduce((a, r) => a + r.leg.amountPaise, 0);
  const waitingCount = rows.filter((r) => r.verdict.verdict === "waiting").length;
  const duplicatesBlocked =
    sim.auditEntries.filter((e) => e.action === "duplicate_blocked").length + sim.faults.duplicateWebhooks;
  const inFlight = returns.filter((r) => r.state !== "completed" && r.state !== "cancelled").length;

  return (
    <div className="px-4 py-6 md:px-6">
      <p className="eyebrow">Ops · Reconciliation console</p>
      <h1 className="mt-1.5 text-[22px] font-bold tracking-tight">Three sources, one truth to find</h1>
      <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        Every refund leg is compared across seller, platform and provider records. A difference
        inside the instrument&apos;s latency budget is <span className="font-medium text-wait">waiting</span> —
        no action. A crossed budget, a missing leg, or a terminal-state contradiction is{" "}
        <span className="font-medium text-stuck">stuck</span> — and those are the only rows that raise their voice.
        {sim.faults.staleData && " Stale-data fault is injected: treat source freshness with suspicion."}
        {sim.faults.providerOutage && " Provider outage is injected: provider records are stale."}
      </p>

      <div className="mt-5">
        <MetricPulse
          metrics={[
            {
              label: "Returns in flight",
              value: inFlight,
              sub: `${rows.length} refund legs across ${returns.length} returns being reconciled.`,
            },
            {
              label: "Money stuck",
              value: <Money paise={stuckPaise} />,
              sub: stuckLegs.length
                ? `${stuckLegs.length} leg${stuckLegs.length === 1 ? "" : "s"} past budget or contradicting another source.`
                : "No leg is currently classified stuck.",
              tone: stuckLegs.length ? "stuck" : "ok",
            },
            {
              label: "Mismatches open",
              value: stuckLegs.length + waitingCount,
              sub: `${stuckLegs.length} stuck · ${waitingCount} waiting inside their windows.`,
              tone: stuckLegs.length ? "stuck" : "wait",
            },
            {
              label: "Duplicates blocked",
              value: duplicatesBlocked,
              sub: "Idempotent issuance + webhook dedupe. Retries return the original receipt; no money moves twice.",
              tone: "ok",
            },
          ]}
        />
      </div>

      <section className="mt-6 rounded border border-rule bg-surface p-4" aria-label="Exception queue">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="eyebrow">Exception queue — stuck first</h2>
          <span className="font-mono text-[11px] text-ink-2">verdicts via engine classifyLeg · clock +{sim.clockOffsetHours}h</span>
        </div>
        <ExceptionQueue rows={rows} />
      </section>
    </div>
  );
}
