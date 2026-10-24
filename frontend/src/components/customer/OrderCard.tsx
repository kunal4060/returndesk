"use client";

import Link from "next/link";
import { Money } from "@/components/ui/Money";
import { ItemCard } from "./ItemCard";
import type { NOrder, NReturn } from "@/lib/data";

/**
 * OrderCard — order summary with the honest money-back counter:
 * credited so far vs the refundable total of the returned items.
 * Money that is merely initiated is never counted as "back".
 */
export function OrderCard({
  order,
  returns,
}: {
  order: NOrder;
  returns: NReturn[];
}) {
  const byItem = new Map(returns.map((r) => [r.itemId, r]));
  const refundableTotal = returns.reduce((a, r) => {
    const legsSum = r.legs.reduce((x, l) => x + l.amountPaise, 0);
    return a + (r.refundablePaise || legsSum);
  }, 0);
  const creditedTotal = returns.reduce(
    (a, r) => a + r.legs.filter((l) => l.state === "credited").reduce((x, l) => x + l.amountPaise, 0),
    0,
  );
  return (
    <section className="rounded border border-rule bg-surface p-5" aria-label={`Order ${order.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="eyebrow">Order</div>
          <h2 className="font-mono text-[16px] font-semibold">{order.id}</h2>
          {order.placedAt && <p className="text-[12px] text-ink-2">Placed {order.placedAt}</p>}
        </div>
        <div className="text-right">
          <div className="eyebrow">Order total</div>
          <Money paise={order.totalPaise} />
        </div>
      </div>

      {returns.length > 0 && (
        <div className="mt-4 rounded border border-rule bg-paper px-4 py-3">
          <span className="text-[13.5px]">
            Money back so far:{" "}
            <span className="font-semibold text-ok"><Money paise={creditedTotal} /></span>
            {" "}of{" "}
            <span className="font-semibold"><Money paise={refundableTotal} /></span>
            {" "}refundable
          </span>
          <p className="mt-1 text-[12.5px] text-ink-2">
            Only money the provider has confirmed as credited counts as &quot;back&quot;. Amounts still
            travelling are shown per item below — split refunds arriving on different days is normal.
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {order.items.map((item) => {
          const ret = byItem.get(item.id);
          return (
            <ItemCard
              key={item.id}
              item={item}
              returnState={ret?.state}
              returnHref={ret ? `/customer/returns/${ret.id}` : undefined}
            />
          );
        })}
      </div>

      <div className="mt-4">
        <Link href={`/customer/orders/${order.id}`} className="text-[13.5px] font-medium text-accent underline underline-offset-2">
          Open item-level dashboard
        </Link>
      </div>
    </section>
  );
}
