# @impactx/backend — IMPACTX 2026, Challenge 15 return/refund engine

Standalone TypeScript package for the item-level e-commerce return/refund
system. All money is **integer paise** everywhere (₹1 = 100 paise); floats
never represent money. Strict TypeScript, tested with vitest.

## Run the tests

```bash
npm install
npx vitest run     # 43 tests, all passing
npm run typecheck  # tsc --noEmit (strict)
```

## Modules (`src/`)

| Module | What it does |
|---|---|
| `money.ts` | Paise helpers: `rupeesToPaise`, `paiseToRupees`, `sumPaise`, `splitByWeights` (largest-remainder split that sums **exactly** to the total, deterministic tie-breaks), `formatINR` (Indian digit grouping, e.g. `₹12,34,567.89`). |
| `types.ts` | Core types: `Instrument` (`card`/`wallet`/`voucher`), `Order`, `AllocationMatrix`/`AllocationRow`, `RefundLeg`, `RefundPlan`, `SourceRecord`, `AuditEntry`. |
| `allocation.ts` | `buildAllocationMatrix(order)` — coupon allocated to items pro-rata by list price (largest remainder); each item's effective price (list − coupon share) split across instruments by the same largest-remainder rule (residual paise to the largest fractional remainders), followed by a column-repair safety pass that is a no-op whenever per-row largest-remainder already reconciles the columns (true for every seeded order). Row sums **and** column sums (＝ payment totals) are asserted exact. This matrix is the persisted shape refunds read. |
| `waterfall.ts` | `computeRefund(matrix, order, itemIds, mode)` — `prorata` refunds the items' matrix rows; `priority` drains voucher → wallet → card capped at each instrument's payment total. Voucher legs are `voucher re-issue (never bank)` and carry an `expiryNote`. Explanation lines cover the per-item arithmetic, the coupon share vanishing, and the free-shipping check (`FREE_SHIP_THRESHOLD = 99900` paise, fee `7900`). The threshold effect is always an explicit preview line; what it does to the money is the configured shipping policy (`opts.shippingPolicy`): `goodwill` (default, and the seeded dataset's configuration per conflict C-05) deducts nothing, while `clawback` reverses the fee (`Free-shipping benefit reversed −₹79`, deducted card-first, refund floored at 0). |
| `machines.ts` | Six named state machines — `ItemJourney`, `PickupAttempt`, `InspectionCase`, `RefundLeg`, `DisputeCase`, `FraudReview` — each with states + allowed-transition maps. `applyTransition(machine, from, event)` returns the new state or throws `IllegalTransitionError`. `RefundLeg`: requested → approved → initiated → processed → credited, plus `failed`/`reversed`/`requires_action`; `credited → initiated` is illegal. |
| `idempotency.ts` | `RefundIssuer` — issue under a stable refund-intent id: replays return the same receipt, bump an attempts counter, and move no money (`totalIssuedPaise` tracks real movement once). A per-payment refundable-balance ledger guard throws `LedgerGuardError` on over-issue; intent reuse with different legs throws `IdempotencyConflictError`. Intent ids are never released on timeout — a retry simply re-presents the same intent id to `issue`. `WebhookInbox` dedupes provider events by event id (`processed` first time, `duplicate` after; a throwing handler is not marked processed). |
| `audit.ts` | `AuditLog` — append-only hash chain: `hash = SHA-256(prevHash + canonical JSON of {seq, ts, actor, action, payload, prevHash})` via `node:crypto`; injectable clock (default logical `t1, t2, …`); entries and payloads frozen. `verifyChain()` / static `AuditLog.verify(entries)` recompute the chain. |
| `reconciler.ts` | `classifyLeg(input)` → `in_agreement` / `waiting` / `stuck` + break class from the 9-class taxonomy. `LATENCY_BUDGET_HOURS = { wallet: 4, voucher: 1, card: 168 }` (card = 7 working days ≈ 168h). Deterministic numbered rules: agreement → terminal lifecycle contradiction (`stuck/lifecycle`) → missing at provider (past budget `stuck/missing_at_provider`, else `waiting/timing`) → amount (|Δ| ≤ 100 paise = `waiting/amount` rounding; larger = `stuck/amount`) → budget crossed (`stuck/timing`) → within-budget lag (`waiting`, reason cites the budget). |
| `eligibility.ts` | `evaluateEligibility(...)` → `{ eligible, reasons, previewLines }`: free gifts are ineligible with a gift-return/clawback preview line, expired windows are ineligible unless a seller exception overrides them, non-returnable categories are blocked, and bundle membership / declared condition add explicit preview lines. |
| `disputes.ts` | `partialRefund(effectivePaise, verdict, hasPhotoProof)` — published tiers: `as_described` 100%, `opened_late` 80%, `minor_damage` 75%, `used` 50%, `seller_fault` 100%; round-half-up so refund + deduction = effective price; **any deduction without photo proof throws**. `scorePickupBundle(bundle)` → completeness 0..1 over the 5 evidence elements, missing list, `strong` (≥ 0.8) / `weak` claim strength. |
| `fraud.ts` | `assessFriction(...)` → `{ level 0–3, signals, fairnessNote, appealAvailable: true }` plus `FRICTION_ACTIONS` per level (L1 extra photos, L2 inspection-before-refund, L3 manual review). Fairness rule: sizing-only patterns are capped at Level 2 (the 12-sizing-returns heavy returner never reaches manual review); Level 3 requires non-sizing anomalies; upheld appeals reduce friction by one level. |
| `index.ts` | Re-exports everything. Note: `RefundLeg` the type and the `RefundLeg` state machine share a name — from the index, `RefundLeg` is the type and the machine is `RefundLegMachine` (also `MACHINES.RefundLeg`). |

## Key test coverage (`tests/`)

- **Worked example, exact** (report 02 §6): A ₹1,250 / B ₹1,000, coupon ₹250,
  paid card ₹1,200 / wallet ₹500 / voucher ₹300 → matrix A = 111111
  (card 66667, wallet 27778, voucher 16666), B = 88889 (card 53333,
  wallet 22222, voucher 13334); pro-rata refund of B = 53333/22222/13334
  (total 88889); priority refund of B = voucher 30000, wallet 50000,
  card 8889. Plus free-shipping policy cases (kept ₹850: goodwill → no deduction; clawback → −₹79) and a dataset-contract test proving the engine reproduces the seeded hero matrix and all 10 test orders to the paisa.
- Idempotency: same intent issued 3× → money moves once, attempts = 3,
  duplicates = 2, identical `issuanceId`; ledger guard throws;
  webhook duplicate handling.
- Machines: `credited → initiated` throws; full legal RefundLeg and
  ItemJourney paths.
- Audit: 3 entries verify; tampered and reordered copies fail.
- Reconciler: 7 cases — agreement, waiting timing (card 48h), stuck
  timing (card 200h), stuck lifecycle (provider reversed vs seller
  pending), waiting amount rounding (Δ = 100 paise), stuck amount,
  missing-at-provider both sides of the budget.
- Disputes/fraud/eligibility: `used` tier on 88889 → refund 44445,
  deduction 44444; deduction without photo proof throws; heavy legit
  sizing returner stays at level ≤ 2 with appeal available.
