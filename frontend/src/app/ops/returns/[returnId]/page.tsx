"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Money } from "@/components/ui/Money";
import { StateChip } from "@/components/ui/StateChip";
import { ThreadDiagram, type ThreadRow } from "@/components/ops/ThreadDiagram";
import { SourcePanel } from "@/components/ops/SourcePanel";
import { VerdictCard } from "@/components/ops/VerdictCard";
import { ReviewerActions } from "@/components/ops/ReviewerActions";
import { INSTRUMENT_LABEL } from "@/components/customer/LegBar";
import { classifyInputForLeg, classifyLeg, type LegVerdict } from "@/lib/engine";
import { getReturn, type NLeg } from "@/lib/data";
import { useSim, type RetryResult } from "@/state/SimProvider";

function rowForLeg(leg: NLeg, verdict: LegVerdict): ThreadRow {
  const bySource = (s: string) => leg.records.find((r) => r.source === s);
  const platform = bySource("platform");
  const provider = bySource("provider");
  const seller = bySource("seller");
  let lagging: ThreadRow["lagging"];
  let deltaText: string | undefined;
  if (verdict.verdict !== "in_agreement") {
    if (provider && platform && provider.state !== platform.state) lagging = "provider";
    else if (seller && platform && seller.state !== platform.state) lagging = "seller";
    else lagging = "provider";
    if (verdict.verdict === "stuck") {
      deltaText = `Δ state — seller: ${seller?.state ?? "missing"} · provider: ${provider?.state ?? "missing"}`;
    }
  }
  return {
    label: `${INSTRUMENT_LABEL[leg.instrument]} leg · ₹${(leg.amountPaise / 100).toLocaleString("en-IN")}`,
    seller: seller?.state,
    platform: platform?.state ?? leg.state,
    provider: provider?.state,
    verdict: (verdict.verdict === "waiting"
      ? "waiting"
      : verdict.verdict === "stuck"
        ? "stuck"
        : "in_agreement") as ThreadRow["verdict"],
    lagging,
    deltaText,
  };
}

export default function OpsReturnPage({ params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = use(params);
  const sim = useSim();
  const ret = getReturn(returnId);
  const [selectedInstrument, setSelectedInstrument] = useState<string>("");
  const [retry, setRetry] = useState<RetryResult | null>(null);

  const legVerdicts = useMemo(() => {
    if (!ret) return new Map<string, LegVerdict>();
    const map = new Map<string, LegVerdict>();
    for (const leg of ret.legs) {
      map.set(
        leg.instrument,
        classifyLeg(classifyInputForLeg({ ...leg, ageHours: leg.ageHours + sim.clockOffsetHours })),
      );
    }
    return map;
  }, [ret, sim.clockOffsetHours]);

  if (!ret) {
    return (
      <div className="px-4 py-8 md:px-6">
        <h1 className="text-[20px] font-semibold">Return not found</h1>
        <p className="mt-2 text-sm text-ink-2">
          <span className="font-mono">{returnId}</span> is not in the seeded scenario.{" "}
          <Link href="/ops" className="text-accent underline">Back to the console</Link>
        </p>
      </div>
    );
  }

  const selected =
    ret.legs.find((l) => l.instrument === selectedInstrument) ?? ret.legs[0];
  const selectedVerdict = selected ? legVerdicts.get(selected.instrument) : undefined;
  const threadRows = ret.legs.map((leg) => rowForLeg(leg, legVerdicts.get(leg.instrument)!));
  const bySource = (s: string) => selected?.records.find((r) => r.source === s);

  const doRetry = () => {
    const result = sim.retryRefund({
      intentId: ret.refundIntentId || `RI-${ret.id}`,
      paymentId: ret.orderId || "HERO-1",
      legs: ret.legs.map((l) => ({ instrument: l.instrument, amountPaise: l.amountPaise })),
    });
    setRetry(result);
  };

  return (
    <div className="px-4 py-6 md:px-6">
      <p className="eyebrow">Ops · Three Truths</p>
      <h1 className="mt-1.5 text-[22px] font-bold tracking-tight">
        Return <span className="font-mono">{ret.id}</span> — {ret.itemName || ret.itemId}
      </h1>
      <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        Journey state <span className="font-mono">{ret.state}</span> · refund intent{" "}
        <span className="font-mono">{ret.refundIntentId || "—"}</span> · refundable{" "}
        <Money paise={ret.refundablePaise} small />. The customer sees this same return{" "}
        <Link href={`/customer/returns/${ret.id}`} className="text-accent underline underline-offset-2">
          here
        </Link>
        .
      </p>

      <div className="mt-5">
        <ThreadDiagram rows={threadRows} staleProvider={sim.faults.providerOutage} />
      </div>

      {/* Leg selector */}
      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Refund legs">
        {ret.legs.map((leg) => {
          const v = legVerdicts.get(leg.instrument);
          const active = selected?.instrument === leg.instrument;
          return (
            <button
              key={leg.instrument}
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedInstrument(leg.instrument)}
              className={`rounded border px-3.5 py-2 text-[13px] ${active ? "border-accent bg-surface font-semibold" : "border-rule bg-surface text-ink-2"}`}
            >
              {INSTRUMENT_LABEL[leg.instrument]} · <Money paise={leg.amountPaise} small /> ·{" "}
              <span className={v?.verdict === "stuck" ? "text-stuck" : v?.verdict === "waiting" ? "text-wait" : "text-ok"}>
                {v?.verdict.replace(/_/g, " ") ?? "—"}
              </span>
              {leg.seededClassification && (
                <span className="ml-2 font-mono text-[11px] text-ink-2">seeded: {leg.seededClassification}</span>
              )}
            </button>
          );
        })}
      </div>

      {selected && selectedVerdict && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <SourcePanel title="Seller record" record={bySource("seller")} stale={sim.faults.staleData} />
          <SourcePanel title="Platform record" record={bySource("platform")} stale={sim.faults.staleData} />
          <SourcePanel
            title="Provider record"
            record={bySource("provider")}
            stale={sim.faults.staleData || sim.faults.providerOutage}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {selected && selectedVerdict && (
          <VerdictCard verdict={selectedVerdict} instrument={selected.instrument} />
        )}
        <ReviewerActions returnId={ret.id} legId={selected ? `${ret.id}-${selected.instrument}` : ret.id} />
      </div>

      {/* Idempotency demo */}
      <section className="mt-4 rounded border border-rule bg-surface p-4" aria-label="Retry refund — idempotency demonstration">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h3 className="eyebrow">Retry refund — the idempotency demonstration</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed">
              Pressing retry re-presents the same refund-intent id{" "}
              <span className="font-mono">{ret.refundIntentId || `RI-${ret.id}`}</span> to the engine&apos;s
              RefundIssuer. The first press issues once; every later press returns the{" "}
              <em>same receipt</em>, counts the attempt, writes a{" "}
              <span className="font-mono">duplicate_blocked</span> audit entry, and moves no money.
            </p>
          </div>
          <button onClick={doRetry} className="rounded bg-ink px-4 py-2.5 text-[13px] font-semibold text-paper hover:bg-accent">
            Retry refund
          </button>
        </div>
        {retry && (
          <div className={`mt-3 rounded border px-3.5 py-3 ${retry.ok ? "border-ok bg-paper" : "border-stuck bg-paper"}`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
              <StateChip label={retry.duplicate ? "Duplicate blocked" : retry.ok ? "Issued once" : "Failed"} tone={retry.ok ? (retry.duplicate ? "wait" : "ok") : "stuck"} shape={retry.ok ? "done" : "exception"} />
              {retry.receiptId && <span className="font-mono text-[12.5px]">issuance: {retry.receiptId}</span>}
              <span className="tnum font-mono text-[12.5px]">attempts: {retry.attempts}</span>
            </div>
            <p className="mt-1.5 text-[13px] text-ink-2">{retry.message}</p>
            <p className="mt-1 text-[12.5px] text-ink-2">
              See it in the <Link href="/ops/audit" className="text-accent underline underline-offset-2">audit ledger</Link>.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
