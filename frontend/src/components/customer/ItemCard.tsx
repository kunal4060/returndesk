"use client";

import Link from "next/link";
import { Money } from "@/components/ui/Money";
import { StateChip } from "@/components/ui/StateChip";
import type { NItem } from "@/lib/data";

/** ItemCard — one item with its state chip and a link to its return. */
export function ItemCard({
  item,
  returnState,
  returnHref,
}: {
  item: NItem;
  returnState?: string;
  returnHref?: string;
}) {
  const state = returnState ?? item.state;
  return (
    <div className="flex items-start justify-between gap-3 rounded border border-rule bg-surface p-3.5">
      <div>
        <div className="text-[14px] font-medium">{item.name}</div>
        <div className="mt-0.5 text-[12px] text-ink-2">
          {item.sellerId ? <>Seller {item.sellerId} · </> : null}
          <span className="font-mono">{item.id}</span>
        </div>
        {state ? (
          <div className="mt-2">
            <StateChip
              label={state.replace(/_/g, " ")}
              tone={state === "completed" ? "ok" : state === "pickup_failed" || state === "disputed" || state === "inspection_hold" ? "stuck" : "accent"}
              shape={state === "completed" ? "done" : state === "pickup_failed" || state === "disputed" ? "exception" : "current"}
              mono
            />
          </div>
        ) : (
          <div className="mt-2 text-[12px] text-ink-2">Not returned</div>
        )}
      </div>
      <div className="text-right">
        <Money paise={item.pricePaise} small />
        {returnHref && (
          <div className="mt-1.5">
            <Link href={returnHref} className="text-[12.5px] font-medium text-accent underline underline-offset-2">
              View return
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
