"use client";

import { useState, type ReactNode } from "react";

export interface StepperStep {
  title: string;
  eyebrow: string;
  body: ReactNode;
}

/**
 * DisputeStepper — one decision per screen. Disputes are stressful;
 * the flow never shows a mega-form, and each step names its decision.
 */
export function DisputeStepper({
  steps,
  finishLabel = "Done",
  onFinish,
}: {
  steps: StepperStep[];
  finishLabel?: string;
  onFinish?: (stepIndex: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  if (!step) return null;
  const isLast = index === steps.length - 1;
  return (
    <div className="rounded border border-rule bg-surface p-5">
      <div className="flex items-center gap-2" aria-label={`Step ${index + 1} of ${steps.length}`}>
        {steps.map((s, i) => (
          <span
            key={s.title}
            className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-accent" : "bg-rule"}`}
            aria-hidden="true"
          />
        ))}
      </div>
      <p className="mt-4 text-[12px] font-medium text-ink-2">
        Step {index + 1} of {steps.length} · {step.eyebrow}
      </p>
      <h2 className="mt-1 text-[18px] font-semibold tracking-tight">{step.title}</h2>
      <div className="mt-3">{step.body}</div>
      <div className="mt-6 flex items-center justify-between border-t border-rule pt-4">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded border border-rule px-3.5 py-2 text-[13px] font-medium disabled:opacity-40"
        >
          Back
        </button>
        <button
          onClick={() => {
            if (isLast) onFinish?.(index);
            else setIndex((i) => Math.min(steps.length - 1, i + 1));
          }}
          className="rounded bg-ink px-4 py-2 text-[13px] font-semibold text-paper hover:bg-accent"
        >
          {isLast ? finishLabel : "Continue"}
        </button>
      </div>
    </div>
  );
}
