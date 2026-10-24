"use client";

import { use } from "react";
import { Money } from "@/components/ui/Money";
import { StateChip } from "@/components/ui/StateChip";
import { StatusTimeline } from "@/components/customer/StatusTimeline";
import { WordingBlock } from "@/components/customer/WordingBlock";
import { INSTRUMENT_LABEL } from "@/components/customer/LegBar";
import { getReturn, getReturnByToken, getReturns } from "@/lib/data";

/**
 * Public tracker — a token-scoped, minimal status page. It shows the
 * return's state and its money legs, and nothing personal: no name, no
 * address, no account details. An unknown token gets the same answer
 * as an expired one, so the page cannot be used to probe for returns.
 */
export default function TrackerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const decoded = decodeURIComponent(token);
  const ret =
    getReturnByToken(decoded) ??
    getReturn(decoded) ??
    getReturns().find((r) => r.refundIntentId && r.refundIntentId === decoded);

  return (
    <div className="mx-auto max-w-[760px] px-4 py-10 md:px-6">
      <p className="eyebrow">Public return tracker · Simulated</p>
      <h1 className="mt-1.5 text-[24px] font-bold tracking-tight">Where is my refund?</h1>

      {!ret ? (
        <div className="mt-6 rounded border border-rule bg-surface p-5">
          <p className="text-[14.5px]">
            This tracking link is not recognised — it may have expired or been mistyped.
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            Tracking links expire 30 days after a return completes, and an expired link shows
            exactly this page: the tracker never confirms whether a return exists for a token
            it cannot verify. If you are the customer, open the link from your order page
            instead, where the full record lives behind your sign-in.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
            This page is scoped to one return token. It shows status and money only — no name,
            address or account details — and the link expires 30 days after the return
            completes (simulated).
          </p>
          <section className="mt-6 rounded border border-rule bg-surface p-5" aria-label="Tracked return">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold">{ret.itemName || "Returned item"}</h2>
              <span className="font-mono text-[12px] text-ink-2">token {decoded.slice(0, 18)}{decoded.length > 18 ? "…" : ""}</span>
            </div>
            <div className="mt-4">
              <StatusTimeline state={ret.state} />
            </div>
            <div className="mt-4">
              <WordingBlock machine="ItemJourney" state={ret.state} />
            </div>
            <div className="mt-5">
              <div className="eyebrow mb-2">Money legs</div>
              <ul className="flex flex-col">
                {ret.legs.map((leg, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-rule py-2.5 last:border-b-0">
                    <span className="text-[13.5px] font-medium">{INSTRUMENT_LABEL[leg.instrument]}</span>
                    <StateChip
                      label={leg.state.replace(/_/g, " ")}
                      tone={leg.state === "credited" ? "ok" : leg.state === "reversed" || leg.state === "failed" ? "stuck" : "accent"}
                      shape={leg.state === "credited" ? "done" : "current"}
                      mono
                    />
                    <span className="text-[12.5px] text-ink-2">{leg.etaText || "Per-instrument timeline"}</span>
                    <Money paise={leg.amountPaise} small />
                  </li>
                ))}
                {ret.legs.length === 0 && <li className="py-2 text-sm text-ink-2">No refund legs yet.</li>}
              </ul>
              <p className="mt-3 text-[12.5px] text-ink-2">
                Money counts as back only when a leg shows <span className="font-mono">credited</span> —
                initiated and processed are on their way, not arrived.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
