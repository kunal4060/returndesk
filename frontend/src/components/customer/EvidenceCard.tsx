"use client";

import type { Rec } from "@/lib/data";
import { pick, str } from "@/lib/data";

/**
 * EvidenceCard — one piece of seeded evidence (handover photo, courier
 * log line, QC snapshot). Always labelled Simulated: this dataset is a
 * stand-in for real uploads, and the label is part of the honesty rule.
 */
export function EvidenceCard({ evidence }: { evidence: Rec }) {
  const title = str(evidence, "title", "label", "kind", "type") || "Evidence";
  const description = str(evidence, "description", "detail", "note", "summary");
  const imageUrl = str(evidence, "imageUrl", "url", "src", "photoUrl");
  const capturedAt = str(evidence, "capturedAt", "at", "timestamp");
  const by = str(evidence, "by", "actor", "source");
  const score = pick(evidence, "detectorScore", "score");
  return (
    <figure className="rounded border border-rule bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <figcaption className="text-[13.5px] font-semibold">{title}</figcaption>
        <span className="rounded border border-wait px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-wait">
          Simulated
        </span>
      </div>
      {imageUrl ? (
        // Seeded evidence images are local stand-ins; a plain img keeps
        // this dependency-free.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={title} className="mt-3 max-h-56 w-full rounded border border-rule object-cover" />
      ) : (
        <div className="mt-3 flex h-24 items-center justify-center rounded border border-dashed border-rule bg-paper text-[12px] text-ink-2">
          Photo evidence (seeded placeholder)
        </div>
      )}
      {description && <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{description}</p>}
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        {capturedAt && (
          <>
            <dt className="text-ink-2">Captured</dt>
            <dd className="font-mono">{capturedAt}</dd>
          </>
        )}
        {by && (
          <>
            <dt className="text-ink-2">Recorded by</dt>
            <dd>{by}</dd>
          </>
        )}
        {typeof score === "number" && (
          <>
            <dt className="text-ink-2">Detector score</dt>
            <dd className="tnum">{score.toFixed(2)} — a review signal only, never a verdict</dd>
          </>
        )}
      </dl>
    </figure>
  );
}
