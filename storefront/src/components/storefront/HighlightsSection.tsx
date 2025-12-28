import type { StorefrontHighlight } from "@/lib/types";

const ICONS: Record<string, string> = {
  Sparkles: "✧",
  Diamond: "◇",
  Zap: "⚡",
  Palette: "🎨",
  Shield: "🛡",
};

interface HighlightsSectionProps {
  highlights: StorefrontHighlight[];
  heading?: {
    eyebrow?: string;
    title?: string;
  };
}

export function HighlightsSection({ highlights, heading }: HighlightsSectionProps) {
  if (!highlights.length) {
    return null;
  }

  return (
    <section className="mx-auto mt-20 max-w-6xl px-6 md:px-8">
      {heading ? (
        <div className="mb-8">
          {heading.eyebrow ? (
            <span className="text-xs uppercase tracking-[0.3em] text-white/50">{heading.eyebrow}</span>
          ) : null}
          {heading.title ? <h2 className="font-display text-3xl text-white md:text-4xl">{heading.title}</h2> : null}
        </div>
      ) : null}
      <div className="grid gap-6 md:grid-cols-3">
        {highlights.map((highlight) => (
          <article
            key={highlight.title}
            className="glass-panel relative overflow-hidden rounded-3xl border border-white/10 p-8 transition hover:border-white/30"
          >
            <div className="absolute right-[-60px] top-[-60px] h-40 w-40 rounded-full bg-white/5 blur-2xl" aria-hidden />
            <div className="relative flex h-full flex-col gap-4">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-2xl">
                {ICONS[highlight.icon ?? ""] ?? "✦"}
              </span>
              <h3 className="font-display text-2xl text-white">{highlight.title}</h3>
              {highlight.subtitle ? (
                <p className="text-sm uppercase tracking-[0.3em] text-white/50">{highlight.subtitle}</p>
              ) : null}
              <p className="text-sm leading-relaxed text-white/70">{highlight.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
