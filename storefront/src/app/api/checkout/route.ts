import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getProductBySlug, getStorefrontPayload } from "@/lib/hub-client";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const resolveHost = (request: NextRequest, fallback: string | null): string => {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = forwarded ?? request.headers.get("host") ?? fallback ?? "localhost:3000";
  return `https://${host}`;
};

export async function POST(request: NextRequest) {
  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "Stripe není nakonfigurovaný. Nastav STRIPE_SECRET_KEY v prostředí storefrontu." },
      { status: 503 }
    );
  }

  const payload = await getStorefrontPayload();
  const formData = await request.formData();

  const sku = String(formData.get("sku") ?? "");
  const quantityRaw = Number(formData.get("quantity") ?? 1);
  const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.min(quantityRaw, 10) : 1;

  const product =
    payload.products.find((item) => item.sku === sku || item.id === sku || item.slug === sku) ??
    (await getProductBySlug(sku));

  if (!product) {
    return NextResponse.json({ error: "Produkt nebyl nalezen." }, { status: 404 });
  }

  if (!product.available) {
    return NextResponse.json({ error: "Produkt není aktuálně dostupný." }, { status: 409 });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-10-29.clover",
  });

  const origin = resolveHost(request, payload.tenant.primaryDomain);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: (product.priceCurrency ?? payload.tenant.currency).toLowerCase(),
    line_items: [
      {
        quantity,
        price_data: {
          currency: (product.priceCurrency ?? payload.tenant.currency).toLowerCase(),
          unit_amount: product.priceCents,
          product_data: {
            name: product.name,
            description: product.excerpt ?? undefined,
            images: product.imageUrl ? [product.imageUrl] : undefined,
            metadata: {
              sku: product.sku ?? product.id,
              tenant: payload.tenant.id,
              microsite: payload.microsite.id,
            },
          },
        },
      },
    ],
    success_url: `${origin}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/products/${product.slug}`,
    metadata: {
      tenant: payload.tenant.id,
      microsite: payload.microsite.id,
      product: product.id,
    },
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe session nevrátila adresu. Zkontroluj konfiguraci Stripe účtu." },
      { status: 500 }
    );
  }

  return NextResponse.redirect(session.url);
}
