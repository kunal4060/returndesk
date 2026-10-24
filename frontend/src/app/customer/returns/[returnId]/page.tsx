"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Money } from "@/components/ui/Money";
import { StateChip } from "@/components/ui/StateChip";
import { StatusTimeline } from "@/components/customer/StatusTimeline";
import { WordingBlock } from "@/components/customer/WordingBlock";
import { EvidenceCard } from "@/components/customer/EvidenceCard";
import { evidenceSet, getReturn, isRec, pick, str, type Rec } from "@/lib/data";
import { useSim } from "@/state/SimProvider";

export default function ReturnDeepDivePage({ params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = use(params);
  const sim = useSim();
  const ret = getReturn(returnId);
  const [appealText, setAppealText] = useState("");
  const [appealDone, setAppealDone] = useState("");

  if (!ret) {
    return (
      <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6">
        <h1 className="text-[20px] font-semibold">Return not found</h1>
        <p className="mt-2 text-sm text-ink-2">
          <span className="font-mono">{returnId}</span> is not in the seeded scenario.{" "}
          <Link href="/customer" className="text-accent underline">Back to your orders</Link>
        </p>
      </div>
    );
  }

  const raw = ret.raw;
  const handover = pick(raw, "handover");
  const qc = isRec(handover) ? pick(handover, "doorstepQcSnapshot") : undefined;
  const warehouse = pick(raw, "warehouseInspection");
  const dispute = pick(raw, "inspectionDispute");
  const claim = str(raw, "customerClaim");
  const claimState = str(raw, "claimState");
  const evidence = evidenceSet.filter((e) => str(e, "returnId") === ret.id);

  const fileAppeal = () => {
    sim.appendAudit("customer", "return_appeal_filed", {
      returnId: ret.id,
      note: appealText.trim() || "Appeal filed from the return page.",
    });
    setAppealDone("Appeal filed and written to the audit ledger. A human reviewer — not the original decision-maker — will pick it up.");
  };

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6">
      <p className="eyebrow">Customer view · Return deep-dive</p>
      <h1 className="mt-1.5 text-[24px] font-bold tracking-tight">
        {ret.itemName || ret.itemId}{" "}
        <span className="font-mono text-[16px] font-medium text-ink-2">· {ret.id}</span>
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        Refund intent <span className="font-mono">{ret.refundIntentId || "—"}</span> — one stable id for
        this return; retries and duplicate webhooks reuse it and can never mint a second refund.
        Refundable <Money paise={ret.refundablePaise} small />.
      </p>

      <div className="mt-5 rounded border border-rule bg-surface p-5">
        <StatusTimeline state={ret.state} disputeHref={ret.disputeId ? `/customer/disputes/${ret.disputeId}` : undefined} />
        <div className="mt-4">
          <WordingBlock machine="ItemJourney" state={ret.state} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Micro-timeline */}
        <section aria-label="Event timeline">
          <h2 className="eyebrow mb-3">Every event, in order</h2>
          <div className="rounded border border-rule bg-surface p-4">
            {ret.events.length === 0 && ret.pickupAttempts.length === 0 && (
              <p className="text-sm text-ink-2">No events recorded for this return yet.</p>
            )}
            <ol className="flex flex-col">
              {ret.pickupAttempts.map((a) => (
                <li key={a.id} className="border-b border-rule py-2.5 last:border-b-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-[13.5px] font-medium">Pickup attempt — {a.state.replace(/_/g, " ")}</span>
                    {a.scheduledAt && <span className="font-mono text-[11.5px] text-ink-2">{a.scheduledAt}</span>}
                  </div>
                  {a.reasonCode && (
                    <p className="mt-0.5 text-[12.5px] text-ink-2">
                      Courier reason: <span className="font-mono">{a.reasonCode}</span>
                    </p>
                  )}
                </li>
              ))}
              {ret.events.map((e, i) => (
                <li key={i} className="border-b border-rule py-2.5 last:border-b-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-mono text-[13px] font-medium">{e.label.replace(/_/g, " ")}</span>
                    {e.actor && <span className="text-[12px] text-ink-2">by {e.actor}</span>}
                    {e.at && <span className="font-mono text-[11.5px] text-ink-2">{e.at}</span>}
                  </div>
                  {e.detail && <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{e.detail}</p>}
                </li>
              ))}
            </ol>
            {claim && (
              <div className="mt-3 rounded border border-rule bg-paper px-3.5 py-3">
                <div className="eyebrow">Your claim {claimState && `· ${claimState.replace(/-/g, " ")}`}</div>
                <p className="mt-1 text-[13.5px]">“{claim}”</p>
                {str(raw, "claimNote") && <p className="mt-1 text-[12.5px] text-ink-2">{str(raw, "claimNote")}</p>}
              </div>
            )}
          </div>
        </section>

        {/* Evidence + QC conflict */}
        <section aria-label="Evidence">
          <h2 className="eyebrow mb-3">Evidence on record (simulated)</h2>
          <div className="flex flex-col gap-3">
            {evidence.map((e) => (
              <EvidenceCard key={str(e, "id")} evidence={e} />
            ))}
            {evidence.length === 0 && (
              <p className="rounded border border-rule bg-surface p-4 text-sm text-ink-2">
                No seeded evidence is attached to this return.
              </p>
            )}
            {isRec(qc) && (
              <div className="rounded border border-ok bg-surface p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[13.5px] font-semibold">Doorstep QC snapshot — frozen at handover</h3>
                  <StateChip label={`QC: ${str(qc, "qcVerdict")}`} tone="ok" shape="done" />
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-ink-2">
                  {((qc.checklist as unknown[]) ?? []).map((c, i) => (
                    <li key={i}>{String(c)}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[12.5px] text-ink-2">
                  Frozen {str(qc, "frozenAt")} · shared with you {str(qc, "sharedWithCustomerAt")}. This record
                  cannot be edited afterwards — a different warehouse verdict becomes a visible dispute,
                  not a silent overwrite.
                </p>
              </div>
            )}
            {isRec(warehouse) && (
              <div className={`rounded border bg-surface p-4 ${warehouse.conflictsWithDoorstepQc ? "border-stuck" : "border-rule"}`}>
                <h3 className="text-[13.5px] font-semibold">
                  Warehouse inspection — verdict: <span className="font-mono">{str(warehouse, "verdict")}</span>
                </h3>
                {str(warehouse, "inspectorNote") && (
                  <p className="mt-1 text-[13px] text-ink-2">{str(warehouse, "inspectorNote")}</p>
                )}
                {Boolean(warehouse.conflictsWithDoorstepQc) && (
                  <p className="mt-1.5 text-[13px] font-medium text-stuck">
                    This conflicts with the frozen doorstep snapshot. The conflict itself is the dispute —
                    nothing is deducted until a human reviewer decides.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Dispute status + appeal */}
      <section className="mt-6 rounded border border-rule bg-surface p-5" aria-label="Dispute and appeal">
        <h2 className="eyebrow">Dispute status &amp; appeal</h2>
        {isRec(dispute) ? (
          <div className="mt-2">
            <p className="text-[14px]">
              Dispute <span className="font-mono">{str(dispute, "id")}</span> · status{" "}
              <span className="font-mono">{str(dispute, "status")}</span>
            </p>
            {str(dispute, "basis") && <p className="mt-1 max-w-3xl text-[13.5px] text-ink-2">{str(dispute, "basis")}</p>}
            <Link href={`/customer/disputes/${str(dispute, "id")}`} className="mt-2 inline-block text-[13.5px] font-medium text-accent underline underline-offset-2">
              Walk the dispute, step by step
            </Link>
          </div>
        ) : ret.disputeId ? (
          <p className="mt-2 text-[14px]">
            A dispute is attached to this return.{" "}
            <Link href={`/customer/disputes/${ret.disputeId}`} className="font-medium text-accent underline underline-offset-2">
              Open the dispute stepper
            </Link>
          </p>
        ) : (
          <p className="mt-2 text-[14px] text-ink-2">No dispute is open on this return.</p>
        )}
        <div className="mt-4 border-t border-rule pt-4">
          <label className="block max-w-2xl">
            <span className="eyebrow">Appeal — in your own words</span>
            <textarea
              value={appealText}
              onChange={(e) => setAppealText(e.target.value)}
              rows={3}
              placeholder="Anything about this return you want a human reviewer to weigh."
              className="mt-1.5 w-full rounded border border-rule bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-accent"
            />
          </label>
          <button onClick={fileAppeal} className="mt-2.5 rounded bg-ink px-4 py-2 text-[13px] font-semibold text-paper hover:bg-accent">
            File appeal
          </button>
          {appealDone && <p className="mt-2 text-[13px] text-ok">{appealDone}</p>}
          <p className="mt-3 text-[12.5px] text-ink-2">
            If extra verification steps were applied to your account as a heavy returner, the full
            explanation and appeal live on the{" "}
            <Link href="/ops/fraud" className="text-accent underline underline-offset-2">fraud &amp; fairness page</Link>{" "}
            — every signal shown, nothing hidden.
          </p>
        </div>
      </section>
    </div>
  );
}
