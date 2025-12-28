interface CtaSectionProps {
  eyebrow?: string;
  title: string;
  description?: string;
  cta?: { label: string; href: string };
}

export const CtaSection = ({ eyebrow, title, description, cta }: CtaSectionProps) => (
  <section className="mx-auto mt-24 max-w-4xl px-6 md:px-0">
    <div className="glass-panel rounded-[2.5rem] border border-white/10 p-12 text-center shadow-brand-soft">
      {eyebrow ? <span className="text-xs uppercase tracking-[0.3em] text-white/50">{eyebrow}</span> : null}
      <h2 className="mt-4 font-display text-4xl text-white md:text-5xl">{title}</h2>
      {description ? <p className="mt-4 text-base leading-relaxed text-white/70">{description}</p> : null}
      {cta ? (
        <a
          href={cta.href}
          className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-8 py-3 text-sm font-semibold text-brand-on-primary transition hover:opacity-90"
        >
          {cta.label}
        </a>
      ) : null}
    </div>
  </section>
);
