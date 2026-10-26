import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Camera, GraduationCap, MessageSquareText, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSamples } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Sign Companion" }, { name: "description", content: "Your sign communication overview." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: profile } = useProfile();
  const { data: samples } = useSamples();
  const { data: convs } = useQuery({
    queryKey: ["conversations", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("id,title,final_sentence,created_at,original_sequence").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });
  const signs = new Set((samples ?? []).map((s) => s.label)).size;
  const totalSigns = (convs ?? []).reduce((n, c) => n + c.original_sequence.length, 0);
  const modelReady = profile?.model_source === "include" ? true : profile?.model_source === "external" ? !!profile.external_model_url : (samples?.length ?? 0) >= 5;

  const stats = [
    { label: "Conversations", value: convs?.length ?? 0, icon: MessageSquareText },
    { label: "Signs recognized", value: totalSigns, icon: Hand },
    { label: "Signs taught", value: signs, icon: GraduationCap },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground">Namaste{profile?.display_name ? `, ${profile.display_name}` : ""}</p>
          <h1 className="text-4xl font-extrabold">Ready to communicate?</h1>
        </div>
        <Button asChild variant="hero" size="lg" className="h-12"><Link to="/recognize"><Camera /> Start live recognition</Link></Button>
      </div>

      <div className={`rounded-2xl p-5 ${modelReady ? "bg-secondary" : "border border-warning bg-warning/10"}`}>
        <p className="font-semibold">Sign model: {modelReady ? (profile?.model_source === "include" ? "Pre-trained ISL model (INCLUDE)" : profile?.model_source === "external" ? "External ISL service connected" : `${signs} custom signs learned`) : "setup required"}</p>
        {!modelReady && (
          <p className="text-sm text-muted-foreground">
            <Link to="/train" className="text-primary underline">Teach signs</Link> or <Link to="/settings" className="text-primary underline">connect a model</Link> before recognition can produce results.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card p-6">
            <s.icon className="mb-4 size-5 text-primary" />
            <p className="font-display text-4xl font-extrabold">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Recent conversations</h2>
          <Link to="/history" className="text-sm text-primary">View all</Link>
        </div>
        <div className="divide-y rounded-2xl border bg-card">
          {(convs ?? []).slice(0, 5).map((c) => (
            <Link key={c.id} to="/history/$id" params={{ id: c.id }} className="block px-5 py-4 hover:bg-muted">
              <p className="font-medium">{c.final_sentence}</p>
              <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
            </Link>
          ))}
          {!convs?.length && <p className="px-5 py-6 text-sm text-muted-foreground">No saved conversations yet.</p>}
        </div>
      </div>
    </div>
  );
}
