# IMPACTX 2026 — Challenge 15 · Frontend

**Ledger & Thread** — the Next.js (App Router) + TypeScript + Tailwind CSS v4
frontend for the item-level return & refund system. English UI only. All
payment/logistics states are simulated and labelled simulated.

Design: warm paper ledger theme (report 05, Part 2) — flat surfaces, hairline
rules, tabular numerals for money, mono for ids/hashes/states, brass accent,
oxide red reserved for "stuck". No purple gradients, no glassmorphism, no emoji
icons (inline SVG only).

## Run

```bash
npm install        # links @impactx/backend and @impactx/ml via file: deps
npm run dev        # predev syncs ../dataset/*.json + *.md into src/data/
npm run build      # prebuild does the same sync, then next build
```

The sync step (`scripts/sync-data.mjs`) exists because Next cannot reliably
import files outside its root: dataset files are mirrored into `src/data/` and
pages import from `@/data/...`. If a dataset file is missing, the sync writes
a minimal placeholder so pages render their honest empty states.

## Environment

Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` to enable the
live Gemini semantic check in the evidence lab. Without a key the check
returns a clearly labelled MOCK result. Never commit `.env.local`.

## Routes

| Route | What it is |
|---|---|
| `/` | Scenario picker: hero scenario card, entry points, six-beat demo checklist |
| `/customer` | Order list with honest money-back-so-far counters (credited only) |
| `/customer/orders/[orderId]` | Item-level dashboard: 5-beat timelines, wording blocks, refund waterfall (engine allocation matrix + computeRefund), eligibility previews, actions |
| `/customer/returns/[returnId]` | Return deep-dive: event micro-timeline, evidence cards, frozen doorstep QC vs warehouse verdict, dispute status, appeal |
| `/customer/disputes/[disputeId]` | Dispute steppers — pickup (courier bundle scored vs customer claim) and inspection (doorstep pass vs warehouse "used" → condition-tier partial refund with arithmetic) |
| `/track/[token]` | Public tracker: token-scoped minimal status, no personal data, expiry explained |
| `/ops` | Reconciliation console: MetricPulse + exception queue classified by the engine's `classifyLeg`, stuck first |
| `/ops/returns/[returnId]` | Three Truths: ThreadDiagram (Seller/Platform/Provider), raw vs normalised source panels, verdict with budget maths, reviewer actions (reason required, audit-logged), idempotent Retry refund |
| `/ops/audit` | Audit ledger: hash-chained entries from the shared engine AuditLog, Verify chain recomputes live |
| `/ops/fraud` | Friction ladder for the seeded heavy returner (engine `assessFriction`, appeal + overturn) + Evidence Lab: honesty notice, seeded ensemble screening, live ONNX sandbox, Gemini semantic check |
| `/api/gemini-screen` | Server route calling `@impactx/ml` `geminiSemanticCheck`; the API key never leaves the server |
| `/eval` | Evaluation harness: runs allocation correctness, waiting/stuck classification and fraud false-positive metrics plus engine checks (idempotency, webhook dedupe, illegal transition, audit chain, wording coverage, no-auto-cancel) live in the browser |
| `/docs` | Data card + threat model rendered from the synced dataset docs, plus the planted-conflicts table |

## Wiring notes

- Sibling packages are consumed as TypeScript source via
  `transpilePackages: ['@impactx/backend', '@impactx/ml']`.
- The engine's AuditLog and ML provenance hash with `node:crypto`, and the ML
  detector-table loader imports `node:fs`. For client bundles only,
  `next.config.ts` aliases those to `src/lib/nodeCryptoShim.ts` (a verified
  FIPS 180-4 SHA-256 — its output matches Node's exactly) and
  `src/lib/nodeFsShim.ts`. Server code keeps the real Node modules.
- All status copy comes from `src/wording/library.ts`, keyed by backend
  machine state: what it means / what happens next / by when. Money is never
  described as arrived before the `credited` state.
- Simulation state (`src/state/SimProvider.tsx`): one shared AuditLog seeded
  with scenario events at app start, one shared RefundIssuer, a logical clock
  offset ("Advance time"), and a fault panel (duplicate webhook, provider
  outage, stale data) — every injection is audit-logged.
