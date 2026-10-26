export const LANGUAGES = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "हिन्दी (Hindi)" },
  { code: "te-IN", label: "తెలుగు (Telugu)" },
];

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getVoices(): SpeechSynthesisVoice[] {
  return speechSupported() ? window.speechSynthesis.getVoices() : [];
}

export function voicesFor(lang: string) {
  const base = lang.split("-")[0];
  return getVoices().filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(base));
}

/** Speaks text, cancelling any current speech first. Returns a warning if no voice for the language. */
export function speak(text: string, opts: { lang: string; rate: number; voiceName?: string | null; onEnd?: () => void }) {
  if (!speechSupported()) return "Speech is not supported in this browser.";
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts.lang;
  u.rate = opts.rate;
  const matches = voicesFor(opts.lang);
  const v = matches.find((x) => x.name === opts.voiceName) ?? matches[0];
  if (v) u.voice = v;
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  window.speechSynthesis.speak(u);
  return matches.length ? null : `No ${opts.lang} voice installed on this device; using the default voice.`;
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
