# Data Card — Seeded Dataset (IMPACTX 2026, Challenge 15)

**All states in this dataset are simulated.** Every order, person, seller, timestamp,
status, photo hash and detector score below is seeded demo data. No real payment,
courier, provider or customer system is connected, and no real customer data is used.
Amounts are stored as **integer paise** (₹1 = 100 paise) everywhere.

## What this dataset is

The single seed the whole prototype runs on: one hero scenario that exercises every
deep system (allocation waterfall, pickup evidence, inspection dispute, three-source
reconciliation, fraud ladder), ten allocation test orders used as ground truth for
the correctness metric, a fairness set of heavy-returner profiles, an evidence-photo
metadata set with precomputed detector scores, and 16 deliberately planted conflicts
that the engine, the UI and the `/eval` harness are all scored against. The `/docs`
page renders this card and `threat-model.md` from the same files the engine reads.

## The hero scenario (HERO-1, in `scenario.json`)

A customer (A. Sharma, Amaravati) orders **4 items from 3 sellers** — running shoes
₹1,000, a t-shirt ₹500, jeans ₹450, wireless earbuds ₹300 — list total **225000
paise**, coupon SAVE250 of **25000 paise** allocated pro-rata, payable **200000
paise**, paid **card 120000 + wallet 50000 + voucher 30000**. The checkout
allocation matrix (pro-rata, largest-remainder, paise-exact in every row and
column) is persisted inside the file; refunds only ever read matrix rows.

Two items are returned. **R-1 (shoes):** two failed pickups — the first with a thin
courier evidence bundle (GPS and call log, no doorstep photo), the second with a
full bundle — against the customer's "I was home both times", producing a
conflicting-claims state; handover then succeeds with a frozen doorstep QC snapshot
(verdict: pass), which the warehouse contradicts with a "used" verdict, opening an
inspection dispute with a proposed partial refund at the used tier (≤50%: 44444 of
88889 paise, human-decided, photo proof required). Its refund legs show the planted
three-source mismatch: on the card leg the **provider says "reversed" while the
seller says "pending"** (classified stuck), the wallet leg is credited, and the
voucher leg is pending inside its budget with a near-expiry re-issue date
(2026-11-02) surfaced. **R-2 (t-shirt):** the straightforward contrast — clean
handover, matching inspections, all three legs waiting inside their latency
budgets. A 16-entry timeline scripts the whole demo beat by beat.

## Counts

| Set | File | Count |
|---|---|---|
| Hero scenario | `scenario.json` | 1 order · 4 items · 3 sellers · 2 returns · 6 refund legs · 16 timeline events |
| Planted conflicts | `conflicts.json` | 16 (C-01…C-16) |
| Allocation test orders | `test-orders.json` | 10 orders (TO-01…TO-10), 2–4 items each |
| Heavy-returner fairness profiles | `heavy-returners.json` | 6 profiles (HR-1…HR-6) |
| Evidence photo metadata | `evidence.json` | 10 entries (EV-01…EV-10), metadata only — no real images |
| Detector scores | `detector-scores.json` | 10 precomputed scores, one per evidence entry |

## The 16 planted conflicts (short list)

1. **C-01** Provider "reversed" vs seller "pending" on the same card leg — stuck. *(scenario)*
2. **C-02** Duplicate refund webhook delivered twice — deduped by event id. *(eval-only)*
3. **C-03** Retry storm: 3 refund retries, exactly one issuance via the stable refund-intent id. *(eval-only)*
4. **C-04** Voucher leg near expiry (2026-11-02) during a slow card leg — expiry surfaced, voucher refunds as voucher. *(scenario)*
5. **C-05** Free-shipping threshold (₹999) broken by the return — explicit preview policy line, never a silent clawback. *(testOrders)*
6. **C-06** Free gift kept while the qualifying item is returned — preview policy line; a gift's refund value is ₹0. *(testOrders)*
7. **C-07** Courier bundle with GPS but no photo vs a full bundle — thin bundles downgrade the courier claim. *(scenario)*
8. **C-08** Doorstep QC pass overturned by warehouse "used" — frozen snapshot turns it into a visible dispute. *(scenario)*
9. **C-09** AI-generated damage photos submitted as evidence — ensemble routes to human review only. *(evidence)*
10. **C-10** Real low-light photo falsely flagged by detectors (score 0.81) — the fairness trap; never auto-cancelled. *(evidence)*
11. **C-11** Same photo reused across two orders — caught by pHash near-duplicate search (hashes differ by 1 hex digit). *(evidence)*
12. **C-12** Heavy returner: 12 sizing returns, all legitimate — friction capped at level 2, appeal overturns. *(scenario)*
13. **C-13** ₹1 amount mismatch between platform and provider — paise-level tolerance, correcting entry, never an edit. *(eval-only)*
14. **C-14** Card leg past its 7-working-day budget — flips from waiting to stuck, escalation fires. *(eval-only)*
15. **C-15** Partial refund at the "used ≤50%" tier — itemised arithmetic, photo proof mandatory, human-decided. *(scenario)*
16. **C-16** Illegal transition credited → initiated — rejected by the state machine and audit-logged. *(eval-only)*

## Known limitations & honesty notes

- **Detector scores are precomputed** for this seeded evidence set and labelled as
  such in `detector-scores.json`; they are not live inference. A live pretrained
  detector and the deterministic checks (pHash, EXIF-vs-delivery, C2PA) are
  separate signals in the ensemble, and **no score can cancel a refund** — signals
  only reorder the human review queue.
- **EXIF absence scores zero on its own.** WhatsApp and in-app cameras strip EXIF
  from honest uploads, so several seeded genuine photos (EV-03, EV-10) have
  `exif: null` by design.
- **Latency budgets are the demo's working assumptions**, taken from published
  gateway behaviour: wallet ~2 hours, voucher near-instant, card 5–7 working days
  at normal speed. Waiting vs stuck is judged against these budgets plus
  terminal-state contradictions — a leg inside its budget with agreeing sources is
  *waiting*, however impatient it feels.
- Expected refunds in `test-orders.json` follow one stated policy: keep the
  original checkout allocation (no re-computation on return); shipping-threshold
  and free-gift effects are preview policy lines and do not change the expected
  legs in this dataset.
- Names are placeholders ("A. Sharma"), sellers are invented, and all hashes in
  `evidence.json` are invented values that are internally consistent only within
  this set (notably the EV-06/EV-07 reuse pair).

## Fine-tune dataset (`dataset/finetune/`)

A small, locally assembled labelled set built for the experimental
fine-tune head in `app/ml/finetune/` — separate from the seeded set
above. Full detail in `dataset/finetune/README.md`; every file's origin
is recorded in `dataset/finetune/manifest.csv`.

**Sources, with labels:**

- **Real (16 base images):** genuine camera photos from the user's own
  uploads — 13 tagged `user-camera-photo` (desk/cake, laptop-hinge
  close-ups, an ESP32 board, flowers, a phone case, handmade frames)
  and 3 tagged `user-camera-photo-of-monitor` (camera photos of a
  monitor screen, tagged separately so the confound is visible).
- **AI (18 base images):** 4 tagged `ai-generated-project` (AI-generated
  damaged-product photos made for this project: cracked phone, damaged
  shoes, scratched watch, torn jacket) and 14 tagged
  `ai-generated-earlier-project` (AI-generated artwork from the user's
  earlier projects, chosen for variety; no `.json` sidecars copied).

**Counts:** 34 base images (16 real / 18 ai) → 23 train bases
(11 real / 12 ai) and 11 test bases (5 real / 6 ai). Training files:
69 (23 originals + 46 augmentations — per train base, a centre-crop
80% + resize `-augcrop` and a JPEG-recompress quality-55 `-augjpg`).
Test files: 11, originals only. Total files on disk: 80.

**Split rule:** by base image, never by file — base ids sorted
(`ai-01`…`ai-18`, `real-01`…`real-16`); bases with sorted
`index % 3 == 2` go to test, the rest to train. Augmentations inherit
their base's split and are never in test, so there is no leakage of a
test photo (or a crop/recompress of it) into training.

**Exclusions:** the ID-card photo `1000132180_0_b5l9.jpg` was
explicitly excluded for privacy and never copied; no photos of people
were included as real bases.

**Measured held-out result (from `app/ml/finetune/results.json`,
run 2026-10-24):** the logistic head on frozen
`prithivMLmods/Deep-Fake-Detector-v2-Model` ViT embeddings scored
**accuracy 0.818 on the 11 test originals (9/11 correct)** — real:
precision 0.714, recall 1.000 (n=5); ai: precision 1.000, recall
0.667 (n=6); confusion matrix (rows = true [real, ai]) [[5, 0], [2, 4]].
The frozen base model's own zero-shot accuracy on the same test set
was 0.545.

**Small-sample caveat:** n=11 is tiny — the confidence interval around
0.818 is **wide** (one image is ~9 percentage points), so this number
demonstrates that the fine-tuning pipeline runs end-to-end; it is not
evidence the head generalises to other photos, products, generators
or compression pipelines.
