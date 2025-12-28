import type { StorefrontFaq } from "@/lib/types";

interface FaqSectionProps {
  faqs?: StorefrontFaq[];
  heading?: {
    title?: string;
    eyebrow?: string;
  };
}

export function FaqSection({ faqs, heading }: FaqSectionProps) {
  if (!faqs?.length) {
    return null;
  }

  return (
    <section id="faq" className="mx-auto mt-24 max-w-5xl px-6 md:px-0">
      <div className="mb-10 text-center">
        <span className="text-xs uppercase tracking-[0.35em] text-white/50">{heading?.eyebrow ?? "FAQ"}</span>
        <h2 className="mt-3 font-display text-3xl text-white md:text-4xl">
          {heading?.title ?? "Nejčastější dotazy k microshopu"}
        </h2>
      </div>
      <div className="space-y-4">
        {faqs.map((faq) => (
          <details
            key={faq.question}
            className="group overflow-hidden rounded-2xl border border-white/10 bg-brand-glass p-6 shadow-brand-soft"
          >
            <summary className="cursor-pointer list-none text-lg font-semibold text-white">
              <div className="flex items-center justify-between gap-4">
                <span>{faq.question}</span>
                <span className="text-sm text-white/50 transition group-open:rotate-45">+</span>
              </div>
            </summary>
            <p className="mt-4 text-sm leading-relaxed text-white/70">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
