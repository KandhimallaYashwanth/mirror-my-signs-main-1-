// Landmark normalization, on-device KNN classifier, external model client and temporal stabilizer.
export type Landmark = { x: number; y: number; z: number };
export type Prediction = { label: string; confidence: number } | { label: null; confidence: number; reason: string };

export const FEATURE_SIZE = 126; // 2 hands x 21 points x 3

/** Normalize each hand relative to its wrist and scale; order hands by handedness (Left, Right). */
export function extractFeatures(hands: Landmark[][], handedness: string[]): number[] | null {
  if (!hands.length) return null;
  const slots: (Landmark[] | null)[] = [null, null];
  hands.forEach((h, i) => {
    const idx = handedness[i] === "Left" ? 0 : 1;
    if (!slots[idx]) slots[idx] = h;
    else slots[idx === 0 ? 1 : 0] = h;
  });
  const out: number[] = [];
  for (const hand of slots) {
    if (!hand) {
      for (let i = 0; i < 63; i++) out.push(0);
      continue;
    }
    const w = hand[0];
    let scale = 0;
    for (const p of hand) scale = Math.max(scale, Math.hypot(p.x - w.x, p.y - w.y, p.z - w.z));
    scale = scale || 1;
    for (const p of hand) out.push((p.x - w.x) / scale, (p.y - w.y) / scale, (p.z - w.z) / scale);
  }
  return out;
}

export type Sample = { label: string; features: number[] };

function dist(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - (b[i] ?? 0);
    s += d * d;
  }
  return Math.sqrt(s);
}

/** k-nearest-neighbour classifier over the user's own recorded samples. */
export class KnnClassifier {
  constructor(private samples: Sample[], private k = 5, private maxDistance = 2.2) {}
  get labels() {
    return Array.from(new Set(this.samples.map((s) => s.label)));
  }
  get ready() {
    return this.labels.length >= 1 && this.samples.length >= 5;
  }
  predict(f: number[]): Prediction {
    if (!this.ready) return { label: null, confidence: 0, reason: "not_trained" };
    const near = this.samples
      .map((s) => ({ s, d: dist(f, s.features) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.k);
    if (near[0].d > this.maxDistance) return { label: null, confidence: 0, reason: "unknown" };
    const votes = new Map<string, number>();
    let total = 0;
    for (const n of near) {
      const w = 1 / (n.d + 1e-3);
      votes.set(n.s.label, (votes.get(n.s.label) ?? 0) + w);
      total += w;
    }
    const [label, v] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    return { label, confidence: v / total };
  }
}

/** Calls a user-configured external ISL model service. Expects JSON {label, confidence}. */
export async function predictExternal(url: string, sequence: number[][]): Promise<Prediction> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sequence, feature_size: FEATURE_SIZE }),
  });
  if (!res.ok) throw new Error(`Model service responded ${res.status}`);
  const data = (await res.json()) as { label?: string | null; confidence?: number };
  if (!data.label || typeof data.confidence !== "number") return { label: null, confidence: 0, reason: "unknown" };
  return { label: data.label, confidence: data.confidence };
}

/** Accepts a label only after it is held above threshold for N frames; suppresses repeats until release. */
export class Stabilizer {
  private current: string | null = null;
  private count = 0;
  private lastEmitted: string | null = null;
  constructor(public threshold: number, public holdFrames: number) {}
  reset() {
    this.current = null;
    this.count = 0;
    this.lastEmitted = null;
  }
  /** Call with null when no hand is visible. Returns accepted label or null. */
  push(p: Prediction | null): { accepted: string | null; progress: number } {
    if (!p || !p.label || p.confidence < this.threshold) {
      if (!p) this.lastEmitted = null; // hands released: allow same sign again
      this.current = null;
      this.count = 0;
      return { accepted: null, progress: 0 };
    }
    if (p.label === this.current) this.count++;
    else {
      this.current = p.label;
      this.count = 1;
    }
    const progress = Math.min(1, this.count / this.holdFrames);
    if (this.count >= this.holdFrames && p.label !== this.lastEmitted) {
      this.lastEmitted = p.label;
      return { accepted: p.label, progress: 1 };
    }
    return { accepted: null, progress };
  }
}

/** Turn accepted glosses into a readable sentence without inventing words. */
export function buildSentence(glosses: string[]): string {
  if (!glosses.length) return "";
  const words = glosses.map((g) => g.replace(/_/g, " ").trim().toLowerCase()).filter(Boolean);
  let s = words.join(" ").replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1");
  s = s.replace(/\bi\b/g, "I");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s += ".";
  return s;
}
