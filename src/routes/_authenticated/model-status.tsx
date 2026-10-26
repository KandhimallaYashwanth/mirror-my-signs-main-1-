import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { loadBundledModel, type IslModel } from "@/lib/isl-model";
import { IslrtcAttribution } from "@/components/IslrtcAttribution";

export const Route = createFileRoute("/_authenticated/model-status")({
  head: () => ({ meta: [{ title: "Model status — Sign Companion" }, { name: "description", content: "Measured status of the ISL recognition models and service." }] }),
  component: ModelStatus,
});

type Api = { state: "none" | "checking" | "ok" | "error"; health?: { model_loaded: boolean; error?: string | null }; info?: { version: string; labels: string[]; metrics?: Record<string, unknown> }; error?: string };

function baseOf(url: string) { return url.replace(/\/(predict-sequence|predict)\/?$/, "").replace(/\/$/, ""); }

function ModelStatus() {
  const { data: profile } = useProfile();
  const [bundled, setBundled] = useState<IslModel | null | undefined>(undefined);
  const [dict, setDict] = useState<number | null>(null);
  const [api, setApi] = useState<Api>({ state: "none" });
  const [lastTest, setLastTest] = useState<string | null>(null);
  const url = profile?.external_model_url ?? (import.meta.env["VITE_ISL_API_URL"] as string | undefined) ?? "";

  useEffect(() => {
    loadBundledModel().then(setBundled);
    fetch("/dictionary/islrtc.json").then((r) => r.json()).then((d) => setDict(d.entries?.length ?? 0)).catch(() => setDict(0));
    setLastTest(localStorage.getItem("isl_last_real_inference"));
  }, []);

  async function check() {
    if (!url) return;
    setApi({ state: "checking" });
    const ctl = AbortSignal.timeout(8000);
    try {
      const b = baseOf(url);
      const h = await fetch(`${b}/health`, { signal: ctl }).then((r) => { if (!r.ok) throw new Error(`health ${r.status}`); return r.json(); });
      const info = h.model_loaded ? await fetch(`${b}/model-info`, { signal: ctl }).then((r) => (r.ok ? r.json() : undefined)) : undefined;
      setApi({ state: "ok", health: h, info });
    } catch (e) {
      setApi({ state: "error", error: e instanceof Error ? e.message : "Unreachable" });
    }
  }
  useEffect(() => { if (url) check(); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = bundled?.metrics;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (<div className="flex justify-between gap-4 border-b py-2 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-semibold">Model status</h1>
      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-medium mb-2">ISLRTC dictionary data</h2>
        <Row k="Imported dictionary signs" v={dict ?? "…"} />
        <Row k="ISLRTC-trained model" v="Not trained — ISLRTC has one video per sign; extra recordings are needed (see ml/islrtc/README.md)" />
      </section>
      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-medium mb-2">On-device ISL model</h2>
        {bundled === undefined ? <p className="text-sm text-muted-foreground">Loading…</p> : !bundled ? <p className="text-sm">Not loaded.</p> : (<>
          <Row k="Dataset" v={bundled.dataset} />
          <Row k="Classes in model" v={bundled.labels.length} />
          <Row k="Training status" v={`Trained ${new Date(bundled.trained_at).toLocaleDateString()}`} />
          <Row k="Loading status" v="Loaded" />
          <Row k="Test accuracy (held-out videos)" v={`${Math.round(bundled.metrics.test_accuracy * 100)}% on ${bundled.metrics.n_test_videos} videos`} />
          <Row k="Videos used" v={`${m?.["n_train_videos"] as number | undefined ?? "?"} train / ${m?.["n_val_videos"] as number | undefined ?? "?"} val / ${m?.n_test_videos} test`} />
        </>)}
      </section>
      <section className="rounded-lg border bg-card p-5 space-y-2">
        <h2 className="font-medium">Inference service</h2>
        {!url ? <p className="text-sm text-muted-foreground">No service address set. Deploy the Python service, then add its address in Settings → External ISL model.</p> : (<>
          <Row k="Address" v={<span className="break-all">{url}</span>} />
          <Row k="Connection" v={api.state === "checking" ? "Checking…" : api.state === "ok" ? "Reachable" : api.state === "error" ? `Failed: ${api.error}` : "—"} />
          {api.health && <Row k="Model loaded on service" v={api.health.model_loaded ? "Yes" : `No${api.health.error ? ` (${api.health.error})` : ""}`} />}
          {api.info && <Row k="Classes on service" v={api.info.labels.length} />}
          <Button size="sm" variant="outline" onClick={check}>Re-check</Button>
        </>)}
        <Row k="Last successful real webcam inference" v={lastTest ? new Date(lastTest).toLocaleString() : "None recorded"} />
        <p className="text-xs text-muted-foreground">Recognition counts as ready only after a model loads and a real sign is recognised from the camera.</p>
      </section>
      <IslrtcAttribution />
    </div>
  );
}
