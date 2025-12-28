import Image from "next/image";
import Link from "next/link";
import { withSlugBasePath } from "@/lib/base-path";
import { formatCurrency } from "@/lib/format";
import type { StorefrontProduct, Tenant } from "@/lib/types";

interface ProductCardProps {
  product: StorefrontProduct;
  tenant: Tenant;
  basePath?: string;
}

export function ProductCard({ product, tenant, basePath }: ProductCardProps) {
  const price = formatCurrency(product.priceCents, product.priceCurrency ?? tenant.currency, tenant.locale);
  const detailsHref = withSlugBasePath(`/products/${product.slug}`, basePath);
  const badge = product.badge ?? product.tags[0] ?? "kolekce";
  const ctaLabel = product.cta?.label ?? "Detail";

  return (
    <Link
      href={detailsHref}
      className="group flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-brand-glass transition hover:border-white/40"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 33vw, 100vw"
            className="object-cover transition duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/5 text-white/40">
            Přidej obrázek produktu
          </div>
        )}
        {badge ? (
          <div className="absolute left-4 top-4 inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
            {badge}
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="space-y-2">
          {product.subtitle ? (
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/40">{product.subtitle}</p>
          ) : null}
          <h3 className="font-display text-2xl text-white">{product.name}</h3>
          {product.excerpt ? <p className="text-sm text-white/60">{product.excerpt}</p> : null}
        </div>
        <div className="mt-auto flex items-center justify-between text-sm font-semibold text-white">
          <span>{price}</span>
          <span className="relative inline-flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-white/60">
            {ctaLabel}
            <span className="h-px w-8 bg-gradient-to-r from-white/30 to-white" />
          </span>
        </div>
      </div>
    </Link>
  );
}
