# IMPACTX 2026 — Challenge 15: "The Return That Shouldn't Be a Hassle"

Item-level return & refund system: refund waterfall across instruments, three-source
reconciliation (waiting vs stuck), idempotent exactly-once refunds, pickup/inspection
disputes, fraud friction ladder with fairness + appeal, and an evidence-screening
ensemble whose signals only reorder a human review queue — **no code path from any
model score to a cancelled refund**.

## Layout
- `frontend/` — Next.js (App Router) + TypeScript + Tailwind. English UI. "Ledger & Thread" design.
- `backend/` — pure TypeScript engine (state machines, waterfall, reconciler, idempotency, audit chain) + tests.
- `ml/` — evidence screening ensemble: pHash duplicates, EXIF consistency, C2PA/exact-hash,
  precomputed detector table (labelled), live pretrained ONNX detector, Gemini semantic-consistency signal (labelled uncalibrated).
- `dataset/` — seeded dataset (hero scenario, 15+ planted conflicts, 10 allocation test orders,
  heavy-returner fairness set, evidence set) + data card.

All payment/logistics states are **simulated and labelled simulated**.
Specs: `../research/00-synthesis-build-plan.md` and reports 02/05/06 in `../research/`.
