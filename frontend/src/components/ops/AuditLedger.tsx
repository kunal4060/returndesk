"use client";

import { useState } from "react";
import { useSim } from "@/state/SimProvider";

/**
 * AuditLedger — the trail rendered as a bound ledger: a continuous
 * ruled list with the running hash in mono at each line's right
 * margin, so "tamper-evident" is visible, not asserted. "Verify chain"
 * recomputes the chain live.
 */
export function AuditLedger() {
  const sim = useSim();
  const [filter, setFilter] = useState("");
  const [verifyResult, setVerifyResult] = useState<string>("");

  const entries = sim.auditEntries.filter((e) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      e.actor.toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q) ||
      JSON.stringify(e.payload).toLowerCase().includes(q)
    );
  });

  const runVerify = () => {
    const res = sim.verifyChain();
    setVerifyResult(res.message);
  };

  return (
    <section aria-label="Audit ledger">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by actor, action, or payload…"
          className="w-72 rounded border border-rule bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
          aria-label="Filter audit entries"
        />
        <button
          onClick={runVerify}
          className="rounded bg-ink px-4 py-2 text-[13px] font-semibold text-paper hover:bg-accent"
        >
          Verify chain
        </button>
        {verifyResult && (
          <span className={`text-[13px] font-medium ${verifyResult.includes("FAILED") || verifyResult.includes("Broken") || verifyResult.includes("mismatch") ? "text-stuck" : "text-ok"}`}>
            {verifyResult}
          </span>
        )}
        <span className="ml-auto font-mono text-[11.5px] text-ink-2">
          source: {sim.auditSource === "engine" ? "engine AuditLog" : "local fallback chain"} · {entries.length} entries shown
        </span>
      </div>

      <div className="rounded border border-rule bg-surface">
        {entries.length === 0 && <p className="px-4 py-6 text-sm text-ink-2">No audit entries match.</p>}
        <ol>
          {entries.map((e) => (
            <li key={`${e.seq}-${e.hash}`} className="flex items-start gap-4 border-b border-rule px-4 py-2.5 last:border-b-0">
              <span className="tnum w-8 shrink-0 pt-0.5 font-mono text-[12px] text-ink-2">{e.seq}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-[13px] font-semibold">{e.action}</span>
                  <span className="text-[12px] text-ink-2">by {e.actor}</span>
                  {e.ts && <span className="font-mono text-[11.5px] text-ink-2">{e.ts}</span>}
                </div>
                {Object.keys(e.payload).length > 0 && (
                  <p className="mt-0.5 break-all font-mono text-[11.5px] leading-relaxed text-ink-2">
                    {JSON.stringify(e.payload)}
                  </p>
                )}
              </div>
              <span className="hidden shrink-0 pt-0.5 text-right font-mono text-[10.5px] leading-tight text-ink-2 sm:block" title={`prev ${e.prevHash}`}>
                {e.hash ? `${e.hash.slice(0, 10)}…${e.hash.slice(-6)}` : "—"}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-3 text-[12.5px] text-ink-2">
        Append-only: entries are never edited or deleted. Each hash covers the previous
        entry&apos;s hash plus this entry&apos;s content, so changing any earlier line breaks
        every later hash — and the Verify button proves it live.
      </p>
    </section>
  );
}
