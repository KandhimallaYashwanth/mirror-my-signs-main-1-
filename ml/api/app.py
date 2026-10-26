"""FastAPI inference service for the exported ISL model (models/isl_model.json).

Run:  uvicorn api.app:app --host 0.0.0.0 --port 8000      (from the ml/ folder)
Env:  ISL_MODEL_PATH (default ../models/isl_model.json relative to this file), ISL_MIN_CONFIDENCE (0.5)
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from isl_features import FEATURE_SIZE, sequence_vector  # noqa: E402

MODEL_PATH = Path(os.environ.get("ISL_MODEL_PATH", Path(__file__).resolve().parents[1] / "models" / "isl_model.json"))
MIN_CONF = float(os.environ.get("ISL_MIN_CONFIDENCE", 0.5))
META_PATH = os.environ.get("ISL_METADATA_PATH")  # manifest.json from islrtc/import_islrtc.py (optional)

app = FastAPI(title="ISL inference")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
MODEL = None
LOAD_ERROR = None
try:
    if MODEL_PATH.exists():
        MODEL = json.loads(MODEL_PATH.read_text())
        LAYERS = [(np.array(l["W"]), np.array(l["b"])) for l in MODEL["layers"]]
        MEAN, STD = np.array(MODEL["mean"]), np.array(MODEL["std"])
    else:
        LOAD_ERROR = f"model file not found: {MODEL_PATH}"
except Exception as e:  # noqa: BLE001
    MODEL, LOAD_ERROR = None, str(e)
META: dict[str, dict] = {}
if META_PATH and Path(META_PATH).exists():
    for r in json.loads(Path(META_PATH).read_text(encoding="utf-8")):
        META.setdefault(r["training_label"], r)


def _meta(label: str | None) -> dict:
    r = META.get(label or "", {})
    return {"english_meaning": r.get("english_meaning") or None, "hindi_meaning": r.get("hindi_meaning") or None}


def infer(frames: list[list[float]]) -> dict:
    if MODEL is None:
        raise HTTPException(503, "Model not available: train it and set ISL_MODEL_PATH")
    x = (sequence_vector(np.asarray(frames, dtype=np.float32)) - MEAN) / STD
    for i, (W, b) in enumerate(LAYERS):
        x = W @ x + b
        if i < len(LAYERS) - 1:
            x = np.maximum(x, 0)
    p = np.exp(x - x.max()); p /= p.sum()
    k = int(p.argmax()); conf = float(p[k])
    if not np.isfinite(conf):
        raise HTTPException(500, "Inference produced invalid output")
    if conf < MIN_CONF:
        return {"label": None, "confidence": conf, "supported": False, "english_meaning": None, "hindi_meaning": None,
                "model_version": MODEL["version"], "status": "low_confidence"}
    label = MODEL["labels"][k]
    return {"label": label, "confidence": conf, "supported": True, **_meta(label),
            "model_version": MODEL["version"], "status": "prediction_available"}


class SeqIn(BaseModel):
    sequence: list[list[float]] = Field(min_length=4, max_length=300)
    feature_size: int = FEATURE_SIZE


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": MODEL is not None, "error": LOAD_ERROR,
            "min_confidence": MIN_CONF, "metadata_loaded": bool(META)}


@app.get("/model-info")
def model_info():
    if MODEL is None:
        raise HTTPException(503, "Model not available")
    info = {k: MODEL.get(k) for k in ("version", "trained_at", "dataset", "labels", "preprocessing", "metrics")}
    info["classes"] = [{"label": l, **_meta(l)} for l in MODEL["labels"]]
    return info



def _validate(body: SeqIn):
    if body.feature_size != FEATURE_SIZE or any(len(f) != FEATURE_SIZE for f in body.sequence):
        raise HTTPException(422, f"Each frame must have {FEATURE_SIZE} landmark features")


@app.post("/predict-sequence")
def predict_sequence(body: SeqIn):
    _validate(body)
    return infer(body.sequence)


@app.post("/predict")
def predict(body: SeqIn):  # same contract; kept for clients using the generic path
    _validate(body)
    return infer(body.sequence)
