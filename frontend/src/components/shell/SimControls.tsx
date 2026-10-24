"use client";

import { useState } from "react";
import { useSim } from "@/state/SimProvider";

/**
 * SimControls — simulation clock + fault injection, in the top bar.
 * Demo-critical: judges can advance time and inject faults from here.
 */
export function SimControls() {
  const sim = useSim();
  const [faultOpen, setFaultOpen] = useState(false);
  const activeFaults =
    (sim.faults.providerOutage ? 1 : 0) +
    (sim.faults.staleData ? 1 : 0) +
    sim.faults.duplicateWebhooks;

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right md:block">
        <div className="eyebrow">Simulated clock</div>
        <div className="font-mono text-[12px] text-ink">{sim.simNowLabel}</div>
      </div>
      <button
        onClick={() => sim.advanceTime(6)}
        className="rounded border border-rule bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-accent hover:text-accent"
      >
        Advance time +6h
      </button>
      <div className="relative">
        <button
          onClick={() => setFaultOpen((o) => !o)}
          className="rounded border border-rule bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-stuck hover:text-stuck"
          aria-expanded={faultOpen}
        >
          Inject fault{activeFaults > 0 ? ` (${activeFaults} active)` : ""}
        </button>
        {faultOpen && (
          <div className="layer-shadow absolute right-0 top-full z-30 mt-2 w-72 rounded border border-rule bg-surface p-3">
            <p className="eyebrow mb-2">Fault panel — simulated</p>
            <div className="flex flex-col gap-2">
              <button
                className="rounded border border-rule px-3 py-2 text-left text-[13px] hover:border-stuck"
                onClick={() => sim.injectFault("duplicate_webhook")}
              >
                Duplicate webhook
                <span className="block text-[12px] text-ink-2">
                  Same provider event delivered again — dedupe must block it. Injected:{" "}
                  {sim.faults.duplicateWebhooks}
                </span>
              </button>
              <button
                className="rounded border border-rule px-3 py-2 text-left text-[13px] hover:border-stuck"
                onClick={() => sim.injectFault("provider_outage")}
              >
                Provider outage
                <span className="block text-[12px] text-ink-2">
                  Provider column goes stale in Three Truths.
                  {sim.faults.providerOutage ? " Active now." : ""}
                </span>
              </button>
              <button
                className="rounded border border-rule px-3 py-2 text-left text-[13px] hover:border-stuck"
                onClick={() => sim.injectFault("stale_data")}
              >
                Stale data
                <span className="block text-[12px] text-ink-2">
                  Source records carry a stale-data warning.
                  {sim.faults.staleData ? " Active now." : ""}
                </span>
              </button>
              {activeFaults > 0 && (
                <button
                  className="rounded border border-rule px-3 py-2 text-left text-[13px] text-ok hover:border-ok"
                  onClick={() => {
                    sim.clearFaults();
                    setFaultOpen(false);
                  }}
                >
                  Clear all faults
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
