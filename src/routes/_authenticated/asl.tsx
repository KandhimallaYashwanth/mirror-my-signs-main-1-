import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadHandLandmarker } from "@/lib/hand-tracker";
import { aslFrame, aslWord, loadAslModel, predictAsl } from "@/lib/asl-model";
import { speak } from "@/lib/speech";

export const Route = createFileRoute("/_authenticated/asl")({
  head: () => ({
    meta: [
      { title: "ASL live — Sign Companion" },
      { name: "description", content: "Real-time American Sign Language word recognition with automatic speech." },
      { property: "og:title", content: "ASL live — Sign Companion" },
      { property: "og:description", content: "Sign ASL words to your camera and hear them spoken." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AslLive,
});

const MIN_CONF = 0.5; // spoken + shown as recognized
const UNCERTAIN_CONF = 0.2; // shown as "uncertain", never spoken
const REPEAT_MS = 3000; // do not re-speak the same word within this window
const END_GAP = 8; // frames without hands that end a sign
const MIN_FRAMES = 12;
const MAX_FRAMES = 150;

async function loadPose() {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
  return PoseLandmarker.createFromOptions(fs, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

function AslLive() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState("Starting…");
  const [text, setText] = useState<{ word: string; confidence: number } | null>(null);
  const [notRecognized, setNotRecognized] = useState(false);
  const [uncertain, setUncertain] = useState<{ word: string; confidence: number }[] | null>(null);
  const lastSpoken = useRef({ word: "", at: 0 });

  const runId = useRef(0);
  const stop = (msg = "Camera stopped") => {
    runId.current++;
    cancelAnimationFrame(raf.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOn(false);
    setStatus(msg);
  };

  const start = async () => {
    const id = ++runId.current;
    try {
      setStatus("Requesting camera permission…");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
      if (id !== runId.current) return stream.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setOn(true);
      setStatus("Loading recognition models…");
      const [hands, pose] = await Promise.all([loadHandLandmarker(), loadPose(), loadAslModel()]).then(([h, p]) => [h, p] as [HandLandmarker, PoseLandmarker]);
      if (id !== runId.current) return;
      setStatus("Ready — sign a word, then lower your hands");
      run(v, hands, pose);
    } catch (e) {
      const err = e as Error;
      if (id !== runId.current) return;
      stop(err.name === "NotAllowedError" ? "Camera permission denied. Allow camera access and press Start camera." : `Could not start: ${err.message}`);
    }
  };

  const run = (v: HTMLVideoElement, hands: HandLandmarker, pose: PoseLandmarker) => {
    let buf: number[][] = [];
    let gap = 0;
    let busy = false;
    let last = -1;
    const tick = () => {
      if (!streamRef.current) return;
      if (v.readyState >= 2 && v.currentTime !== last) {
        last = v.currentTime;
        const ts = performance.now();
        const h = hands.detectForVideo(v, ts).landmarks ?? [];
        const p = pose.detectForVideo(v, ts).landmarks?.[0];
        const f = h.length ? aslFrame(p, h) : null;
        if (f) {
          buf.push(f);
          gap = 0;
          if (buf.length === 1) setStatus("Watching sign…");
          if (buf.length > MAX_FRAMES) buf.shift();
        } else if (buf.length) {
          gap++;
          if (gap >= END_GAP) {
            const seg = buf;
            buf = [];
            gap = 0;
            if (seg.length >= MIN_FRAMES && !busy) {
              busy = true;
              setStatus("Recognizing…");
              predictAsl(seg)
                .then((r) => {
                  const top = r.top.map((t) => ({ word: aslWord(t.label), confidence: t.confidence }));
                  if (r.confidence >= MIN_CONF) {
                    const word = top[0].word;
                    setText({ word, confidence: r.confidence });
                    setNotRecognized(false);
                    setUncertain(null);
                    const now = Date.now();
                    if (word !== lastSpoken.current.word || now - lastSpoken.current.at > REPEAT_MS) {
                      lastSpoken.current = { word, at: now };
                      speak(word, { lang: "en-US", rate: 1 });
                    }
                  } else if (r.confidence >= UNCERTAIN_CONF) {
                    setNotRecognized(false);
                    setText(null);
                    setUncertain(top);
                  } else {
                    setNotRecognized(true);
                    setUncertain(null);
                  }
                  setStatus("Ready — sign a word, then lower your hands");
                })
                .catch((e) => setStatus(`Model error: ${(e as Error).message}`))
                .finally(() => (busy = false));
            } else setStatus("Ready — sign a word, then lower your hands");
          }
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">ASL live</h1>
          <p className="text-sm text-muted-foreground">200 isolated ASL words (ASL Citizen model). Not continuous sentences or every ASL sign.</p>
        </div>
        {on ? (
          <Button variant="outline" onClick={() => stop()}><CameraOff /> Stop camera</Button>
        ) : (
          <Button onClick={start}><Camera /> Start camera</Button>
        )}
      </div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-ink">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
      </div>
      <div className="rounded-2xl border bg-card p-5">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Status: {status}</p>
        <p className="mt-2 font-display text-4xl font-bold">
          {notRecognized ? "Sign not recognized" : uncertain ? <span className="text-muted-foreground">Uncertain: {uncertain[0].word}?</span> : text ? text.word : "—"}
        </p>
        {uncertain && (
          <p className="text-sm text-muted-foreground">
            Low confidence, not spoken. Closest supported signs: {uncertain.map((u) => `${u.word} ${Math.round(u.confidence * 100)}%`).join(" · ")}
          </p>
        )}
        {text && !notRecognized && <p className="text-sm text-muted-foreground">Confidence {Math.round(text.confidence * 100)}%</p>}
      </div>
    </div>
  );
}
