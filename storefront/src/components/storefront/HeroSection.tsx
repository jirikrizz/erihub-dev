import Image from "next/image";
import Link from "next/link";
import type { StorefrontHero } from "@/lib/types";

interface HeroSectionProps {
  hero: StorefrontHero;
}

export function HeroSection({ hero }: HeroSectionProps) {
  const renderCta = (label: string, href: string, className: string) => {
    if (!href) {
      return null;
    }

    if (href.startsWith("http")) {
      return (
        <a href={href} className={className} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      );
    }

    const normalized = href.startsWith("#") ? `/${href}` : href;

    return (
      <Link href={normalized} className={className}>
        {label}
      </Link>
    );
  };

  return (
    <section className="relative overflow-hidden rounded-[3rem] border border-white/10 bg-brand-glass px-6 pb-10 pt-16 shadow-brand md:px-12 md:pt-20">
      <div className="absolute left-[-15%] top-[-15%] hidden blur-3xl lg:block" aria-hidden>
        <div className="hero-ring" />
      </div>
      <div className="absolute right-[-10%] top-[5%] hidden blur-3xl lg:block" aria-hidden>
        <div className="hero-ring" />
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 md:grid-cols-[1.2fr_0.9fr]">
        <div className="space-y-8">
          {hero.eyebrow ? (
            <span className="inline-flex items-center rounded-full bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
              {hero.eyebrow}
            </span>
          ) : null}
          <div className="space-y-6">
            <h1 className="max-w-2xl font-display text-4xl leading-tight text-white md:text-5xl lg:text-6xl">
              {hero.title}
            </h1>
            {hero.description ? (
              <p className="max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
                {hero.description}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
            {hero.primaryCta
              ? renderCta(
                  hero.primaryCta.label,
                  hero.primaryCta.href,
                  "rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-on-primary transition hover:opacity-90"
                )
              : null}
            {hero.secondaryCta
              ? renderCta(
                  hero.secondaryCta.label,
                  hero.secondaryCta.href,
                  "rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/60 hover:text-white"
                )
              : null}
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-0 -z-10 scale-110 rounded-3xl bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.3),_transparent_70%)] blur-2xl" aria-hidden />
          <div className="overflow-hidden rounded-3xl border border-white/10 shadow-brand">
            {hero.media?.image ? (
              <Image
                src={hero.media.image}
                alt={hero.media.alt ?? hero.title}
                width={960}
                height={1120}
                className="h-full w-full object-cover"
                priority
              />
            ) : (
              <div className="flex h-full min-h-[380px] items-center justify-center bg-white/5 text-white/50">
                Přidej hero vizuál v HUBu
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
