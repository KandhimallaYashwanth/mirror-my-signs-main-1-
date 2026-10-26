// Browser inference for the pretrained ASL Citizen BiGRU+Attention model (200 isolated signs).
// Preprocessing reproduces SharoonArshad/asl-citizen-processed-200 (see ml/asl/README.md):
// 75 landmarks/frame = 33 pose + 21 left hand + 21 right hand (x,y,z); missing hand = raw zeros;
// subtract shoulder centre (pose 11/12) and divide by 3D shoulder width; linear resample to 200 frames;
// append velocity (v[0]=0, v[t]=p[t]-p[t-1]) → (200, 450).
import aslModelAsset from "@/assets/asl_bigru.onnx.asset.json";
import labels from "../../public/models/asl/labels.json";

type P = { x: number; y: number; z: number };
type Session = { run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>> };

export const ASL_LABELS = labels as Record<string, string>;
export const SEQ = 200;

let session: Promise<{ session: Session; Tensor: new (t: string, d: Float32Array, dims: number[]) => unknown }> | null = null;
export function loadAslModel() {
  if (!session) {
    session = (async () => {
      const ort = await import("onnxruntime-web");
      ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
      const s = await ort.InferenceSession.create(aslModelAsset.url, { executionProviders: ["wasm"] });
      return { session: s as unknown as Session, Tensor: ort.Tensor as never };
    })().catch((e) => {
      session = null;
      throw e;
    });
  }
  return session;
}

/** Build one 225-value frame from pose + hands, or null if no pose was found. */
export function aslFrame(pose: P[] | undefined, hands: P[][]): number[] | null {
  if (!pose || pose.length < 33) return null;
  const slots: (P[] | null)[] = [null, null];
  const lw = pose[15], rw = pose[16]; // subject's left / right wrist
  for (const h of hands) {
    const w = h[0];
    const dl = Math.hypot(w.x - lw.x, w.y - lw.y), dr = Math.hypot(w.x - rw.x, w.y - rw.y);
    const i = dl <= dr ? 0 : 1;
    if (!slots[i]) slots[i] = h;
    else if (!slots[1 - i]) slots[1 - i] = h;
  }
  const pts: P[] = [...pose.slice(0, 33)];
  for (const s of slots) for (let i = 0; i < 21; i++) pts.push(s ? s[i] : { x: 0, y: 0, z: 0 });
  const a = pose[11], b = pose[12];
  const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  const sc = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) || 1;
  const out: number[] = [];
  for (const p of pts) out.push((p.x - c.x) / sc, (p.y - c.y) / sc, (p.z - c.z) / sc);
  return out;
}

export function aslInput(frames: number[][]): Float32Array {
  const n = frames.length, D = 225;
  const pos = new Float32Array(SEQ * D);
  for (let i = 0; i < SEQ; i++) {
    const t = n === 1 ? 0 : (i * (n - 1)) / (SEQ - 1);
    const lo = Math.floor(t), hi = Math.min(lo + 1, n - 1), w = t - lo;
    for (let j = 0; j < D; j++) pos[i * D + j] = frames[lo][j] * (1 - w) + frames[hi][j] * w;
  }
  const x = new Float32Array(SEQ * 450);
  for (let i = 0; i < SEQ; i++) {
    for (let j = 0; j < D; j++) {
      x[i * 450 + j] = pos[i * D + j];
      x[i * 450 + D + j] = i === 0 ? 0 : pos[i * D + j] - pos[(i - 1) * D + j];
    }
  }
  return x;
}

export async function predictAsl(frames: number[][]): Promise<{ label: string; confidence: number; top: { label: string; confidence: number }[] }> {
  const { session: s, Tensor } = await loadAslModel();
  const out = await s.run({ x: new Tensor("float32", aslInput(frames), [1, SEQ, 450]) });
  const logits = out["logits"].data;
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  let sum = 0;
  for (let i = 0; i < logits.length; i++) sum += Math.exp(logits[i] - max);
  const top = Array.from(logits, (v, i) => ({ label: ASL_LABELS[String(i)], confidence: Math.exp(v - max) / sum }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
  return { label: top[0].label, confidence: top[0].confidence, top };
}

/** "BACKPACK1" → "backpack" for display/speech. */
export const aslWord = (l: string) => l.replace(/\d+$/, "").toLowerCase();
