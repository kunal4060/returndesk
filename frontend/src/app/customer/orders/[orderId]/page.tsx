"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Money } from "@/components/ui/Money";
import { StateChip } from "@/components/ui/StateChip";
import { StatusTimeline } from "@/components/customer/StatusTimeline";
import { WordingBlock } from "@/components/customer/WordingBlock";
import { WaterfallPanel } from "@/components/customer/WaterfallPanel";
import type { LedgerLeg } from "@/components/customer/LedgerTable";
import {
  buildAllocationMatrix,
  computeRefund,
  evaluateEligibility,
} from "@/lib/engine";
import {
  getOrder,
  getReturnForItem,
  getReturns,
  moneyPaise,
  pick,
  str,
  type NItem,
  type Rec,
} from "@/lib/data";
import { useSim } from "@/state/SimProvider";

interface PlanView {
  legs: LedgerLeg[];
  grossPaise: number;
  clawbackPaise: number;
  explanation: string[];
  couponSharePaise: number;
  source: "engine" | "dataset";
}

function planForItem(orderId: string, item: NItem): PlanView | null {
  const order = getOrder(orderId);
  if (!order) return null;
  const ret = getReturnForItem(orderId, item.id);
  const stateByInstrument = new Map<string, string>(
    (ret?.legs ?? []).map((l) => [l.instrument as string, l.state]),
  );
  // Engine path: persisted matrix from checkout + waterfall.
  if (buildAllocationMatrix && computeRefund) {
    try {
      const engineOrder = {
        id: order.id,
        items: order.items.map((i) => ({
          id: i.id,
          name: i.name,
          sellerId: i.sellerId || "S-00",
          listPricePaise: i.pricePaise,
        })),
        couponPaise: order.couponPaise,
        payments: order.payments.map((p) => ({ instrument: p.instrument, amountPaise: p.amountPaise })),
      };
      const matrix = buildAllocationMatrix(engineOrder) as Rec;
      const plan = computeRefund(matrix, engineOrder, [item.id], "prorata") as Rec;
      const rows = (matrix.rows as Rec[] | undefined) ?? [];
      const row = rows.find((r) => r.itemId === item.id);
      const legs = ((plan.legs as Rec[] | undefined) ?? []).map((l) => ({
        instrument: l.instrument as LedgerLeg["instrument"],
        amountPaise: Number(l.amountPaise ?? 0),
        state: stateByInstrument.get(String(l.instrument)) ?? "requested",
        destination: String(l.destination ?? ""),
        etaText: String(l.etaText ?? ""),
      }));
      if (legs.length) {
        return {
          legs,
          grossPaise: Number(plan.grossPaise ?? 0),
          clawbackPaise: Number(plan.clawbackPaise ?? 0),
          explanation: Array.isArray(plan.explanation) ? plan.explanation.map(String) : [],
          couponSharePaise: row ? Number(row.couponSharePaise ?? 0) : moneyPaise(item.raw, "couponSharePaise"),
          source: "engine",
        };
      }
    } catch {
      /* fall through to dataset legs */
    }
  }
  if (ret && ret.legs.length) {
    return {
      legs: ret.legs.map((l) => ({
        instrument: l.instrument,
        amountPaise: l.amountPaise,
        state: l.state,
        destination: l.destination,
        etaText: l.etaText,
      })),
      grossPaise: ret.refundablePaise,
      clawbackPaise: 0,
      explanation: [],
      couponSharePaise: moneyPaise(item.raw, "couponSharePaise"),
      source: "dataset",
    };
  }
  return null;
}

function ItemSection({ orderId, item }: { orderId: string; item: NItem }) {
  const sim = useSim();
  const ret = getReturnForItem(orderId, item.id);
  const plan = useMemo(() => (ret ? planForItem(orderId, item) : null), [orderId, item, ret]);
  const [localState, setLocalState] = useState<string>("");
  const [actionNote, setActionNote] = useState<string>("");

  const eligibility = useMemo(() => {
    if (ret) return undefined;
    const order = getOrder(orderId);
    const deliveredAt = order ? str(order.raw, "deliveredAt", "placedAt") : "";
    const days = deliveredAt
      ? Math.max(0, Math.round((Date.now() - new Date(deliveredAt).getTime()) / 86400000))
      : 3;
    return evaluateEligibility({
      category: item.category || "general",
      daysSinceDelivery: Number.isFinite(days) ? Math.min(days, 3) : 3,
      returnWindowDays: 30,
      conditionDeclared: "unused",
      isFreeGift: Boolean(pick(item.raw, "isFreeGift")),
      qualifiesBundle: Boolean(pick(item.raw, "qualifiesBundle", "inBundle")),
    });
  }, [orderId, item, ret]);

  const requestReturn = () => {
    setLocalState("requested");
    sim.appendAudit("customer", "return_requested_local", {
      orderId,
      itemId: item.id,
      note: "Return requested from the item dashboard (simulated local state).",
    });
    setActionNote("Return requested. A pickup slot offer is on its way — this is a simulated local state for the demo.");
  };

  const reschedule = () => {
    sim.appendAudit("customer", "pickup_rescheduled", { orderId, itemId: item.id, returnId: ret?.id });
    setActionNote("Pickup rescheduled to the next available slot (simulated). The courier's earlier visit record stays attached to the return.");
  };

  return (
    <article className="rounded border border-rule bg-surface p-5" aria-label={item.name}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold">{item.name}</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            {item.sellerId && <>Seller {item.sellerId} · </>}
            <span className="font-mono">{item.id}</span>
            {ret && (
              <>
                {" "}· Return <span className="font-mono">{ret.id}</span> · Intent{" "}
                <span className="font-mono">{ret.refundIntentId || "—"}</span>
              </>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="eyebrow">Item price</div>
          <Money paise={item.pricePaise} />
        </div>
      </div>

      {ret ? (
        <>
          <div className="mt-4">
            <StatusTimeline state={ret.state} disputeHref={ret.disputeId ? `/customer/disputes/${ret.disputeId}` : undefined} />
          </div>
          <div className="mt-4">
            <WordingBlock machine="ItemJourney" state={ret.state} />
          </div>
          {plan && (
            <div className="mt-4">
              <WaterfallPanel
                legs={plan.legs}
                refundablePaise={plan.grossPaise - plan.clawbackPaise}
                couponSharePaise={plan.couponSharePaise}
                clawbackPaise={plan.clawbackPaise}
                listPricePaise={item.pricePaise}
                explanation={plan.explanation}
              />
              <p className="mt-2 font-mono text-[11px] text-ink-2">
                waterfall via {plan.source === "engine" ? "engine buildAllocationMatrix + computeRefund" : "seeded dataset legs"}
              </p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/customer/returns/${ret.id}`} className="rounded border border-rule px-3.5 py-2 text-[13px] font-medium hover:border-accent hover:text-accent">
              Return deep-dive
            </Link>
            {(ret.state === "pickup_failed" || ret.pickupAttempts.some((a) => a.state === "failed")) && (
              <button onClick={reschedule} className="rounded border border-rule px-3.5 py-2 text-[13px] font-medium hover:border-accent hover:text-accent">
                Reschedule pickup
              </button>
            )}
            {ret.disputeId ? (
              <Link href={`/customer/disputes/${ret.disputeId}`} className="rounded border border-stuck px-3.5 py-2 text-[13px] font-medium text-stuck">
                Open dispute
              </Link>
            ) : (
              <Link href={`/ops/returns/${ret.id}`} className="rounded border border-rule px-3.5 py-2 text-[13px] font-medium hover:border-accent hover:text-accent">
                See this return in ops
              </Link>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2">
            <StateChip label={localState ? "Return requested (simulated)" : "Kept — no return"} tone={localState ? "accent" : "neutral"} shape={localState ? "current" : "done"} />
          </div>
          {eligibility && (
            <div className="mt-3 rounded border border-rule bg-paper px-3.5 py-3">
              <div className="eyebrow">Return outcome preview — before you confirm</div>
              <p className="mt-1 text-[13.5px]">
                {eligibility.eligible ? "This item can be returned." : "This item cannot be refunded as a normal return."}
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] text-ink-2">
                {[...eligibility.reasons, ...eligibility.previewLines].map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {!localState && (
            <button onClick={requestReturn} className="mt-3.5 rounded bg-ink px-4 py-2 text-[13px] font-semibold text-paper hover:bg-accent">
              Request return
            </button>
          )}
        </>
      )}
      {actionNote && <p className="mt-3 text-[13px] text-ok">{actionNote}</p>}
    </article>
  );
}

export default function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const order = getOrder(orderId);
  const returns = getReturns().filter((r) => r.orderId === orderId);
  const refundableTotal = returns.reduce((a, r) => a + r.refundablePaise, 0);
  const creditedTotal = returns.reduce(
    (a, r) => a + r.legs.filter((l) => l.state === "credited").reduce((x, l) => x + l.amountPaise, 0),
    0,
  );

  if (!order) {
    return (
      <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6">
        <h1 className="text-[20px] font-semibold">Order not found</h1>
        <p className="mt-2 text-sm text-ink-2">
          <span className="font-mono">{orderId}</span> is not in the seeded scenario.{" "}
          <Link href="/customer" className="text-accent underline">Back to your orders</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6">
      <p className="eyebrow">Customer view · Item-level dashboard</p>
      <h1 className="mt-1.5 text-[24px] font-bold tracking-tight">
        Order <span className="font-mono">{order.id}</span>
      </h1>
      <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-2">
        {returns.length > 0 ? (
          <>
            Money back so far: <span className="font-semibold text-ok"><Money paise={creditedTotal} small /></span> of{" "}
            <span className="font-semibold text-ink"><Money paise={refundableTotal} small /></span> refundable across{" "}
            {returns.length} return{returns.length === 1 ? "" : "s"}. The rest is still travelling — per
            instrument, on purpose, below.
          </>
        ) : (
          "No returns on this order yet."
        )}
      </p>
      <div className="mt-6 flex flex-col gap-5">
        {order.items.map((item) => (
          <ItemSection key={item.id} orderId={order.id} item={item} />
        ))}
      </div>
    </div>
  );
}
