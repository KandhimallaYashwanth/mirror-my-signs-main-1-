// In-browser runner for the ISL model trained by ml/train.py (format "isl-mlp-v1").
// Preprocessing MUST match ml/isl_features.py: per-frame extractFeatures → linear resample to seq_len → standardize.
import type { Prediction } from "@/lib/recognition";

export type IslModel = {
  format: string;
  version: string;
  trained_at: string;
  dataset: string;
  labels: string[];
  preprocessing: { feature_size: number; seq_len: number };
  mean: number[];
  std: number[];
  layers: { W: number[][]; b: number[] }[];
  metrics: { test_accuracy: number; n_test_videos: number; [k: string]: unknown };
};

import islModelAsset from "@/assets/isl_model.json.asset.json";
export const BUNDLED_MODEL_URL = islModelAsset.url;
let cached: Promise<IslModel | null> | null = null;

/** Returns null when no trained model has been published with the app. */
export function loadBundledModel(): Promise<IslModel | null> {
  if (!cached) {
    cached = fetch(BUNDLED_MODEL_URL)
      .then(async (r) => {
        if (!r.ok) return null;
        const m = (await r.json()) as IslModel;
        return m.format === "isl-mlp-v1" ? m : null;
      })
      .catch(() => null);
  }
  return cached;
}

export function resampleSequence(frames: number[][], len: number): number[] {
  const n = frames.length;
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const t = n === 1 ? 0 : (i * (n - 1)) / (len - 1);
    const lo = Math.floor(t);
    const hi = Math.min(lo + 1, n - 1);
    const a = t - lo;
    const A = frames[lo], B = frames[hi];
    for (let j = 0; j < A.length; j++) out.push(A[j] * (1 - a) + B[j] * a);
  }
  return out;
}

export function predictWithModel(m: IslModel, frames: number[][], minConfidence = 0.5): Prediction {
  if (frames.length < 4) return { label: null, confidence: 0, reason: "not_enough_frames" };
  let x = resampleSequence(frames, m.preprocessing.seq_len).map((v, i) => (v - m.mean[i]) / m.std[i]);
  m.layers.forEach((l, li) => {
    const y = l.b.slice();
    for (let o = 0; o < l.W.length; o++) {
      const row = l.W[o];
      let s = y[o];
      for (let i = 0; i < row.length; i++) s += row[i] * x[i];
      y[o] = li < m.layers.length - 1 ? Math.max(0, s) : s;
    }
    x = y;
  });
  const max = Math.max(...x);
  const e = x.map((v) => Math.exp(v - max));
  const sum = e.reduce((a, b) => a + b, 0);
  let k = 0;
  for (let i = 1; i < e.length; i++) if (e[i] > e[k]) k = i;
  const conf = e[k] / sum;
  if (conf < minConfidence) return { label: null, confidence: conf, reason: "unknown" };
  return { label: m.labels[k], confidence: conf };
}
