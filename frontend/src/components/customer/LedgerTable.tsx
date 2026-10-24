"use client";

import { Money } from "@/components/ui/Money";
import { StateChip, chipToneForVerdict } from "@/components/ui/StateChip";
import { INSTRUMENT_LABEL } from "./LegBar";
import type { Instrument } from "@/lib/data";

export interface LedgerLeg {
  instrument: Instrument;
  amountPaise: number;
  state: string;
  destination: string;
  etaText: string;
}

/**
 * LedgerTable — the precise reading of a refund: one row per leg with
 * instrument, amount, state and expected arrival, a discount
 * reallocation line where one applies, and a running total that
 * visibly reconciles to the item's refundable amount.
 */
export function LedgerTable({
  legs,
  refundablePaise,
  couponSharePaise = 0,
  clawbackPaise = 0,
  listPricePaise,
}: {
  legs: LedgerLeg[];
  refundablePaise: number;
  couponSharePaise?: number;
  clawbackPaise?: number;
  listPricePaise?: number;
}) {
  const legsTotal = legs.reduce((a, l) => a + l.amountPaise, 0);
  let running = 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-rule text-left">
            <th className="eyebrow px-3 py-2">Instrument</th>
            <th className="eyebrow px-3 py-2">Goes to</th>
            <th className="eyebrow px-3 py-2">State</th>
            <th className="eyebrow px-3 py-2">Expected arrival</th>
            <th className="eyebrow px-3 py-2 text-right">Amount</th>
            <th className="eyebrow px-3 py-2 text-right">Running total</th>
          </tr>
        </thead>
        <tbody>
          {typeof listPricePaise === "number" && couponSharePaise > 0 && (
            <>
              <tr className="border-b border-rule">
                <td className="px-3 py-2 text-ink-2" colSpan={4}>Item list price</td>
                <td className="px-3 py-2 text-right"><Money paise={listPricePaise} small /></td>
                <td className="px-3 py-2 text-right text-ink-2"><Money paise={listPricePaise} small /></td>
              </tr>
              <tr className="border-b border-rule">
                <td className="px-3 py-2 text-ink-2" colSpan={4}>
                  Discount reallocation — this item&apos;s coupon share is not refundable cash and vanishes with the return
                </td>
                <td className="px-3 py-2 text-right text-stuck">−<Money paise={couponSharePaise} small /></td>
                <td className="px-3 py-2 text-right text-ink-2"><Money paise={listPricePaise - couponSharePaise} small /></td>
              </tr>
            </>
          )}
          {legs.map((leg, i) => {
            running += leg.amountPaise;
            return (
              <tr key={`${leg.instrument}-${i}`} className="border-b border-rule">
                <td className="px-3 py-2 font-medium">{INSTRUMENT_LABEL[leg.instrument]}</td>
                <td className="px-3 py-2 text-ink-2">{leg.destination || "Original instrument"}</td>
                <td className="px-3 py-2">
                  <StateChip label={leg.state.replace(/_/g, " ")} tone={chipToneForVerdict(leg.state)} shape={leg.state === "credited" ? "done" : "current"} mono />
                </td>
                <td className="px-3 py-2 text-ink-2">{leg.etaText || "See instrument timeline"}</td>
                <td className="px-3 py-2 text-right"><Money paise={leg.amountPaise} small /></td>
                <td className="px-3 py-2 text-right text-ink-2"><Money paise={running} small /></td>
              </tr>
            );
          })}
          {clawbackPaise > 0 && (
            <tr className="border-b border-rule">
              <td className="px-3 py-2 text-ink-2" colSpan={4}>
                Free-shipping benefit reversed — this return dropped the kept items below the free-shipping threshold (policy line, shown before you confirmed)
              </td>
              <td className="px-3 py-2 text-right text-stuck">−<Money paise={clawbackPaise} small /></td>
              <td className="px-3 py-2 text-right text-ink-2"><Money paise={legsTotal} small /></td>
            </tr>
          )}
          <tr className="border-t-2 border-ink">
            <td className="px-3 py-2 font-semibold" colSpan={4}>
              Total refund for this item — reconciles to the refundable amount
            </td>
            <td className="px-3 py-2 text-right font-semibold"><Money paise={legsTotal} small /></td>
            <td className="px-3 py-2 text-right">
              <span className={legsTotal === refundablePaise ? "font-medium text-ok" : "font-medium text-wait"}>
                {legsTotal === refundablePaise ? "Matches" : "Refundable"} <Money paise={refundablePaise} small />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
