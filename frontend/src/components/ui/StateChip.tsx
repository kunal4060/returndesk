"use client";

/**
 * StateChip — status shown as shape + text label, never colour alone.
 * filled dot = done · ring = current · dashed ring = upcoming ·
 * diamond with cross = exception.
 */
export type ChipTone = "ok" | "wait" | "stuck" | "accent" | "neutral";
export type ChipShape = "done" | "current" | "future" | "exception";

const TONE_TEXT: Record<ChipTone, string> = {
  ok: "text-ok",
  wait: "text-wait",
  stuck: "text-stuck",
  accent: "text-accent",
  neutral: "text-ink-2",
};

const TONE_BORDER: Record<ChipTone, string> = {
  ok: "border-ok",
  wait: "border-wait",
  stuck: "border-stuck",
  accent: "border-accent",
  neutral: "border-ink-2",
};

const TONE_BG: Record<ChipTone, string> = {
  ok: "bg-ok",
  wait: "bg-wait",
  stuck: "bg-stuck",
  accent: "bg-accent",
  neutral: "bg-ink-2",
};

export function chipToneForVerdict(verdict: string): ChipTone {
  if (verdict === "in_agreement" || verdict === "credited" || verdict === "completed") return "ok";
  if (verdict === "waiting") return "wait";
  if (verdict === "stuck") return "stuck";
  return "neutral";
}

export function StateChip({
  label,
  tone = "neutral",
  shape = "current",
  mono = false,
}: {
  label: string;
  tone?: ChipTone;
  shape?: ChipShape;
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${TONE_TEXT[tone]} ${mono ? "font-mono" : ""}`}
      role="status"
      aria-label={label}
    >
      {shape === "done" && <span className={`inline-block h-2 w-2 rounded-full ${TONE_BG[tone]}`} />}
      {shape === "current" && (
        <span className={`inline-block h-2 w-2 rounded-full border-2 ${TONE_BORDER[tone]}`} />
      )}
      {shape === "future" && (
        <span className={`inline-block h-2 w-2 rounded-full border border-dashed ${TONE_BORDER[tone]}`} />
      )}
      {shape === "exception" && (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
          <rect x="2" y="2" width="6" height="6" transform="rotate(45 5 5)" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3.6 3.6 L6.4 6.4 M6.4 3.6 L3.6 6.4" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )}
      <span>{label}</span>
    </span>
  );
}
