import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Sign Companion" },
      { name: "description", content: "Sign in or create your Sign Companion account." },
      { property: "og:title", content: "Sign in — Sign Companion" },
      { property: "og:description", content: "Access your sign recognition workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard", data: { display_name: name } },
        });
        if (error) throw error;
        if (data.user && data.user.identities?.length === 0) {
          toast.error("An account with this email already exists. Please sign in instead.");
          setMode("in");
          return;
        }
        toast.success("Account created! Check your email and click the confirmation link before signing in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
        if (error) throw error;
        toast.success("Password reset link sent.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) return toast.error(r.error.message);
    if (r.redirected) return;
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-hero p-10 text-ink-foreground md:flex">
        <Link to="/"><Logo light /></Link>
        <h2 className="text-4xl font-extrabold leading-tight">Every sign,<br /><span className="text-accent">heard clearly.</span></h2>
        <p className="text-sm opacity-70">Indian Sign Language companion</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="md:hidden"><Logo /></div>
          <h1 className="text-3xl font-bold">{mode === "in" ? "Welcome back" : mode === "up" ? "Create account" : "Reset password"}</h1>
          {mode === "up" && (
            <div className="space-y-2"><Label htmlFor="n">Name</Label><Input id="n" value={name} onChange={(e) => setName(e.target.value)} /></div>
          )}
          <div className="space-y-2"><Label htmlFor="e">Email</Label><Input id="e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {mode !== "forgot" && (
            <div className="space-y-2"><Label htmlFor="p">Password</Label><Input id="p" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          )}
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {mode === "in" ? "Sign in" : mode === "up" ? "Sign up" : "Send reset link"}
          </Button>
          {mode !== "forgot" && (
            <Button type="button" variant="outline" className="h-11 w-full" onClick={google}>Continue with Google</Button>
          )}
          <div className="flex justify-between text-sm text-muted-foreground">
            <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="hover:text-foreground">
              {mode === "in" ? "Create an account" : "I have an account"}
            </button>
            {mode === "in" && <button type="button" onClick={() => setMode("forgot")} className="hover:text-foreground">Forgot password?</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
