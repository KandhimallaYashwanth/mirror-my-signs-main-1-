import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, MessageSquareText, Volume2, GraduationCap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign Companion — Indian Sign Language to speech" },
      { name: "description", content: "Sign in front of your camera; Sign Companion turns ISL gestures into sentences and speaks them aloud in English, Hindi or Telugu." },
      { property: "og:title", content: "Sign Companion — Indian Sign Language to speech" },
      { property: "og:description", content: "Real-time ISL recognition, sentence building and text-to-speech." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const steps = [
  { icon: Camera, title: "Sign to the camera", text: "Hand landmarks are tracked live on your device." },
  { icon: MessageSquareText, title: "Build a sentence", text: "Each confirmed sign is added. Edit anything before speaking." },
  { icon: Volume2, title: "Speak it aloud", text: "One tap reads your sentence in English, Hindi or Telugu." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <section className="bg-hero text-ink-foreground">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Logo light />
          <nav className="flex items-center gap-2">
            <Link to="/help" className="px-3 text-sm opacity-80 hover:opacity-100">How it works</Link>
            <Button asChild variant="hero" size="sm"><Link to="/auth">Sign in</Link></Button>
          </nav>
        </header>
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-16 md:pt-24">
          <p className="mb-5 inline-block rounded-full border border-ink-foreground/20 px-3 py-1 text-xs uppercase tracking-widest opacity-80">
            Indian Sign Language · ISL
          </p>
          <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.02] md:text-7xl">
            Your hands speak.<br />
            <span className="text-accent">Now everyone hears.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg opacity-80">
            A digital companion that watches your signs, builds them into sentences, and speaks for you — honestly, with every prediction's confidence shown.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild variant="hero" size="lg" className="h-12 px-8 text-base"><Link to="/auth">Start communicating</Link></Button>
            <Button asChild variant="ghost" size="lg" className="h-12 text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground"><Link to="/help">Read the guide</Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="rounded-2xl border bg-card p-7">
            <div className="mb-6 flex items-center justify-between">
              <s.icon className="size-6 text-primary" />
              <span className="font-display text-4xl font-extrabold text-muted">0{i + 1}</span>
            </div>
            <h3 className="text-xl font-bold">{s.title}</h3>
            <p className="mt-2 text-muted-foreground">{s.text}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-24 md:grid-cols-2">
        <div className="rounded-2xl bg-secondary p-8">
          <GraduationCap className="mb-4 size-6 text-primary" />
          <h3 className="text-2xl font-bold">Teach it your signs</h3>
          <p className="mt-2 text-secondary-foreground/80">Record a few examples of each ISL sign. The recognizer learns your own signing — or connect a trained ISL model service.</p>
        </div>
        <div className="rounded-2xl bg-muted p-8">
          <ShieldCheck className="mb-4 size-6 text-primary" />
          <h3 className="text-2xl font-bold">Private by design</h3>
          <p className="mt-2 text-muted-foreground">Video never leaves your device. Only the sentences you choose to save are stored in your account.</p>
        </div>
      </section>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">Digital Companion for Sign Communication</footer>
    </div>
  );
}
