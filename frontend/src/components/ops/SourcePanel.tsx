"use client";

import { Money } from "@/components/ui/Money";
import type { NSourceRecord } from "@/lib/data";

/**
 * SourcePanel — one source's record for a leg: the raw imported values
 * beside the normalised values, with freshness. Raw-vs-normalised is
 * what lets a reviewer see what the source actually said.
 */
export function SourcePanel({
  title,
  record,
  stale = false,
}: {
  title: string;
  record?: NSourceRecord;
  stale?: boolean;
}) {
  return (
    <section className="rounded border border-rule bg-surface p-4" aria-label={`${title} record`}>
      <div className="flex items-baseline justify-between">
        <h3 className="eyebrow">{title}</h3>
        {stale && <span className="text-[11px] font-semibold uppercase tracking-wide text-stuck">Stale (simulated)</span>}
      </div>
      {!record ? (
        <p className="mt-3 text-[13px] text-stuck">No record from this source yet — the leg is missing here.</p>
      ) : (
        <>
          <dl className="mt-3 space-y-1.5 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Normalised state</dt>
              <dd className="font-mono font-medium">{record.state}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Normalised amount</dt>
              <dd>{record.amountPaise !== null ? <Money paise={record.amountPaise} small /> : <span className="text-ink-2">not reported</span>}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Recorded at</dt>
              <dd className="font-mono text-[12px]">{record.recordedAt || "—"}</dd>
            </div>
          </dl>
          <div className="mt-3 border-t border-rule pt-2.5">
            <div className="eyebrow mb-1">Raw, as imported</div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-ink-2">
              {JSON.stringify(record.raw, null, 1)}
            </pre>
          </div>
        </>
      )}
    </section>
  );
}
