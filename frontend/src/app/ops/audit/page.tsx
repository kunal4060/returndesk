import { AuditLedger } from "@/components/ops/AuditLedger";

export default function OpsAuditPage() {
  return (
    <div className="px-4 py-6 md:px-6">
      <p className="eyebrow">Ops · Audit ledger</p>
      <h1 className="mt-1.5 text-[22px] font-bold tracking-tight">Append-only, hash-chained, verifiable</h1>
      <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        Seeded from the scenario&apos;s events at app start, then appended by everything the
        console does: reviewer actions (reason required), appeals, fault injections, refund
        issuances and blocked duplicates. Hashes are SHA-256 of the previous hash plus the
        entry content — computed by the engine&apos;s AuditLog.
      </p>
      <div className="mt-5">
        <AuditLedger />
      </div>
    </div>
  );
}
