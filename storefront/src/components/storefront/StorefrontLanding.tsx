import { BuilderRenderer } from "@/components/storefront/BuilderRenderer";
import { HeroSection } from "@/components/storefront/HeroSection";
import { HighlightsSection } from "@/components/storefront/HighlightsSection";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { EditorialSection } from "@/components/storefront/EditorialSection";
import { TestimonialsSection } from "@/components/storefront/TestimonialsSection";
import { FaqSection } from "@/components/storefront/FaqSection";
import { CtaSection } from "@/components/storefront/CtaSection";
import type { StorefrontPayload, StorefrontSection } from "@/lib/types";

type StorefrontLandingProps = {
  payload: StorefrontPayload;
  basePath?: string;
};

const renderSection = (section: StorefrontSection, payload: StorefrontPayload, basePath?: string) => {
  switch (section.type) {
    case "hero":
      return (
        <HeroSection
          hero={{
            eyebrow: section.eyebrow,
            title: section.title ?? payload.catalog.hero.title,
            description: section.description ?? payload.catalog.hero.description,
            primaryCta: section.primaryCta ?? payload.catalog.hero.primaryCta,
            secondaryCta: section.secondaryCta ?? payload.catalog.hero.secondaryCta,
            media: section.mediaImage ? { image: section.mediaImage } : payload.catalog.hero.media,
          }}
        />
      );
    case "product-grid":
      return (
        <ProductGrid
          products={payload.products}
          tenant={payload.tenant}
          heading={{
            eyebrow: section.subtitle,
            title: section.title,
            description: section.description,
          }}
          limit={section.limit}
          basePath={basePath}
        />
      );
    case "highlights":
      return (
        <HighlightsSection
          highlights={
            section.items?.map((item) => ({
              title: item.title,
              description: item.description,
              icon: item.icon,
            })) ?? payload.catalog.highlights
          }
          heading={{ title: section.title }}
        />
      );
    case "testimonials":
      return (
        <TestimonialsSection
          testimonials={
            section.items?.map((item) => ({
              quote: item.quote,
              author: item.author,
              role: item.role,
            })) ?? payload.catalog.testimonials
          }
          heading={{ title: section.title, eyebrow: section.subtitle }}
        />
      );
    case "faq":
      return (
        <FaqSection
          faqs={
            section.items?.map((item) => ({
              question: item.question,
              answer: item.answer,
            })) ?? payload.catalog.faqs
          }
          heading={{ title: section.title, eyebrow: section.subtitle }}
        />
      );
    case "cta":
      return (
        <CtaSection
          eyebrow={section.eyebrow}
          title={section.title ?? "Připravení otevřít microshop?"}
          description={section.description}
          cta={section.cta}
        />
      );
    default:
      return null;
  }
};

export const StorefrontLanding = ({ payload, basePath }: StorefrontLandingProps) => {
  if (payload.builder?.html) {
    return <BuilderRenderer builder={payload.builder} products={payload.products} tenant={payload.tenant} />;
  }

  const sections = payload.sections ?? [];

  return (
    <div className="space-y-24">
      {sections.length > 0 ? (
        sections.map((section) => (
          <div key={section.id} className="space-y-24">
            {renderSection(section, payload, basePath)}
          </div>
        ))
      ) : (
        <>
          <HeroSection hero={payload.catalog.hero} />
          <HighlightsSection highlights={payload.catalog.highlights} />
          <ProductGrid products={payload.products} tenant={payload.tenant} basePath={basePath} />
          <EditorialSection editorial={payload.catalog.editorial} />
          <TestimonialsSection testimonials={payload.catalog.testimonials} />
          <FaqSection faqs={payload.catalog.faqs} />
        </>
      )}
    </div>
  );
};
