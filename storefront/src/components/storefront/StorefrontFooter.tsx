import Link from "next/link";
import { withSlugBasePath } from "@/lib/base-path";
import type { StorefrontFooterConfig, StorefrontPage, Tenant } from "@/lib/types";

interface StorefrontFooterProps {
  tenant: Tenant;
  pages: StorefrontPage[];
  footer?: StorefrontFooterConfig | null;
  basePath?: string;
}

export function StorefrontFooter({ tenant, pages, footer, basePath }: StorefrontFooterProps) {
  if (footer?.visible === false) {
    return null;
  }

  const pathBase = basePath && basePath !== "/" ? basePath : undefined;
  const links = footer?.links?.length
    ? footer.links
    : pages
        .filter((page) => page.published)
        .slice(0, 4)
        .map((page) => ({ label: page.title, href: page.path || "/" }));
  const contacts = footer?.contactItems?.length ? footer.contactItems : [];

  return (
    <footer className="relative mt-24 border-t border-white/10 bg-brand-glass">
      <div className="absolute inset-0 opacity-40">
        <div className="blur-beam left-[12%] top-[-10%]" />
        <div className="blur-beam right-[10%] top-[20%]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-14 text-[var(--brand-on-surface,#F8FAFC)] md:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md space-y-4">
          <h3 className="font-display text-3xl font-semibold">{footer?.aboutTitle ?? tenant.name}</h3>
          <p className="text-sm leading-relaxed opacity-80">
            {footer?.aboutText ?? "Kurátorovaný výběr microshopů s napojením na HUB a Stripe Checkout."}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-8 text-sm opacity-80 md:w-auto md:grid-cols-1">
          <div className="space-y-3">
            <span className="block text-xs uppercase tracking-[0.3em] opacity-60">{footer?.contactTitle ?? "Kontakt"}</span>
            <div className="space-y-2">
              {contacts.length === 0 ? (
                <p>support@krasnevune.cz</p>
              ) : (
                contacts.map((item) => (
                  <p key={item.label}>
                    <span className="opacity-70">{item.label}: </span>
                    <span>{item.value}</span>
                  </p>
                ))
              )}
            </div>
          </div>
          <div className="space-y-3">
            <span className="block text-xs uppercase tracking-[0.3em] opacity-60">Navigace</span>
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link.label + link.href}>
                  <Link href={withSlugBasePath(link.href, pathBase)} className="transition hover:opacity-80" style={{ color: "inherit" }}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="relative border-t border-white/10 py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-6 text-xs opacity-60 md:flex-row md:items-center md:px-8">
          <span>
            © {new Date().getFullYear()} {tenant.name}. Všechna práva vyhrazena.
          </span>
          <span>Microshop powered by HUB • Data-driven storefront</span>
        </div>
      </div>
    </footer>
  );
}
