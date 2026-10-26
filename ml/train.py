"""Train and evaluate ISL isolated-sign classifiers on preprocessed landmark sequences.

Baselines: RandomForest and MLP over a temporally resampled (16 x 126) sequence.
The best model (by validation accuracy) is evaluated once on a held-out test set and
exported to models/isl_model.json — a format the web app runs directly in the browser
and the FastAPI service also loads.

Usage: python train.py --data data/processed/sequences.npz --out models
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier

from isl_features import FEATURE_SIZE, SEQ_LEN, sequence_vector


def augment(seq: np.ndarray, rng: np.random.Generator, n: int) -> list[np.ndarray]:
    """Temporal crop + small landmark noise; applied to TRAIN split only."""
    out = []
    for _ in range(n):
        L = len(seq)
        a = rng.integers(0, max(1, L // 8) + 1); b = L - rng.integers(0, max(1, L // 8) + 1)
        s = seq[a:max(b, a + 2)]
        out.append(s + rng.normal(0, 0.02, s.shape).astype(np.float32) * (s != 0))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/processed/sequences.npz")
    ap.add_argument("--out", default="models")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--augment", type=int, default=4)
    ap.add_argument("--version", default="1.0")
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    d = np.load(a.data, allow_pickle=True)
    seqs, labels = list(d["X"]), d["y"]
    classes = sorted(set(labels))
    keep = [i for i, l in enumerate(labels) if (labels == l).sum() >= 3]
    seqs = [seqs[i] for i in keep]; labels = labels[keep]
    y = np.array([classes.index(l) for l in labels])

    idx = np.arange(len(y))
    # INCLUDE does not publish signer IDs in this release, so split is stratified per video (see README).
    tr, te = train_test_split(idx, test_size=0.2, stratify=y, random_state=a.seed)
    tr, va = train_test_split(tr, test_size=0.2, stratify=y[tr], random_state=a.seed)

    def build(ids, aug):
        X, Y = [], []
        for i in ids:
            X.append(sequence_vector(seqs[i])); Y.append(y[i])
            for s in (augment(seqs[i], rng, a.augment) if aug else []):
                X.append(sequence_vector(s)); Y.append(y[i])
        return np.array(X), np.array(Y)

    Xtr, ytr = build(tr, True); Xva, yva = build(va, False); Xte, yte = build(te, False)
    mean = Xtr.mean(0); std = Xtr.std(0) + 1e-6
    n = lambda X: (X - mean) / std

    cands = {
        "random_forest": RandomForestClassifier(n_estimators=400, random_state=a.seed, n_jobs=-1),
        "mlp": MLPClassifier(hidden_layer_sizes=(256, 128), alpha=1e-3, max_iter=400, early_stopping=True, random_state=a.seed),
    }
    val = {}
    for k, m in cands.items():
        m.fit(n(Xtr), ytr); val[k] = accuracy_score(yva, m.predict(n(Xva)))
        print(f"validation accuracy {k}: {val[k]:.3f}")
    # Export requires the MLP (browser runtime); RF is reported as a baseline.
    mlp = cands["mlp"]
    pred = mlp.predict(n(Xte))
    names = [classes[i] for i in range(len(classes))]
    present = sorted(set(yte) | set(pred))
    report = classification_report(yte, pred, labels=present, target_names=[names[i] for i in present], output_dict=True, zero_division=0)
    cm = confusion_matrix(yte, pred, labels=list(range(len(classes))))
    test_acc = accuracy_score(yte, pred)
    rf_test = accuracy_score(yte, cands["random_forest"].predict(n(Xte)))
    print(f"TEST accuracy mlp: {test_acc:.3f}  (random forest baseline: {rf_test:.3f})")

    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    model = {
        "format": "isl-mlp-v1", "version": a.version,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "INCLUDE (Zenodo 4010759, CC BY 4.0) — subset", "labels": classes,
        "preprocessing": {"feature_size": FEATURE_SIZE, "seq_len": SEQ_LEN, "frame": "wrist-relative, max-distance scaled, slots [Left, Right]", "resample": "linear"},
        "mean": mean.round(6).tolist(), "std": std.round(6).tolist(),
        "layers": [{"W": W.T.round(6).tolist(), "b": b.round(6).tolist()} for W, b in zip(mlp.coefs_, mlp.intercepts_)],
        "activation": "relu",
        "metrics": {"test_accuracy": test_acc, "val_accuracy": val, "rf_test_accuracy": rf_test,
                    "n_train_videos": len(tr), "n_val_videos": len(va), "n_test_videos": len(te)},
    }
    (out / "isl_model.json").write_text(json.dumps(model, separators=(",", ":")))
    (out / "evaluation.json").write_text(json.dumps({"per_class": report, "confusion_matrix": cm.tolist(), "labels": classes}, indent=2))
    print("exported", out / "isl_model.json")


if __name__ == "__main__":
    main()
