import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useProfile, type Profile } from "@/hooks/use-profile";
import { LANGUAGES, speak, speechSupported, voicesFor } from "@/lib/speech";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Sign Companion" }, { name: "description", content: "Language, voice and recognition settings." }] }),
  component: Settings,
});

function Settings() {
  const { data, update } = useProfile();
  const [f, setF] = useState<Partial<Profile>>({});
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => { if (data) setF(data); }, [data]);
  useEffect(() => {
    if (!speechSupported()) return;
    const load = () => setVoices(voicesFor(f.preferred_language ?? "en-IN"));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [f.preferred_language]);
  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  const set = (p: Partial<Profile>) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    try {
      await update({
        display_name: f.display_name, preferred_language: f.preferred_language, speech_rate: f.speech_rate, voice_name: f.voice_name,
        confidence_threshold: f.confidence_threshold, hold_frames: f.hold_frames, show_landmarks: f.show_landmarks,
        model_source: f.model_source, external_model_url: f.external_model_url || null,
      });
      toast.success("Settings saved");
    } catch (e) { toast.error((e as Error).message); }
  };

  const section = "space-y-4 rounded-2xl border bg-card p-6";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold md:text-4xl">Settings</h1>
      <div className={section}>
        <h2 className="text-lg font-bold">Profile</h2>
        <div className="space-y-2"><Label>Display name</Label><Input value={f.display_name ?? ""} onChange={(e) => set({ display_name: e.target.value })} /></div>
      </div>
      <div className={section}>
        <h2 className="text-lg font-bold">Language & voice</h2>
        <div className="space-y-2">
          <Label>Speech language</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2" value={f.preferred_language} onChange={(e) => set({ preferred_language: e.target.value, voice_name: null })}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Voice</Label>
          {voices.length ? (
            <select className="h-9 w-full rounded-md border bg-background px-2" value={f.voice_name ?? ""} onChange={(e) => set({ voice_name: e.target.value || null })}>
              <option value="">Automatic</option>
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          ) : (
            <p className="text-sm text-warning">No voice for this language is installed on this device. The browser default voice will be used.</p>
          )}
        </div>
        <div className="space-y-2"><Label>Speech rate: {f.speech_rate?.toFixed(1)}×</Label><Slider min={0.5} max={1.6} step={0.1} value={[f.speech_rate ?? 1]} onValueChange={([v]) => set({ speech_rate: v })} /></div>
        <Button variant="outline" onClick={() => speak(f.preferred_language === "hi-IN" ? "नमस्ते, आप कैसे हैं?" : f.preferred_language === "te-IN" ? "నమస్తే, మీరు ఎలా ఉన్నారు?" : "Hello, how are you?", { lang: f.preferred_language!, rate: f.speech_rate ?? 1, voiceName: f.voice_name })}>Test voice</Button>
      </div>
      <div className={section}>
        <h2 className="text-lg font-bold">Recognition</h2>
        <div className="space-y-2"><Label>Confidence threshold: {Math.round((f.confidence_threshold ?? 0.75) * 100)}%</Label><Slider min={0.4} max={0.98} step={0.01} value={[f.confidence_threshold ?? 0.75]} onValueChange={([v]) => set({ confidence_threshold: v })} /></div>
        <div className="space-y-2"><Label>Hold time: {f.hold_frames} frames</Label><Slider min={4} max={40} step={1} value={[f.hold_frames ?? 12]} onValueChange={([v]) => set({ hold_frames: v })} /></div>
        <label className="flex items-center gap-3"><Switch checked={!!f.show_landmarks} onCheckedChange={(v) => set({ show_landmarks: v })} /> Show landmarks overlay</label>
      </div>
      <div className={section}>
        <h2 className="text-lg font-bold">Sign model</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {[{ v: "include", t: "Pre-trained ISL model", d: "Trained on the INCLUDE Indian Sign Language dataset. Runs on this device." }, { v: "custom", t: "My taught signs", d: "On-device recognizer trained on your samples." }, { v: "external", t: "External ISL model", d: "A trained model service you host (e.g. FastAPI)." }].map((o) => (
            <button key={o.v} onClick={() => set({ model_source: o.v })} className={`rounded-xl border p-4 text-left ${f.model_source === o.v ? "border-primary bg-secondary" : ""}`}>
              <p className="font-semibold">{o.t}</p><p className="text-sm text-muted-foreground">{o.d}</p>
            </button>
          ))}
        </div>
        {f.model_source === "external" && (
          <div className="space-y-2">
            <Label>Model endpoint URL</Label>
            <Input placeholder="https://your-isl-service.example.com/predict" value={f.external_model_url ?? ""} onChange={(e) => set({ external_model_url: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              Receives POST <code>{"{ sequence: number[][], feature_size: 126 }"}</code> (last ≤30 frames of normalized two-hand landmarks) and must return <code>{"{ label, confidence }"}</code>. Must allow CORS from this site. See Help for details.
            </p>
          </div>
        )}
      </div>
      <Button size="lg" onClick={save}>Save settings</Button>
    </div>
  );
}
