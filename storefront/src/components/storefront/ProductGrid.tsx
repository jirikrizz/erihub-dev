import type { StorefrontProduct, Tenant } from "@/lib/types";
import { ProductCard } from "./ProductCard";

interface ProductGridProps {
  products: StorefrontProduct[];
  tenant: Tenant;
  basePath?: string;
  heading?: {
    eyebrow?: string;
    title?: string;
    description?: string;
  };
  limit?: number;
}

export function ProductGrid({ products, tenant, heading, limit, basePath }: ProductGridProps) {
  const displayed = limit ? products.slice(0, limit) : products;

  if (!displayed.length) {
    return null;
  }

  return (
    <section id="kolekce" className="mx-auto mt-24 max-w-6xl space-y-10 px-6 md:px-8">
      <div className="flex flex-col gap-3">
        <span className="text-xs uppercase tracking-[0.3em] text-white/50">{heading?.eyebrow ?? "Signature kolekce"}</span>
        <h2 className="font-display text-3xl text-white md:text-4xl">{heading?.title ?? "Parfémové duo & kurátorované vůně"}</h2>
        <p className="max-w-2xl text-sm text-white/60">
          {heading?.description ??
            "Seznam produktů se generuje přímo z HUBu. Unifikujeme ceny, popisy i galerii napříč Shoptet, WooCommerce a mobilní aplikací."}
        </p>
      </div>
      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
        {displayed.map((product) => (
          <ProductCard key={product.id} product={product} tenant={tenant} basePath={basePath} />
        ))}
      </div>
    </section>
  );
}
