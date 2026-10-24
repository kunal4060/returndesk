#!/usr/bin/env python3
"""
Our fine-tune (EXPERIMENTAL) — transfer-learning head on a frozen base.

The pretrained Deep-Fake-Detector-v2 ViT stays frozen and remains the
primary live detector (see ../src/onnxDetector.ts). This script only:
  1. extracts the frozen ViT embedding (last hidden state, CLS token)
     for every image in ../../../dataset/finetune/,
  2. trains a small sklearn LogisticRegression head on TRAIN embeddings
     (originals + augmentations, split by base image — see manifest),
  3. evaluates on TEST base ORIGINALS only,
  4. also records the frozen base model's own zero-shot predictions on
     the same test set, when its classification head is an ai/real head.

Outputs (this directory): results.json, head.json, predictions.json.
Console output is tee'd to run.log by the invoking command.

REAL NUMBERS ONLY: every metric in results.json is computed here from
the actual test predictions. On total failure this script writes a
results.json carrying the error instead of metrics.
"""
import csv
import json
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
DATASET = HERE.parents[1] / "dataset" / "finetune"  # app/dataset/finetune
MANIFEST = DATASET / "manifest.csv"

CANDIDATE_MODELS = [
    "prithivMLmods/Deep-Fake-Detector-v2-Model",
    "dima806/ai_vs_real_image_detection",
    "google/vit-base-patch16-224",
]
SPLIT_RULE = "sort base ids; bases with sorted index % 3 == 2 go to test, rest to train; split by base image, augmentations inherit the base split and are never in test"


def load_manifest():
    with open(MANIFEST, newline="") as f:
        return list(csv.DictReader(f))


def ai_probability_from_logits(logits, id2label):
    """Map a classification head's logits to P(ai), or None if the head
    is not an ai/real head (e.g. ImageNet)."""
    arr = np.asarray(logits, dtype=np.float64)
    arr = arr - arr.max()
    exp = np.exp(arr)
    probs = exp / exp.sum()
    labels = [str(id2label.get(i, f"LABEL_{i}")).lower() for i in range(len(probs))]
    fake_hints = ("fake", "ai", "generated", "synthetic", "deepfake", "artificial")
    real_hints = ("real", "authentic", "genuine", "natural", "human")
    for i, lab in enumerate(labels):
        if any(h in lab for h in fake_hints):
            return float(probs[i])
    for i, lab in enumerate(labels):
        if any(h in lab for h in real_hints):
            return float(1.0 - probs[i])
    return None


def main():
    started = time.time()
    rows = load_manifest()
    train_rows = [r for r in rows if r["split"] == "train"]
    test_rows = [r for r in rows if r["split"] == "test" and r["kind"] == "original"]
    train_bases = sorted({r["base_id"] for r in train_rows})
    print(f"manifest: {len(rows)} files, train rows={len(train_rows)} "
          f"({len(train_bases)} bases), test originals={len(test_rows)}", flush=True)

    import torch
    from transformers import AutoImageProcessor, AutoModelForImageClassification

    model = None
    processor = None
    base_model_used = None
    load_errors = []
    for candidate in CANDIDATE_MODELS:
        try:
            print(f"trying base model: {candidate}", flush=True)
            processor = AutoImageProcessor.from_pretrained(candidate)
            model = AutoModelForImageClassification.from_pretrained(candidate)
            base_model_used = candidate
            print(f"loaded base model: {candidate}", flush=True)
            break
        except Exception as exc:  # try the next candidate, honestly logged
            msg = f"{candidate}: {type(exc).__name__}: {exc}"
            print(f"FAILED to load {msg}", flush=True)
            load_errors.append(msg)
            model = None
            processor = None
    if model is None:
        raise RuntimeError("no candidate base model could be loaded: " + " | ".join(load_errors))

    for p in model.parameters():
        p.requires_grad = False
    model.eval()
    id2label = getattr(model.config, "id2label", {}) or {}
    print(f"base model id2label: {id2label}", flush=True)

    def embed_and_logits(path: Path):
        image = Image.open(path).convert("RGB")
        inputs = processor(images=image, return_tensors="pt")
        with torch.no_grad():
            out = model(**inputs, output_hidden_states=True)
        hidden = out.hidden_states[-1]  # (1, tokens, dim)
        cls = hidden[0, 0].cpu().numpy().astype(np.float64)
        logits = out.logits[0].cpu().numpy().astype(np.float64) if out.logits is not None else None
        return cls, logits

    def embed_rows(subset):
        embs, logits_list = [], []
        for r in subset:
            path = DATASET / r["label"] / r["file"]
            emb, logits = embed_and_logits(path)
            embs.append(emb)
            logits_list.append(logits)
            print(f"  embedded {r['file']} emb_dim={emb.shape[0]}", flush=True)
        return np.stack(embs), logits_list

    print("embedding train rows...", flush=True)
    x_train, _ = embed_rows(train_rows)
    y_train = np.array([1 if r["label"] == "ai" else 0 for r in train_rows])
    print("embedding test originals...", flush=True)
    x_test, test_logits = embed_rows(test_rows)
    y_test = np.array([1 if r["label"] == "ai" else 0 for r in test_rows])
    emb_dim = int(x_train.shape[1])
    print(f"embedding dim: {emb_dim}", flush=True)

    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

    head = LogisticRegression(max_iter=1000, class_weight="balanced")
    head.fit(x_train, y_train)
    ai_idx = list(head.classes_).index(1)
    test_scores = head.predict_proba(x_test)[:, ai_idx]
    test_pred = (test_scores >= 0.5).astype(int)

    accuracy = float(accuracy_score(y_test, test_pred))
    report = classification_report(
        y_test, test_pred, labels=[0, 1], target_names=["real", "ai"],
        output_dict=True, zero_division=0,
    )
    per_class = {
        name: {
            "precision": float(report[name]["precision"]),
            "recall": float(report[name]["recall"]),
            "f1": float(report[name]["f1-score"]),
            "support": int(report[name]["support"]),
        }
        for name in ("real", "ai")
    }
    cm = confusion_matrix(y_test, test_pred, labels=[0, 1]).tolist()
    cm = [[int(v) for v in row] for row in cm]

    # Frozen base model's own zero-shot predictions on the same test set.
    base_zs_accuracy = None
    zs_probs = []
    zs_ok = True
    for logits in test_logits:
        if logits is None:
            zs_ok = False
            break
        p = ai_probability_from_logits(logits, id2label)
        if p is None:
            zs_ok = False
            break
        zs_probs.append(p)
    if zs_ok and len(zs_probs) == len(test_rows):
        zs_pred = (np.array(zs_probs) >= 0.5).astype(int)
        base_zs_accuracy = float(accuracy_score(y_test, zs_pred))
    print(f"base zero-shot accuracy on test: {base_zs_accuracy}", flush=True)

    runtime = round(time.time() - started, 2)
    results = {
        "baseModel": base_model_used,
        "nTrainImages": int(len(train_rows)),
        "nTrainBases": int(len(train_bases)),
        "nTest": int(len(test_rows)),
        "accuracy": accuracy,
        "perClass": per_class,
        "confusionMatrix": cm,
        "confusionMatrixLabels": ["real", "ai"],
        "baseModelZeroShotAccuracy": base_zs_accuracy,
        "splitRule": SPLIT_RULE,
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "runtimeSeconds": runtime,
    }
    head_json = {
        "coef": [float(v) for v in head.coef_[0]],
        "intercept": float(head.intercept_[0]),
        "classes_": ["real", "ai"],
        "embedding": f"vit-cls-{emb_dim}",
        "note": (
            f"LogisticRegression(max_iter=1000, class_weight='balanced') trained on frozen "
            f"{base_model_used} ViT CLS embeddings from the local fine-tune dataset "
            f"(train images={len(train_rows)} incl. augmentations, train bases={len(train_bases)}). "
            f"Experimental only — small local dataset; signal reorders a human review queue, "
            f"it never decides a refund."
        ),
    }
    predictions = [
        {
            "file": r["file"],
            "base_id": r["base_id"],
            "label": r["label"],
            "finetunedAiScore": float(s),
        }
        for r, s in zip(test_rows, test_scores)
    ]

    (HERE / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    (HERE / "head.json").write_text(json.dumps(head_json, indent=2) + "\n")
    (HERE / "predictions.json").write_text(json.dumps(predictions, indent=2) + "\n")

    print(json.dumps(results, indent=2), flush=True)
    print(f"done in {runtime}s", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        err = traceback.format_exc()
        print(err, flush=True)
        failure = {
            "baseModel": None,
            "nTrainImages": 0,
            "nTrainBases": 0,
            "nTest": 0,
            "accuracy": None,
            "perClass": None,
            "confusionMatrix": None,
            "baseModelZeroShotAccuracy": None,
            "splitRule": SPLIT_RULE,
            "trainedAt": datetime.now(timezone.utc).isoformat(),
            "runtimeSeconds": None,
            "error": err.strip().splitlines()[-1] if err.strip() else "unknown error",
            "errorDetail": err,
        }
        try:
            (HERE / "results.json").write_text(json.dumps(failure, indent=2) + "\n")
        except Exception:
            pass
        sys.exit(1)
