import { OrderCard } from "@/components/customer/OrderCard";
import { getOrders, getReturns } from "@/lib/data";

export default function CustomerOrdersPage() {
  const orders = getOrders();
  const returns = getReturns();
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6">
      <p className="eyebrow">Customer view</p>
      <h1 className="mt-1.5 text-[24px] font-bold tracking-tight">Your orders &amp; returns</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        Each item has its own return story and its own money trail. The counter on each order
        only counts money the provider has confirmed as credited — never money that is
        merely on its way.
      </p>
      <div className="mt-6 flex flex-col gap-5">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            returns={returns.filter((r) => r.orderId === order.id)}
          />
        ))}
        {orders.length === 0 && (
          <p className="rounded border border-rule bg-surface p-5 text-sm text-ink-2">
            No orders in the seeded scenario yet. Run <span className="font-mono">npm run sync-data</span>{" "}
            after the dataset lands.
          </p>
        )}
      </div>
    </div>
  );
}
