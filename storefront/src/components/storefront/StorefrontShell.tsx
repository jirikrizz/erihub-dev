import type { CSSProperties, ReactNode } from "react";
import { StorefrontHeader } from "@/components/storefront/StorefrontHeader";
import { StorefrontFooter } from "@/components/storefront/StorefrontFooter";
import { DEFAULT_THEME } from "@/lib/types";
import type { StorefrontPayload } from "@/lib/types";

type StorefrontShellProps = {
  payload: StorefrontPayload;
  children: ReactNode;
  basePath?: string;
};

export const StorefrontShell = ({ payload, children, basePath }: StorefrontShellProps) => {
  const theme = payload.theme ?? DEFAULT_THEME;
  const palette = theme.palette;
  const headerVisible = payload.header?.visible ?? true;
  const footerVisible = payload.footer?.visible ?? true;
  const rootStyle: CSSProperties = {
    color: palette.onSurface,
    backgroundColor: palette.background,
    fontFamily: `${theme.typography.sans}, var(--font-sans), system-ui`,
    // CSS variables for components
    ["--brand-primary" as string]: palette.primary,
    ["--brand-secondary" as string]: palette.secondary,
    ["--brand-accent" as string]: palette.accent,
    ["--brand-surface" as string]: palette.surface,
    ["--brand-muted" as string]: palette.muted,
    ["--brand-on-primary" as string]: palette.onPrimary,
    ["--brand-on-surface" as string]: palette.onSurface,
    ["--brand-gradient-from" as string]: palette.gradientFrom,
    ["--brand-gradient-to" as string]: palette.gradientTo,
    ["--brand-background" as string]: palette.background,
  };

  return (
    <div className="min-h-screen bg-[color:var(--brand-background,#020617)] text-[color:var(--brand-on-surface,#F8FAFC)]" style={rootStyle}>
      {headerVisible ? (
        <StorefrontHeader
          tenant={payload.tenant}
          microsite={payload.microsite}
          pages={payload.pages}
          header={payload.header ?? null}
          lastPublishedAt={payload.lastPublishedAt}
          basePath={basePath}
        />
      ) : null}
      <main className="relative flex-1">
        <div className="absolute inset-0 -z-10">
          <div className="blur-beam left-[18%] top-[15%]" />
          <div className="blur-beam right-[25%] top-[35%]" />
        </div>
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-24 pt-12 sm:px-6 md:px-10 lg:px-14">{children}</div>
      </main>
      {footerVisible ? (
        <StorefrontFooter tenant={payload.tenant} pages={payload.pages} footer={payload.footer ?? null} basePath={basePath} />
      ) : null}
    </div>
  );
};
