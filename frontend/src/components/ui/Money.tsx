"use client";

import { formatINR } from "@/lib/engine";

/** Money — integer paise rendered as ₹ with tabular figures. */
export function Money({
  paise,
  className = "",
  small = false,
}: {
  paise: number;
  className?: string;
  small?: boolean;
}) {
  return (
    <span className={`tnum whitespace-nowrap ${small ? "text-[13px]" : ""} ${className}`}>
      {formatINR(paise)}
    </span>
  );
}
