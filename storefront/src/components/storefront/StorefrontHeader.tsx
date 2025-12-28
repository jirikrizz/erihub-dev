import Link from "next/link";
import { withSlugBasePath } from "@/lib/base-path";
import { formatDateRelative } from "@/lib/format";
import type { StorefrontHeaderConfig, StorefrontMicrosite, StorefrontPage, Tenant } from "@/lib/types";

interface StorefrontHeaderProps {
  tenant: Tenant;
  microsite: StorefrontMicrosite;
  pages: StorefrontPage[];
  header?: StorefrontHeaderConfig | null;
  lastPublishedAt?: string | null;
  basePath?: string;
}

const fallbackNavigation = (pages: StorefrontPage[]): StorefrontHeaderConfig["navigation"] => {
  const links = [
    { label: "Kolekce", href: "/#kolekce" },
    ...pages
      .filter((page) => page.published)
      .slice(0, 3)
      .map((page) => ({ label: page.title, href: page.path || "/" })),
    { label: "Kontakt", href: "/#kontakt" },
  ];
  return links;
};

export function StorefrontHeader({ tenant, microsite, pages, header, lastPublishedAt, basePath }: StorefrontHeaderProps) {
  if (header?.visible === false) {
    return null;
  }

  const publishedLabel = lastPublishedAt
    ? formatDateRelative(lastPublishedAt, tenant.locale ?? "cs-CZ")
    : "právě teď";
  const pathBase = basePath && basePath !== "/" ? basePath : undefined;

  const navigation = header?.navigation?.length ? header.navigation : fallbackNavigation(pages);
  const title = header?.title ?? tenant.name;
  const subtitle = header?.subtitle ?? microsite.name;

  return (
    <header className="relative z-20 border-b border-white/5">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-6 md:px-8">
        <div className="flex flex-col gap-1">
          <Link
            href={withSlugBasePath("/", pathBase)}
            className="text-lg font-display tracking-tight md:text-xl"
            style={{ color: "var(--brand-on-surface,#F8FAFC)" }}
          >
            {title}
          </Link>
          {subtitle ? (
            <p className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "color-mix(in srgb, var(--brand-on-surface,#F8FAFC) 60%, transparent)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <nav className="hidden items-center gap-6 text-sm font-medium lg:flex" style={{ color: "var(--brand-on-surface,#F8FAFC)" }}>
          {navigation.map((item) => (
            <Link
              key={item.href + item.label}
              href={withSlugBasePath(item.href, pathBase)}
              className="transition hover:opacity-80"
              style={{ color: "inherit" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-4 md:flex">
          {header?.cta ? (
            <Link
              href={withSlugBasePath(header.cta.href, pathBase)}
              className="rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition"
              style={{
                borderColor: "color-mix(in srgb, var(--brand-on-surface,#F8FAFC) 40%, transparent)",
                color: "var(--brand-on-surface,#F8FAFC)",
              }}
            >
              {header.cta.label}
            </Link>
          ) : null}
          {header?.showPublishedBadge ?? true ? (
            <div
              className="text-right text-[0.7rem] uppercase tracking-[0.3em]"
              style={{ color: "color-mix(in srgb, var(--brand-on-surface,#F8FAFC) 60%, transparent)" }}
            >
              <span className="block">Publikováno</span>
              <span style={{ color: "var(--brand-on-surface,#F8FAFC)" }}>{publishedLabel}</span>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
