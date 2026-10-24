"use client";

/**
 * SimProvider — client context holding the simulated world.
 *
 * One shared AuditLog (from @impactx/backend) is created at app start
 * and seeded with the scenario's events; one shared RefundIssuer backs
 * the idempotent "Retry refund" demo. The logical clock is an hour
 * offset applied to the scenario's base time, so "Advance time" moves
 * every age display without rewriting the seeded data. Fault injection
 * (duplicate webhook / provider outage / stale data) flips flags the
 * ops views read, and every injection is itself audit-logged.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { callFirst, getClass, readList } from "@/lib/engine";
import { getOrders, getReturns, scenarioNow, type Rec } from "@/lib/data";
import { notificationForState, type NotificationItem } from "@/wording/library";

export interface AuditViewEntry {
  seq: number;
  ts: string;
  actor: string;
  action: string;
  payload: Rec;
  prevHash: string;
  hash: string;
}

export interface FaultState {
  providerOutage: boolean;
  staleData: boolean;
  duplicateWebhooks: number;
}

export interface RetryResult {
  ok: boolean;
  receiptId: string;
  duplicate: boolean;
  attempts: number;
  message: string;
}

export interface RetryRequest {
  intentId: string;
  paymentId: string;
  legs: { instrument: string; amountPaise: number }[];
}

interface SimContextValue {
  auditEntries: AuditViewEntry[];
  auditSource: "engine" | "local-fallback";
  appendAudit: (actor: string, action: string, payload?: Rec) => void;
  verifyChain: () => { ok: boolean; valid: boolean; message: string };
  retryRefund: (req: RetryRequest) => RetryResult;
  clockOffsetHours: number;
  advanceTime: (hours: number) => void;
  simNowLabel: string;
  faults: FaultState;
  injectFault: (kind: "duplicate_webhook" | "provider_outage" | "stale_data") => void;
  clearFaults: () => void;
  notifications: NotificationItem[];
}

const SimContext = createContext<SimContextValue | null>(null);

/* Tiny demo-grade hash for the local fallback chain only. */
function fnv(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    h1 = Math.imul(h1 ^ input.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (input.charCodeAt(i) + i), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(4).slice(0, 64);
}

interface LocalChain {
  entries: AuditViewEntry[];
}

function localAppend(chain: LocalChain, actor: string, action: string, payload: Rec): AuditViewEntry {
  const seq = chain.entries.length + 1;
  const prevHash = chain.entries.length ? chain.entries[chain.entries.length - 1].hash : "0".repeat(64);
  const ts = new Date().toISOString();
  const hash = fnv(prevHash + JSON.stringify({ seq, ts, actor, action, payload }));
  const entry: AuditViewEntry = { seq, ts, actor, action, payload, prevHash, hash };
  chain.entries = [...chain.entries, entry];
  return entry;
}

function normaliseEntry(raw: unknown, idx: number): AuditViewEntry {
  const r = (raw ?? {}) as Rec;
  return {
    seq: typeof r.seq === "number" ? r.seq : idx + 1,
    ts: String(r.ts ?? r.timestamp ?? r.at ?? ""),
    actor: String(r.actor ?? "system"),
    action: String(r.action ?? r.type ?? r.event ?? "event"),
    payload: (r.payload ?? {}) as Rec,
    prevHash: String(r.prevHash ?? ""),
    hash: String(r.hash ?? ""),
  };
}

export function SimProvider({ children }: { children: ReactNode }) {
  const auditRef = useRef<Record<string, unknown> | null>(null);
  const localChainRef = useRef<LocalChain>({ entries: [] });
  const issuerRef = useRef<Record<string, unknown> | null>(null);
  const issuerAttemptsRef = useRef<Map<string, number>>(new Map());
  const issuerReceiptsRef = useRef<Map<string, string>>(new Map());
  const seededRef = useRef(false);
  const [, setVersion] = useState(0);
  const [clockOffsetHours, setClockOffsetHours] = useState(0);
  const [faults, setFaults] = useState<FaultState>({
    providerOutage: false,
    staleData: false,
    duplicateWebhooks: 0,
  });

  const auditSource: "engine" | "local-fallback" = useMemo(() => {
    const AuditLog = getClass("AuditLog");
    return AuditLog ? "engine" : "local-fallback";
  }, []);

  const getAudit = useCallback((): Record<string, unknown> | null => {
    if (auditRef.current) return auditRef.current;
    const AuditLog = getClass("AuditLog");
    if (!AuditLog) return null;
    try {
      auditRef.current = new AuditLog() as Record<string, unknown>;
    } catch {
      try {
        auditRef.current = new AuditLog((() => new Date().toISOString()) as never) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return auditRef.current;
  }, []);

  const readEntries = useCallback((): AuditViewEntry[] => {
    const audit = getAudit();
    if (audit) {
      const list = readList(audit, ["entries", "list", "all", "getEntries", "events", "log", "chain"]);
      if (list.length) return list.map(normaliseEntry);
    }
    return localChainRef.current.entries;
  }, [getAudit]);

  const appendAudit = useCallback(
    (actor: string, action: string, payload: Rec = {}) => {
      const audit = getAudit();
      let written = false;
      if (audit) {
        const entry = { actor, action, payload, ts: new Date().toISOString() };
        // Engine contract first: append(actor, action, payload).
        const res = callFirst(audit, ["append", "add", "record", "push", "appendEntry"], [
          [actor, action, payload],
          [entry],
          [action, payload],
          [{ type: action, actor, payload }],
        ]);
        written = res.ok;
      }
      if (!written) {
        localAppend(localChainRef.current, actor, action, payload);
      }
      setVersion((v) => v + 1);
    },
    [getAudit],
  );

  // Seed the shared log with scenario events, once.
  if (!seededRef.current) {
    seededRef.current = true;
    const returns = getReturns();
    let seeded = 0;
    for (const ret of returns) {
      for (const ev of ret.events.slice(0, 12)) {
        const audit = (() => {
          const AuditLog = getClass("AuditLog");
          if (!AuditLog) return null;
          if (!auditRef.current) {
            try {
              auditRef.current = new AuditLog() as Record<string, unknown>;
            } catch {
              return null;
            }
          }
          return auditRef.current;
        })();
        const entry = {
          actor: ev.actor || "system",
          action: ev.label || "scenario_event",
          payload: { returnId: ret.id, state: ev.state, at: ev.at, seeded: true },
          ts: ev.at || new Date().toISOString(),
        };
        let ok = false;
        if (audit) {
          ok = callFirst(audit, ["append", "add", "record", "push", "appendEntry"], [
            [entry.actor, entry.action, entry.payload],
            [entry],
            [entry.action, entry.payload],
          ]).ok;
        }
        if (!ok) localAppend(localChainRef.current, entry.actor, entry.action, entry.payload);
        seeded += 1;
        if (seeded >= 40) break;
      }
      if (seeded >= 40) break;
    }
  }

  const verifyChain = useCallback((): { ok: boolean; valid: boolean; message: string } => {
    const audit = getAudit();
    if (audit) {
      const res = callFirst(audit, ["verifyChain", "verify", "isValid", "checkChain"], [[]]);
      if (res.ok) {
        const v = res.value;
        const valid = typeof v === "boolean" ? v : Boolean((v as Rec)?.valid ?? (v as Rec)?.ok ?? true);
        return { ok: true, valid, message: valid ? "Hash chain verified — every entry recomputes." : "Chain verification FAILED." };
      }
    }
    // Local fallback: recompute the FNV chain.
    const entries = localChainRef.current.entries;
    let prev = "0".repeat(64);
    for (const e of entries) {
      if (e.prevHash !== prev) return { ok: true, valid: false, message: `Broken link at seq ${e.seq}.` };
      const expect = fnv(e.prevHash + JSON.stringify({ seq: e.seq, ts: e.ts, actor: e.actor, action: e.action, payload: e.payload }));
      if (expect !== e.hash) return { ok: true, valid: false, message: `Hash mismatch at seq ${e.seq}.` };
      prev = e.hash;
    }
    return { ok: true, valid: true, message: `Local fallback chain verified (${entries.length} entries).` };
  }, [getAudit]);

  const getIssuer = useCallback((): Record<string, unknown> | null => {
    if (issuerRef.current) return issuerRef.current;
    const Issuer = getClass("RefundIssuer");
    if (!Issuer) return null;
    // Engine contract: new RefundIssuer({ paymentId: refundableBalancePaise }).
    // Balances are seeded generously (order totals + headroom) because the
    // seeded scenario's refunds were "issued" before this console session;
    // the demo exercises replay behaviour, not first issuance accounting.
    const balances: Record<string, number> = {};
    for (const order of getOrders()) {
      balances[order.id] = Math.max(order.totalPaise * 3, 1_000_000);
    }
    if (Object.keys(balances).length === 0) balances["HERO-1"] = 1_000_000;
    try {
      issuerRef.current = new Issuer(balances as never) as Record<string, unknown>;
      return issuerRef.current;
    } catch {
      return null;
    }
  }, []);

  const retryRefund = useCallback(
    (req: RetryRequest): RetryResult => {
      const { intentId, paymentId, legs } = req;
      const issuer = getIssuer();
      if (issuer && typeof issuer.issue === "function") {
        try {
          const before =
            typeof issuer.attemptsFor === "function"
              ? Number((issuer.attemptsFor as (id: string) => number)(intentId))
              : 0;
          const receipt = (issuer.issue as (i: string, p: string, l: unknown) => Rec)(
            intentId,
            paymentId,
            legs,
          );
          const attempts =
            typeof issuer.attemptsFor === "function"
              ? Number((issuer.attemptsFor as (id: string) => number)(intentId))
              : before + 1;
          const duplicate = before >= 1;
          const receiptId = String(receipt.issuanceId ?? receipt.intentId ?? intentId);
          appendAudit("ops-reviewer", duplicate ? "duplicate_blocked" : "refund_issued", {
            intentId,
            issuanceId: receiptId,
            attempts,
            note: duplicate
              ? "Retry re-presented the same refund-intent id; the engine returned the original receipt and moved no money."
              : "First issuance under this refund-intent id.",
          });
          return {
            ok: true,
            receiptId,
            duplicate,
            attempts,
            message: duplicate
              ? "Duplicate blocked by idempotency — the engine returned the original receipt; no second issuance exists and no money moved."
              : `Refund issued once under intent ${intentId} (issuance ${receiptId}). Press again to watch the duplicate get blocked.`,
          };
        } catch (e) {
          return {
            ok: false,
            receiptId: "",
            duplicate: false,
            attempts: 0,
            message: e instanceof Error ? e.message : String(e),
          };
        }
      }
      // Local fallback (engine class unavailable): same semantics, own map.
      const attempts = (issuerAttemptsRef.current.get(intentId) ?? 0) + 1;
      issuerAttemptsRef.current.set(intentId, attempts);
      const existing = issuerReceiptsRef.current.get(intentId);
      if (existing) {
        appendAudit("ops-reviewer", "duplicate_blocked", { intentId, issuanceId: existing, attempts });
        return {
          ok: true,
          receiptId: existing,
          duplicate: true,
          attempts,
          message: "Duplicate blocked by idempotency (local fallback) — original receipt returned.",
        };
      }
      const receiptId = `iss_${intentId}`;
      issuerReceiptsRef.current.set(intentId, receiptId);
      appendAudit("ops-reviewer", "refund_issued", { intentId, issuanceId: receiptId, attempts });
      return { ok: true, receiptId, duplicate: false, attempts, message: `Refund issued once under intent ${intentId}.` };
    },
    [appendAudit, getIssuer],
  );

  const advanceTime = useCallback((hours: number) => {
    setClockOffsetHours((h) => h + hours);
  }, []);

  const injectFault = useCallback(
    (kind: "duplicate_webhook" | "provider_outage" | "stale_data") => {
      if (kind === "duplicate_webhook") {
        setFaults((f) => ({ ...f, duplicateWebhooks: f.duplicateWebhooks + 1 }));
        appendAudit("fault-panel", "webhook_duplicate_injected", {
          note: "Same provider webhook delivered again; dedupe by provider event id must block any second effect.",
        });
      } else if (kind === "provider_outage") {
        setFaults((f) => ({ ...f, providerOutage: true }));
        appendAudit("fault-panel", "provider_outage_injected", {
          note: "Provider source marked stale in the Three Truths view until cleared.",
        });
      } else {
        setFaults((f) => ({ ...f, staleData: true }));
        appendAudit("fault-panel", "stale_data_injected", {
          note: "Source records are shown with a stale-data warning.",
        });
      }
    },
    [appendAudit],
  );

  const clearFaults = useCallback(() => {
    setFaults({ providerOutage: false, staleData: false, duplicateWebhooks: 0 });
    appendAudit("fault-panel", "faults_cleared", {});
  }, [appendAudit]);

  const notifications = useMemo<NotificationItem[]>(() => {
    const out: NotificationItem[] = [];
    for (const ret of getReturns()) {
      out.push(notificationForState("ItemJourney", ret.state, `Return ${ret.id}`));
      for (const leg of ret.legs) {
        out.push(notificationForState("RefundLeg", leg.state, `${leg.instrument} refund · ${ret.id}`));
      }
    }
    return out.slice(0, 20);
  }, []);

  const baseNow = scenarioNow();
  const simNowLabel = baseNow
    ? `${baseNow} + ${clockOffsetHours}h (simulated)`
    : `Scenario start + ${clockOffsetHours}h (simulated)`;

  const value: SimContextValue = {
    auditEntries: readEntries(),
    auditSource,
    appendAudit,
    verifyChain,
    retryRefund,
    clockOffsetHours,
    advanceTime,
    simNowLabel,
    faults,
    injectFault,
    clearFaults,
    notifications,
  };

  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSim(): SimContextValue {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error("useSim must be used inside SimProvider");
  return ctx;
}
