"use client";

import { getWording } from "@/wording/library";

/**
 * WordingBlock — what this means / what happens next / by when.
 * All three slots come from the wording library, keyed by state.
 */
export function WordingBlock({ machine, state }: { machine: string; state: string }) {
  const entry = getWording(machine, state);
  return (
    <div className="grid gap-4 rounded border border-rule bg-surface p-4 sm:grid-cols-3">
      <div>
        <div className="eyebrow">What this means</div>
        <p className="mt-1 text-[13.5px] leading-relaxed">{entry.what}</p>
      </div>
      <div>
        <div className="eyebrow">What happens next</div>
        <p className="mt-1 text-[13.5px] leading-relaxed">{entry.next}</p>
      </div>
      <div>
        <div className="eyebrow">By when</div>
        <p className="mt-1 text-[13.5px] leading-relaxed">{entry.byWhen}</p>
      </div>
    </div>
  );
}
