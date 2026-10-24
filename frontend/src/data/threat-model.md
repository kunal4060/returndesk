# Threat Model — IMPACTX 2026, Challenge 15 (one page)

Five risks, each with the mitigation actually implemented in this prototype. All
states are simulated; the mitigations below are real properties of the engine and
are exercised by the seeded dataset and the `/eval` harness.

**The standing rule across every risk: there is no automated denial.** No signal,
score, rule or state in this system can cancel or deny a customer's refund on its
own. Automation can add verification, route work to a human, and explain itself —
only a human can decide against a customer, and that decision is appealable and
audit-logged.

## 1. Duplicate refund via retry / webhook replay

*Risk.* Timeouts, double-taps, flaky clients and at-least-once webhook delivery can
each re-fire a refund. A retry that mints a fresh key turns one return into two
payouts (seeded as conflicts C-02 and C-03).

*Mitigations implemented.* One stable **refund-intent id** is minted once per
(item, refund event) at approval and used as the idempotency key for every
downstream provider call; it is never re-minted on retry and never released on
timeout (a timeout means "unknown", not "failed"). A **refundable-balance ledger
guard** (captured − refunded − in-flight ≥ requested) is checked in the same
transaction, so even a different key cannot over-refund. Execution is claimed by
compare-and-swap, and the webhook consumer **dedupes by provider event id**,
returning 200 on duplicates. Exactly-once issuance is a tested eval case.

## 2. AI-generated / manipulated evidence photos

*Risk.* Synthetic or laundered damage photos can be submitted to extract refunds
for damage that never happened (seeded: EV-04, EV-05, EV-08) — while real
detectors also falsely flag genuine photos at a double-digit rate, especially
low-light and recompressed ones (seeded fairness trap: EV-02, score 0.81).

*Mitigations implemented.* A layered **ensemble**, honestly labelled: (a)
deterministic checks computed live — perceptual-hash near-duplicate search across
orders (catches the EV-06/EV-07 reuse pair), EXIF timestamp vs delivery-date
consistency (catches EV-09), C2PA presence (EV-08's credential declares AI
generation), and exact-hash matching; (b) a **live pretrained detector signal**,
shown with its confidence and its measured limits (on this seeded set the scores
are precomputed and labelled as such); (c) a **Gemini semantic-consistency
signal** (does the damage, lighting and scene agree with the claim?). "No EXIF"
scores zero on its own — honest uploads lose EXIF too. **All three layers only
reorder the human review queue.** There is no code path from any score to a
cancelled refund, and the eval harness contains a case proving exactly that.

## 3. Courier evidence fabrication

*Risk.* A courier (or a customer) can fabricate the pickup story: a
"customer unreachable" claim with a spoofed location, or a customer insisting
they were home when they were not (seeded in R-1, conflict C-07).

*Mitigations implemented.* A pickup attempt is an **evidence bundle, not an
assertion**: reason code, timestamp, GPS, call log and doorstep photo, each
field present or absent on the record. **Bundle-completeness scoring** downgrades
thin bundles automatically (R-1 attempt 1: GPS but no photo). When the bundle and
the customer's claim disagree, the case enters an explicit **conflicting-claims
state** — neither side is auto-believed — with a reschedule and a drop-off
fallback. The doorstep QC snapshot is **frozen at handover and shared with the
customer**, so a later warehouse verdict cannot silently overwrite it (C-08).

## 4. Leaked tracker link

*Risk.* The public return-tracker link gets forwarded, screenshotted or posted;
anyone holding it could otherwise read the customer's return and refund details.

*Mitigations implemented.* Tracker links are **token-scoped**: an unguessable,
single-purpose token that resolves to exactly one return, shows status only, and
contains **no personal data** — no name, address, phone, or payment details
(amounts are shown as leg states, not account identifiers). Tokens **expire**,
can be revoked and re-issued by the customer, and open no path to actions:
tracking is read-only, and any change (reschedule, appeal, bank details) requires
the authenticated account.

## 5. Insider override abuse

*Risk.* The human override that fairness depends on is itself an attack surface:
a support agent or ops insider could push through fraudulent refunds, suppress
legitimate ones, or quietly edit states and amounts.

*Mitigations implemented.* Every override requires a **reason code** and a named
actor, and lands in the **tamper-evident audit trail**: an append-only,
hash-chained event log (each entry carries the SHA-256 of the previous entry),
with a "verify chain" check that recomputes integrity live. Statuses are never
edited in place — corrections are new entries, and illegal transitions (e.g.
credited → initiated, C-16) are rejected by the state machines and logged.
Breaks and deductions follow maker-checker discipline: the person who raises a
deduction is not the person who approves it.
