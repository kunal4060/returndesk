/**
 * data.ts — dataset access + normalisation.
 *
 * The seeded dataset lives in ../dataset/*.json and is mirrored into
 * src/data/ by scripts/sync-data.mjs (predev/prebuild). This module is
 * the only place that knows the JSON shapes; it normalises flexibly
 * (field-name variants, rupees-vs-paise detection per field name) into
 * the view models the pages render. Money follows the backend
 * convention: integer paise, `*Paise` field names. Plain `amount`-style
 * fields holding non-integers are read as rupees.
 */
import scenarioRaw from "@/data/scenario.json";
import evidenceRaw from "@/data/evidence.json";
import testOrdersRaw from "@/data/test-orders.json";
import heavyReturnersRaw from "@/data/heavy-returners.json";
import detectorScoresRaw from "@/data/detector-scores.json";

export type Rec = Record<string, unknown>;

export const scenario = scenarioRaw as Rec;
export const evidenceSet = asArray(evidenceRaw);
export const testOrders = asArray(testOrdersRaw);
export const heavyReturners = asArray(heavyReturnersRaw);
export const detectorScores = asArray(detectorScoresRaw);

/* ---------------- generic helpers ---------------- */

export function asArray(v: unknown): Rec[] {
  if (Array.isArray(v)) return v.filter(isRec);
  if (isRec(v)) {
    for (const key of ["items", "orders", "returns", "profiles", "cases", "results", "records", "data", "entries", "photos", "scores"]) {
      if (Array.isArray(v[key])) return (v[key] as unknown[]).filter(isRec);
    }
  }
  return [];
}

export function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function pick(obj: Rec | undefined, ...keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

export function str(obj: Rec | undefined, ...keys: string[]): string {
  const v = pick(obj, ...keys);
  return v === undefined ? "" : String(v);
}

export function numOr(obj: Rec | undefined, fallback: number, ...keys: string[]): number {
  const v = pick(obj, ...keys);
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Money: *Paise keys are paise; other numeric keys: integer = paise, decimal = rupees. */
export function moneyPaise(obj: Rec | undefined, ...keys: string[]): number {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (k.toLowerCase().includes("paise")) return Math.round(v);
    return Number.isInteger(v) ? v : Math.round(v * 100);
  }
  return 0;
}

/* ---------------- view models ---------------- */

export type Instrument = "card" | "wallet" | "voucher";

export interface NPayment {
  instrument: Instrument;
  amountPaise: number;
}

export interface NItem {
  id: string;
  orderId: string;
  name: string;
  sellerId: string;
  pricePaise: number;
  state: string;
  returnId: string;
  category: string;
  raw: Rec;
}

export interface NOrder {
  id: string;
  items: NItem[];
  payments: NPayment[];
  couponPaise: number;
  totalPaise: number;
  placedAt: string;
  customerName: string;
  raw: Rec;
}

export interface NEvent {
  at: string;
  actor: string;
  label: string;
  state: string;
  source: string;
  detail: string;
  raw: Rec;
}

export interface NSourceRecord {
  source: "seller" | "platform" | "provider" | string;
  state: string;
  amountPaise: number | null;
  recordedAt: string;
  raw: Rec;
}

export interface NLeg {
  id: string;
  returnId: string;
  itemId: string;
  instrument: Instrument;
  amountPaise: number;
  state: string;
  destination: string;
  etaText: string;
  ageHours: number;
  initiatedAt: string;
  records: NSourceRecord[];
  /** The dataset's own planted classification, when present (eval ground truth). */
  seededClassification: string;
  seededReason: string;
  raw: Rec;
}

export interface NPuckupAttempt {
  id: string;
  state: string;
  scheduledAt: string;
  reasonCode: string;
  bundle: Rec;
  raw: Rec;
}

export interface NReturn {
  id: string;
  orderId: string;
  itemId: string;
  itemName: string;
  sellerId: string;
  state: string;
  refundablePaise: number;
  refundIntentId: string;
  events: NEvent[];
  legs: NLeg[];
  disputeId: string;
  pickupAttempts: NPuckupAttempt[];
  trackingToken: string;
  raw: Rec;
}

/* ---------------- orders ---------------- */

function scenarioOrders(): Rec[] {
  const list = asArray(scenario.orders ?? scenario.orderList);
  if (list.length) return list;
  if (isRec(scenario.order)) return [scenario.order];
  if (Array.isArray(scenario.items) && (scenario.id || scenario.orderId)) return [scenario];
  return [];
}

function normaliseItem(raw: Rec, orderId: string): NItem {
  return {
    id: str(raw, "id", "itemId"),
    orderId,
    name: str(raw, "name", "title", "itemName") || "Item",
    sellerId: str(raw, "sellerId", "seller", "sellerName"),
    pricePaise: moneyPaise(raw, "listPricePaise", "pricePaise", "price", "amount"),
    state: str(raw, "state", "status", "journeyState"),
    returnId: str(raw, "returnId"),
    category: str(raw, "category"),
    raw,
  };
}

export function getOrders(): NOrder[] {
  return scenarioOrders().map((raw) => {
    const id = str(raw, "id", "orderId");
    // The hero scenario keeps items beside the order, not inside it.
    const itemRaws = asArray(raw.items).length ? asArray(raw.items) : asArray(scenario.items);
    const items = itemRaws.map((i) => normaliseItem(i, id));
    const payments = asArray(raw.payments).map((p) => ({
      instrument: (str(p, "instrument") || "card") as Instrument,
      amountPaise: moneyPaise(p, "amountPaise", "amount"),
    }));
    const itemsTotal = items.reduce((a, i) => a + i.pricePaise, 0);
    const payTotal = payments.reduce((a, p) => a + p.amountPaise, 0);
    return {
      id,
      items,
      payments,
      couponPaise: moneyPaise(raw, "couponPaise", "coupon"),
      totalPaise: numOr(raw, 0, "totalPaise") || payTotal || itemsTotal,
      placedAt: str(raw, "placedAt", "createdAt", "date"),
      customerName: str(raw, "customerName", "customer"),
      raw,
    };
  });
}

export function getOrder(orderId: string): NOrder | undefined {
  return getOrders().find((o) => o.id === orderId);
}

/* ---------------- returns & legs ---------------- */

function normaliseSourceRecord(raw: Rec): NSourceRecord {
  const amount = pick(raw, "amountPaise", "amount");
  return {
    source: str(raw, "source") || "platform",
    state: str(raw, "state", "status") || "missing",
    amountPaise: typeof amount === "number" ? moneyPaise(raw, "amountPaise", "amount") : null,
    recordedAt: str(raw, "recordedAt", "at", "timestamp"),
    raw,
  };
}

function legRecords(raw: Rec): NSourceRecord[] {
  const fromArray = asArray(raw.sourceRecords ?? raw.records);
  if (fromArray.length) return fromArray.map(normaliseSourceRecord);
  // Dataset shape: sources: { platform: {state, updatedAt, reference}, ... }
  if (isRec(raw.sources)) {
    return ["seller", "platform", "provider"]
      .filter((s) => isRec((raw.sources as Rec)[s]))
      .map((s) => {
        const v = (raw.sources as Rec)[s] as Rec;
        return {
          source: s,
          state: str(v, "state", "status") || "missing",
          amountPaise: null,
          recordedAt: str(v, "updatedAt", "recordedAt", "at"),
          raw: v,
        };
      });
  }
  const bySource = pick(raw, "sourceStates", "bySource");
  if (isRec(bySource)) {
    return ["seller", "platform", "provider"]
      .filter((s) => bySource[s] !== undefined)
      .map((s) => {
        const v = bySource[s];
        if (isRec(v)) return normaliseSourceRecord({ source: s, ...v });
        return { source: s, state: String(v), amountPaise: null, recordedAt: "", raw: {} };
      });
  }
  // Flat per-source state fields, e.g. sellerState / providerState.
  const out: NSourceRecord[] = [];
  for (const s of ["seller", "platform", "provider"]) {
    const st = pick(raw, `${s}State`, `${s}Status`);
    if (st !== undefined) {
      out.push({
        source: s,
        state: String(st),
        amountPaise: null,
        recordedAt: str(raw, `${s}RecordedAt`, `${s}At`),
        raw: {},
      });
    }
  }
  return out;
}

export function normaliseLeg(raw: Rec, returnId = "", itemId = ""): NLeg {
  return {
    id: str(raw, "id", "legId", "idempotencyKey", "intentId") || `${returnId}-${str(raw, "instrument")}`,
    returnId: str(raw, "returnId") || returnId,
    itemId: str(raw, "itemId") || itemId,
    instrument: (str(raw, "instrument") || "card") as Instrument,
    amountPaise: moneyPaise(raw, "amountPaise", "amount"),
    state: str(raw, "platformState", "state", "status") || "requested",
    seededClassification: str(raw, "classification"),
    seededReason: str(raw, "classificationReason", "reason"),
    destination: str(raw, "destination"),
    etaText: str(raw, "etaText", "eta"),
    ageHours: numOr(raw, 0, "ageHours", "elapsedHours"),
    initiatedAt: str(raw, "initiatedAt", "createdAt", "at"),
    records: legRecords(raw),
    raw,
  };
}

function normaliseEvent(raw: Rec): NEvent {
  return {
    at: str(raw, "at", "timestamp", "recordedAt", "time"),
    actor: str(raw, "actor", "by", "source"),
    label: str(raw, "label", "event", "action", "type") || "event",
    state: str(raw, "state", "to", "status"),
    source: str(raw, "source"),
    detail: str(raw, "detail", "note", "reason", "description"),
    raw,
  };
}

export function getReturns(): NReturn[] {
  const rawReturns = asArray(scenario.returns ?? scenario.returnList);
  const flatLegs = asArray(scenario.legs ?? scenario.refundLegs).map((l) => normaliseLeg(l));
  const heroOrderId = isRec(scenario.order) ? str(scenario.order, "id") : str(scenario, "id");
  // The scenario-level timeline is the returns' shared event source when
  // a return carries no events of its own.
  const scenarioTimeline = asArray(scenario.timeline);
  return rawReturns.map((raw) => {
    const id = str(raw, "id", "returnId");
    const itemId = str(raw, "itemId");
    const ownLegs = asArray(raw.legs ?? raw.refundLegs).map((l) => normaliseLeg(l, id, itemId));
    const legs = ownLegs.length ? ownLegs : flatLegs.filter((l) => l.returnId === id);
    const ownEvents = asArray(raw.events ?? raw.timeline);
    const events = ownEvents.length
      ? ownEvents.map(normaliseEvent)
      : scenarioTimeline
          .filter((e) => JSON.stringify(e).includes(id))
          .map((e) =>
            normaliseEvent({
              at: pick(e, "t", "at"),
              actor: pick(e, "actor"),
              label: pick(e, "event", "label"),
              detail: pick(e, "detail"),
            }),
          );
    const dispute = pick(raw, "inspectionDispute", "dispute");
    return {
      id,
      orderId: str(raw, "orderId") || heroOrderId,
      itemId,
      itemName: str(raw, "itemName", "name"),
      sellerId: str(raw, "sellerId", "seller"),
      state: str(raw, "state", "status", "journeyState") || "requested",
      refundablePaise:
        moneyPaise(raw, "refundablePaise", "refundable", "amountPaise", "amount") ||
        legs.reduce((a, l) => a + l.amountPaise, 0),
      refundIntentId: str(raw, "refundIntentId", "intentId"),
      events,
      legs,
      disputeId:
        str(raw, "disputeId") ||
        (isRec(dispute) ? str(dispute, "id", "disputeId") : "") ||
        (str(raw, "state", "status", "journeyState").includes("pickup") ? `DSP-${id}-PICKUP` : ""),
      pickupAttempts: asArray(raw.pickupAttempts ?? raw.attempts).map((a) => ({
        id: str(a, "id", "attemptId") || `attempt-${String(pick(a, "attempt") ?? "")}`,
        state: str(a, "state", "status", "outcome"),
        scheduledAt: str(a, "scheduledAt", "at", "slot"),
        reasonCode: str(a, "courierReasonCode", "reasonCode", "reason"),
        bundle: (pick(a, "bundle", "evidence", "evidenceBundle") as Rec) ?? a,
        raw: a,
      })),
      trackingToken: str(raw, "trackingToken", "token"),
      raw,
    };
  });
}

export function getReturn(returnId: string): NReturn | undefined {
  return getReturns().find((r) => r.id === returnId);
}

export function getAllLegs(): NLeg[] {
  const fromReturns = getReturns().flatMap((r) => r.legs);
  if (fromReturns.length) return fromReturns;
  return asArray(scenario.legs ?? scenario.refundLegs).map((l) => normaliseLeg(l));
}

export function getReturnForItem(orderId: string, itemId: string): NReturn | undefined {
  return getReturns().find(
    (r) => (r.orderId === orderId || !r.orderId) && r.itemId === itemId,
  );
}

export function getReturnByToken(token: string): NReturn | undefined {
  const tokens = asArray(scenario.trackingTokens ?? scenario.tokens);
  const hit = tokens.find((t) => str(t, "token") === token);
  if (hit) {
    const rid = str(hit, "returnId");
    const byId = rid ? getReturn(rid) : undefined;
    if (byId) return byId;
  }
  return getReturns().find((r) => r.trackingToken && r.trackingToken === token);
}

export function getDispute(disputeId: string): Rec | undefined {
  const disputes = asArray(scenario.disputes ?? scenario.disputeCases);
  const top = disputes.find((d) => str(d, "id", "disputeId") === disputeId);
  if (top) return top;
  // Disputes are usually embedded in their return (inspectionDispute).
  for (const raw of asArray(scenario.returns ?? scenario.returnList)) {
    const d = pick(raw, "inspectionDispute", "dispute");
    if (isRec(d) && str(d, "id", "disputeId") === disputeId) {
      return { ...d, returnId: str(raw, "id", "returnId"), itemId: str(raw, "itemId") };
    }
  }
  return undefined;
}

/** The return that owns a dispute id, if any. */
export function getReturnForDispute(disputeId: string): NReturn | undefined {
  return getReturns().find((r) => r.disputeId === disputeId);
}

export function getDisputesForReturn(returnId: string): Rec[] {
  return asArray(scenario.disputes ?? scenario.disputeCases).filter(
    (d) => str(d, "returnId") === returnId,
  );
}

/** Scenario "now" for age displays: scenario.now, else latest event time. */
export function scenarioNow(): string {
  return str(scenario, "now", "currentTime", "asOf");
}

export function heroSummary(): { title: string; description: string } {
  return {
    title:
      str(scenario, "title", "name", "scenarioName") ||
      "The brief's hero scenario",
    description:
      str(scenario, "description", "summary") ||
      "One order, four items, three sellers — paid by card, wallet and voucher. Two items come back: one pickup fails twice, one inspection is disputed, and the refund splits across all three instruments while the seller, platform and provider records disagree.",
  };
}
