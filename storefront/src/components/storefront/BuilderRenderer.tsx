import { DEFAULT_BUILDER_CSS } from "@/lib/defaultBuilderCss";
import { renderBuilderHtml } from "@/lib/renderBuilderHtml";
import type { StorefrontProduct, Tenant } from "@/lib/types";

type BuilderRendererProps = {
  builder: {
    html: string;
    css?: string | null;
  };
  products: StorefrontProduct[];
  tenant: Tenant;
};

export const BuilderRenderer = ({ builder, products, tenant }: BuilderRendererProps) => {
  const markup = renderBuilderHtml(builder.html, products, tenant);
  const styles = `${DEFAULT_BUILDER_CSS}\n${builder.css ?? ""}`;

  return (
    <div className="builder-runtime">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="builder-runtime__content" dangerouslySetInnerHTML={{ __html: markup }} />
    </div>
  );
};
