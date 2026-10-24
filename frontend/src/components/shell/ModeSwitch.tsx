"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** ModeSwitch — customer ⇄ ops: the same return, two views of the truth. */
export function ModeSwitch() {
  const pathname = usePathname();
  const inOps = pathname.startsWith("/ops");
  const inCustomer = pathname.startsWith("/customer");
  const base =
    "rounded px-3 py-1.5 text-[13px] font-medium border border-rule transition-colors";
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Audience mode">
      <Link
        href="/customer"
        className={`${base} ${inCustomer ? "bg-ink text-paper" : "bg-surface text-ink-2 hover:text-ink"}`}
        aria-current={inCustomer ? "page" : undefined}
      >
        Customer
      </Link>
      <Link
        href="/ops"
        className={`${base} ${inOps ? "bg-ink text-paper" : "bg-surface text-ink-2 hover:text-ink"}`}
        aria-current={inOps ? "page" : undefined}
      >
        Ops console
      </Link>
    </div>
  );
}
