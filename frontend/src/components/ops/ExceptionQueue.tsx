"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { StateChip, chipToneForVerdict } from "@/components/ui/StateChip";
import { INSTRUMENT_LABEL } from "@/components/customer/LegBar";
import type { LegVerdict } from "@/lib/engine";
import type { NLeg } from "@/lib/data";

export interface QueueRow {
  id: string;
  leg: NLeg;
  verdict: LegVerdict;
}

export const BREAK_LABELS: Record<string, string> = {
  missing_at_provider: "Missing item — provider has no record",
  missing_in_ledger: "Missing item — ledger has no record",
  amount: "Amount differs",
  amount_mismatch: "Amount differs",
  timing: "Date/status differs — past its window",
  lifecycle: "Date/status differs — states contradict",
  fee: "Amount differs — fee",
  duplicate: "Extra item — duplicate",
  bank: "Amount differs — bank side",
  restatement: "Date/status differs — restated",
};

/**
 * ExceptionQueue — label-first rows, stuck first, then largest amount.
 * Waiting rows are quiet by design; stuck rows are the only loud ones.
 */
export function ExceptionQueue({ rows }: { rows: QueueRow[] }) {
  const sorted = [...rows].sort((a, b) => {
    const rank = (v: string) => (v === "stuck" ? 0 : v === "waiting" ? 1 : 2);
    const d = rank(a.verdict.verdict) - rank(b.verdict.verdict);
    if (d !== 0) return d;
    return b.leg.amountPaise - a.leg.amountPaise;
  });

  const columns: Column<QueueRow>[] = [
    {
      key: "label",
      header: "Exception",
      render: (r) =>
        r.verdict.verdict === "in_agreement" ? (
          <span className="text-ink-2">In agreement</span>
        ) : (
          <span className={r.verdict.verdict === "stuck" ? "font-semibold text-stuck" : "text-ink"}>
            {BREAK_LABELS[r.verdict.breakClass ?? ""] ??
              (r.verdict.verdict === "stuck" ? "Status differs — stuck" : "Waiting — inside its window")}
          </span>
        ),
    },
    {
      key: "leg",
      header: "Refund leg",
      render: (r) => (
        <span>
          <span className="font-medium">{INSTRUMENT_LABEL[r.leg.instrument]}</span>{" "}
          <Link href={`/ops/returns/${r.leg.returnId}`} className="font-mono text-[12px] text-accent underline underline-offset-2">
            {r.leg.returnId || r.leg.id}
          </Link>
          <span className="block font-mono text-[11px] text-ink-2">{r.leg.id}</span>
        </span>
      ),
    },
    {
      key: "verdict",
      header: "Verdict",
      render: (r) => (
        <StateChip
          label={r.verdict.verdict.replace(/_/g, " ")}
          tone={chipToneForVerdict(r.verdict.verdict)}
          shape={r.verdict.verdict === "stuck" ? "exception" : r.verdict.verdict === "in_agreement" ? "done" : "current"}
        />
      ),
    },
    {
      key: "age",
      header: "Age vs budget",
      align: "right",
      render: (r) => (
        <span className="tnum font-mono text-[12px]">
          {(r.verdict.ageHours ?? r.leg.ageHours).toFixed(0)}h / {(r.verdict.budgetHours ?? 0).toFixed(0)}h
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => <Money paise={r.leg.amountPaise} small />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={sorted}
      emptyText="No refund legs in the seeded scenario yet."
    />
  );
}
