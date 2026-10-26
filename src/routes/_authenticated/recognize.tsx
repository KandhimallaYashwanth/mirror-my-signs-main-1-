import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  Pause,
  Play,
  RefreshCw,
  Square,
  Volume2,
  VolumeX,
  Repeat,
  Save,
  Trash2,
  Undo2,
  AlertTriangle,
  Hand,
  CheckCircle2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useCameraHands } from "@/hooks/use-camera-hands";
import { useProfile, useSamples } from "@/hooks/use-profile";
import {
  KnnClassifier,
  Stabilizer,
  buildSentence,
  predictExternal,
  type Prediction,
} from "@/lib/recognition";
import { LANGUAGES, speak, speechSupported, stopSpeaking } from "@/lib/speech";
import { supabase } from "@/integrations/supabase/client";
import { loadBundledModel, predictWithModel, type IslModel } from "@/lib/isl-model";
import {
  AntiFlickerFilter,
  resolveGestureFrame,
  type GestureFrame,
  resetGestureRecognizerCache,
} from "@/lib/gesture";

export const Route = createFileRoute("/_authenticated/recognize")({
  head: () => ({
    meta: [
      { title: "Live recognition — Sign Companion" },
      { name: "description", content: "Sign to your camera and build a spoken sentence." },
    ],
  }),
  component: Recognize,
});

type Accepted = { label: string; confidence: number };
type PageMode = "isl" | "gestures";

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | "idle";
}) {
  const dot = {
    ok: "bg-success",
    warn: "bg-warning",
    bad: "bg-destructive",
    idle: "bg-muted-foreground",
  }[tone];
  return (
    <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs">
      <span className={`size-2 rounded-full ${dot}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Recognize() {
  const { data: profile } = useProfile();
  const { data: samples } = useSamples();
  const qc = useQueryClient();
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [recognizing, setRecognizing] = useState(false);
  const [live, setLive] = useState<Prediction | null>(null);
  const [gestureMeta, setGestureMeta] = useState<{
    fingers: number;
    source: string;
    handedness: string;
  } | null>(null);
  const [progress, setProgress] = useState(0);
  const [accepted, setAccepted] = useState<Accepted[]>([]);
  const [sentence, setSentence] = useState("");
  const [edited, setEdited] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [lang, setLang] = useState("en-IN");
  const [modelError, setModelError] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<PageMode>("isl");

  useEffect(() => {
    if (profile) {
      setShowLandmarks(profile.show_landmarks);
      setLang(profile.preferred_language);
    }
  }, [profile]);

  const [islModel, setIslModel] = useState<IslModel | null | undefined>(undefined);
  useEffect(() => {
    loadBundledModel().then(setIslModel);
  }, []);
  const externalUrl =
    profile?.external_model_url ||
    (import.meta.env["VITE_ISL_API_URL"] as string | undefined) ||
    "";
  const useExternal = pageMode === "isl" && profile?.model_source === "external" && !!externalUrl;
  const useInclude = pageMode === "isl" && profile?.model_source === "include" && !!islModel;
  const knn = useMemo(
    () => new KnnClassifier((samples ?? []).map((s) => ({ label: s.label, features: s.features }))),
    [samples],
  );
  const modelReady =
    useExternal || useInclude || (profile?.model_source !== "include" && knn.ready);

  const stab = useRef(new Stabilizer(0.75, 12));
  const gestureStab = useRef(new Stabilizer(0.75, 10));
  const prevGestureRef = useRef<string | null>(null);
  const lastSpokenRef = useRef<string | null>(null);
  const antiFlicker = useRef(new AntiFlickerFilter(5));

  useEffect(() => {
    if (profile) {
      stab.current.threshold = profile.confidence_threshold;
      stab.current.holdFrames = useExternal || useInclude ? 2 : profile.hold_frames;
      gestureStab.current.threshold = Math.max(0.65, profile.confidence_threshold);
      gestureStab.current.holdFrames = Math.max(4, Math.min(profile.hold_frames, 12));
    }
  }, [profile, useExternal, useInclude]);

  const recognizingRef = useRef(false);
  recognizingRef.current = recognizing;
  const seq = useRef<number[][]>([]);
  const inflight = useRef(false);
  const lastCall = useRef(0);

  const acceptCommon = (p: Prediction, label: string) => {
    setAccepted((a) => [...a, { label, confidence: p.label ? p.confidence : 0 }]);
    try {
      localStorage.setItem("isl_last_real_inference", new Date().toISOString());
    } catch {
      /* ignore */
    }
  };

  const accept = (p: Prediction) => {
    const r = stab.current.push(p);
    setProgress(r.progress);
    if (r.accepted) acceptCommon(p, r.accepted);
  };

  // Indian Sign Language (ISL) pipeline: completely preserved as an independent recognition option
  const onFrame = (f: number[] | null) => {
    if (!recognizingRef.current) return;
    if (!f) {
      stab.current.push(null);
      setProgress(0);
      setLive(null);
      seq.current = [];
      return;
    }
    if (useInclude && islModel) {
      seq.current.push(f);
      if (seq.current.length > 45) seq.current.shift();
      const now = performance.now();
      if (seq.current.length >= 12 && now - lastCall.current > 300) {
        lastCall.current = now;
        const p = predictWithModel(islModel, seq.current, profile?.confidence_threshold ?? 0.5);
        setLive(p);
        accept(p);
      }
    } else if (useExternal) {
      seq.current.push(f);
      if (seq.current.length > 30) seq.current.shift();
      const now = performance.now();
      if (!inflight.current && seq.current.length >= 10 && now - lastCall.current > 400) {
        inflight.current = true;
        lastCall.current = now;
        predictExternal(externalUrl, [...seq.current])
          .then((p) => {
            setModelError(null);
            setLive(p);
            accept(p);
          })
          .catch((e) => setModelError((e as Error).message))
          .finally(() => (inflight.current = false));
      }
    } else {
      const p = knn.predict(f);
      setLive(p);
      accept(p);
    }
  };

  // Google MediaPipe Gesture Recognizer pipeline: pretrained categories + landmark finger counting
  const onGesture = (frame: GestureFrame) => {
    if (!recognizingRef.current) return;

    if (!frame.landmarks.length) {
      gestureStab.current.push(null);
      const smoothed = antiFlicker.current.push(null);
      if (!smoothed) {
        setLive(null);
        setGestureMeta(null);
        setProgress(0);
        lastSpokenRef.current = null;
        prevGestureRef.current = null;
      }
      return;
    }

    const threshold = profile?.confidence_threshold
      ? Math.max(0.65, profile.confidence_threshold)
      : 0.7;
    const resolved = resolveGestureFrame(frame, threshold);

    if (resolved.source === "unknown" || !resolved.label || resolved.label === "Unknown") {
      const unknownPred: Prediction = { label: "Unknown", confidence: resolved.confidence };
      const smoothedUnknown = antiFlicker.current.push(unknownPred);
      setLive(smoothedUnknown ?? unknownPred);
      setGestureMeta({
        fingers: resolved.fingersCount,
        source: resolved.source,
        handedness: resolved.handedness,
      });
      const r = gestureStab.current.push({ label: null, confidence: 0, reason: "unknown" });
      setProgress(r.progress);
      prevGestureRef.current = null;
      return;
    }

    const rawPred: Prediction = {
      label: resolved.label,
      confidence: resolved.confidence,
    };

    // Smooth prediction continuously across frames to eliminate flickering
    const smoothed = antiFlicker.current.push(rawPred);
    if (smoothed) {
      setLive({ label: smoothed.label, confidence: smoothed.confidence });
      setGestureMeta({
        fingers: resolved.fingersCount,
        source: resolved.source,
        handedness: resolved.handedness,
      });
    }

    const stable = smoothed ?? rawPred;
    if (prevGestureRef.current !== stable.label) {
      gestureStab.current.reset();
      prevGestureRef.current = stable.label as string;
    }

    const r = gestureStab.current.push(stable);
    setProgress(r.progress);

    if (r.accepted && r.accepted !== "Unknown") {
      acceptCommon(stable, r.accepted);

      // Speak only when accepted gesture changes and remains stable; do NOT repeat on every frame
      if (r.accepted !== lastSpokenRef.current) {
        lastSpokenRef.current = r.accepted;
        if (speechSupported()) {
          speak(r.accepted, {
            lang,
            rate: profile?.speech_rate ?? 1,
            voiceName: profile?.voice_name,
          });
        }
      }
    }
  };

  const cam = useCameraHands({
    showLandmarks,
    mode: pageMode === "gestures" ? "gestures" : "hands",
    onFrame,
    onGesture,
  });

  // Reset stabilizers and restart camera when switching mode
  useEffect(() => {
    stab.current.reset();
    gestureStab.current.reset();
    antiFlicker.current.reset();
    prevGestureRef.current = null;
    lastSpokenRef.current = null;
    setLive(null);
    setGestureMeta(null);
    setProgress(0);
    if (cam.camera === "live") cam.start(cam.facing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMode]);

  useEffect(() => {
    if (!edited) setSentence(buildSentence(accepted.map((a) => a.label)));
  }, [accepted, edited]);

  const startRecognition = async () => {
    if (cam.camera !== "live") await cam.start();
    stab.current.reset();
    gestureStab.current.reset();
    antiFlicker.current.reset();
    lastSpokenRef.current = null;
    prevGestureRef.current = null;
    setRecognizing(true);
  };

  const stopAll = () => {
    setRecognizing(false);
    cam.stop();
    setLive(null);
    setGestureMeta(null);
    setProgress(0);
    lastSpokenRef.current = null;
  };

  const retryModelLoad = () => {
    resetGestureRecognizerCache();
    cam.start(cam.facing);
  };

  const doSpeak = () => {
    if (!sentence.trim()) return toast.info("Nothing to speak yet.");
    setSpeaking(true);
    const warn = speak(sentence, {
      lang,
      rate: profile?.speech_rate ?? 1,
      voiceName: profile?.voice_name,
      onEnd: () => setSpeaking(false),
    });
    if (warn) toast.warning(warn);
  };

  const save = async () => {
    if (!sentence.trim()) return toast.info("Build a sentence first.");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const generated = buildSentence(accepted.map((a) => a.label));
    const { data: conv, error } = await supabase
      .from("conversations")
      .insert({
        user_id: u.user.id,
        title: sentence.slice(0, 60),
        original_sequence: accepted.map((a) => a.label),
        generated_sentence: generated,
        final_sentence: sentence,
        language: lang,
        model_source:
          pageMode === "gestures"
            ? "mediapipe-gestures"
            : useInclude
              ? `include-v${islModel!.version}`
              : useExternal
                ? "external"
                : "custom",
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    if (accepted.length) {
      const { error: e2 } = await supabase.from("gesture_predictions").insert(
        accepted.map((a, i) => ({
          conversation_id: conv.id,
          user_id: u.user!.id,
          label: a.label,
          confidence: a.confidence,
          position: i,
        })),
      );
      if (e2) toast.error(e2.message);
    }
    qc.invalidateQueries({ queryKey: ["conversations"] });
    toast.success("Conversation saved");
    setAccepted([]);
    setEdited(false);
    setSentence("");
  };

  const camTone =
    cam.camera === "live"
      ? "ok"
      : cam.camera === "requesting"
        ? "warn"
        : cam.camera === "idle"
          ? "idle"
          : "bad";
  const trTone =
    cam.tracker === "ready"
      ? "ok"
      : cam.tracker === "loading"
        ? "warn"
        : cam.tracker === "error"
          ? "bad"
          : "idle";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">Live recognition</h1>
          <p className="text-muted-foreground">Hold each sign steady until the ring fills.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill label="Camera" value={cam.camera} tone={camTone} />
          <StatusPill label="Hand tracking" value={cam.tracker} tone={trTone} />
          {pageMode === "gestures" ? (
            <StatusPill
              label="Gesture model"
              value={
                cam.tracker === "ready"
                  ? "MediaPipe · Pretrained (7 gestures + fingers)"
                  : cam.tracker === "loading"
                    ? "Loading model…"
                    : cam.tracker === "error"
                      ? "Load error"
                      : "Idle"
              }
              tone={trTone}
            />
          ) : (
            <StatusPill
              label="Sign model"
              value={
                modelReady
                  ? useInclude
                    ? `INCLUDE v${islModel!.version} · ${islModel!.labels.length} signs`
                    : useExternal
                      ? "external"
                      : `${knn.labels.length} signs`
                  : "setup required"
              }
              tone={modelReady ? "ok" : "bad"}
            />
          )}
          <StatusPill
            label="Recognition"
            value={recognizing ? "running" : cam.camera === "live" ? "paused" : "stopped"}
            tone={recognizing ? "ok" : "idle"}
          />
        </div>
      </div>

      <div className="flex w-fit rounded-xl border bg-card p-1">
        <button
          onClick={() => setPageMode("isl")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            pageMode === "isl"
              ? "bg-secondary text-secondary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sign language (ISL)
        </button>
        <button
          onClick={() => setPageMode("gestures")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            pageMode === "gestures"
              ? "bg-secondary text-secondary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Hand className="size-4" /> Hand gestures (MediaPipe)
        </button>
      </div>

      {!modelReady && pageMode === "isl" && (
        <div className="flex items-start gap-3 rounded-xl border border-warning bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">Sign model setup required</p>
            <p className="text-muted-foreground">
              No recognition model is available yet, so no signs will be predicted.{" "}
              <Link to="/train" className="font-medium text-primary underline">
                Teach your signs
              </Link>{" "}
              (at least 5 samples) or{" "}
              <Link to="/settings" className="font-medium text-primary underline">
                choose a sign model in Settings
              </Link>
              .
              {profile?.model_source === "include" &&
                islModel === null &&
                " The pre-trained ISL model file is not available in this app yet."}
            </p>
          </div>
        </div>
      )}

      {pageMode === "gestures" && (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground space-y-1">
          <p>
            Uses Google&apos;s MediaPipe Gesture Recognizer to classify 7 pretrained categories (
            <span className="text-foreground font-medium">
              Closed fist, Open palm, Pointing up, Thumb down, Thumb up, Victory, I love you
            </span>
            ) and calculates 0–5 finger counts from landmark geometry.
          </p>
          <p className="text-xs">
            <span className="font-semibold text-warning">Note:</span> This recognizes generic hand
            gestures and finger counts; it does not translate Indian Sign Language (ISL). For sign
            language, switch to the{" "}
            <span className="font-medium text-foreground">Sign language (ISL)</span> tab above.
          </p>
        </div>
      )}

      {cam.tracker === "error" && (
        <div className="flex items-center justify-between rounded-xl border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0" />
            <span>
              {cam.error ||
                "Failed to load gesture recognition model. Please verify your connection."}
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={retryModelLoad}>
            <RefreshCw className="mr-1 size-3.5" /> Retry
          </Button>
        </div>
      )}

      {useInclude && pageMode === "isl" && (
        <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">
          This page uses the Indian Sign Language model, which knows only {islModel!.labels.length}{" "}
          greeting signs. For American Sign Language (200 words), use{" "}
          <Link to="/asl" className="font-medium text-primary underline">
            ASL Live
          </Link>
          .
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-ink shadow-inner">
            <video
              ref={cam.videoRef}
              playsInline
              muted
              className={`absolute inset-0 h-full w-full object-cover ${cam.facing === "user" ? "-scale-x-100" : ""}`}
            />
            <canvas
              ref={cam.canvasRef}
              className={`absolute inset-0 h-full w-full object-cover ${cam.facing === "user" ? "-scale-x-100" : ""}`}
            />
            {cam.camera !== "live" && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-ink-foreground">
                <div>
                  <CameraOff className="mx-auto mb-3 size-10 opacity-60" />
                  <p className="opacity-80">
                    {cam.error ??
                      (cam.camera === "requesting"
                        ? "Waiting for camera permission…"
                        : "Camera is off")}
                  </p>
                  {cam.camera === "denied" && (
                    <p className="mt-2 text-xs text-warning">
                      Please check camera permissions in your browser URL bar.
                    </p>
                  )}
                </div>
              </div>
            )}
            {cam.camera === "live" && (
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-xl bg-ink/75 px-4 py-3 text-ink-foreground backdrop-blur-md border border-white/10">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] uppercase tracking-widest opacity-60">
                      {cam.handsVisible ? `${cam.handsVisible} hand(s)` : "No hands detected"}
                    </p>
                    {pageMode === "gestures" &&
                      gestureMeta?.fingers !== undefined &&
                      gestureMeta.fingers >= 0 && (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                          {gestureMeta.fingers} finger{gestureMeta.fingers === 1 ? "" : "s"}
                        </span>
                      )}
                    {pageMode === "gestures" && gestureMeta?.handedness && (
                      <span className="text-[10px] opacity-60">· {gestureMeta.handedness}</span>
                    )}
                  </div>
                  <p className="truncate font-display text-xl font-bold">
                    {!recognizing
                      ? "Paused"
                      : live?.label
                        ? live.label.replace(/_/g, " ")
                        : live
                          ? (live as { reason?: string }).reason === "not_trained"
                            ? "Model not ready"
                            : "Unknown"
                          : "—"}
                  </p>
                </div>
                {live?.label && recognizing && (
                  <div className="text-right">
                    <span className="font-mono text-sm font-semibold">
                      {Math.round(live.confidence * 100)}%
                    </span>
                    {progress > 0 && (
                      <p className="text-[10px] text-primary-foreground/70">Hold to accept</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <Progress value={progress * 100} className="h-2 transition-all duration-75" />
          {modelError && (
            <p className="text-sm text-destructive">Model service error: {modelError}</p>
          )}
          {cam.inferError && (
            <p className="text-sm text-destructive">Inference error: {cam.inferError}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!recognizing ? (
              cam.camera === "live" ? (
                <Button
                  onClick={() => {
                    cam.resume();
                    setRecognizing(true);
                  }}
                >
                  <Play className="mr-1.5 size-4" /> Resume
                </Button>
              ) : (
                <Button onClick={startRecognition}>
                  <Camera className="mr-1.5 size-4" /> Start recognition
                </Button>
              )
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setRecognizing(false);
                  cam.pause();
                }}
              >
                <Pause className="mr-1.5 size-4" /> Pause
              </Button>
            )}
            <Button variant="outline" onClick={stopAll} disabled={cam.camera !== "live"}>
              <Square className="mr-1.5 size-4" /> Stop
            </Button>
            <Button variant="ghost" onClick={cam.switchCamera}>
              <RefreshCw className="mr-1.5 size-4" /> Flip camera
            </Button>
            <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <Switch checked={showLandmarks} onCheckedChange={setShowLandmarks} /> Landmarks
            </label>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                Recognized {pageMode === "gestures" ? "gestures" : "signs"}
              </p>
              {accepted.length > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="size-3 text-success" /> {accepted.length} accepted
                </span>
              )}
            </div>
            <div className="flex min-h-12 flex-wrap gap-2 rounded-xl border border-dashed p-2.5">
              {accepted.length === 0 && (
                <span className="text-sm text-muted-foreground self-center">
                  Hold a gesture steady in front of the camera…
                </span>
              )}
              {accepted.map((a, i) => (
                <span
                  key={i}
                  className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground shadow-sm flex items-center gap-1.5"
                >
                  <span>{a.label.replace(/_/g, " ")}</span>
                  <span className="text-xs opacity-60 font-mono">
                    {Math.round(a.confidence * 100)}%
                  </span>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAccepted((a) => a.slice(0, -1))}
                disabled={!accepted.length}
              >
                <Undo2 className="mr-1 size-3.5" /> Undo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAccepted([]);
                  setEdited(false);
                  setSentence("");
                }}
                disabled={!accepted.length}
              >
                <Trash2 className="mr-1 size-3.5" /> Clear
              </Button>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground font-semibold">
              Sentence {edited && "· edited"}
            </p>
            <Textarea
              value={sentence}
              onChange={(e) => {
                setSentence(e.target.value);
                setEdited(true);
              }}
              rows={4}
              className="font-display text-xl resize-none"
              placeholder="Your recognized words will appear here as a sentence…"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">
              Voice speech language
            </label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  Speak in {l.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Speech reads the sentence text as written; it does not translate languages.
          </p>
          <Button
            variant="speak"
            className="h-12 w-full text-base font-semibold"
            onClick={doSpeak}
            disabled={speaking || !sentence.trim()}
          >
            <Volume2 className="mr-2 !size-5" /> Speak sentence
          </Button>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                stopSpeaking();
                setSpeaking(false);
              }}
            >
              <VolumeX className="mr-1 size-4" /> Stop
            </Button>
            <Button variant="outline" onClick={doSpeak} disabled={!sentence.trim()}>
              <Repeat className="mr-1 size-4" /> Repeat
            </Button>
            <Button variant="outline" onClick={save} disabled={!sentence.trim()}>
              <Save className="mr-1 size-4" /> Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
