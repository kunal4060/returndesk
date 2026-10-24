/**
 * engine.ts — the frontend's single doorway to @impactx/backend.
 *
 * Pages and components never import the backend package directly; they
 * go through these wrappers. Money formatting falls back to a local
 * Indian-grouping formatter only if the engine's formatINR is missing,
 * and classification falls back to a clearly-labelled local latency
 * check only if classifyLeg cannot be called — the UI always shows
 * which source produced a verdict.
 */
import * as backend from "@impactx/backend";

type AnyFn = (...args: never[]) => unknown;

function fn(name: string): AnyFn | undefined {
  const v = (backend as unknown as Record<string, unknown>)[name];
  return typeof v === "function" ? (v as AnyFn) : undefined;
}

function val(name: string): unknown {
  return (backend as unknown as Record<string, unknown>)[name];
}

/* ---------------- money ---------------- */

function localFormatINR(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  const digits = String(rupees);
  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const last3 = digits.slice(-3);
    let rest = digits.slice(0, -3);
    const pairs: string[] = [];
    while (rest.length > 2) {
      pairs.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest.length > 0) pairs.unshift(rest);
    grouped = [...pairs, last3].join(",");
  }
  return `${sign}₹${grouped}.${String(rem).padStart(2, "0")}`;
}

/** Format integer paise as ₹ with Indian digit grouping (engine-first). */
export function formatINR(paise: number): string {
  const f = fn("formatINR");
  if (f) {
    try {
      return String(f(paise as never));
    } catch {
      /* fall through to local formatter */
    }
  }
  return localFormatINR(paise);
}

export function rupeesToPaise(rupees: number): number {
  const f = fn("rupeesToPaise");
  if (f) {
    try {
      return Number(f(rupees as never));
    } catch {
      /* fall through */
    }
  }
  return Math.round(rupees * 100);
}

/* ---------------- allocation & waterfall ---------------- */

export const buildAllocationMatrix = fn("buildAllocationMatrix") as
  | ((order: unknown) => unknown)
  | undefined;

export const computeRefund = fn("computeRefund") as
  | ((matrix: unknown, order: unknown, itemIds: readonly string[], mode?: string) => unknown)
  | undefined;

/* ---------------- machines ---------------- */

export interface MachineDef {
  name: string;
  states: readonly string[];
  transitions: Readonly<Record<string, Readonly<Record<string, string>>>>;
  terminalStates?: readonly string[];
}

export function getMachines(): Record<string, MachineDef> {
  const m = val("MACHINES");
  if (m && typeof m === "object") return m as Record<string, MachineDef>;
  return {};
}

export function applyTransition(
  machine: string,
  from: string,
  event: string,
): { ok: true; next: string } | { ok: false; error: string } {
  const f = fn("applyTransition");
  if (!f) return { ok: false, error: "applyTransition is not exported by @impactx/backend yet" };
  try {
    const next = f(machine as never, from as never, event as never);
    return { ok: true, next: String(next) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------------- reconciliation ---------------- */

export interface LegVerdict {
  verdict: "in_agreement" | "waiting" | "stuck" | string;
  reason: string;
  breakClass?: string;
  ageHours?: number;
  budgetHours?: number;
  source: "engine" | "local-fallback";
}

export const LATENCY_BUDGET_HOURS: Record<string, number> =
  (val("LATENCY_BUDGET_HOURS") as Record<string, number> | undefined) ?? {
    wallet: 2,
    voucher: 1,
    card: 168,
  };

export interface ClassifyInput {
  instrument: string;
  amountPaise: number;
  ageHours: number;
  platformState: string;
  providerState: string | null;
  sellerState: string | null;
  providerAmountPaise: number | null;
  legPresentAtProvider: boolean;
}

/**
 * Classify one refund leg across its three source records, using the
 * engine's classifyLeg with its exact ClassifyLegInput contract
 * ({ verdict, breakClass, reason } out). The budget maths is attached
 * from LATENCY_BUDGET_HOURS so the UI can show age vs budget.
 */
export function classifyLeg(input: ClassifyInput): LegVerdict {
  const budget = LATENCY_BUDGET_HOURS[input.instrument] ?? 48;
  const f = fn("classifyLeg");
  if (f) {
    try {
      // Translate to the engine's exact ClassifyLegInput contract —
      // the engine reads platformAmountPaise; this wrapper's local
      // shape calls it amountPaise. Passing the local shape through
      // verbatim leaves platformAmountPaise undefined in the engine
      // (amount delta becomes NaN and its agreement rule never fires).
      const engineInput = {
        instrument: input.instrument,
        ageHours: input.ageHours,
        platformState: input.platformState,
        providerState: input.providerState,
        sellerState: input.sellerState,
        platformAmountPaise: input.amountPaise,
        providerAmountPaise: input.providerAmountPaise,
        legPresentAtProvider: input.legPresentAtProvider,
      };
      const out = f(engineInput as never);
      const v = normaliseVerdict(out);
      if (v) {
        return {
          ...v,
          ageHours: input.ageHours,
          budgetHours: budget,
          source: "engine",
        };
      }
    } catch {
      /* fall through to local check */
    }
  }
  return {
    ...localClassify({
      leg: { instrument: input.instrument },
      records: [
        { state: input.platformState },
        ...(input.providerState !== null ? [{ state: input.providerState }] : []),
        ...(input.sellerState !== null ? [{ state: input.sellerState }] : []),
      ],
      ageHours: input.ageHours,
    }),
    budgetHours: budget,
    source: "local-fallback",
  };
}

/** Build the classifyLeg input from a normalised leg's source records. */
export function classifyInputForLeg(leg: {
  instrument: string;
  amountPaise: number;
  ageHours: number;
  state: string;
  records: { source: string; state: string; amountPaise: number | null }[];
}): ClassifyInput {
  const bySource = (s: string) => leg.records.find((r) => r.source === s);
  const provider = bySource("provider");
  const seller = bySource("seller");
  const platform = bySource("platform");
  return {
    instrument: leg.instrument,
    amountPaise: leg.amountPaise,
    ageHours: leg.ageHours,
    platformState: platform?.state ?? leg.state,
    providerState: provider ? provider.state : null,
    sellerState: seller ? seller.state : null,
    providerAmountPaise: provider ? provider.amountPaise ?? leg.amountPaise : null,
    legPresentAtProvider: Boolean(provider),
  };
}

function normaliseVerdict(out: unknown): Omit<LegVerdict, "source"> | null {
  if (typeof out === "string") return { verdict: out, reason: "" };
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;
    const verdict = String(
      o.verdict ?? o.classification ?? o.status ?? o.result ?? "",
    );
    if (!verdict) return null;
    return {
      verdict: verdict.replace(/-/g, "_"),
      reason: String(o.reason ?? o.explanation ?? o.detail ?? ""),
      breakClass: o.breakClass ? String(o.breakClass) : o.class ? String(o.class) : undefined,
      ageHours: typeof o.ageHours === "number" ? o.ageHours : undefined,
      budgetHours: typeof o.budgetHours === "number" ? o.budgetHours : undefined,
    };
  }
  return null;
}

function localClassify(input: {
  leg: unknown;
  records?: unknown;
  ageHours?: number;
}): Omit<LegVerdict, "source"> {
  const leg = (input.leg ?? {}) as Record<string, unknown>;
  const instrument = String(leg.instrument ?? "");
  const budget = LATENCY_BUDGET_HOURS[instrument] ?? 48;
  const age = input.ageHours ?? (typeof leg.ageHours === "number" ? leg.ageHours : 0);
  const records = Array.isArray(input.records) ? input.records : [];
  const states = new Set(
    records.map((r) => String((r as Record<string, unknown>).state ?? "")),
  );
  if (records.length >= 3 && states.size === 1) {
    return { verdict: "in_agreement", reason: "All three sources report the same state.", ageHours: age, budgetHours: budget };
  }
  if (states.has("reversed")) {
    return { verdict: "stuck", reason: "A source reports a reversal while others have not caught up — terminal-state contradiction.", breakClass: "lifecycle", ageHours: age, budgetHours: budget };
  }
  if (age > budget) {
    return { verdict: "stuck", reason: `Age ${age}h is past the ${budget}h latency budget for ${instrument || "this instrument"}.`, breakClass: "timing", ageHours: age, budgetHours: budget };
  }
  return { verdict: "waiting", reason: `Inside the ${budget}h latency budget for ${instrument || "this instrument"} — no action yet.`, ageHours: age, budgetHours: budget };
}

/* ---------------- eligibility / disputes / fraud ---------------- */

export interface EligibilityView {
  eligible: boolean;
  reasons: string[];
  previewLines: string[];
}

/** evaluateEligibility takes one EligibilityInput object in the engine. */
export function evaluateEligibility(input: {
  category: string;
  daysSinceDelivery: number;
  returnWindowDays: number;
  conditionDeclared: string;
  isFreeGift: boolean;
  qualifiesBundle: boolean;
  sellerException?: string;
}): EligibilityView | undefined {
  const f = fn("evaluateEligibility");
  if (!f) return undefined;
  try {
    const out = f(input as never) as Record<string, unknown>;
    return {
      eligible: Boolean(out.eligible),
      reasons: arr(out.reasons),
      previewLines: arr(out.previewLines),
    };
  } catch {
    return undefined;
  }
}

export function partialRefund(input: {
  refundablePaise: number;
  tier?: string;
  condition?: string;
  item?: unknown;
}): { payablePaise: number; deductionPaise: number; deductionPct: number; tierLabel?: string; explanation?: string; source: "engine" | "local-tiers" } {
  const f = fn("partialRefund");
  if (f) {
    // Engine contract: partialRefund(effectivePaise, verdict, hasPhotoProof)
    // — a deduction tier without photo proof throws, by design.
    const verdict = input.tier ?? input.condition ?? "used";
    try {
      const out = f(input.refundablePaise as never, verdict as never, true as never);
      const n = normalisePartial(out, input.refundablePaise);
      if (n) {
        const o = out as Record<string, unknown>;
        return {
          ...n,
          tierLabel: typeof o.tierLabel === "string" ? o.tierLabel : undefined,
          explanation: typeof o.explanation === "string" ? o.explanation : undefined,
          source: "engine",
        };
      }
    } catch {
      /* fall through to published tiers */
    }
  }
  // Published condition tiers (synthesis §2, dimension 5).
  const tiers: Record<string, number> = {
    opened: 20,
    late: 20,
    minor_damage: 25,
    "minor damage": 25,
    used: 50,
    seller_fault: 0,
    "seller's fault": 0,
  };
  const pct = tiers[(input.tier ?? input.condition ?? "used").toLowerCase()] ?? 50;
  const deductionPaise = Math.round((input.refundablePaise * pct) / 100);
  return {
    payablePaise: input.refundablePaise - deductionPaise,
    deductionPaise,
    deductionPct: pct,
    source: "local-tiers",
  };
}

function normalisePartial(
  out: unknown,
  refundablePaise: number,
): { payablePaise: number; deductionPaise: number; deductionPct: number } | null {
  if (typeof out === "number") {
    const deductionPaise = refundablePaise - out;
    return {
      payablePaise: out,
      deductionPaise,
      deductionPct: refundablePaise > 0 ? Math.round((deductionPaise / refundablePaise) * 100) : 0,
    };
  }
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;
    const payable = num(o.payablePaise ?? o.refundPaise ?? o.amountPaise ?? o.payable ?? o.amount);
    if (payable === null) return null;
    const deduction = num(o.deductionPaise ?? o.deduction) ?? refundablePaise - payable;
    return {
      payablePaise: payable,
      deductionPaise: deduction,
      deductionPct:
        num(o.deductionPct ?? o.pct) ??
        (refundablePaise > 0 ? Math.round((deduction / refundablePaise) * 100) : 0),
    };
  }
  return null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function scorePickupBundle(bundle: unknown): { scorePct: number; present: string[]; missing: string[]; claimStrength?: string; source: "engine" | "local" } {
  const f = fn("scorePickupBundle");
  if (f) {
    try {
      // Engine contract: PickupBundle { reasonCode, timestamp, gps,
      // callLog, doorstepPhoto }. Dataset bundles name the booleans
      // hasTimestamp / hasGps / hasCallLog / hasDoorstepPhoto.
      const b = (bundle ?? {}) as Record<string, unknown>;
      const mapped = {
        reasonCode: b.reasonCode ?? null,
        timestamp: b.timestamp ?? b.hasTimestamp ?? null,
        gps: b.gps ?? b.hasGps ?? null,
        callLog: b.callLog ?? b.hasCallLog ?? null,
        doorstepPhoto: b.doorstepPhoto ?? b.hasDoorstepPhoto ?? null,
      };
      const out = f(mapped as never);
      if (typeof out === "number") {
        return { scorePct: Math.round(out <= 1 ? out * 100 : out), present: [], missing: [], source: "engine" };
      }
      if (out && typeof out === "object") {
        const o = out as Record<string, unknown>;
        const raw = num(o.score ?? o.completeness ?? o.scorePct);
        if (raw !== null) {
          return {
            scorePct: Math.round(raw <= 1 ? raw * 100 : raw),
            present: arr(o.present ?? o.presentFields),
            missing: arr(o.missing ?? o.missingFields),
            claimStrength: typeof o.claimStrength === "string" ? o.claimStrength : undefined,
            source: "engine",
          };
        }
      }
    } catch {
      /* fall through */
    }
  }
  const fields = ["reasonCode", "timestamp", "gps", "callLog", "photo"];
  const b = (bundle ?? {}) as Record<string, unknown>;
  const present = fields.filter((k) => {
    const v = b[k] ?? b[k.toLowerCase()] ?? b[`${k}Present`];
    return v !== undefined && v !== null && v !== false && v !== "";
  });
  const missing = fields.filter((k) => !present.includes(k));
  return {
    scorePct: Math.round((present.length / fields.length) * 100),
    present,
    missing,
    source: "local",
  };
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

export interface FrictionResult {
  level: number | string;
  levelLabel: string;
  signals: { label: string; detail: string }[];
  fairnessNote: string;
  source: "engine" | "unavailable";
  raw: unknown;
}

export function assessFriction(profile: unknown): FrictionResult {
  const f = fn("assessFriction");
  if (f) {
    // Engine contract: assessFriction({ returnsLast90Days,
    // accountAgeDays, allSizingRelated, priorAppealsUpheld }).
    // Dataset profiles carry sizingShare instead of the boolean.
    const p = (profile ?? {}) as Record<string, unknown>;
    const engineInput = {
      returnsLast90Days: typeof p.returnsLast90Days === "number" ? p.returnsLast90Days : 0,
      accountAgeDays: typeof p.accountAgeDays === "number" ? p.accountAgeDays : 0,
      allSizingRelated:
        typeof p.allSizingRelated === "boolean"
          ? p.allSizingRelated
          : typeof p.sizingShare === "number"
            ? p.sizingShare >= 0.99
            : false,
      // Pass the graded share through: the engine caps friction at
      // L2 for sizing-DOMINANT patterns (share ≥ 0.7), not only for
      // the all-sizing boolean.
      sizingShare: typeof p.sizingShare === "number" ? p.sizingShare : undefined,
      priorAppealsUpheld: typeof p.priorAppealsUpheld === "number" ? p.priorAppealsUpheld : 0,
    };
    const attempts: unknown[][] = [[engineInput], [profile]];
    for (const args of attempts) {
      try {
        const out = f(...(args as never[]));
        if (out && typeof out === "object") {
          const o = out as Record<string, unknown>;
          const signalsRaw = (o.signals ?? o.reasons ?? []) as unknown[];
          return {
            level: (o.level ?? o.frictionLevel ?? o.tier ?? "—") as number | string,
            levelLabel: String(o.levelLabel ?? o.label ?? o.name ?? ""),
            signals: (Array.isArray(signalsRaw) ? signalsRaw : []).map((s) => {
              if (typeof s === "string") return { label: s, detail: "" };
              const so = s as Record<string, unknown>;
              return {
                label: String(so.label ?? so.name ?? so.signal ?? "signal"),
                detail: String(so.detail ?? so.explanation ?? so.reason ?? so.value ?? ""),
              };
            }),
            fairnessNote: String(o.fairnessNote ?? o.fairness ?? o.note ?? ""),
            source: "engine",
            raw: out,
          };
        }
      } catch {
        /* next shape */
      }
    }
  }
  return { level: "—", levelLabel: "", signals: [], fairnessNote: "", source: "unavailable", raw: undefined };
}

export const FRICTION_ACTIONS: string[] = (() => {
  const v = val("FRICTION_ACTIONS");
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
  if (v && typeof v === "object") {
    // Engine shape: Record<FrictionLevel, string[]> (cumulative actions
    // per level). The ladder shows each level's headline (last) action.
    return Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([level, actions]) => {
        const list = Array.isArray(actions) ? actions.map(String) : [];
        return `L${level} — ${list[list.length - 1] ?? ""}`;
      });
  }
  return [
    "L0 — no extra checks",
    "L1 — extra photos at pickup",
    "L2 — refund after inspection (not at pickup)",
    "L3 — manual review before refund",
  ];
})();

/* ---------------- classes: issuer, webhook inbox, audit log ---------------- */

export type BackendClass = new (...args: never[]) => Record<string, unknown>;

export function getClass(name: string): BackendClass | undefined {
  const v = val(name);
  return typeof v === "function" ? (v as BackendClass) : undefined;
}

/** Call the first available method from `names`, trying argument shapes. */
export function callFirst(
  obj: Record<string, unknown>,
  names: string[],
  argShapes: unknown[][],
): { ok: true; value: unknown; method: string } | { ok: false; error: string } {
  for (const name of names) {
    const m = obj[name];
    if (typeof m !== "function") continue;
    for (const args of argShapes) {
      try {
        const value = (m as AnyFn).call(obj, ...(args as never[]));
        return { ok: true, value, method: name };
      } catch {
        /* next shape */
      }
    }
    return { ok: false, error: `method ${name} rejected all argument shapes` };
  }
  return { ok: false, error: `none of [${names.join(", ")}] available` };
}

/** Read a list from an object property or zero-arg method, tolerantly. */
export function readList(obj: Record<string, unknown>, names: string[]): unknown[] {
  for (const name of names) {
    const v = obj[name];
    if (Array.isArray(v)) return v;
    if (typeof v === "function") {
      try {
        const out = (v as AnyFn).call(obj);
        if (Array.isArray(out)) return out;
      } catch {
        /* continue */
      }
    }
  }
  return [];
}
