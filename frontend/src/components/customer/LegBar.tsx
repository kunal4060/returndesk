"use client";

import { Money } from "@/components/ui/Money";
import type { Instrument } from "@/lib/data";

export interface LegBarLeg {
  instrument: Instrument;
  amountPaise: number;
}

const INSTRUMENT_BG: Record<Instrument, string> = {
  card: "bg-card",
  wallet: "bg-wallet",
  voucher: "bg-voucher",
};

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  card: "Card",
  wallet: "Wallet",
  voucher: "Voucher",
};

/**
 * LegBar — one 100% stacked bar per item: the refund's composition at
 * a glance. A hatched segment is money held / not refundable. Every
 * segment is also labelled in text — colour never works alone.
 */
export function LegBar({
  legs,
  heldPaise = 0,
  heldLabel = "Held / not refundable",
}: {
  legs: LegBarLeg[];
  heldPaise?: number;
  heldLabel?: string;
}) {
  const total = legs.reduce((a, l) => a + l.amountPaise, 0) + heldPaise;
  if (total <= 0) return <p className="text-[13px] text-ink-2">No refund legs yet.</p>;
  const pct = (v: number) => `${Math.max(0, (v / total) * 100).toFixed(2)}%`;
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-sm border border-rule" role="img" aria-label="Refund composition by instrument">
        {legs.map((leg, i) => (
          <div
            key={`${leg.instrument}-${i}`}
            className={INSTRUMENT_BG[leg.instrument]}
            style={{ width: pct(leg.amountPaise) }}
            title={`${INSTRUMENT_LABEL[leg.instrument]} ${leg.amountPaise}`}
          />
        ))}
        {heldPaise > 0 && (
          <div
            style={{
              width: pct(heldPaise),
              backgroundImage:
                "repeating-linear-gradient(45deg, #e7e0d4 0 4px, #faf7f2 4px 8px)",
            }}
            title={heldLabel}
          />
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
        {legs.map((leg, i) => (
          <li key={`${leg.instrument}-${i}`} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${INSTRUMENT_BG[leg.instrument]}`} />
            {INSTRUMENT_LABEL[leg.instrument]} <Money paise={leg.amountPaise} small />
          </li>
        ))}
        {heldPaise > 0 && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] border border-rule bg-paper" />
            {heldLabel} <Money paise={heldPaise} small />
          </li>
        )}
      </ul>
    </div>
  );
}
