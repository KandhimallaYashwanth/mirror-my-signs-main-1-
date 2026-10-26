// Browser-only MediaPipe hand landmarker loader. Import dynamically from effects only.
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { MEDIAPIPE_TASKS_VISION_WASM } from "@/lib/gesture";

let cached: Promise<HandLandmarker> | null = null;

export function loadHandLandmarker() {
  if (!cached) {
    cached = (async () => {
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_TASKS_VISION_WASM);
      const modelAssetPath =
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
      try {
        return await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
      } catch (gpuError) {
        console.warn("GPU delegate unavailable for HandLandmarker, falling back to CPU:", gpuError);
        return await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
      }
    })().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];
