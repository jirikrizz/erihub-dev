import { load } from "cheerio";
import { formatCurrency } from "./format";
import type { StorefrontProduct, Tenant } from "./types";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const buildProductCard = (product: StorefrontProduct, tenant: Tenant, cardStyle?: string): string => {
  const price = formatCurrency(product.priceCents, product.priceCurrency ?? tenant.currency, tenant.locale);
  const description = product.excerpt ? `<p>${escapeHtml(product.excerpt)}</p>` : "";
  const subtitle = product.subtitle ? `<p class="microshop-product-eyebrow">${escapeHtml(product.subtitle)}</p>` : "";
  const badge = product.badge ?? product.tags[0];
  const badgeMarkup = badge ? `<span class="microshop-product-badge">${escapeHtml(badge)}</span>` : "";
  const ctaLabel = product.cta?.label ? escapeHtml(product.cta.label) : "Detail";
  const imageMarkup = product.imageUrl
    ? `<img src="${product.imageUrl}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async" />`
    : '<div class="microshop-product-image-placeholder"></div>';

  return `<article class="microshop-product-card"${cardStyle ? ` data-style="${cardStyle}"` : ""}>${badgeMarkup}${imageMarkup}<div class="microshop-product-body">${subtitle}<h3>${escapeHtml(
    product.name
  )}</h3>${description}</div><div class="microshop-product-footer"><span class="price">${price}</span><span class="cta">${ctaLabel}</span></div></article>`;
};

export const renderBuilderHtml = (html: string, products: StorefrontProduct[], tenant: Tenant): string => {
  const $ = load(html);

  $('[data-microshop-block="product-grid"]').each((_, element) => {
    const grid = $(element);
    grid.find("[data-sample]").each((__, sample) => {
      const el = $(sample);
      if (el.is(element)) {
        el.removeAttr("data-sample");
        return;
      }
      if (el.hasClass("grid")) {
        el.removeAttr("data-sample");
        el.empty();
        return;
      }
      el.remove();
    });
    const limitAttr = grid.attr("data-limit");
    const limit = limitAttr ? Number.parseInt(limitAttr, 10) : undefined;
    const cardStyle = grid.attr("data-card-style") ?? undefined;
    grid.find(".grid").remove();
    const gridContainer = $("<div class=\"grid\"></div>");
    grid.append(gridContainer);
    const target = gridContainer;
    products
      .filter((product) => product.available)
      .slice(0, Number.isFinite(limit) && limit ? limit : products.length)
      .forEach((product) => {
        target.append(buildProductCard(product, tenant, cardStyle));
      });
  });

  const body = $("body");
  if (body.length > 0) {
    return body.html() ?? "";
  }

  return $.root().html() ?? html;
};
