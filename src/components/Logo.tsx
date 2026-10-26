import { Hand } from "lucide-react";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-display text-lg font-bold">
      <span className="grid size-8 place-items-center rounded-xl bg-accent text-accent-foreground">
        <Hand className="size-4" />
      </span>
      <span className={light ? "text-ink-foreground" : "text-foreground"}>Sign Companion</span>
    </span>
  );
}
