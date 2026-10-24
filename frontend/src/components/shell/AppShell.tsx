"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode, SVGProps } from "react";
import { useState } from "react";
import { ModeSwitch } from "./ModeSwitch";
import { SimControls } from "./SimControls";
import { NotificationDrawer } from "@/components/customer/NotificationDrawer";
import { useSim } from "@/state/SimProvider";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" {...props} />
  );
}

const NAV: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/",
    label: "Scenario",
    icon: (
      <Icon>
        <path d="M2 5.5 8 2l6 3.5V14H9.5v-5h-3v5H2z" />
      </Icon>
    ),
  },
  {
    href: "/customer",
    label: "Customer",
    icon: (
      <Icon>
        <circle cx="8" cy="5.2" r="2.6" />
        <path d="M2.8 13.6c.7-2.4 2.8-3.6 5.2-3.6s4.5 1.2 5.2 3.6" />
      </Icon>
    ),
  },
  {
    href: "/ops",
    label: "Ops console",
    icon: (
      <Icon>
        <rect x="2" y="2" width="5" height="5" />
        <rect x="9" y="2" width="5" height="5" />
        <rect x="2" y="9" width="5" height="5" />
        <rect x="9" y="9" width="5" height="5" />
      </Icon>
    ),
  },
  {
    href: "/ops/audit",
    label: "Audit ledger",
    icon: (
      <Icon>
        <path d="M3 2h8l2 2v10H3z" />
        <path d="M5.5 6h5M5.5 9h5M5.5 12h3" />
      </Icon>
    ),
  },
  {
    href: "/ops/fraud",
    label: "Fraud & evidence",
    icon: (
      <Icon>
        <path d="M8 1.8 13 3.8v4c0 3.2-2.1 5.4-5 6.4-2.9-1-5-3.2-5-6.4v-4z" />
        <path d="M5.8 8.2 7.4 9.8 10.4 6.4" />
      </Icon>
    ),
  },
  {
    href: "/eval",
    label: "Evaluation",
    icon: (
      <Icon>
        <path d="M2.5 13.5v-4M6.2 13.5v-7M9.9 13.5v-10M13.6 13.5v-5.5" />
      </Icon>
    ),
  },
  {
    href: "/docs",
    label: "Docs",
    icon: (
      <Icon>
        <path d="M4 1.8h7L13 4v10.2H4z" />
        <path d="M10.8 2v2.2H13M6 7h4M6 10h4" />
      </Icon>
    ),
  },
];

/** AppShell — left rail + top bar (sim clock, fault panel, mode switch). */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const sim = useSim();
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-rule bg-surface md:flex">
        <div className="border-b border-rule px-5 py-5">
          <div className="text-[15px] font-bold tracking-tight">Ledger &amp; Thread</div>
          <div className="mt-0.5 text-[12px] text-ink-2">Returns &amp; refunds, kept honestly</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3 py-4" aria-label="Primary">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href) && (item.href !== "/ops" || pathname === "/ops" || pathname.startsWith("/ops/returns"));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded px-2.5 py-2 text-[13.5px] ${
                  active ? "bg-paper font-semibold text-accent" : "text-ink-2 hover:bg-paper hover:text-ink"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-rule px-5 py-4 text-[12px] text-ink-2">
          All payment and logistics states are <span className="font-semibold text-ink">simulated</span>.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-rule bg-paper/95">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6">
            <span className="text-[14px] font-bold md:hidden">Ledger &amp; Thread</span>
            <ModeSwitch />
            <div className="ml-auto flex items-center gap-3">
              <SimControls />
              <button
                onClick={() => setNotifOpen(true)}
                className="relative rounded border border-rule bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-accent hover:text-accent"
                aria-label="Open simulated notifications"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" className="inline">
                  <path d="M8 2a4 4 0 0 1 4 4c0 3 .8 4 1.2 4.6H2.8C3.2 10 4 9 4 6a4 4 0 0 1 4-4zM6.6 12.4a1.5 1.5 0 0 0 2.8 0" />
                </svg>{" "}
                Notices
                {sim.notifications.length > 0 && (
                  <span className="tnum ml-1 rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                    {sim.notifications.length}
                  </span>
                )}
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Primary mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded border border-rule bg-surface px-2.5 py-1 text-[12.5px] text-ink-2"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} notifications={sim.notifications} />
    </div>
  );
}
