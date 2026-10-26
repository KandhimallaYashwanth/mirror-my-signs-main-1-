import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Search, Trash2, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { downloadText } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/history/")({
  head: () => ({ meta: [{ title: "History — Sign Companion" }, { name: "description", content: "Your saved conversations." }] }),
  component: History,
});

function History() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data } = useQuery({
    queryKey: ["conversations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const list = (data ?? []).filter((c) => {
    const t = q.toLowerCase();
    if (t && !c.title.toLowerCase().includes(t) && !c.final_sentence.toLowerCase().includes(t)) return false;
    const d = c.created_at.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  const del = async (id: string) => {
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["conversations"] });
  };
  const clearAll = async () => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("conversations").delete().eq("user_id", u.user!.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["conversations"] });
    toast.success("History cleared");
  };
  const exportAll = () =>
    downloadText("conversations.txt", list.map((c) => `[${new Date(c.created_at).toLocaleString()}] ${c.title}\nSigns: ${c.original_sequence.join(" ")}\n${c.final_sentence}\n`).join("\n"));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold md:text-4xl">Conversation history</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportAll} disabled={!list.length}><Download /> Export</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline" disabled={!data?.length}><Trash2 /> Clear all</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all history?</AlertDialogTitle>
                <AlertDialogDescription>This permanently deletes every saved conversation.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clearAll}>Delete all</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>
      <div className="divide-y rounded-2xl border bg-card">
        {list.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-5 py-4">
            <Link to="/history/$id" params={{ id: c.id }} className="min-w-0 flex-1">
              <p className="truncate font-medium">{c.title}</p>
              <p className="truncate text-sm text-muted-foreground">{c.final_sentence}</p>
              <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
            </Link>
            <button onClick={() => del(c.id)} aria-label="Delete" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
          </div>
        ))}
        {!list.length && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No conversations found.</p>}
      </div>
    </div>
  );
}
