import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & guide — Sign Companion" },
      {
        name: "description",
        content:
          "How to use Sign Companion for Indian Sign Language recognition, teaching signs and connecting a trained model.",
      },
      { property: "og:title", content: "Help & guide — Sign Companion" },
      { property: "og:description", content: "Getting started with ISL recognition and speech." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Help,
});

const items = [
  [
    "1. Teach your signs",
    "Open “Teach signs”, type a word (e.g. hello), perform the ISL sign and press Record. 30 snapshots of your hand shape are saved. Teach several signs, 2–3 recordings each.",
  ],
  [
    "2. Start live recognition",
    "Open “Live”, allow camera access and press Start. Hold a sign steady — the bar fills and the sign is added once it passes your confidence threshold. Lower your hands between signs to repeat the same word.",
  ],

  [
    "3. Correct & speak",
    "On the Sign language (ISL) tab, edit the sentence if needed, choose a language, then press Speak. The Hand gestures (MediaPipe) tab speaks a pretrained gesture only after it is held steady and the accepted label changes — it does not speak every video frame, and it is not Indian Sign Language.",
  ],
  [
    "Hand gestures (MediaPipe)",
    "The Live page’s second tab loads Google’s official Gesture Recognizer model (Closed fist, Open palm, Pointing up, Thumb down, Thumb up, Victory, I love you). When that classifier reports no canned gesture, landmark geometry counts 0–5 raised fingers. Unknown and no-hand frames are shown without treating them as signs. This is a small set of generic gestures, not a full sign-language translator.",
  ],
  [
    "4. Save & review",
    "Save a conversation to keep the original signs, their confidence and your corrected sentence. Search, edit, export or delete it in History.",
  ],
  [
    "Lighting & framing",
    "Use even light, a plain background and keep both hands fully in view. Front and rear cameras are supported on mobile.",
  ],
  [
    "Limitations",
    "The built-in recognizer learns static hand shapes from your own samples; it does not know ISL out of the box. Dynamic, motion-based signs and face/body cues need a trained temporal model connected through Settings → External ISL model.",
  ],
  [
    "Connecting a trained ISL model",
    "Host a service (e.g. FastAPI) that accepts POST JSON { sequence: number[][], feature_size: 126 } — up to 30 frames, each 126 values: left then right hand, 21 MediaPipe points × (x,y,z), relative to the wrist and scaled. Return { label: string | null, confidence: 0–1 } and enable CORS.",
  ],
  [
    "Privacy",
    "Video is processed on your device and never uploaded. Only taught landmark samples and saved conversations are stored in your account.",
  ],
];

function Help() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link to="/">
        <Logo />
      </Link>
      <h1 className="mt-10 text-4xl font-extrabold">How to use Sign Companion</h1>
      <div className="mt-8 space-y-4">
        {items.map(([t, d]) => (
          <div key={t} className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-bold">{t}</h2>
            <p className="mt-1 text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
      <Link to="/dashboard" className="mt-8 inline-block text-primary">
        Go to dashboard →
      </Link>
    </div>
  );
}
