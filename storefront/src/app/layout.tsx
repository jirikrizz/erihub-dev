import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { getStorefrontPayload } from "@/lib/hub-client";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fontDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const getHost = async () => {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-host");
  const host = forwarded ?? headerList.get("host") ?? "localhost:3000";
  return host;
};

export async function generateMetadata(): Promise<Metadata> {
  const payload = await getStorefrontPayload();
  const seo = payload.microsite.seo ?? {};
  const host = await getHost();

  return {
    title: seo.title ?? payload.microsite.name,
    description:
      seo.description ??
      "Kurátorovaný microshop z HUBu: prémiové produkty, vlastní brand a Stripe checkout během minut.",
    openGraph: {
      title: seo.title ?? payload.microsite.name,
      description:
        seo.description ??
        "Kurátorovaný microshop z HUBu: prémiové produkty, vlastní brand a Stripe checkout během minut.",
      images: seo.ogImage ? [seo.ogImage] : undefined,
      url: `https://${host}`,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title ?? payload.microsite.name,
      description:
        seo.description ??
        "Kurátorovaný microshop z HUBu: prémiové produkty, vlastní brand a Stripe checkout během minut.",
      images: seo.ogImage ? [seo.ogImage] : undefined,
    },
    metadataBase: new URL(`https://${host}`),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const payload = await getStorefrontPayload();
  const locale = payload.tenant.locale ?? "cs-CZ";
  const brand = payload.tenant.brand;

  const brandVars: CSSProperties & Record<string, string> = {
    "--brand-primary": brand?.primary ?? "#6F2CFF",
    "--brand-secondary": brand?.secondary ?? "#0B112B",
    "--brand-accent": brand?.accent ?? "#14B8A6",
    "--brand-surface": brand?.surface ?? "#0F172A",
    "--brand-muted": brand?.muted ?? "#1E293B",
    "--brand-on-primary": brand?.onPrimary ?? "#0B1120",
    "--brand-on-surface": brand?.onSurface ?? "#F8FAFC",
    "--brand-gradient-from": brand?.gradientFrom ?? "rgba(124,58,237,0.65)",
    "--brand-gradient-to": brand?.gradientTo ?? "rgba(8,145,178,0.65)",
  };

  return (
    <html lang={locale}>
      <body
        className={`${fontSans.variable} ${fontDisplay.variable} bg-slate-950 text-slate-100 antialiased`}
        style={brandVars}
      >
        <div className="min-h-screen flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
