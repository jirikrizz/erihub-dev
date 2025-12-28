import type { StorefrontTestimonial } from "@/lib/types";

interface TestimonialsSectionProps {
  testimonials?: StorefrontTestimonial[];
  heading?: {
    title?: string;
    eyebrow?: string;
  };
}

export function TestimonialsSection({ testimonials, heading }: TestimonialsSectionProps) {
  if (!testimonials?.length) {
    return null;
  }

  return (
    <section className="mx-auto mt-24 max-w-6xl px-6 md:px-8">
      {heading ? (
        <div className="mb-10 text-center md:text-left">
          {heading.eyebrow ? (
            <span className="text-xs uppercase tracking-[0.3em] text-white/50">{heading.eyebrow}</span>
          ) : null}
          {heading.title ? <h2 className="font-display text-3xl text-white md:text-4xl">{heading.title}</h2> : null}
        </div>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2">
        {testimonials.map((testimonial) => (
          <article
            key={testimonial.author}
            className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-brand-glass p-10 shadow-brand"
          >
            <div className="absolute left-[-32%] top-[-40%] h-80 w-80 rounded-full bg-gradient-to-br from-white/10 to-transparent blur-3xl" />
            <div className="relative flex h-full flex-col gap-6">
              <p className="text-lg leading-relaxed text-white/80">“{testimonial.quote}”</p>
              <div className="space-y-1 text-sm text-white/60">
                <p className="font-semibold text-white">{testimonial.author}</p>
                {testimonial.role ? <p>{testimonial.role}</p> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
