# Dataset — file inventory & field conventions

Seeded dataset for the IMPACTX 2026 Challenge 15 prototype (e-commerce
return/refund system). **All states are simulated** — see the labelling field
inside each JSON file and `data-card.md`. This folder is data only; the engine
reads it, nothing here executes.

## Files

| File | Contents |
|---|---|
| `scenario.json` | The hero scenario HERO-1: order (4 items, 3 sellers, coupon, split payment), the persisted allocation matrix, customer, two scripted returns (R-1 pickup fight + inspection dispute + three-source leg mismatch; R-2 straightforward), and a 16-event demo timeline. |
| `conflicts.json` | The 16 planted conflicts C-01…C-16: `{id, title, description, appearsIn, expectedSystemBehaviour}`. `appearsIn` is one of `scenario` / `testOrders` / `evidence` / `eval-only`. |
| `test-orders.json` | 10 mixed-instrument orders (TO-01…TO-10) with hand-computed `expectedRefund` ground truth for the allocation-correctness metric. Each order also carries its full allocation matrix so failures can be localised to a row or column. |
| `heavy-returners.json` | Fairness set: 6 customer profiles (HR-1…HR-6) with return volume, sizing share, account age, prior disputes, the maximum friction level the system may apply, and the expected appeal outcome. HR-1 is the hero customer. |
| `evidence.json` | Evidence photo metadata only (no real images): 10 entries (EV-01…EV-10) with kind, perceptual hash, SHA-256, EXIF block or `null`, C2PA flag, delivery timestamp and notes. EV-06/EV-07 are the reuse pair (near-identical pHash). |
| `detector-scores.json` | Precomputed detector scores for the seeded evidence set — explicitly labelled simulated, **not** live inference. Includes the fairness trap: genuine low-light EV-02 scores 0.81 and must still never be auto-cancelled. |
| `data-card.md` | One-page data card (what the dataset is, hero summary, counts, all 16 conflicts in short form, limitations and honesty notes). Rendered on `/docs`. |
| `threat-model.md` | One-page threat model: five risks with implemented mitigations, including the standing no-automated-denial rule. Rendered on `/docs`. |

## Field conventions

- **Money is integer paise** in every JSON field (₹1 = 100 paise). Field names
  carry the suffix `Paise` (e.g. `listPricePaise`, `amountPaise`,
  `totalPaise`). No floats are ever used for money; a 1-paise difference is a
  real, testable difference (see TO-10).
- **Dates and times are ISO 8601** with the `+05:30` offset
  (e.g. `2026-10-24T09:12:00+05:30`). `ageHours` on refund legs is a plain
  number of hours since the leg was initiated.
- **Allocation math** (report 02 rules): effective price = list price −
  pro-rata coupon share, allocated by largest remainder so shares sum exactly;
  each item's instruments split pro-rata by payment shares, largest remainder
  per row; every row sums to the item's effective price and every column sums
  to that instrument's payment total. Refunds read the persisted matrix row —
  they are never re-derived.
- **Refund-to-source is absolute:** a voucher leg refunds as a voucher (never
  to bank), and no instrument is ever refunded more than it contributed.
- **Leg states are per-source.** Each refund leg carries `platformState`,
  `providerState` and `sellerState` separately — disagreement between them is
  the data, not an error. `classification` (`waiting` / `stuck` / `settled`)
  is judged against per-instrument latency budgets (wallet ~2 h, voucher
  near-instant, card 5–7 working days) and terminal-state contradictions.
- **Evidence kinds** are from a fixed vocabulary: `genuine`,
  `genuine_low_light`, `genuine_whatsapp_compressed`, `ai_generated`,
  `ai_generated_recompressed`, `reused_across_orders`, `c2pa_signed_ai`,
  `predelivery_timestamp`. `phashHex` is 16 lowercase hex characters;
  `sha256Hex` is 64. `exif: null` means the upload carries no EXIF (common for
  honest WhatsApp / in-app uploads) and must score zero on that fact alone.
- **Simulated labelling:** every JSON file carries a top-level `labelling`
  field (or per-file equivalent) stating the data is seeded and simulated.
  Nothing in this folder describes a real person, order or transaction.
