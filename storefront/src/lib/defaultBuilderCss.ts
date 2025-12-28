export const DEFAULT_BUILDER_CSS = `
:root {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #10131f;
  background: radial-gradient(circle at top, #eef2ff, #f8f9fd 45%);
  --microshop-card-shadow: 0 30px 60px rgba(15, 23, 42, 0.12);
  --microshop-card-radius: 28px;
}
body {
  margin: 0;
  background: transparent;
  color: #10131f;
}
section {
  width: 100%;
}
.microshop-hero {
  position: relative;
  padding: 96px 64px;
  border-radius: 36px;
  background: var(--microshop-hero-bg, linear-gradient(135deg, #0f172a, #1e293b));
  color: #fff;
  overflow: hidden;
  box-shadow: 0 32px 80px rgba(15, 23, 42, 0.45);
  isolation: isolate;
}
.microshop-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--microshop-hero-image, none) center / cover no-repeat;
  opacity: 0.28;
  transform: scale(1.02);
  z-index: 1;
}
.microshop-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--microshop-hero-overlay, radial-gradient(circle at top right, rgba(148, 163, 184, 0.2), transparent 55%));
  pointer-events: none;
  z-index: 2;
}
.microshop-hero-eyebrow {
  display: inline-flex;
  font-size: 14px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  margin-bottom: 16px;
  padding: 8px 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
}
.microshop-hero h1 {
  font-size: clamp(42px, 4vw, 56px);
  line-height: 1.05;
  margin: 0 0 18px;
  max-width: 780px;
}
.microshop-hero p {
  font-size: 18px;
  margin: 0 0 28px;
  max-width: 560px;
  color: rgba(255, 255, 255, 0.86);
}
.microshop-hero .cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 28px;
  border-radius: 999px;
  background: #fff;
  color: #0f172a;
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
}
.microshop-hero[data-align='center'] {
  text-align: center;
  align-items: center;
}
.microshop-hero[data-align='center'] .microshop-hero-eyebrow {
  margin-inline: auto;
}
.microshop-hero[data-align='center'] h1,
.microshop-hero[data-align='center'] p {
  margin-left: auto;
  margin-right: auto;
}
.microshop-hero[data-align='right'] {
  text-align: right;
  align-items: flex-end;
}
.microshop-text {
  padding: 48px;
  border-radius: 28px;
  background: var(--microshop-text-bg, linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 255, 0.9)));
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}
.microshop-text h2 {
  margin: 0 0 16px;
  font-size: 32px;
  color: var(--microshop-text-accent, #0f172a);
}
.microshop-text p {
  margin: 0;
  font-size: 18px;
  color: #334155;
  line-height: 1.6;
}
.microshop-text-eyebrow {
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: var(--microshop-text-accent, #0f172a);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 12px;
  margin-bottom: 12px;
}
.microshop-text[data-align='center'] {
  text-align: center;
}
.microshop-text[data-align='center'] .microshop-text-eyebrow {
  margin-left: auto;
  margin-right: auto;
}
.microshop-product-grid {
  padding: 48px 0;
}
.microshop-product-grid h2 {
  text-align: center;
  margin-bottom: 16px;
  font-size: 34px;
  color: #0f172a;
}
.microshop-product-grid p {
  color: #475569;
  font-size: 16px;
}
.microshop-product-grid .grid {
  display: grid;
  gap: 32px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}
.microshop-product-grid[data-columns='2'] .grid {
  grid-template-columns: repeat(2, minmax(280px, 1fr));
}
.microshop-product-grid[data-columns='4'] .grid {
  grid-template-columns: repeat(4, minmax(220px, 1fr));
}
.microshop-product-card {
  position: relative;
  background: #ffffff;
  border-radius: 28px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--microshop-card-shadow);
  border: 1px solid rgba(15, 23, 42, 0.04);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.microshop-product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 36px 70px rgba(15, 23, 42, 0.16);
}
.microshop-product-card[data-style='glass'],
.microshop-product-grid[data-card-style='glass'] .microshop-product-card {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f8fafc;
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(12px);
}
.microshop-product-card[data-style='minimal'],
.microshop-product-grid[data-card-style='minimal'] .microshop-product-card {
  box-shadow: none;
  border: 1px solid rgba(15, 23, 42, 0.08);
}
.microshop-product-badge {
  position: absolute;
  top: 24px;
  left: 24px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.88);
  color: #fff;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.32);
}
.microshop-product-card img {
  width: 100%;
  border-radius: 22px;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
}
.microshop-product-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 4 / 5;
  border-radius: 22px;
  background: linear-gradient(135deg, #e2e8f0, #f8fafc);
  color: #64748b;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.microshop-product-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 18px 0 8px;
}
.microshop-product-tags span {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: #475569;
}
.microshop-product-card h3 {
  margin: 12px 0 8px;
  font-size: 20px;
  color: #0f172a;
}
.microshop-product-card p {
  color: #475569;
  margin: 0 0 18px;
  min-height: 52px;
  line-height: 1.6;
}
.microshop-product-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.microshop-product-card .price {
  font-weight: 700;
  font-size: 20px;
  color: #0f172a;
}
.microshop-product-card[data-style='glass'] .price,
.microshop-product-grid[data-card-style='glass'] .microshop-product-card .price {
  color: #e2e8f0;
}
.microshop-product-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 12px;
  color: #475569;
  margin: 12px 0 4px;
}
.microshop-product-card[data-style='glass'] .microshop-product-eyebrow,
.microshop-product-grid[data-card-style='glass'] .microshop-product-card .microshop-product-eyebrow {
  color: #cbd5e1;
}
.microshop-product-card .cta {
  display: inline-flex;
  padding: 10px 20px;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.microshop-product-card[data-style='glass'] .cta,
.microshop-product-grid[data-card-style='glass'] .microshop-product-card .cta {
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
}
.microshop-cta {
  padding: 72px;
  border-radius: 32px;
  text-align: center;
  background: linear-gradient(
    135deg,
    var(--microshop-cta-from, #6366f1),
    var(--microshop-cta-to, #22d3ee)
  );
  color: var(--microshop-cta-text, #fff);
  box-shadow: 0 28px 64px rgba(15, 23, 42, 0.24);
}
.microshop-cta p {
  max-width: 520px;
  margin: 14px auto 26px;
  font-size: 18px;
}
.microshop-cta .cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  text-decoration: none;
  font-weight: 600;
}
.microshop-cta[data-align='left'] {
  text-align: left;
}
.microshop-cta[data-align='left'] p {
  margin-left: 0;
}
.microshop-image-banner {
  position: relative;
  border-radius: 36px;
  overflow: hidden;
  min-height: 320px;
  padding: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: #0f172a;
}
.microshop-image-banner::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--microshop-banner-image) center / cover no-repeat;
  opacity: 0.85;
  transform: scale(1.02);
}
.microshop-image-banner::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--microshop-banner-overlay, linear-gradient(135deg, rgba(15, 23, 42, 0.5), rgba(15, 23, 42, 0.2)));
  opacity: var(--microshop-banner-opacity, 1);
}
.microshop-image-banner-content {
  position: relative;
  max-width: 720px;
  text-align: center;
}
.microshop-image-banner[data-align='left'] {
  justify-content: flex-start;
}
.microshop-image-banner[data-align='left'] .microshop-image-banner-content {
  text-align: left;
}
.microshop-image-banner[data-align='right'] {
  justify-content: flex-end;
}
.microshop-image-banner[data-align='right'] .microshop-image-banner-content {
  text-align: right;
}
.microshop-image-banner h2 {
  font-size: clamp(36px, 3.2vw, 52px);
  margin-bottom: 16px;
}
.microshop-image-banner p {
  font-size: 18px;
  margin-bottom: 24px;
  color: rgba(255, 255, 255, 0.86);
}
.microshop-image-banner .cta {
  display: inline-flex;
  padding: 12px 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  color: #0f172a;
  font-weight: 600;
  text-decoration: none;
}
.microshop-split {
  display: flex;
  flex-wrap: wrap;
  gap: 40px;
  align-items: center;
  border-radius: 32px;
  padding: 64px;
  background: var(--microshop-split-bg, linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 255, 0.9)));
  box-shadow: 0 28px 64px rgba(15, 23, 42, 0.1);
}
.microshop-split-media,
.microshop-split-content {
  flex: 1 1 320px;
  min-width: 280px;
}
.microshop-split-media img {
  width: 100%;
  border-radius: 28px;
  object-fit: cover;
  box-shadow: 0 22px 48px rgba(15, 23, 42, 0.18);
}
.microshop-split[data-position='right'] .microshop-split-media {
  order: 2;
}
.microshop-split[data-position='right'] .microshop-split-content {
  order: 1;
}
.microshop-split-eyebrow {
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(79, 70, 229, 0.12);
  color: #4f46e5;
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 16px;
}
.microshop-split h3 {
  font-size: 32px;
  margin: 0 0 16px;
  color: #0f172a;
}
.microshop-split p {
  font-size: 17px;
  color: #475569;
  line-height: 1.6;
  margin-bottom: 20px;
}
.microshop-split-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 22px;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.microshop-split-bullets {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.microshop-split-bullets li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: #1f2937;
}
.microshop-split-bullets li::before {
  content: '•';
  font-size: 20px;
  color: #6366f1;
}
`;
