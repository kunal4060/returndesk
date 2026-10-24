"use client";

import { useEffect, useState } from "react";
import { StateChip } from "@/components/ui/StateChip";
import {
  assessFriction,
  buildAllocationMatrix,
  classifyInputForLeg,
  classifyLeg,
  computeRefund,
  getMachines,
} from "@/lib/engine";
import {
  detectorScores,
  evidenceSet,
  getAllLegs,
  heavyReturners,
  scenario,
  str,
  testOrders,
  type Rec,
} from "@/lib/data";
import { WORDING } from "@/wording/library";
import {
  AuditLog,
  RefundIssuer,
  WebhookInbox,
  applyTransition,
} from "@impactx/backend";
import { screenEvidence } from "@impactx/ml";

interface CheckResult {
  name: string;
  expected: string;
  actual: string;
  pass: boolean;
  detail: string;
}

interface Metric {
  label: string;
  value: string;
  sub: string;
}

function runAllocation(): { metric: Metric; checks: CheckResult[] } {
  const checks: CheckResult[] = [];
  let correct = 0;
  for (const raw of testOrders) {
    const id = str(raw, "id");
    try {
      if (!buildAllocationMatrix || !computeRefund) throw new Error("engine allocation functions unavailable");
      const items = (raw.items as Rec[]).map((i) => ({
        id: str(i, "id"),
        name: str(i, "id"),
        sellerId: "S-TEST",
        listPricePaise: Number(i.listPricePaise ?? 0),
      }));
      const order = {
        id,
        items,
        couponPaise: Number(raw.couponPaise ?? 0),
        payments: (raw.payments as Rec[]).map((p) => ({
          instrument: str(p, "instrument"),
          amountPaise: Number(p.amountPaise ?? 0),
        })),
      };
      const expected = raw.expectedRefund as Rec;
      const returnIds = (raw.returnItemIds as unknown[]).map(String);
      const matrix = buildAllocationMatrix(order);
      const plan = computeRefund(matrix, order, returnIds, str(expected, "mode") || "prorata") as Rec;
      const expectedLegs = new Map(
        ((expected.legs as Rec[]) ?? []).map((l) => [str(l, "instrument"), Number(l.amountPaise ?? 0)]),
      );
      const actualLegs = new Map(
        ((plan.legs as Rec[]) ?? []).map((l) => [str(l, "instrument"), Number(l.amountPaise ?? 0)]),
      );
      const legsMatch =
        expectedLegs.size === actualLegs.size &&
        [...expectedLegs.entries()].every(([k, v]) => actualLegs.get(k) === v);
      const totalMatch = Number(plan.totalPaise ?? -1) === Number(expected.totalPaise ?? -2);
      const ok = legsMatch && totalMatch;
      if (ok) correct += 1;
      checks.push({
        name: `Allocation — ${id}`,
        expected: [...expectedLegs.entries()].map(([k, v]) => `${k} ${v}`).join(" · ") + ` = ${expected.totalPaise}`,
        actual: [...actualLegs.entries()].map(([k, v]) => `${k} ${v}`).join(" · ") + ` = ${plan.totalPaise}`,
        pass: ok,
        detail: ok ? "Rupee-by-rupee match against the hand-computed expectation." : "Leg split or total differs from the expectation.",
      });
    } catch (e) {
      checks.push({
        name: `Allocation — ${id}`,
        expected: "engine refund equals hand-computed expectation",
        actual: e instanceof Error ? e.message : String(e),
        pass: false,
        detail: "Engine threw while computing this order.",
      });
    }
  }
  const pct = testOrders.length ? Math.round((correct / testOrders.length) * 100) : 0;
  return {
    metric: {
      label: "Refund allocation correctness",
      value: `${pct}%`,
      sub: `${correct} of ${testOrders.length} seeded mixed-instrument orders match the hand-computed refund rupee-by-rupee.`,
    },
    checks,
  };
}

function mapSeededVerdict(seeded: string): string {
  if (seeded === "settled") return "in_agreement";
  return seeded;
}

function runClassification(): { metric: Metric; checks: CheckResult[] } {
  const checks: CheckResult[] = [];
  let correct = 0;
  let total = 0;

  for (const leg of getAllLegs()) {
    if (!leg.seededClassification) continue;
    total += 1;
    const expected = mapSeededVerdict(leg.seededClassification);
    const verdict = classifyLeg(classifyInputForLeg(leg));
    const ok = verdict.verdict === expected;
    if (ok) correct += 1;
    checks.push({
      name: `Classification — ${leg.returnId} ${leg.instrument} leg`,
      expected,
      actual: `${verdict.verdict} (${verdict.source})`,
      pass: ok,
      detail: verdict.reason || leg.seededReason,
    });
  }

  const synthetic: { name: string; input: Parameters<typeof classifyLeg>[0]; expected: string; why: string }[] = [
    {
      name: "Synthetic — all sources agree pending, card, 10h",
      input: { instrument: "card", amountPaise: 10000, ageHours: 10, platformState: "pending", providerState: "pending", sellerState: "pending", providerAmountPaise: 10000, legPresentAtProvider: true },
      expected: "waiting",
      why: "Unanimous \"pending\" inside the 168h card budget means the leg is in flight: waiting. in_agreement is reserved for settled (terminal) agreement — the same labelling the seeded legs use (hero voucher leg).",
    },
    {
      name: "Synthetic — provider reversed vs platform processed",
      input: { instrument: "card", amountPaise: 10000, ageHours: 96, platformState: "processed", providerState: "reversed", sellerState: "pending", providerAmountPaise: 10000, legPresentAtProvider: true },
      expected: "stuck",
      why: "Terminal-state contradiction never resolves by waiting.",
    },
    {
      name: "Synthetic — leg missing at provider, wallet, 10h",
      input: { instrument: "wallet", amountPaise: 5000, ageHours: 10, platformState: "initiated", providerState: null, sellerState: "initiated", providerAmountPaise: null, legPresentAtProvider: false },
      expected: "stuck",
      why: "Wallet budget is 4h; absent at the provider after 10h means the refund may never have been sent.",
    },
    {
      name: "Synthetic — leg missing at provider, card, 10h",
      input: { instrument: "card", amountPaise: 5000, ageHours: 10, platformState: "initiated", providerState: null, sellerState: "initiated", providerAmountPaise: null, legPresentAtProvider: false },
      expected: "waiting",
      why: "Card budget is 168h; absence at hour 10 is still inside the expected window.",
    },
  ];
  for (const c of synthetic) {
    total += 1;
    const verdict = classifyLeg(c.input);
    const ok = verdict.verdict === c.expected;
    if (ok) correct += 1;
    checks.push({
      name: `Classification — ${c.name}`,
      expected: c.expected,
      actual: `${verdict.verdict} (${verdict.source})`,
      pass: ok,
      detail: `${c.why} Engine: ${verdict.reason}`,
    });
  }

  const pct = total ? Math.round((correct / total) * 100) : 0;
  return {
    metric: {
      label: "Waiting vs stuck classification accuracy",
      value: `${pct}%`,
      sub: `${correct} of ${total} labelled legs (seeded scenario legs + synthetic cases) classified as labelled.`,
    },
    checks,
  };
}

function runFraud(): { metric: Metric; checks: CheckResult[] } {
  const checks: CheckResult[] = [];
  let escalated = 0;
  for (const profile of heavyReturners) {
    const id = str(profile, "id");
    const expectedMax = Number(profile.expectedMaxFrictionLevel ?? 0);
    const result = assessFriction(profile);
    const level = typeof result.level === "number" ? result.level : Number(result.level) || 0;
    const beyond = level > expectedMax;
    if (beyond) escalated += 1;
    checks.push({
      name: `Friction — ${id} (${str(profile, "label")})`,
      expected: `level ≤ ${expectedMax}`,
      actual: `level ${level}`,
      pass: !beyond,
      detail: beyond
        ? "Escalated beyond this legitimate profile's expected maximum — a false positive."
        : "Within the expected maximum for this profile.",
    });
  }
  const rate = heavyReturners.length ? Math.round((escalated / heavyReturners.length) * 100) : 0;
  return {
    metric: {
      label: "Fraud friction false-positive rate",
      value: `${rate}%`,
      sub: `${escalated} of ${heavyReturners.length} seeded profiles escalated beyond their expected maximum friction level.`,
    },
    checks,
  };
}

function runEngineChecks(): CheckResult[] {
  const checks: CheckResult[] = [];

  // Idempotency: 3 issues, 1 issuance.
  try {
    const issuer = new RefundIssuer({ "PAY-EVAL": 1_000_000 });
    const legs = [{ instrument: "card", amountPaise: 5000 }];
    const r1 = issuer.issue("intent-eval-1", "PAY-EVAL", legs);
    const r2 = issuer.issue("intent-eval-1", "PAY-EVAL", legs);
    const r3 = issuer.issue("intent-eval-1", "PAY-EVAL", legs);
    const same = r1.issuanceId === r2.issuanceId && r2.issuanceId === r3.issuanceId;
    const pass = same && issuer.attemptsFor("intent-eval-1") === 3 && issuer.totalIssuedPaise === 5000;
    checks.push({
      name: "Idempotency — 3 issues collapse to 1 issuance",
      expected: "one issuanceId, attempts = 3, total issued 5000 paise",
      actual: `issuanceId ${r1.issuanceId} (same: ${same}), attempts = ${issuer.attemptsFor("intent-eval-1")}, total issued ${issuer.totalIssuedPaise} paise`,
      pass,
      detail: "Retries re-present the same intent id and receive the original receipt; the ledger guard prevents a second issuance.",
    });
  } catch (e) {
    checks.push({ name: "Idempotency — 3 issues collapse to 1 issuance", expected: "one issuance", actual: e instanceof Error ? e.message : String(e), pass: false, detail: "RefundIssuer threw." });
  }

  // Webhook dedupe.
  try {
    const inbox = new WebhookInbox();
    let handled = 0;
    const first = inbox.receive("evt-eval-1", () => { handled += 1; });
    const second = inbox.receive("evt-eval-1", () => { handled += 1; });
    checks.push({
      name: "Webhook dedupe — same provider event delivered twice",
      expected: "first: processed, second: duplicate, handler ran once",
      actual: `first: ${first}, second: ${second}, handler ran ${handled} time(s)`,
      pass: first === "processed" && second === "duplicate" && handled === 1,
      detail: "At-least-once delivery is normal; dedupe by provider event id means exactly one effect.",
    });
  } catch (e) {
    checks.push({ name: "Webhook dedupe", expected: "duplicate blocked", actual: e instanceof Error ? e.message : String(e), pass: false, detail: "WebhookInbox threw." });
  }

  // Illegal transition rejected.
  try {
    const illegal = applyTransition("RefundLeg", "credited", "initiate");
    checks.push({
      name: "Illegal transition — credited → initiated on RefundLeg",
      expected: "rejected with IllegalTransitionError",
      actual: `returned "${illegal}"`,
      pass: false,
      detail: "A credited leg stepping back to initiated would rewrite history; the machine must refuse.",
    });
  } catch (e) {
    checks.push({
      name: "Illegal transition — credited → initiated on RefundLeg",
      expected: "rejected with IllegalTransitionError",
      actual: e instanceof Error ? e.message : String(e),
      pass: e instanceof Error && e.name === "IllegalTransitionError",
      detail: "Rejection is loud and audit-loggable, never silent.",
    });
  }

  // Audit chain verifies + tamper detected.
  try {
    const log = new AuditLog();
    log.append("eval", "check_one", { n: 1 });
    log.append("eval", "check_two", { n: 2 });
    log.append("ops-reviewer", "duplicate_blocked", { n: 3 });
    const valid = log.verifyChain();
    const entries = log.entries.map((e) => ({ ...e }));
    if (entries[1]) entries[1] = { ...entries[1], payload: { n: 999 } };
    const tamperedValid = AuditLog.verify(entries as never);
    checks.push({
      name: "Audit chain — verifies, and tampering is detected",
      expected: "verifyChain() = true; tampered copy verifies false",
      actual: `verifyChain() = ${valid}; tampered copy = ${tamperedValid}`,
      pass: valid && !tamperedValid,
      detail: "Each entry's SHA-256 covers the previous hash plus its content; editing history breaks every later link.",
    });
  } catch (e) {
    checks.push({ name: "Audit chain verification", expected: "chain verifies", actual: e instanceof Error ? e.message : String(e), pass: false, detail: "AuditLog threw." });
  }

  // Wording coverage.
  try {
    const machines = getMachines();
    const names = Object.keys(machines);
    const missing: string[] = [];
    let stateCount = 0;
    for (const name of names) {
      for (const state of machines[name].states) {
        stateCount += 1;
        if (!WORDING[name]?.[state]) missing.push(`${name}.${state}`);
      }
    }
    checks.push({
      name: "Wording coverage — every machine state has library copy",
      expected: `${stateCount} states across ${names.length} machines, all covered`,
      actual: missing.length ? `missing: ${missing.join(", ")}` : `all ${stateCount} states covered`,
      pass: names.length > 0 && missing.length === 0,
      detail: "The same library feeds the customer pages, notifications and ops — no state can appear without plain-language what / next / by-when copy.",
    });
  } catch (e) {
    checks.push({ name: "Wording coverage", expected: "all states covered", actual: e instanceof Error ? e.message : String(e), pass: false, detail: "Coverage check threw." });
  }

  // No auto-cancel from AI evidence.
  try {
    const worst = evidenceSet.find((e) => str(e, "kind").startsWith("ai_generated")) ?? evidenceSet[3];
    const table = {
      labelling: "Precomputed detector scores for the seeded evidence set — simulated set, NOT live inference",
      scores: detectorScores.map((s) => ({
        evidenceId: str(s, "evidenceId"),
        aiLikelihood: Number(s.aiLikelihood ?? 0),
        confidenceNote: str(s, "confidenceNote"),
      })),
    };
    const corpus = evidenceSet.map((e) => ({
      id: str(e, "id"),
      phashHex: str(e, "phashHex") || undefined,
      sha256Hex: str(e, "sha256Hex") || undefined,
    }));
    const result = screenEvidence({
      evidenceId: str(worst, "id"),
      exif: (worst.exif as never) ?? null,
      phashHex: str(worst, "phashHex") || undefined,
      sha256Hex: str(worst, "sha256Hex") || undefined,
      c2paPresent: typeof worst.c2paPresent === "boolean" ? worst.c2paPresent : undefined,
      corpus,
      deliveredAtISO: str(worst, "deliveredAt") || str(scenario.order as Rec, "deliveredAt"),
      photoClaimedOfDeliveredItem: true,
      precomputedTable: table as never,
    });
    const pass = result.outcome === "route_to_human_review" && result.automatedDecision === null;
    checks.push({
      name: "No auto-cancel — worst-case AI evidence still routes to a human",
      expected: "outcome route_to_human_review, automatedDecision null",
      actual: `outcome ${result.outcome}, automatedDecision ${String(result.automatedDecision)}, priority ${result.priorityScore.toFixed(2)}`,
      pass,
      detail: "Even a 0.94 detector score on seeded synthetic evidence only reorders the review queue. There is no code path from a score to a cancelled refund.",
    });
  } catch (e) {
    checks.push({ name: "No auto-cancel", expected: "route_to_human_review", actual: e instanceof Error ? e.message : String(e), pass: false, detail: "screenEvidence threw." });
  }

  return checks;
}

export default function EvalPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [ranAt, setRanAt] = useState<string>("");

  const runAll = () => {
    const allocation = runAllocation();
    const classification = runClassification();
    const fraud = runFraud();
    setMetrics([allocation.metric, classification.metric, fraud.metric]);
    setChecks([...allocation.checks, ...classification.checks, ...fraud.checks, ...runEngineChecks()]);
    setRanAt(new Date().toLocaleTimeString("en-IN"));
  };

  useEffect(() => {
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passed = checks.filter((c) => c.pass).length;

  return (
    <div className="px-4 py-6 md:px-6">
      <p className="eyebrow">Evaluation harness</p>
      <h1 className="mt-1.5 text-[22px] font-bold tracking-tight">Proof, run live against the real engine</h1>
      <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        Nothing here is a screenshot or a fixture: every check executes the same{" "}
        <span className="font-mono">@impactx/backend</span> engine and seeded dataset the product
        pages use, in your browser, when you press run.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={runAll} className="rounded bg-ink px-4 py-2.5 text-[13px] font-semibold text-paper hover:bg-accent">
          Run all checks
        </button>
        {ranAt && (
          <span className="text-[13px] text-ink-2">
            Last run {ranAt} · <span className="tnum font-semibold text-ink">{passed}/{checks.length}</span> checks passing
          </span>
        )}
      </div>

      {metrics.length > 0 && (
        <div className="mt-5 grid gap-px overflow-hidden rounded border border-rule bg-rule md:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.label} className="bg-surface px-4 py-4">
              <div className="eyebrow">{m.label}</div>
              <div className="tnum mt-1 text-[26px] font-bold leading-none">{m.value}</div>
              <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{m.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded border border-rule bg-surface">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="eyebrow px-3 py-2.5">Check</th>
              <th className="eyebrow px-3 py-2.5">Expected</th>
              <th className="eyebrow px-3 py-2.5">Actual</th>
              <th className="eyebrow px-3 py-2.5">Result</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c, i) => (
              <tr key={i} className="border-b border-rule align-top last:border-b-0">
                <td className="max-w-[300px] px-3 py-2.5">
                  <div className="font-medium">{c.name}</div>
                  <div className="mt-0.5 text-[12px] leading-snug text-ink-2">{c.detail}</div>
                </td>
                <td className="max-w-[260px] px-3 py-2.5 font-mono text-[12px]">{c.expected}</td>
                <td className="max-w-[300px] px-3 py-2.5 font-mono text-[12px]">{c.actual}</td>
                <td className="px-3 py-2.5">
                  <StateChip label={c.pass ? "Pass" : "Fail"} tone={c.pass ? "ok" : "stuck"} shape={c.pass ? "done" : "exception"} />
                </td>
              </tr>
            ))}
            {checks.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-ink-2">Press “Run all checks”.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
