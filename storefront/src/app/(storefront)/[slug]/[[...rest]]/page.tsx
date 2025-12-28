import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { StorefrontLanding } from "@/components/storefront/StorefrontLanding";
import { ProductDetailView } from "@/components/storefront/ProductDetail";
import { withSlugBasePath } from "@/lib/base-path";
import { markdownToHtml } from "@/lib/markdown";
import { getPageByPath, getStorefrontPayload } from "@/lib/hub-client";

interface SlugPageProps {
  params: Promise<{ slug: string; rest?: string[] }>;
}

const resolvePath = async (params: Promise<{ slug: string; rest?: string[] }>) => {
  const { slug, rest } = await params;
  const tail = rest ?? [];
  const path = tail.length > 0 ? `/${tail.join("/")}` : "/";
  return { slug, path };
};

export async function generateMetadata({ params }: SlugPageProps): Promise<Metadata> {
  const { slug, path } = await resolvePath(params);
  const payload = await getStorefrontPayload(slug);
  const segments = path.split("/").filter(Boolean);

  if (segments[0] === "products" && segments[1]) {
    const product = payload.products.find((item) => item.slug === segments[1]);
    if (product) {
      const title = `${product.name} | ${payload.microsite.name}`;
      const description = product.excerpt ?? payload.microsite.seo?.description ?? undefined;
      const images = product.imageUrl
        ? [product.imageUrl]
        : payload.microsite.seo?.ogImage
        ? [payload.microsite.seo.ogImage]
        : undefined;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          images,
        },
      };
    }
  }

  if (path === "/") {
    return {
      title: payload.microsite.name,
      description: payload.microsite.seo?.description ?? undefined,
    };
  }

  const page = await getPageByPath(path, slug);
  if (!page) {
    return {
      title: payload.microsite.name,
      description: payload.microsite.seo?.description ?? undefined,
    };
  }

  return {
    title: `${page.title} | ${payload.microsite.name}`,
    description: page.bodyMd?.slice(0, 160) ?? payload.microsite.seo?.description ?? undefined,
  };
}

export default async function MicrositeSlugPage({ params }: SlugPageProps) {
  const { slug, path } = await resolvePath(params);
  const payload = await getStorefrontPayload(slug);
  const { rest } = await params;
  const segments = rest ?? [];

  if (path === "/") {
    return <StorefrontLanding payload={payload} basePath={`/${slug}`} />;
  }

  if (segments[0] === "products" && segments[1]) {
    const product = payload.products.find((item) => item.slug === segments[1]);
    if (!product) {
      notFound();
    }

    const descriptionHtml = await markdownToHtml(product.descriptionMd ?? product.excerpt ?? "");
    const backHref = withSlugBasePath("/", `/${slug}`);

    return (
      <ProductDetailView
        payload={payload}
        product={product}
        descriptionHtml={descriptionHtml}
        backHref={backHref}
        basePath={`/${slug}`}
      />
    );
  }

  const page = await getPageByPath(path, slug);

  if (!page) {
    notFound();
  }

  const body = await markdownToHtml(page.bodyMd ?? "");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 rounded-[3rem] border border-white/10 bg-brand-glass px-8 py-12 shadow-brand-soft">
      <div className="space-y-3">
        <span className="text-xs uppercase tracking-[0.35em] text-white/50">{payload.tenant.name}</span>
        <h1 className="font-display text-4xl text-white md:text-5xl">{page.title}</h1>
      </div>
      {page.heroImage ? (
        <div className="overflow-hidden rounded-3xl border border-white/10">
          <Image src={page.heroImage} alt={page.title} width={1600} height={900} className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="prose prose-invert prose-atelier" dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  );
}
