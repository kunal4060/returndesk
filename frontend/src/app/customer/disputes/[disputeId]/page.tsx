"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Money } from "@/components/ui/Money";
import { StateChip } from "@/components/ui/StateChip";
import { DisputeStepper } from "@/components/customer/DisputeStepper";
import { EvidenceCard } from "@/components/customer/EvidenceCard";
import { partialRefund, scorePickupBundle } from "@/lib/engine";
import {
  evidenceSet,
  getDispute,
  getReturn,
  getReturnForDispute,
  isRec,
  pick,
  str,
  type Rec,
} from "@/lib/data";
import { getWording } from "@/wording/library";
import { useSim } from "@/state/SimProvider";

function InspectionDispute({ dispute, returnId }: { dispute: Rec; returnId: string }) {
  const sim = useSim();
  const ret = getReturn(returnId);
  const raw = ret?.raw ?? {};
  const handover = pick(raw, "handover");
  const qc = isRec(handover) ? (pick(handover, "doorstepQcSnapshot") as Rec) : undefined;
  const warehouse = pick(raw, "warehouseInspection") as Rec | undefined;
  const fullRefundPaise = Number(pick(dispute, "fullRefundPaise") ?? ret?.refundablePaise ?? 0);
  const outcome = partialRefund({ refundablePaise: fullRefundPaise, tier: "used" });
  const evidence = evidenceSet.filter((e) => str(e, "returnId") === returnId);
  const [choice, setChoice] = useState<string>("");
  const [done, setDone] = useState<string>("");

  const decide = (kind: string, label: string) => {
    setChoice(kind);
    sim.appendAudit("customer", `dispute_choice_${kind}`, { disputeId: str(dispute, "id"), returnId });
    setDone(`${label} — recorded in the audit ledger. The reviewer's decision will appear here with its reasons.`);
  };

  const steps = [
    {
      eyebrow: "The conflict",
      title: "Two records disagree about the same shoes",
      body: (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border border-ok p-3.5">
            <div className="eyebrow">Doorstep QC — frozen at handover</div>
            <p className="mt-1 text-[14px] font-medium">Verdict: {qc ? str(qc, "qcVerdict") : "pass"}</p>
            {qc && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">
                {((qc.checklist as unknown[]) ?? []).map((c, i) => (
                  <li key={i}>{String(c)}</li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-[12.5px] text-ink-2">
              Saved at handover and shared with the customer. It cannot be edited afterwards.
            </p>
          </div>
          <div className="rounded border border-stuck p-3.5">
            <div className="eyebrow">Warehouse inspection</div>
            <p className="mt-1 text-[14px] font-medium">
              Verdict: <span className="font-mono">{warehouse ? str(warehouse, "verdict") : "used"}</span>
            </p>
            {warehouse && str(warehouse, "inspectorNote") && (
              <p className="mt-1.5 text-[13px] text-ink-2">{str(warehouse, "inspectorNote")}</p>
            )}
            <p className="mt-1.5 text-[12.5px] text-ink-2">
              Recorded {warehouse ? str(warehouse, "inspectedAt") : ""}. A later claim — it does not
              overwrite the doorstep record.
            </p>
          </div>
          <p className="text-[13.5px] text-ink-2 md:col-span-2">{str(dispute, "basis")}</p>
        </div>
      ),
    },
    {
      eyebrow: "The evidence",
      title: "Photo proof is mandatory for any deduction",
      body: (
        <div className="grid gap-3 md:grid-cols-2">
          {evidence.map((e) => (
            <EvidenceCard key={str(e, "id")} evidence={e} />
          ))}
          {evidence.length === 0 && <p className="text-sm text-ink-2">No seeded evidence attached.</p>}
          <p className="text-[13px] text-ink-2 md:col-span-2">
            Engine rule, not a promise: a condition deduction claimed without photo proof is
            rejected outright by the partial-refund calculation — it throws rather than deducting
            on assertion alone.
          </p>
        </div>
      ),
    },
    {
      eyebrow: "The proposed outcome",
      title: "If the warehouse verdict is upheld: the “used” tier, arithmetic shown",
      body: (
        <div>
          <div className="max-w-xl rounded border border-rule bg-paper px-4 py-3 font-mono text-[13px] leading-relaxed">
            Item effective price: <Money paise={fullRefundPaise} small />
            <br />
            Condition tier: {outcome.tierLabel ?? "Used — up to 50% deduction"}
            <br />
            Deduction: −<Money paise={outcome.deductionPaise} small /> ({outcome.deductionPct}%)
            <br />
            <span className="font-semibold">Partial refund payable: <Money paise={outcome.payablePaise} small /></span>
          </div>
          {outcome.explanation && <p className="mt-2.5 max-w-2xl text-[13px] text-ink-2">{outcome.explanation}</p>}
          {typeof pick(dispute, "proposedPartialRefundPaise") === "number" && (
            <p className="mt-1.5 max-w-2xl text-[13px] text-ink-2">
              The seeded case file proposes <Money paise={Number(pick(dispute, "proposedPartialRefundPaise"))} small />{" "}
              (floored); the engine rounds half-up to <Money paise={outcome.payablePaise} small />. Either way the
              split back across card / wallet / voucher follows the persisted allocation matrix proportions.
            </p>
          )}
          <p className="mt-2 max-w-2xl text-[13px] text-ink-2">
            Until a human reviewer decides, the legs stay at the full amounts — no deduction is
            applied silently while a dispute is open. Source of arithmetic:{" "}
            {outcome.source === "engine" ? "engine partialRefund" : "published condition tiers"}.
          </p>
        </div>
      ),
    },
    {
      eyebrow: "Your decision",
      title: "Accept the tier, or send it to a full human review",
      body: (
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => decide("accept_partial", "Partial refund accepted")}
            className={`rounded border px-4 py-3 text-left text-[13.5px] ${choice === "accept_partial" ? "border-accent bg-paper font-semibold" : "border-rule"}`}
          >
            Accept the partial refund of <Money paise={outcome.payablePaise} small /> if the reviewer upholds the warehouse verdict
          </button>
          <button
            onClick={() => decide("full_review", "Full human review requested")}
            className={`rounded border px-4 py-3 text-left text-[13.5px] ${choice === "full_review" ? "border-accent bg-paper font-semibold" : "border-rule"}`}
          >
            Ask for a full review — a reviewer compares both evidence sets from scratch; the full{" "}
            <Money paise={fullRefundPaise} small /> stays possible
          </button>
          {done && <p className="text-[13px] text-ok">{done}</p>}
          <p className="text-[12.5px] text-ink-2">
            Dispute SLA: decided within 3 working days of opening ({str(dispute, "openedAt")}). The
            clock and the outcome both stay visible here.
          </p>
        </div>
      ),
    },
  ];

  return <DisputeStepper steps={steps} finishLabel="Finish" />;
}

function PickupDispute({ returnId }: { returnId: string }) {
  const sim = useSim();
  const ret = getReturn(returnId);
  const raw = ret?.raw ?? {};
  const [done, setDone] = useState("");
  const scored = (ret?.pickupAttempts ?? []).map((a) => ({
    attempt: a,
    score: scorePickupBundle(a.bundle),
    note: str(a.raw, "bundleCompleteness"),
  }));

  const choose = (kind: string, label: string) => {
    sim.appendAudit("customer", `pickup_dispute_${kind}`, { returnId });
    setDone(`${label} — recorded in the audit ledger.`);
  };

  const steps = [
    {
      eyebrow: "The courier's claim",
      title: "Each visit is an evidence bundle, scored for completeness",
      body: (
        <div className="flex flex-col gap-3">
          {scored.map(({ attempt, score, note }, i) => (
            <div key={attempt.id || i} className="rounded border border-rule p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[14px] font-medium">
                  Attempt {i + 1} — {attempt.state.replace(/_/g, " ")}
                  {attempt.reasonCode && (
                    <span className="ml-2 font-mono text-[12px] text-ink-2">{attempt.reasonCode}</span>
                  )}
                </span>
                <span className="tnum text-[13px]">
                  Bundle completeness <span className="font-semibold">{score.scorePct}%</span>
                  {score.claimStrength && (
                    <span className="ml-2 text-ink-2">claim strength: {score.claimStrength}</span>
                  )}
                </span>
              </div>
              {score.missing.length > 0 && (
                <p className="mt-1 text-[13px] text-stuck">Missing: {score.missing.join(", ")}</p>
              )}
              {note && <p className="mt-1 text-[13px] text-ink-2">{note}</p>}
              <p className="mt-1 font-mono text-[11px] text-ink-2">scored by {score.source === "engine" ? "engine scorePickupBundle" : "local field count"}</p>
            </div>
          ))}
          {scored.length === 0 && <p className="text-sm text-ink-2">No pickup attempts recorded.</p>}
        </div>
      ),
    },
    {
      eyebrow: "Your claim",
      title: "Both sides, side by side — neither is auto-believed",
      body: (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border border-rule p-3.5">
            <div className="eyebrow">Courier says</div>
            <p className="mt-1 text-[13.5px]">
              The customer was unreachable on the recorded attempts (reason code{" "}
              <span className="font-mono">customer_unreachable</span>), supported by the bundles above —
              the first of which has no doorstep photo and is downgraded for it.
            </p>
          </div>
          <div className="rounded border border-rule p-3.5">
            <div className="eyebrow">You say</div>
            <p className="mt-1 text-[13.5px]">“{str(raw, "customerClaim") || "I was available at the address."}”</p>
            {str(raw, "claimNote") && <p className="mt-1 text-[13px] text-ink-2">{str(raw, "claimNote")}</p>}
          </div>
          <p className="text-[13.5px] text-ink-2 md:col-span-2">
            {getWording("ItemJourney", "pickup_failed").what} The case sits in the conflicting-claims
            state until a workable pickup happens or a reviewer decides.
          </p>
        </div>
      ),
    },
    {
      eyebrow: "The way forward",
      title: "Reschedule, drop off, or escalate — your pick",
      body: (
        <div className="flex flex-col gap-2.5">
          <button onClick={() => choose("reschedule", "Pickup rescheduled")} className="rounded border border-rule px-4 py-3 text-left text-[13.5px] hover:border-accent">
            <span className="font-semibold">Reschedule the pickup</span> — a fresh slot; the earlier visit records stay attached for the reviewer.
          </button>
          <button onClick={() => choose("drop_off", "Drop-off chosen")} className="rounded border border-rule px-4 py-3 text-left text-[13.5px] hover:border-accent">
            <span className="font-semibold">Drop off at a collection point</span> — skip the doorstep entirely; the handover there is photographed and frozen the same way.
          </button>
          <button onClick={() => choose("escalate", "Escalated to a reviewer")} className="rounded border border-rule px-4 py-3 text-left text-[13.5px] hover:border-accent">
            <span className="font-semibold">Escalate</span> — a reviewer decides from both bundles and your claim. Maximum three courier attempts before drop-off becomes the default.
          </button>
          {done && <p className="text-[13px] text-ok">{done}</p>}
        </div>
      ),
    },
  ];

  return <DisputeStepper steps={steps} finishLabel="Finish" />;
}

export default function DisputePage({ params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = use(params);
  const dispute = getDispute(disputeId);
  const isPickup = disputeId.toUpperCase().includes("PICKUP");
  const ownerReturn = getReturnForDispute(disputeId);
  const returnId =
    ownerReturn?.id ??
    (dispute ? str(dispute, "returnId") : "") ??
    (isPickup ? disputeId.replace(/^DSP-/, "").replace(/-PICKUP$/, "") : "");

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 md:px-6">
      <p className="eyebrow">Customer view · Dispute</p>
      <h1 className="mt-1.5 text-[24px] font-bold tracking-tight">
        {isPickup ? "Pickup dispute" : "Inspection dispute"}{" "}
        <span className="font-mono text-[15px] font-medium text-ink-2">{disputeId}</span>
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        One decision per screen. Evidence is shown at the step where it is used, and every
        outcome carries its reasons. Return{" "}
        {returnId ? (
          <Link href={`/customer/returns/${returnId}`} className="font-mono text-accent underline underline-offset-2">
            {returnId}
          </Link>
        ) : (
          "—"
        )}
        .
      </p>
      <div className="mt-3">
        <StateChip label="Simulated dispute — seeded evidence" tone="wait" shape="current" />
      </div>
      <div className="mt-5">
        {isPickup ? (
          <PickupDispute returnId={returnId} />
        ) : dispute ? (
          <InspectionDispute dispute={dispute} returnId={returnId} />
        ) : (
          <div className="rounded border border-rule bg-surface p-5">
            <p className="text-sm text-ink-2">
              This dispute is not in the seeded dataset. If it concerns a failed pickup, open it as{" "}
              <span className="font-mono">DSP-&lt;returnId&gt;-PICKUP</span>; inspection disputes are
              seeded inside their return records.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
