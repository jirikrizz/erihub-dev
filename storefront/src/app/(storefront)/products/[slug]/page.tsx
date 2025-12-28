import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withBasePath } from "@/lib/base-path";
import { getProductBySlug, getStorefrontPayload } from "@/lib/hub-client";
import { markdownToHtml } from "@/lib/markdown";
import { ProductDetailView } from "@/components/storefront/ProductDetail";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const payload = await getStorefrontPayload();
  const product = payload.products.find((item) => item.slug === slug);

  if (!product) {
    return {
      title: payload.microsite.name,
    };
  }

  return {
    title: `${product.name} | ${payload.microsite.name}`,
    description: product.excerpt ?? payload.microsite.seo?.description ?? "Microsite produkt",
    openGraph: {
      title: `${product.name} | ${payload.microsite.name}`,
      description: product.excerpt ?? payload.microsite.seo?.description ?? "Microsite produkt",
      images: product.imageUrl ? [product.imageUrl] : payload.microsite.seo?.ogImage ? [payload.microsite.seo.ogImage] : undefined,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const payload = await getStorefrontPayload();
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const descriptionHtml = await markdownToHtml(product.descriptionMd ?? product.excerpt ?? "");
  const backHref = withBasePath("/");

  return <ProductDetailView payload={payload} product={product} descriptionHtml={descriptionHtml} backHref={backHref} />;
}
