import type { Editor } from 'grapesjs';

export type MicroshopBlockId = 'hero' | 'feature-grid' | 'benefits' | 'testimonial' | 'cta-banner';

export type MicroshopBlock = {
  id: MicroshopBlockId;
  label: string;
  category: string;
  content: string;
};

export const microshopBlocks: MicroshopBlock[] = [
  {
    id: 'hero',
    label: 'Hero sekce',
    category: 'Microshop',
    content: `
    <section class="microshop-hero" data-microshop-block="hero">
      <div class="hero-badge">Limitovaná kolekce</div>
      <h1>Vôňa, ktorá ťa odnesie</h1>
      <p>Kurátorovaný výber niche parfémov a doplnkov vybraných špeciálne pre VIP klientov.</p>
      <div class="hero-actions">
        <a class="hero-button" href="#">Nakúpiť hneď</a>
        <a class="hero-link" href="#">Pozrieť si katalóg</a>
      </div>
    </section>
    `,
  },
  {
    id: 'feature-grid',
    label: 'Grid produktov',
    category: 'Microshop',
    content: `
    <section class="microshop-product-grid" data-microshop-block="product-grid" data-columns="3">
      <article class="microshop-product-card" data-sample>
        <div class="microshop-product-image-placeholder"></div>
        <h3>Imperial Oud</h3>
        <p>Lúčne tóny s nádychom ambry.</p>
        <div class="microshop-product-footer">
          <span class="price">3 490 Kč</span>
          <a class="cta" href="#">Do košíku</a>
        </div>
      </article>
      <article class="microshop-product-card" data-sample>
        <div class="microshop-product-image-placeholder"></div>
        <h3>Rose Noire</h3>
        <p>Zamatová ruža so santalom.</p>
        <div class="microshop-product-footer">
          <span class="price">2 890 Kč</span>
          <a class="cta" href="#">Do košíku</a>
        </div>
      </article>
      <article class="microshop-product-card" data-sample>
        <div class="microshop-product-image-placeholder"></div>
        <h3>Golden Hour</h3>
        <p>Citrusové osvieženie so štipkou vanilky.</p>
        <div class="microshop-product-footer">
          <span class="price">3 190 Kč</span>
          <a class="cta" href="#">Do košíku</a>
        </div>
      </article>
    </section>
    `,
  },
  {
    id: 'testimonial',
    label: 'Referencie',
    category: 'Microshop',
    content: `
    <section class="testimonial-block" data-microshop-block="testimonial">
      <blockquote>
        <p>"Po rokoch hľadania som konečne objavila vône, ktoré ma definujú. Microshop mi odporučil všetko na mieru."</p>
        <footer>— Lucia, Praha</footer>
      </blockquote>
    </section>
    `,
  },
  {
    id: 'cta-banner',
    label: 'CTA banner',
    category: 'Microshop',
    content: `
    <section class="cta-banner" data-microshop-block="cta">
      <h2>Získaj VIP prístup</h2>
      <p>Staň sa insiderom a maj prístup k limitovaným edíciám skôr ako ostatní.</p>
      <a class="cta-button" href="#">Chcem pozvánku</a>
    </section>
    `,
  },
  {
    id: 'benefits',
    label: 'Výhody',
    category: 'Microshop',
    content: `
    <section class="microshop-benefits" data-microshop-block="benefits">
      <div class="microshop-benefits-inner">
        <article>
          <h4>Kurátorovaný výběr</h4>
          <p>Každý produkt ručně vybíráme podle prodejních dat a preferencí tvých zákazníků.</p>
        </article>
        <article>
          <h4>Prémiové marže</h4>
          <p>Nastav si vlastní ceny a využij předpřipravené balíčky pro upselling kampaně.</p>
        </article>
        <article>
          <h4>Okamžité sdílení</h4>
          <p>Microshop publikuj na unikátní URL nebo exportuj na vlastní doménu během pár vteřin.</p>
        </article>
      </div>
    </section>
    `,
  },
];

export const registerMicroshopBlocks = (editor: Editor) => {
  const blockManager = editor.BlockManager || editor.Blocks;
  if (!blockManager) {
    return;
  }

  microshopBlocks.forEach(({ id, label, category, content }) => {
    blockManager.add(id, {
      label,
      content,
      category: {
        id: 'microshop',
        label: category,
      },
    });
  });
};
