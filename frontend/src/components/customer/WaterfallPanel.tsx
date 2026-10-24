"use client";

import { LegBar } from "./LegBar";
import { LedgerTable, type LedgerLeg } from "./LedgerTable";

/**
 * WaterfallPanel — table-first, bar-assisted refund view for one item:
 * the stacked instrument bar for composition, the ledger table for the
 * precise reading, and the engine's line-by-line explanation.
 */
export function WaterfallPanel({
  legs,
  refundablePaise,
  couponSharePaise = 0,
  clawbackPaise = 0,
  listPricePaise,
  explanation = [],
  heldPaise = 0,
}: {
  legs: LedgerLeg[];
  refundablePaise: number;
  couponSharePaise?: number;
  clawbackPaise?: number;
  listPricePaise?: number;
  explanation?: string[];
  heldPaise?: number;
}) {
  return (
    <section aria-label="Refund breakdown" className="rounded border border-rule bg-surface p-4">
      <div className="eyebrow mb-3">Where the money goes</div>
      <LegBar legs={legs} heldPaise={heldPaise} />
      <div className="mt-4">
        <LedgerTable
          legs={legs}
          refundablePaise={refundablePaise}
          couponSharePaise={couponSharePaise}
          clawbackPaise={clawbackPaise}
          listPricePaise={listPricePaise}
        />
      </div>
      {explanation.length > 0 && (
        <div className="mt-4 border-t border-rule pt-3">
          <div className="eyebrow mb-1.5">How this was worked out</div>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
            {explanation.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[12px] text-ink-2">
        Voucher money always returns as a voucher — never to a bank account. Split refunds
        arriving on different days is normal: each instrument keeps its own timeline.
      </p>
    </section>
  );
}
