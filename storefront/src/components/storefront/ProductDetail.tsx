import Image from "next/image";
import Link from "next/link";
import { withBasePath, withSlugBasePath } from "@/lib/base-path";
import { formatCurrency } from "@/lib/format";
import type { StorefrontPayload, StorefrontProduct } from "@/lib/types";

type ProductDetailViewProps = {
  payload: StorefrontPayload;
  product: StorefrontProduct;
  descriptionHtml: string;
  backHref: string;
  basePath?: string;
};

export const ProductDetailView = ({ payload, product, descriptionHtml, backHref, basePath }: ProductDetailViewProps) => {
  const price = formatCurrency(product.priceCents, product.priceCurrency ?? payload.tenant.currency, payload.tenant.locale);
  const gallery = product.gallery?.length ? product.gallery : product.imageUrl ? [product.imageUrl] : [];
  const checkoutAction = withBasePath("/api/checkout");
  const ctaHref =
    product.cta?.href && product.cta.href.trim() !== "" ? withSlugBasePath(product.cta.href, basePath) : null;
  const ctaLabel = product.cta?.label ?? "Pokračovat na checkout";
  const openInNewTab = ctaHref ? /^https?:\/\//i.test(ctaHref) : false;

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-16 md:px-8">
      <Link href={backHref} className="mb-6 inline-flex items-center text-xs uppercase tracking-[0.35em] text-white/50 hover:text-white/80">
        ← Zpět
      </Link>
      <div className="grid gap-12 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-brand-glass p-6 shadow-brand">
            {gallery.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {gallery.slice(0, 4).map((image, index) => (
                  <div key={image} className={`relative overflow-hidden rounded-2xl border border-white/10 ${index === 0 ? "md:col-span-2" : ""}`}>
                    <Image src={image} alt={`${product.name} vizuál ${index + 1}`} width={900} height={1100} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-72 w-full items-center justify-center rounded-3xl border border-dashed border-white/20 text-white/40">
                Přidej galerii v HUBu
              </div>
            )}
          </div>
          <div className="rounded-[2.5rem] border border-white/10 bg-brand-glass p-10 shadow-brand-soft">
            <h2 className="font-display text-3xl text-white md:text-4xl">Popis rituálu</h2>
            <div className="prose prose-invert prose-atelier mt-6" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
          </div>
        </div>
        <div className="space-y-10">
          <div className="glass-panel rounded-[2.5rem] p-10">
            <span className="text-xs uppercase tracking-[0.35em] text-white/50">Signature vůně</span>
            <h1 className="mt-4 font-display text-4xl text-white md:text-5xl">{product.name}</h1>
            {product.subtitle ? <p className="mt-2 text-xs uppercase tracking-[0.4em] text-white/50">{product.subtitle}</p> : null}
            {product.excerpt ? <p className="mt-4 text-sm leading-relaxed text-white/60">{product.excerpt}</p> : null}
            <div className="mt-10 flex items-center justify-between text-sm font-semibold text-white">
              <span className="text-2xl">{price}</span>
              <span className="text-xs uppercase tracking-[0.35em] text-white/50">SKU {product.sku ?? "—"}</span>
            </div>
            {ctaHref ? (
              <div className="mt-10 flex flex-col gap-4">
                <Link
                  href={ctaHref}
                  className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3 text-sm font-semibold text-brand-on-primary transition hover:opacity-90"
                  target={openInNewTab ? "_blank" : undefined}
                  rel={openInNewTab ? "noopener" : undefined}
                >
                  {ctaLabel}
                </Link>
                {openInNewTab ? <p className="text-xs text-white/40">Odkaz se otevře v nové záložce.</p> : null}
              </div>
            ) : (
              <form action={checkoutAction} method="post" className="mt-10 flex flex-col gap-4">
                <input type="hidden" name="sku" value={product.sku ?? product.id} />
                <input type="hidden" name="quantity" value="1" />
                <button
                  type="submit"
                  className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-brand-on-primary transition hover:opacity-90"
                >
                  {ctaLabel}
                </button>
                <p className="text-xs text-white/40">
                  Checkout probíhá přes Stripe. Po úspěšné platbě se objednávka propíše do HUB CRM.
                </p>
              </form>
            )}
          </div>
          <div className="rounded-[2.5rem] border border-white/10 bg-brand-glass p-8 shadow-brand-soft">
            <h3 className="text-sm uppercase tracking-[0.35em] text-white/50">Notes &amp; pairing</h3>
            <ul className="mt-4 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
              {product.tags.length ? (
                product.tags.map((tag) => (
                  <li key={tag} className="rounded-full border border-white/20 px-4 py-2">
                    {tag}
                  </li>
                ))
              ) : (
                <li className="text-white/40">Přidej tagy v HUBu</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
