import { useCallback, useEffect, useRef, useState } from "react";
import type { GestureRecognizer, HandLandmarker } from "@mediapipe/tasks-vision";
import { HAND_CONNECTIONS, loadHandLandmarker } from "@/lib/hand-tracker";
import { loadGestureRecognizer, type GestureCategory, type GestureFrame } from "@/lib/gesture";
import { extractFeatures, type Landmark } from "@/lib/recognition";

export type CameraStatus = "idle" | "requesting" | "live" | "denied" | "unavailable" | "error";
export type TrackerStatus = "idle" | "loading" | "ready" | "error";
export type DetectorMode = "hands" | "gestures";

/**
 * Opens the camera and runs hand tracking each frame.
 * mode "hands": calls onFrame with normalized features (for the ISL/KNN pipeline).
 * mode "gestures": runs Google's pretrained Gesture Recognizer and calls onGesture.
 */
export function useCameraHands(opts: {
  showLandmarks: boolean;
  mode?: DetectorMode;
  onFrame: (features: number[] | null) => void;
  onGesture?: (frame: GestureFrame) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<HandLandmarker | null>(null);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const rafRef = useRef<number>(0);
  const runningRef = useRef(false);
  const lastTimestampRef = useRef<number>(0);

  const onFrameRef = useRef(opts.onFrame);
  onFrameRef.current = opts.onFrame;
  const onGestureRef = useRef(opts.onGesture ?? (() => {}));
  onGestureRef.current = opts.onGesture ?? (() => {});
  const showRef = useRef(opts.showLandmarks);
  showRef.current = opts.showLandmarks;
  const modeRef = useRef<DetectorMode>(opts.mode ?? "hands");
  modeRef.current = opts.mode ?? "hands";

  const [camera, setCamera] = useState<CameraStatus>("idle");
  const [tracker, setTracker] = useState<TrackerStatus>("idle");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [error, setError] = useState<string | null>(null);
  const [handsVisible, setHandsVisible] = useState(0);
  const [inferError, setInferError] = useState<string | null>(null);

  const stopLoop = () => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const stop = useCallback(() => {
    stopLoop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setCamera("idle");
    setHandsVisible(0);
  }, []);

  const loop = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!runningRef.current || !v || !c) return;

    if (v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
      const useGestures = modeRef.current === "gestures";
      let hands: Landmark[][] = [];
      let handed: string[] = [];
      let gestures: GestureCategory[][] = [];

      // Guarantee strictly monotonically increasing timestamp for MediaPipe Video mode
      const now = performance.now();
      const timestamp = now > lastTimestampRef.current ? now : lastTimestampRef.current + 1;
      lastTimestampRef.current = timestamp;

      try {
        if (useGestures) {
          const rec = recognizerRef.current;
          if (rec) {
            const res = rec.recognizeForVideo(v, timestamp);
            hands = (res.landmarks ?? []) as Landmark[][];
            handed = (res.handedness ?? []).map((h) => h[0]?.categoryName ?? "Right");
            gestures = (res.gestures ?? []).map((cats) =>
              (cats ?? []).map((cat) => ({
                name: cat.categoryName ?? "None",
                score: typeof cat.score === "number" ? cat.score : 0,
              })),
            );
          }
        } else {
          const t = trackerRef.current;
          if (t) {
            const res = t.detectForVideo(v, timestamp);
            hands = (res.landmarks ?? []) as Landmark[][];
            handed = (res.handedness ?? []).map((h) => h[0]?.categoryName ?? "Right");
          }
        }
        setInferError(null);
      } catch (e) {
        setInferError((e as Error).message || "Inference failed");
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      setHandsVisible(hands.length);
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);

      if (showRef.current && hands.length > 0) {
        const css = getComputedStyle(document.documentElement);
        ctx.strokeStyle = css.getPropertyValue("--accent").trim() || "#f59e0b";
        ctx.fillStyle = css.getPropertyValue("--primary-foreground").trim() || "#ffffff";
        ctx.lineWidth = 3;

        for (const h of hands) {
          if (!h || h.length < 21) continue;
          for (const [a, b] of HAND_CONNECTIONS) {
            if (h[a] && h[b]) {
              ctx.beginPath();
              ctx.moveTo(h[a].x * c.width, h[a].y * c.height);
              ctx.lineTo(h[b].x * c.width, h[b].y * c.height);
              ctx.stroke();
            }
          }
          for (const p of h) {
            if (p) {
              ctx.beginPath();
              ctx.arc(p.x * c.width, p.y * c.height, 4, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      if (useGestures) {
        onGestureRef.current({ landmarks: hands, handedness: handed, gestures });
      } else {
        onFrameRef.current(extractFeatures(hands, handed));
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(
    async (mode: "user" | "environment" = facing) => {
      setError(null);
      setInferError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("unavailable");
        setError(
          "This browser cannot access a camera. Please use HTTPS or localhost on a supported browser.",
        );
        return;
      }

      stop();
      setCamera("requesting");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 960 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) throw new Error("Video element is not mounted");
        v.srcObject = stream;
        await v.play();
        setCamera("live");
      } catch (e) {
        const name = (e as DOMException).name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setCamera("denied");
          setError(
            "Camera permission was denied. Allow camera access in your browser settings to continue.",
          );
        } else if (
          name === "NotFoundError" ||
          name === "DevicesNotFoundError" ||
          name === "OverconstrainedError"
        ) {
          setCamera("unavailable");
          setError("No suitable camera was found on this device.");
        } else if (name === "NotReadableError" || name === "TrackStartError") {
          setCamera("error");
          setError("The camera is currently in use by another application.");
        } else {
          setCamera("error");
          setError((e as Error).message || "Camera access failed");
        }
        return;
      }

      try {
        if (modeRef.current === "gestures") {
          if (!recognizerRef.current) {
            setTracker("loading");
            recognizerRef.current = await loadGestureRecognizer();
          }
        } else {
          if (!trackerRef.current) {
            setTracker("loading");
            trackerRef.current = await loadHandLandmarker();
          }
        }
        setTracker("ready");
        runningRef.current = true;
        loop();
      } catch (e) {
        setTracker("error");
        setError(
          "The hand/gesture model failed to load. Check your network connection and that the model URL is reachable. Details: " +
            ((e as Error).message || "Network/WebGL error"),
        );
      }
    },
    [facing, loop, stop],
  );

  const pause = useCallback(() => stopLoop(), []);
  const resume = useCallback(() => {
    if (camera === "live" && !runningRef.current) {
      runningRef.current = true;
      loop();
    }
  }, [camera, loop]);

  const switchCamera = useCallback(() => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    if (camera === "live") start(next);
  }, [facing, camera, start]);

  useEffect(() => () => stop(), [stop]);

  return {
    videoRef,
    canvasRef,
    camera,
    tracker,
    facing,
    error,
    inferError,
    handsVisible,
    start,
    stop,
    pause,
    resume,
    switchCamera,
  };
}
