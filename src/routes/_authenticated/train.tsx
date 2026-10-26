import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Circle, Trash2, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCameraHands } from "@/hooks/use-camera-hands";
import { useSamples } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/train")({
  head: () => ({ meta: [{ title: "Teach signs — Sign Companion" }, { name: "description", content: "Record examples of ISL signs." }] }),
  component: Train,
});

const TARGET = 30;

function Train() {
  const { data: samples } = useSamples();
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const buf = useRef<number[][]>([]);
  const recRef = useRef(false);
  const frame = useRef(0);

  const cam = useCameraHands({
    showLandmarks: true,
    onFrame: (f) => {
      if (!recRef.current || !f) return;
      frame.current++;
      if (frame.current % 2) return; // every other frame for variety
      buf.current.push(f);
      setCount(buf.current.length);
      if (buf.current.length >= TARGET) finish();
    },
  });

  const finish = async () => {
    recRef.current = false;
    setRecording(false);
    const { data: u } = await supabase.auth.getUser();
    const clean = label.trim().toLowerCase().replace(/\s+/g, "_");
    const rows = buf.current.map((features) => ({ user_id: u.user!.id, label: clean, features }));
    buf.current = [];
    const { error } = await supabase.from("sign_samples").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`Saved ${rows.length} samples for "${clean}"`);
    qc.invalidateQueries({ queryKey: ["samples"] });
  };

  const record = () => {
    if (!label.trim()) return toast.info("Type the sign's meaning first.");
    if (!cam.handsVisible) return toast.info("Show your hand(s) to the camera first.");
    buf.current = [];
    setCount(0);
    recRef.current = true;
    setRecording(true);
  };

  const remove = async (l: string) => {
    const { error } = await supabase.from("sign_samples").delete().eq("label", l);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["samples"] });
  };

  const groups = new Map<string, number>();
  (samples ?? []).forEach((s) => groups.set(s.label, (groups.get(s.label) ?? 0) + 1));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold md:text-4xl">Teach your signs</h1>
        <p className="max-w-2xl text-muted-foreground">
          Type a word, perform the ISL sign, and press record. Move slightly while recording so the recognizer learns variations. Record each sign 2–3 times for best results.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-ink">
            <video ref={cam.videoRef} playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
            <canvas ref={cam.canvasRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
            {cam.camera !== "live" && (
              <div className="absolute inset-0 grid place-items-center text-center text-ink-foreground">
                <div>
                  <CameraOff className="mx-auto mb-3 size-10 opacity-60" />
                  <p className="opacity-80">{cam.error ?? "Camera is off"}</p>
                </div>
              </div>
            )}
            {recording && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-destructive px-3 py-1 text-sm text-destructive-foreground">
                <Circle className="size-3 fill-current" /> {count}/{TARGET}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {cam.camera !== "live" ? (
              <Button onClick={() => cam.start("user")}><Camera /> Open camera</Button>
            ) : (
              <Button variant="outline" onClick={cam.stop}>Close camera</Button>
            )}
            <span className="self-center text-sm text-muted-foreground">Hand tracking: {cam.tracker} · hands: {cam.handsVisible}</span>
          </div>
        </div>
        <div className="space-y-5 rounded-2xl border bg-card p-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Sign meaning</p>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. hello, thank you, water" disabled={recording} />
            <Button className="w-full" variant="hero" onClick={record} disabled={cam.camera !== "live" || recording}>
              <Circle className="fill-current" /> {recording ? "Recording…" : "Record samples"}
            </Button>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Your vocabulary ({groups.size})</p>
            <ul className="divide-y">
              {groups.size === 0 && <li className="py-3 text-sm text-muted-foreground">No signs taught yet.</li>}
              {[...groups.entries()].map(([l, n]) => (
                <li key={l} className="flex items-center justify-between py-2">
                  <span className="font-medium">{l.replace(/_/g, " ")}</span>
                  <span className="flex items-center gap-3 text-sm text-muted-foreground">
                    {n} samples
                    <button onClick={() => remove(l)} aria-label={`Delete ${l}`} className="hover:text-destructive"><Trash2 className="size-4" /></button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
