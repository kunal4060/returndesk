"use client";

import type { ReactNode } from "react";

/** Drawer — slide-over primitive; the one place the warm shadow is used. */
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <button
        aria-label="Close panel"
        className="absolute inset-0 h-full w-full cursor-default bg-ink/20"
        onClick={onClose}
      />
      <div className="layer-shadow absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-surface">
        <div className="flex items-center justify-between border-b border-rule px-5 py-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded border border-rule px-2 py-1 text-[13px] text-ink-2 hover:text-ink"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
