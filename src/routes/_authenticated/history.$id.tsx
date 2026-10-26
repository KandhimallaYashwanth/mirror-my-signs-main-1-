import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Volume2, Download, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { speak } from "@/lib/speech";
import { downloadText } from "@/lib/export";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/history/$id")({
  head: () => ({ meta: [{ title: "Conversation — Sign Companion" }, { name: "description", content: "Conversation details." }] }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data } = useQuery({
    queryKey: ["conversations", id],
    queryFn: async () => {
      const [c, p] = await Promise.all([
        supabase.from("conversations").select("*").eq("id", id).single(),
        supabase.from("gesture_predictions").select("*").eq("conversation_id", id).order("position"),
      ]);
      if (c.error) throw c.error;
      return { conv: c.data, preds: p.data ?? [] };
    },
  });
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    if (data) {
      setTitle(data.conv.title);
      setText(data.conv.final_sentence);
    }
  }, [data]);
  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  const c = data.conv;

  const save = async () => {
    const { error } = await supabase.from("conversations").update({ title, final_sentence: text, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["conversations"] });
    toast.success("Saved");
  };
  const del = async () => {
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["conversations"] });
    navigate({ to: "/history" });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/history" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> History</Link>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-12 font-display text-2xl font-bold" />
      <p className="text-sm text-muted-foreground">{new Date(c.created_at).toLocaleString()} · {c.language} · model: {c.model_source ?? "—"}</p>
      <div className="rounded-2xl border bg-card p-5">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Original recognized signs</p>
        <div className="flex flex-wrap gap-2">
          {data.preds.map((p) => (
            <span key={p.id} className="rounded-full bg-secondary px-3 py-1 text-sm">{p.label.replace(/_/g, " ")} <span className="opacity-60">{Math.round(p.confidence * 100)}%</span></span>
          ))}
          {!data.preds.length && <span className="text-sm text-muted-foreground">None (typed manually)</span>}
        </div>
        <p className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">Generated sentence</p>
        <p>{c.generated_sentence || "—"}</p>
      </div>
      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Final sentence</p>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="font-display text-xl" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="speak" onClick={() => { const w = speak(text, { lang: c.language, rate: profile?.speech_rate ?? 1, voiceName: profile?.voice_name }); if (w) toast.warning(w); }}><Volume2 /> Speak</Button>
        <Button variant="outline" onClick={save}><Save /> Save changes</Button>
        <Button variant="outline" onClick={() => downloadText(`${title || "conversation"}.txt`, `${title}\n${new Date(c.created_at).toLocaleString()}\nSigns: ${c.original_sequence.join(" ")}\n\n${text}\n`)}><Download /> Export</Button>
        <Button variant="ghost" className="text-destructive" onClick={del}><Trash2 /> Delete</Button>
      </div>
    </div>
  );
}
