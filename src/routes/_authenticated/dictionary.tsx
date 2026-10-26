import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { IslrtcAttribution } from "@/components/IslrtcAttribution";

type Entry = { sign_id: string; isl_label: string; english_meaning: string; hindi_meaning: string; category: string; source: string; video_url: string | null };

export const Route = createFileRoute("/_authenticated/dictionary")({
  head: () => ({ meta: [{ title: "ISL Dictionary — Sign Companion" }, { name: "description", content: "Browse ISLRTC Indian Sign Language dictionary signs you have imported." }] }),
  component: Dictionary,
});

function Dictionary() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  useEffect(() => {
    fetch("/dictionary/islrtc.json").then((r) => (r.ok ? r.json() : { entries: [] })).then((d) => setEntries(Array.isArray(d?.entries) ? d.entries : [])).catch(() => setEntries([]));
  }, []);
  const cats = useMemo(() => Array.from(new Set((entries ?? []).map((e) => e.category).filter(Boolean))).sort(), [entries]);
  const shown = (entries ?? []).filter((e) => (!cat || e.category === cat) && (!q || `${e.english_meaning} ${e.hindi_meaning}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">ISL Dictionary</h1>
        <p className="text-muted-foreground mt-1">Browsing only. A sign listed here is not necessarily one the AI can recognise — see Model status for that.</p>
      </div>
      <IslrtcAttribution />
      {entries === null ? <p className="text-muted-foreground">Loading…</p> : entries.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 space-y-2">
          <h2 className="font-medium">No dictionary signs imported yet</h2>
          <p className="text-sm text-muted-foreground">ISLRTC offers its dictionary only as videos (YouTube, Google Drive, DIKSHA) with no data download. Download the videos you need, run the import script in <code>ml/islrtc</code>, and add the generated list to the app. Signs will appear here once imported.</p>
          <a className="text-sm text-primary underline" href="https://drive.google.com/drive/folders/1U-Pr4r1-cupgNOOq9NH_uTsQnPSVEKco" target="_blank" rel="noreferrer">Open the official ISLRTC video folder</a>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Input className="max-w-xs" placeholder="Search English or Hindi" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="rounded-md border bg-background px-3 text-sm" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All categories</option>
              {cats.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((e) => (
              <li key={e.sign_id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="font-medium">{e.english_meaning}</div>
                {e.hindi_meaning && <div className="text-sm">{e.hindi_meaning}</div>}
                {e.category && <div className="text-xs text-muted-foreground">{e.category}</div>}
                {e.video_url ? <video src={e.video_url} controls preload="none" className="w-full rounded" /> : <p className="text-xs text-muted-foreground">Video not hosted with the app.</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
