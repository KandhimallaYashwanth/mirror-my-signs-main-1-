// Google MediaPipe Gesture Recognizer wrapper: model loader, display labels, finger counting, and anti-flicker smoothing.
// The gesture model recognises generic hand gestures — it is NOT a sign-language model.
import type { GestureRecognizer } from "@mediapipe/tasks-vision";
import type { Landmark, Prediction } from "@/lib/recognition";

let cached: Promise<GestureRecognizer> | null = null;

/** WASM fileset matching the installed @mediapipe/tasks-vision version (1.1.1). */
export const MEDIAPIPE_TASKS_VISION_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";

/** Official pretrained Gesture Recognizer (float16) from Google's MediaPipe model storage. */
export const MEDIAPIPE_GESTURE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

/** Canned classifier categories from the pretrained task (excluding None). */
export const PRETRAINED_GESTURE_CATEGORIES = [
  "Closed_Fist",
  "Open_Palm",
  "Pointing_Up",
  "Thumb_Down",
  "Thumb_Up",
  "Victory",
  "ILoveYou",
] as const;

const PRETRAINED_SET = new Set<string>(PRETRAINED_GESTURE_CATEGORIES);

export function isPretrainedGesture(name: string): boolean {
  return PRETRAINED_SET.has(name);
}

/**
 * Loads the official MediaPipe Gesture Recognizer task model in VIDEO mode.
 * Tries GPU delegate first; gracefully falls back to CPU if WebGL/GPU is unavailable.
 */
export function loadGestureRecognizer(customModelPath?: string): Promise<GestureRecognizer> {
  if (!cached) {
    cached = (async () => {
      const { FilesetResolver, GestureRecognizer } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_TASKS_VISION_WASM);
      const modelAssetPath = customModelPath || MEDIAPIPE_GESTURE_MODEL_URL;

      const options = {
        runningMode: "VIDEO" as const,
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        cannedGesturesClassifierOptions: { scoreThreshold: 0.5 },
      };

      try {
        return await GestureRecognizer.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate: "GPU" },
          ...options,
        });
      } catch (gpuError) {
        console.warn(
          "GPU delegate unavailable for GestureRecognizer, falling back to CPU delegate:",
          gpuError,
        );
        return await GestureRecognizer.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate: "CPU" },
          ...options,
        });
      }
    })().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

/** Resets the cached model promise (e.g. for retrying after connection failure). */
export function resetGestureRecognizerCache(): void {
  cached = null;
}

/** Official pretrained categories. "None" / "Unrecognized" means no known gesture is present. */
export const GESTURE_LABELS: Record<string, string> = {
  None: "Unknown",
  Unrecognized: "Unknown",
  Closed_Fist: "Closed fist",
  Open_Palm: "Open palm",
  Pointing_Up: "Pointing up",
  Thumb_Down: "Thumb down",
  Thumb_Up: "Thumb up",
  Victory: "Victory",
  ILoveYou: "I love you",
  "Closed Fist": "Closed fist",
  "Open Palm": "Open palm",
  "Pointing Up": "Pointing up",
  "Thumb Down": "Thumb down",
  "Thumb Up": "Thumb up",
  "I Love You": "I love you",
};

/** Formats a MediaPipe gesture category name into a user-friendly display string. */
export function displayGesture(name: string): string {
  if (!name || name === "None" || name === "Unrecognized") return "Unknown";
  return GESTURE_LABELS[name] ?? name.replace(/_/g, " ");
}

export function fingerCountLabel(n: number): string {
  return n === 1 ? "1 finger" : `${n} fingers`;
}

export type GestureCategory = { name: string; score: number };
export type GestureFrame = {
  landmarks: Landmark[][];
  handedness: string[];
  gestures: GestureCategory[][]; // per hand, sorted best-first by MediaPipe
};

const FINGER_TIPS = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky
const FINGER_PIPS = [3, 6, 10, 14, 18];
const FINGER_MCPS = [2, 5, 9, 13, 17];

/**
 * Returns a 5-element boolean array indicating whether each finger is extended:
 * [thumb, index, middle, ring, pinky].
 * Pure landmark geometry — fully independent of the gesture classifier.
 * Returns null if landmarks are invalid or incomplete (< 21 points).
 */
export function getExtendedFingers(lm: Landmark[]): boolean[] | null {
  if (!lm || lm.length < 21) return null;
  const dist = (i: number, j: number) => Math.hypot(lm[i].x - lm[j].x, lm[i].y - lm[j].y);

  const extended: boolean[] = [false, false, false, false, false];

  // Four fingers (Index, Middle, Ring, Pinky):
  // When extended, tip is further from both wrist (0) and MCP than its PIP joint.
  for (let f = 1; f < 5; f++) {
    const tip = FINGER_TIPS[f];
    const pip = FINGER_PIPS[f];
    const mcp = FINGER_MCPS[f];
    const tipToWrist = dist(tip, 0);
    const pipToWrist = dist(pip, 0);
    const tipToMcp = dist(tip, mcp);
    const pipToMcp = dist(pip, mcp);
    extended[f] = tipToWrist > pipToWrist * 1.05 && tipToMcp > pipToMcp * 0.95;
  }

  // Thumb rotates at CMC/MCP rather than folding like the other fingers.
  const thumbTipToPinky = dist(4, 17);
  const thumbIpToPinky = dist(3, 17);
  const thumbTipToWrist = dist(4, 0);
  const thumbMcpToWrist = dist(2, 0);
  const thumbTipToIndexMcp = dist(4, 5);
  const thumbIpToIndexMcp = dist(3, 5);

  const thumbSpread =
    thumbTipToPinky > thumbIpToPinky * 1.08 && thumbTipToIndexMcp > thumbIpToIndexMcp * 1.02;
  const thumbUpward =
    thumbTipToWrist > thumbMcpToWrist * 1.15 && thumbTipToIndexMcp > thumbIpToIndexMcp * 1.05;
  extended[0] = thumbSpread || thumbUpward;

  return extended;
}

/**
 * Counts extended fingers (0-5) from one hand's landmarks. Pure landmark
 * geometry — fully independent of the gesture classifier, so it never
 * overrides a recognized gesture or an ISL sign. Returns -1 if landmarks
 * are incomplete.
 */
export function countFingers(lm: Landmark[]): number {
  const ext = getExtendedFingers(lm);
  if (!ext) return -1;
  return ext.reduce((acc, isExt) => acc + (isExt ? 1 : 0), 0);
}

export type ResolvedGesture = {
  label: string;
  confidence: number;
  fingersCount: number;
  source: "model" | "finger_count" | "unknown" | "none";
  rawCategory: string;
  handedness: string;
};

function emptyResolved(source: "none" | "unknown", raw = "None"): ResolvedGesture {
  return {
    label: source === "none" ? "" : "Unknown",
    confidence: 0,
    fingersCount: -1,
    source,
    rawCategory: raw,
    handedness: "",
  };
}

/**
 * Resolves a unified prediction for a video frame:
 * 1. If MediaPipe recognizes one of the 7 pretrained gestures with confidence >= threshold,
 *    use that label. Finger counting never replaces a recognized canned gesture.
 * 2. If the classifier reports None / Unrecognized (or no category), count 0–5 raised fingers.
 * 3. If a canned gesture is present but below threshold, show Unknown — do not guess with finger counts.
 * 4. Missing/incomplete landmarks → Unknown; no hands → none.
 *
 * This path is only used by the Hand gestures tab. The ISL pipeline never calls it.
 */
export function resolveGestureFrame(frame: GestureFrame, threshold = 0.7): ResolvedGesture {
  if (!frame.landmarks.length) return emptyResolved("none");

  let bestTop: { name: string; score: number } | null = null;
  let bestAny: { name: string; score: number } | null = null;
  let bestHandIdx = 0;

  for (let i = 0; i < frame.gestures.length; i++) {
    const top = frame.gestures[i]?.[0];
    if (!top) continue;
    if (!bestAny || top.score > bestAny.score) {
      bestAny = { name: top.name, score: top.score };
      bestHandIdx = i;
    }
    if (
      isPretrainedGesture(top.name) &&
      top.score >= threshold &&
      (!bestTop || top.score > bestTop.score)
    ) {
      bestTop = { name: top.name, score: top.score };
      bestHandIdx = i;
    }
  }

  const primaryLandmarks = frame.landmarks[bestHandIdx] ?? frame.landmarks[0];
  const primaryHandedness = frame.handedness[bestHandIdx] ?? frame.handedness[0] ?? "Right";
  const fingers = countFingers(primaryLandmarks);

  if (bestTop) {
    return {
      label: displayGesture(bestTop.name),
      confidence: bestTop.score,
      fingersCount: fingers,
      source: "model",
      rawCategory: bestTop.name,
      handedness: primaryHandedness,
    };
  }

  // A canned class was detected but not confidently enough — do not override with a finger count.
  if (bestAny && isPretrainedGesture(bestAny.name)) {
    return {
      label: "Unknown",
      confidence: bestAny.score,
      fingersCount: fingers,
      source: "unknown",
      rawCategory: bestAny.name,
      handedness: primaryHandedness,
    };
  }

  if (fingers >= 0) {
    const rawTop = bestAny;
    const isNone = !rawTop || rawTop.name === "None" || rawTop.name === "Unrecognized";
    return {
      label: fingerCountLabel(fingers),
      confidence: isNone ? 0.85 : Math.max(0.7, 1 - (rawTop?.score ?? 0)),
      fingersCount: fingers,
      source: "finger_count",
      rawCategory: rawTop?.name ?? "None",
      handedness: primaryHandedness,
    };
  }

  return {
    label: "Unknown",
    confidence: bestAny?.score ?? 0,
    fingersCount: -1,
    source: "unknown",
    rawCategory: bestAny?.name ?? "None",
    handedness: primaryHandedness,
  };
}

/**
 * Sliding-window anti-flicker filter to smooth live predictions across video frames.
 * - Prevents single-frame classification flips using majority voting over recent frames.
 * - Bridges 1-2 frame tracking drops to prevent visual flashing.
 * - Averages confidence scores to avoid jumpy confidence meters.
 */
export class AntiFlickerFilter {
  private window: { label: string; confidence: number; timestamp: number }[] = [];
  private readonly windowSize: number;
  private lastStable: { label: string; confidence: number } | null = null;
  private noHandStreak = 0;

  constructor(windowSize = 5) {
    this.windowSize = windowSize;
  }

  reset(): void {
    this.window = [];
    this.lastStable = null;
    this.noHandStreak = 0;
  }

  push(prediction: Prediction | null): { label: string; confidence: number } | null {
    if (!prediction || !prediction.label) {
      this.noHandStreak++;
      if (this.noHandStreak <= 2 && this.lastStable) {
        return this.lastStable;
      }
      this.window = [];
      this.lastStable = null;
      return null;
    }

    this.noHandStreak = 0;
    this.window.push({
      label: prediction.label,
      confidence: prediction.confidence,
      timestamp: Date.now(),
    });
    if (this.window.length > this.windowSize) {
      this.window.shift();
    }

    const voteCounts = new Map<string, { count: number; totalConf: number }>();
    for (const item of this.window) {
      const cur = voteCounts.get(item.label) ?? { count: 0, totalConf: 0 };
      voteCounts.set(item.label, {
        count: cur.count + 1,
        totalConf: cur.totalConf + item.confidence,
      });
    }

    let bestLabel = prediction.label;
    let bestCount = 0;
    let bestConf = prediction.confidence;

    for (const [label, data] of voteCounts.entries()) {
      if (data.count > bestCount) {
        bestLabel = label;
        bestCount = data.count;
        bestConf = data.totalConf / data.count;
      }
    }

    const res = { label: bestLabel, confidence: bestConf };
    this.lastStable = res;
    return res;
  }
}
