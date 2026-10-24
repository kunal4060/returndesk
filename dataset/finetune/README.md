# Fine-tune dataset — experimental (IMPACTX 2026, Challenge 15)

A small, locally assembled labelled set used **only** to train the
experimental fine-tune head in `app/ml/finetune/` (a logistic-regression
head on frozen pretrained ViT embeddings). It is not a benchmark dataset
and its size does not support general claims — see the caveat below.

## Sources

| Label | Source value in manifest | Count (base images) | What it is |
|---|---|---|---|
| real | `user-camera-photo` | 13 | Genuine camera photos from the user's own uploads (`~/workspace/user/files/`) — desk/cake, laptop-hinge close-ups, an ESP32 board, flowers, a phone case on a table, handmade frames, and similar everyday photos |
| real | `user-camera-photo-of-monitor` | 3 | Genuine camera photos *of a monitor screen* (real captures, but the subject is a screen — tagged separately in the manifest so this confound is visible, not hidden) |
| ai | `ai-generated-project` | 4 | AI-generated damaged-product photos made for this project (cracked phone, damaged shoes, scratched watch, torn jacket) |
| ai | `ai-generated-earlier-project` | 14 | AI-generated artwork from the user's earlier projects (frames/glasses renders, Lippan-art designs, celebration artwork, a UI preview), selected for visual variety; `.json` sidecars were not copied |

Every file's original filename is recorded in `manifest.csv` (`origin`
column), so any image can be traced back to its source.

## Counts

- **Base images: 34** — 16 real, 18 ai.
- **Train bases: 23** (11 real, 12 ai) · **Test bases: 11** (5 real, 6 ai).
- **Train files: 69** — 23 originals + 46 augmentations (2 per train base).
- **Test files: 11** — originals only; augmentations are never in test.
- **Total files on disk: 80** (38 in `real/`, 42 in `ai/`).

## Naming

Originals are renamed `real-01.jpg` … `real-16.jpg` and
`ai-01.jpg` … `ai-18.jpg` (converted to JPEG via Pillow, quality 90,
when the source was WebP/PNG). Augmentations keep the base name with a
suffix: `-augcrop` (centre-crop 80% + resize back) and `-augjpg`
(JPEG recompress at quality 55, "WhatsApp-style").

## Split rule (no leakage)

Split is **by base image**, never by file: base ids are sorted
(`ai-01`…`ai-18`, `real-01`…`real-16`); bases whose sorted index
satisfies `index % 3 == 2` go to **test**, the rest to **train**.
Augmentations inherit their base's split, so no crop or recompress of a
test photo can appear in training.

## Exclusions

- `1000132180_0_b5l9.jpg` — an ID-card photo — was **explicitly excluded
  for privacy** and was never copied.
- No photos of people were included as real bases.

## Small-sample caveat

34 base images is a very small dataset. Any held-out metric computed on
the 11 test originals has a **wide confidence interval** (a single image
is ~9 percentage points of accuracy) and says little about performance
on other photos, products, generators or compression pipelines. Treat
every number from this set as a demonstration that the fine-tuning
pipeline runs end-to-end — not as evidence the head generalises.
