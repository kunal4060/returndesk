"use client";

import type { ReactNode } from "react";

export interface PulseMetric {
  label: string;
  value: ReactNode;
  sub: string;
  tone?: "ink" | "stuck" | "ok" | "wait";
}

const TONE_CLASS = {
  ink: "text-ink",
  stuck: "text-stuck",
  ok: "text-ok",
  wait: "text-wait",
};

/**
 * MetricPulse — the console's 3-second answer: is everything roughly
 * OK, and what needs a human today?
 */
export function MetricPulse({ metrics }: { metrics: PulseMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-rule bg-rule lg:grid-cols-4">
      {metrics.map((m) => (
        <div key={m.label} className="bg-surface px-4 py-3.5">
          <div className="eyebrow">{m.label}</div>
          <div className={`tnum mt-1 text-[22px] font-semibold leading-none ${TONE_CLASS[m.tone ?? "ink"]}`}>
            {m.value}
          </div>
          <div className="mt-1.5 text-[12px] leading-snug text-ink-2">{m.sub}</div>
        </div>
      ))}
    </div>
  );
}
