import Link from "next/link";
import { Money } from "@/components/ui/Money";
import { StateChip } from "@/components/ui/StateChip";
import { getOrders, getReturns, heroSummary, scenario } from "@/lib/data";
import { str } from "@/lib/data";

const DEMO_BEATS = [
  "Customer view — open the hero order: two items returning, timelines mid-flight, and a money-back counter that only counts confirmed credits.",
  "Waterfall — open the shoes: card / wallet / voucher legs with the discount reallocation line; the voucher leg returns as a voucher, never to a bank.",
  "Disputes — the pickup failed twice (courier bundle vs the customer's claim), then the warehouse said “used” against a frozen doorstep QC pass: partial-refund arithmetic, shown in full.",
  "Ops flip — the same return in the console: the provider says “reversed”, the seller says “pending”; the verdict is stuck, and Retry refund is blocked by idempotency on the second press.",
  "Fraud & fairness — the customer is a heavy returner (12 sizing returns, all legitimate): friction rises with every signal explained, the customer appeals, a human overturns it.",
  "Proof — run the evaluation harness live, then verify the audit hash chain.",
];

export default function HomePage() {
  const orders = getOrders();
  const returns = getReturns();
  const hero = orders[0];
  const summary = heroSummary();
  const payments = hero?.payments ?? [];
  const labelling = str(scenario, "labelling");

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6">
      <p className="eyebrow">IMPACTX 2026 · Challenge 15 · Simulated scenario</p>
      <h1 className="mt-2 max-w-3xl text-[28px] font-bold leading-tight tracking-tight">
        The return that shouldn&apos;t be a hassle
      </h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">
        An item-level return and refund system that keeps every rupee accounted for: a refund
        waterfall across card, wallet and voucher; three sources of truth reconciled as{" "}
        <em>waiting</em> or <em>stuck</em>; exactly-once refunds; evidence-based disputes; and an
        audit trail you can verify. Every status word on every screen comes from one wording
        library, and money is never called &quot;back&quot; before the provider confirms the credit.
      </p>
      {labelling && (
        <p className="mt-3 max-w-3xl rounded border border-wait bg-surface px-3.5 py-2.5 text-[12.5px] text-wait">
          {labelling}
        </p>
      )}

      {/* Hero scenario card */}
      <section className="mt-8 rounded border border-rule bg-surface p-5" aria-label="Hero scenario">
        <div className="eyebrow">Seeded scenario · {str(scenario, "id") || "HERO-1"}</div>
        <h2 className="mt-1.5 text-[19px] font-semibold tracking-tight">{summary.title}</h2>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-2">{summary.description}</p>

        {hero && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded border border-rule bg-paper p-3.5">
              <div className="eyebrow">The order</div>
              <div className="mt-1 font-mono text-[14px] font-semibold">{hero.id}</div>
              <p className="mt-1 text-[12.5px] text-ink-2">
                {hero.items.length} items · {new Set(hero.items.map((i) => i.sellerId)).size} sellers · total{" "}
                <Money paise={hero.totalPaise} small />
              </p>
              <ul className="mt-2 space-y-1 text-[12.5px] text-ink-2">
                {payments.map((p) => (
                  <li key={p.instrument} className="flex justify-between">
                    <span className="capitalize">{p.instrument}</span>
                    <Money paise={p.amountPaise} small />
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded border border-rule bg-paper p-3.5 md:col-span-2">
              <div className="eyebrow">The returns</div>
              <ul className="mt-2 space-y-2.5">
                {returns.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
                    <span className="font-medium">{r.itemName || r.itemId}</span>
                    <StateChip
                      label={r.state.replace(/_/g, " ")}
                      tone={r.state.includes("dispute") ? "stuck" : "accent"}
                      shape={r.state.includes("dispute") ? "exception" : "current"}
                      mono
                    />
                    <Link href={`/customer/returns/${r.id}`} className="text-accent underline underline-offset-2">
                      Return {r.id}
                    </Link>
                    <Link href={`/ops/returns/${r.id}`} className="text-accent underline underline-offset-2">
                      Same return in ops
                    </Link>
                  </li>
                ))}
                {returns.length === 0 && <li className="text-ink-2">No returns seeded yet.</li>}
              </ul>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/customer" className="rounded bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-paper hover:bg-accent">
            Enter as customer
          </Link>
          <Link href="/ops" className="rounded border border-ink px-4 py-2.5 text-[13.5px] font-semibold hover:border-accent hover:text-accent">
            Ops console
          </Link>
          <Link href="/eval" className="rounded border border-rule bg-surface px-4 py-2.5 text-[13.5px] font-medium hover:border-accent hover:text-accent">
            Evaluation harness
          </Link>
          <Link href="/docs" className="rounded border border-rule bg-surface px-4 py-2.5 text-[13.5px] font-medium hover:border-accent hover:text-accent">
            Data card &amp; threat model
          </Link>
        </div>
      </section>

      {/* Demo checklist */}
      <section className="mt-8" aria-label="Demo checklist">
        <h2 className="eyebrow">The six-beat demo</h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-2">
          {DEMO_BEATS.map((beat, i) => (
            <li key={i} className="flex gap-3 rounded border border-rule bg-surface p-4">
              <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent text-[12.5px] font-bold text-accent">
                {i + 1}
              </span>
              <p className="text-[13.5px] leading-relaxed">{beat}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
