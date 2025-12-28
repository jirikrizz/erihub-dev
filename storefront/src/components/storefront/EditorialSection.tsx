import { markdownToHtml } from "@/lib/markdown";
import type { StorefrontEditorial } from "@/lib/types";

interface EditorialSectionProps {
  editorial?: StorefrontEditorial;
}

export async function EditorialSection({ editorial }: EditorialSectionProps) {
  if (!editorial) return null;

  const body = await markdownToHtml(editorial.bodyMd);

  return (
    <section className="mx-auto mt-24 max-w-4xl px-6 md:px-0">
      <div className="space-y-6 rounded-[3rem] border border-white/10 bg-brand-glass p-10 shadow-brand-soft">
        <span className="text-xs uppercase tracking-[0.35em] text-white/50">Atelier Insight</span>
        <h2 className="font-display text-3xl text-white md:text-4xl">{editorial.title}</h2>
        <div className="prose prose-invert prose-atelier" dangerouslySetInnerHTML={{ __html: body }} />
      </div>
    </section>
  );
}
