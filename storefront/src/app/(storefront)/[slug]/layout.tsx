import type { ReactNode } from "react";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { getStorefrontPayload } from "@/lib/hub-client";

export default async function SlugLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payload = await getStorefrontPayload(slug);

  return <StorefrontShell payload={payload} basePath={`/${slug}`}>{children}</StorefrontShell>;
}
