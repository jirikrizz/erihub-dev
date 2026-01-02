export const DEFAULT_TEMPLATE_HTML = `
<section class="microshop-hero" data-microshop-block="hero">
  <div class="microshop-hero-inner">
    <span class="microshop-hero-badge">Limitovaná kolekce</span>
    <h1>Vůně, které definuje tvou náladu</h1>
    <p>Připravili jsme kurátorovaný výběr niche parfémů, doplňků a dárků pro tvé VIP zákazníky. Vše v jedné elegantní landing page připravené ke sdílení.</p>
    <div class="microshop-hero-actions">
      <a class="microshop-hero-button" href="#">Nakoupit hned</a>
      <a class="microshop-hero-link" href="#">Zobrazit katalog</a>
    </div>
  </div>
  <div class="microshop-hero-image" data-sample></div>
</section>

<section class="microshop-product-grid" data-microshop-block="product-grid" data-columns="3">
  <article class="microshop-product-card" data-sample>
    <div class="microshop-product-image-placeholder"></div>
    <h3>Imperial Oud</h3>
    <p>Lúčne tóny s nádychom ambry a orientálních koření.</p>
    <div class="microshop-product-footer">
      <span class="price">3 490 Kč</span>
      <a class="cta" href="#">Do košíku</a>
    </div>
  </article>
  <article class="microshop-product-card" data-sample>
    <div class="microshop-product-image-placeholder"></div>
    <h3>Rose Noire</h3>
    <p>Zamatová růže se santalovým dřevem a vanilkou.</p>
    <div class="microshop-product-footer">
      <span class="price">2 890 Kč</span>
      <a class="cta" href="#">Do košíku</a>
    </div>
  </article>
  <article class="microshop-product-card" data-sample>
    <div class="microshop-product-image-placeholder"></div>
    <h3>Golden Hour</h3>
    <p>Citrusové osvěžení s ambrovým dozvukem pro každodenní použití.</p>
    <div class="microshop-product-footer">
      <span class="price">3 190 Kč</span>
      <a class="cta" href="#">Do košíku</a>
    </div>
  </article>
</section>

<section class="microshop-benefits" data-microshop-block="benefits">
  <div class="microshop-benefits-inner">
    <article>
      <h4>Kurátorovaný výběr</h4>
      <p>Každý produkt ručně vybíráme podle prodejních dat a preferencí tvých zákazníků.</p>
    </article>
    <article>
      <h4>Prémiové marže</h4>
      <p>Nastav si vlastní ceny a využij předpřipravené balíčky pro rychlé upselling kampaně.</p>
    </article>
    <article>
      <h4>Okamžité sdílení</h4>
      <p>Microshop publikuj na unikátní URL nebo exportuj na vlastní doménu během pár vteřin.</p>
    </article>
  </div>
</section>

<section class="microshop-testimonials" data-microshop-block="testimonial">
  <div class="microshop-testimonials-inner">
    <figure>
      <blockquote>
        "Po letech hledání jsem našla partnera, který mi pomáhá prodávat limitované vůně skutečně osobně."
      </blockquote>
      <figcaption>— Lucia, Praha</figcaption>
    </figure>
    <figure>
      <blockquote>
        "Microshop jsme spustili za 15 minut a hned první den vyprodali celou kolekci."
      </blockquote>
      <figcaption>— Ondřej, Brno</figcaption>
    </figure>
  </div>
</section>

<section class="microshop-cta" data-microshop-block="cta">
  <div class="microshop-cta-inner">
    <h2>Připraveni udělat další krok?</h2>
    <p>Rezervujte si microshop pro své VIP zákazníky a odlište se v každém detailu.</p>
    <a class="microshop-cta-button" href="#">Chci svůj microshop</a>
  </div>
</section>
`;

export const DEFAULT_TEMPLATE_CSS = `
:root {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #10131f;
  background: radial-gradient(circle at top, #eef2ff, #f8f9fd 45%);
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
  max-width: 1080px;
  margin: 4rem auto 3rem;
  padding: 4.5rem clamp(1.5rem, 4vw, 4rem);
  border-radius: 36px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
  background: linear-gradient(140deg, rgba(91, 33, 255, 0.85), rgba(13, 148, 136, 0.65));
  color: #fff;
  position: relative;
  overflow: hidden;
}
.microshop-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 20%, rgba(255,255,255,0.28), transparent 55%);
  pointer-events: none;
}
.microshop-hero-inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.microshop-hero-badge {
  align-self: flex-start;
  padding: 0.5rem 1.25rem;
  border-radius: 999px;
  background: rgba(255,255,255,0.18);
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
}
.microshop-hero h1 {
  font-size: clamp(2.6rem, 5vw, 4rem);
  margin: 0;
}
.microshop-hero p {
  margin: 0;
  max-width: 540px;
  line-height: 1.7;
  font-size: 1.1rem;
}
.microshop-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.microshop-hero-button {
  background: #fff;
  color: #10131f;
  padding: 0.85rem 1.75rem;
  border-radius: 999px;
  font-weight: 600;
  text-decoration: none;
}
.microshop-hero-link {
  color: #fff;
  font-weight: 500;
  text-decoration: none;
}
.microshop-hero-image {
  position: relative;
  z-index: 1;
  min-height: 260px;
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06));
  box-shadow: none;
}

.microshop-product-grid {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 1.5rem 4rem;
  display: grid;
  gap: 2rem;
}
.microshop-product-card {
  background: #fff;
  border-radius: 28px;
  padding: 1.9rem;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: transform 0.25s ease;
}
.microshop-product-card:hover {
  transform: translateY(-6px);
  box-shadow: none;
}
.microshop-product-image-placeholder,
.microshop-product-card img {
  border-radius: 20px;
  height: 220px;
  width: 100%;
  object-fit: cover;
  background: linear-gradient(135deg, rgba(91, 33, 255, 0.12), rgba(13, 148, 136, 0.12));
}
.microshop-product-card h3 {
  margin: 0;
  font-size: 1.25rem;
  color: #10131f;
}
.microshop-product-card p {
  margin: 0;
  color: rgba(16, 19, 31, 0.65);
  line-height: 1.6;
}
.microshop-product-footer {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}
.microshop-product-card .price {
  font-weight: 700;
  font-size: 1.1rem;
  color: #5b21ff;
}
.microshop-product-card .cta {
  padding: 0.65rem 1.75rem;
  border-radius: 999px;
  border: none;
  background: #10131f;
  color: #fff;
  font-weight: 600;
  text-decoration: none;
}

.microshop-benefits {
  max-width: 1080px;
  margin: 0 auto 4rem;
  padding: 0 1.5rem;
}
.microshop-benefits-inner {
  border-radius: 32px;
  background: #10131f;
  color: #fff;
  padding: 3rem;
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.microshop-benefits-inner h4 {
  margin-bottom: 0.5rem;
  font-size: 1.15rem;
}
.microshop-benefits-inner p {
  margin: 0;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.75);
}

.microshop-testimonials {
  max-width: 1080px;
  margin: 0 auto 4rem;
  padding: 0 1.5rem;
}
.microshop-testimonials-inner {
  border-radius: 32px;
  background: #fff;
  padding: 3rem;
  box-shadow: none;
  display: grid;
  gap: 2.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
.microshop-testimonials blockquote {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.7;
}
.microshop-testimonials figcaption {
  margin-top: 1rem;
  font-weight: 600;
  color: #5b21ff;
}

.microshop-cta {
  max-width: 1080px;
  margin: 0 auto 5rem;
  padding: 0 1.5rem;
}
.microshop-cta-inner {
  border-radius: 32px;
  background: linear-gradient(135deg, #5b21ff, #4338ca);
  color: #fff;
  padding: 3.5rem clamp(1.5rem, 4vw, 3.5rem);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.microshop-cta-inner h2 {
  margin: 0;
  font-size: clamp(2.2rem, 4vw, 3.2rem);
}
.microshop-cta-inner p {
  margin: 0;
  line-height: 1.6;
  color: rgba(255,255,255,0.85);
}
.microshop-cta-button {
  align-self: center;
  background: #fff;
  color: #10131f;
  padding: 0.85rem 1.85rem;
  border-radius: 999px;
  font-weight: 600;
  text-decoration: none;
}

@media (max-width: 768px) {
  .microshop-hero {
    margin: 3rem 1rem 2rem;
  }
  .microshop-benefits-inner,
  .microshop-testimonials-inner {
    padding: 2.5rem;
  }
}
`;
