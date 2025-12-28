import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import FALLBACK_PAYLOAD from "./fallback-data";
import type { StorefrontPage, StorefrontPayload, StorefrontProduct } from "./types";

const HUB_API_URL = process.env.HUB_API_URL ?? process.env.NEXT_PUBLIC_HUB_API_URL;
const HUB_API_TOKEN = process.env.HUB_API_TOKEN ?? process.env.NEXT_PUBLIC_HUB_API_TOKEN;

const sanitizeHost = (host: string | null): string => {
  if (!host) return "localhost";
  return host.replace(/https?:\/\//, "").split(":")[0].trim().toLowerCase();
};

const hubFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  if (!HUB_API_URL) {
    throw new Error("HUB_API_URL is not configured");
  }

  const url = new URL(path, HUB_API_URL);
  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(HUB_API_TOKEN ? { Authorization: `Bearer ${HUB_API_TOKEN}` } : {}),
      ...init.headers,
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hub request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
};

const applyLandingOverrides = (payload: StorefrontPayload): StorefrontPayload => {
  // D55f… = nový slovenský landing pre Plačkovú & Rendyho
  if (payload.microsite.id !== "d55f8c60-05c8-4a02-9e7e-a749d91dd1e2") {
    return payload;
  }

  const css = `
  /* VŠECHNO JE NAVÁZANÉ NA .kv-pl-landing, NEMĚLO BY OVLIVNIT ZBYTEK WEBU */

  .kv-pl-landing {
    position: relative;
    padding: 3rem 0 4rem;
    color: #ffffff;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI",
      sans-serif;
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.06), transparent 55%),
      radial-gradient(circle at bottom right, rgba(211, 155, 255, 0.08), transparent 60%);
  }

  .kv-pl-landing * {
    box-sizing: border-box;
  }

  .kv-pl-landing a {
    text-decoration: none;
  }

  .kv-pl-landing img {
    max-width: none;
    width: auto;
    display: block;
  }

  .kv-pl-landing-container {
    max-width: 1180px;
    margin: 0 auto;
    padding: 0 1.5rem;
  }

  .kv-pl-section {
    padding: 3.5rem 0;
  }

  @media (min-width: 992px) {
    .kv-pl-section {
      padding: 4.5rem 0;
    }
  }

  .kv-pl-heading {
    font-weight: 800;
    letter-spacing: 0.02em;
  }

  .kv-pl-heading-xl {
    font-size: clamp(2.4rem, 3.4vw, 3.35rem);
    line-height: 1.04;
    margin-bottom: 0.9rem;
  }

  .kv-pl-heading-lg {
    font-size: clamp(1.9rem, 2.6vw, 2.45rem);
    line-height: 1.1;
    margin-bottom: 0.45rem;
  }

  .kv-pl-heading-sm {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: #b6b6c7;
    margin-bottom: 0.6rem;
  }

  .kv-pl-text {
    font-size: 1.02rem;
    line-height: 1.68;
    color: #e0e0ec;
  }

  .kv-pl-text-muted {
    font-size: 0.94rem;
    color: #c7c7d8;
  }

  /* BADGE */

  .kv-pl-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.18rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: #d0d0df;
    background: radial-gradient(circle at top left, rgba(255, 75, 125, 0.22), transparent);
    margin-bottom: 1.1rem;
  }

  .kv-pl-badge-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: linear-gradient(90deg, #ff4b7d, #d39bff);
  }

  /* BUTTONS */

  .kv-pl-btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }

  .kv-pl-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.85rem 1.65rem;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: 1px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.18s ease-out;
  }

  .kv-pl-btn-primary {
    background: linear-gradient(90deg, #ff4b7d, #d39bff);
    color: #ffffff;
    box-shadow: 0 12px 30px rgba(255, 75, 125, 0.45);
  }

  .kv-pl-btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 18px 40px rgba(255, 75, 125, 0.6);
    filter: brightness(1.04);
  }

  .kv-pl-btn-outline {
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.4);
    background: rgba(10, 10, 18, 0.7);
    backdrop-filter: blur(10px);
  }

  .kv-pl-btn-outline:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  /* HERO – OBA NAHOŘE */

  .kv-pl-hero {
    padding-top: 2.75rem;
    padding-bottom: 3.5rem;
  }

  .kv-pl-hero-inner {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.1fr);
    gap: 2.7rem;
    align-items: center;
  }

  @media (max-width: 880px) {
    .kv-pl-hero-inner {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .kv-pl-hero-subtitle {
    max-width: 36rem;
    margin-bottom: 1.5rem;
  }

  .kv-pl-hero-benefits {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.4rem;
    font-size: 0.9rem;
    color: #e2e2ef;
    font-weight: 600;
    margin-top: 1.1rem;
    margin-bottom: 0.6rem;
  }

  .kv-pl-hero-benefit {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .kv-pl-hero-benefit-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.7);
  }

  .kv-pl-hero-note {
    font-size: 0.94rem;
    color: #d0d0e0;
    margin-top: 0.8rem;
  }

  .kv-pl-hero-meta-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 1rem;
    margin-top: 1rem;
    padding: 0.75rem 0;
  }
  .kv-pl-hero-meta-item {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.85rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #e4e4f0;
    font-size: 0.86rem;
    font-weight: 600;
  }
  .kv-pl-hero-meta-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: linear-gradient(90deg, #ff4b7d, #d39bff);
  }

  .kv-pl-hero-visual {
    position: relative;
  }

  .kv-pl-hero-gallery {
    display: grid;
    grid-template-columns: 1.15fr 0.95fr;
    gap: 0.75rem;
  }

  @media (max-width: 700px) {
    .kv-pl-hero-gallery {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .kv-pl-hero-photo-main {
    position: relative;
    border-radius: 28px;
    overflow: hidden;
    box-shadow: 0 28px 60px rgba(0, 0, 0, 0.95);
  }

  .kv-pl-hero-photo-main img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .kv-pl-hero-photo-side {
    display: grid;
    grid-template-rows: 1fr 1fr;
    gap: 0.75rem;
  }

  .kv-pl-hero-photo {
    border-radius: 22px;
    overflow: hidden;
    box-shadow: 0 22px 50px rgba(0, 0, 0, 0.9);
  }

  .kv-pl-hero-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .kv-pl-hero-floating {
    position: absolute;
    right: 6%;
    bottom: -1.2rem;
    transform: translateY(0);
    width: min(425px, 78%);
    border-radius: 18px;
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.09), transparent 58%),
      rgba(3, 3, 9, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-shadow: 0 22px 55px rgba(0, 0, 0, 0.95);
    padding: 0.7rem 0.9rem;
    display: flex;
    gap: 0.65rem;
    align-items: center;
    backdrop-filter: blur(14px);
  }

  @media (max-width: 700px) {
    .kv-pl-hero-floating {
      position: static;
      margin-top: 0.9rem;
      width: 100%;
    }
  }

  .kv-pl-hero-floating-img-row {
    display: flex;
    gap: 0.4rem;
  }

  .kv-pl-hero-floating-img {
    width: 80px;
    flex-shrink: 0;
    position: static;
  }

  .kv-pl-hero-floating-img img {
    max-width: none;
    max-height: 170px;
    object-fit: contain;
    filter: drop-shadow(0 14px 26px rgba(0, 0, 0, 0.9));
    position: absolute;
    top: -55px;
  }

  /* Mobile tweaks */
  @media (max-width: 768px) {
    .kv-pl-hero-floating-img {
      width: 40px;
    }
    .kv-pl-hero-floating-img img {
      max-height: 130px;
      top: -15px;
    }
    /* targeting first and second by order */
    .kv-pl-hero-floating-img:first-child img {
      left: -60px !important;
    }
    .kv-pl-hero-floating-img:nth-child(2) img {
      left: -20px;
    }
  }

  .kv-pl-hero-floating-text {
    font-size: 0.8rem;
    color: #c3c3d4;
  }

  .kv-pl-hero-floating-text strong {
    display: block;
    color: #ffffff;
    font-size: 0.85rem;
    margin-bottom: 0.1rem;
  }

  .kv-pl-hero-floating-text span {
    display: block;
  }

  /* SPLIT SECTIONS (PLAČKOVÁ / RENDY) */

  .kv-pl-split-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.1fr);
    gap: 2.7rem;
    align-items: center;
  }

  @media (max-width: 900px) {
    .kv-pl-split-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .kv-pl-photo-grid {
    display: grid;
    grid-template-columns: 1.3fr 0.9fr;
    grid-template-rows: auto auto;
    gap: 0.75rem;
  }

  @media (max-width: 600px) {
    .kv-pl-photo-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .kv-pl-photo-main {
    grid-column: 1 / 2;
    grid-row: 1 / 3;
    border-radius: 26px;
    overflow: hidden;
    box-shadow: 0 26px 60px rgba(0, 0, 0, 0.95);
  }

  .kv-pl-photo-main img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .kv-pl-photo-small {
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 22px 48px rgba(0, 0, 0, 0.9);
  }

  .kv-pl-photo-small img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .kv-pl-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 1rem;
    margin-bottom: 1rem;
  }

  .kv-pl-pill {
    font-size: 0.82rem;
    padding: 0.3rem 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(5, 5, 15, 0.85);
    color: #e4e4f0;
    font-weight: 600;
  }

  .kv-pl-inline-chip {
    display: inline-flex;
    align-items: center;
    padding: 0.18rem 0.55rem;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.7);
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-right: 0.45rem;
    color: #e5e7eb;
  }

  /* PRODUKTOVÉ BLOKY – FOTO + FLAKÓN */

  .kv-pl-product-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
    gap: 2.6rem;
    align-items: center;
  }

  .kv-pl-product-grid.kv-pl-reverse {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.95fr);
  }

  @media (max-width: 880px) {
    .kv-pl-product-grid,
    .kv-pl-product-grid.kv-pl-reverse {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .kv-pl-product-meta {
    font-size: 0.88rem;
    color: #a3a3b5;
    margin-top: 0.4rem;
  }

  .kv-pl-product-meta span {
    color: #ffffff;
    font-weight: 600;
  }

  .kv-pl-product-visual {
    max-width: 400px;
    margin: 0 auto;
    border-radius: 24px;
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.12), transparent 56%),
      rgba(4, 4, 10, 0.96);
    padding: 1.3rem 1.4rem 1rem;
    box-shadow: 0 22px 55px rgba(0, 0, 0, 0.95);
    position: relative;
    overflow: hidden;
  }

  .kv-pl-product-visual-dark {
    background:
      radial-gradient(circle at top, rgba(0, 0, 0, 0.9), transparent 60%),
      rgba(0, 0, 0, 0.98);
  }

  .kv-pl-product-tag {
    position: absolute;
    top: 0.8rem;
    left: 0.9rem;
    font-size: 0.72rem;
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(0, 0, 0, 0.75);
    color: #b6b6c7;
    backdrop-filter: blur(8px);
  }

  .kv-pl-product-tag strong {
    color: #ffffff;
  }

  .kv-pl-product-img-main {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    overflow: hidden;
    height: 220px;
    margin: 0 auto;
  }

  .kv-pl-product-img-main img {
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.9));
    position: absolute;
    top: 0;
    z-index: 0;
    max-width: none;
  }

  .kv-pl-product-img-alt {
    display: flex;
    justify-content: flex-end;
    opacity: 1;
    position: relative;
    height: 140px;
    width: auto;
    overflow: hidden;
  }

  .kv-pl-product-img-alt img {
    height: 155px;
    position: absolute;
    object-fit: contain;
    filter: drop-shadow(0 18px 30px rgba(0, 0, 0, 0.9));
    width: auto;
    z-index: 9;
  }

  /* ZÁVĚREČNÁ CTA */

  .kv-pl-final {
    background: radial-gradient(circle at top, #ff4b7d, #9a3ad0);
    margin-top: 1rem;
  }

  .kv-pl-final-inner {
    text-align: center;
    max-width: 640px;
    margin: 0 auto;
  }

  .kv-pl-final-inner h2 {
    margin-bottom: 0.5rem;
  }

  .kv-pl-final-inner p {
    margin-bottom: 1.5rem;
    font-size: 0.96rem;
    color: rgba(255, 255, 255, 0.92);
  }

  .kv-pl-final .kv-pl-btn-outline {
    border-color: rgba(255, 255, 255, 0.9);
    color: #ffffff;
  }

  /* Mobilné zjednodušenie */
  @media (max-width: 700px) {
    .kv-pl-section { padding: 2.6rem 0; }
    .kv-pl-heading-xl { font-size: clamp(1.9rem, 6vw, 2.3rem); }
    .kv-pl-heading-lg { font-size: clamp(1.6rem, 4.8vw, 1.9rem); }
    .kv-pl-text { font-size: 0.96rem; line-height: 1.6; }
    .kv-pl-text-muted { font-size: 0.9rem; }
    .kv-pl-btn-row { flex-direction: column; align-items: stretch; }
    .kv-pl-btn { width: 100%; justify-content: center; }
    .kv-pl-hero-gallery { grid-template-columns: 1fr; }
    .kv-pl-hero-photo-side { display: none; }
    .kv-pl-hero-floating { position: static; margin-top: 1rem; width: 100%; }
    .kv-pl-product-img-main { height: 190px; }
    .kv-pl-product-img-alt { height: 110px; }
    .kv-pl-product-img-alt img { height: 125px; }
  }
  `;

  // Lokálne obrázky (uložené v /src/img); v Next je dostupné jako /_next/static/media/... až po build, ale do HTML injektujeme public path.
  const sugarImgs = [
    "https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20298_smommy--1-1.png?693a0df1",
    "https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20298-1_sugarmommyflakon--1.png?693a1265",
    "https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20298_mommy1.jpg?693a0e58",
    "https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20298-3_mommy4.jpg?693a0e59",
    "https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20298-2_mommy3.jpg?693a0e59",
  ];
  const blackImgs = [
    "https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20301_blackombre.png?693a1744",
    "https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20301-2_rene3.jpg?693a16a7",
    "https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20301-3_rene4.jpg?693a16a7",
    "https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20301-1_rene5.jpg?693a16a7",
  ];

  const html = `
<div class="kv-pl-landing">
  <div class="kv-pl-landing-container">
    <!-- HERO – OBA NAHOŘE -->
    <section class="kv-pl-section kv-pl-hero">
      <div class="kv-pl-hero-inner">
        <div>
          <div class="kv-pl-badge">
            <span class="kv-pl-badge-dot"></span>
            Limitovaná kolekcia parfumových elixírov KrasneVone.sk
          </div>
          <h1 class="kv-pl-heading kv-pl-heading-xl">
            Dva elixíry. Dve ikony. Jedna voňavá posadnutosť.
          </h1>
          <p class="kv-pl-text kv-pl-hero-subtitle">
            <strong>Sugar Mommy by Plačková</strong> a <strong>Black Ombre</strong> – unisex 
            <strong>Extrait de Parfum s 25&nbsp;% parfumácie</strong>, 50&nbsp;ml, inšpirované svetovými niche vôňami. 
            Každý flakón len <strong>29,90&nbsp;€</strong>.
          </p>
          <div class="kv-pl-hero-benefits">
            <div class="kv-pl-hero-benefit">
              <span class="kv-pl-hero-benefit-dot"></span>
              Pre ženy aj mužov, ktorí milujú výrazné vône
            </div>
            <div class="kv-pl-hero-benefit">
              <span class="kv-pl-hero-benefit-dot"></span>
              Extrait de Parfum – parfumový elixír s dlhou výdržou
            </div>
            <div class="kv-pl-hero-benefit">
              <span class="kv-pl-hero-benefit-dot"></span>
              Inšpirované ikonickými niche parfumami
            </div>
          </div>
          <div class="kv-pl-btn-row" style="margin-top:1.3rem;">
            <a href="https://krasnevone.sk/sugar-mommy-by-plackova" target="_top" class="kv-pl-btn kv-pl-btn-primary">Kúpiť SUGAR MOMMY – 29,90&nbsp;€</a>
            <a href="https://krasnevone.sk/black-ombre" target="_top" class="kv-pl-btn kv-pl-btn-outline">Kúpiť BLACK OMBRE – 29,90&nbsp;€</a>
          </div>
          <div class="kv-pl-hero-meta-strip">
            <div class="kv-pl-hero-meta-item">
              <span class="kv-pl-hero-meta-dot"></span>
              <span>Unisex pre ňu aj pre neho</span>
            </div>
            <div class="kv-pl-hero-meta-item">
              <span class="kv-pl-hero-meta-dot"></span>
              <span>Extrait de Parfum · 25&nbsp;% parfumácie</span>
            </div>
            <div class="kv-pl-hero-meta-item">
              <span class="kv-pl-hero-meta-dot"></span>
              <span>50&nbsp;ml flakón · 29,90&nbsp;€</span>
            </div>
          </div>
          <p class="kv-pl-hero-note">
            Vyber si, či si viac <strong>„sweet life“</strong> so Sugar Mommy alebo <strong>„dark luxury“</strong> s Black Ombre – obe vône sú 
            unisex elixíry stvorené na to, aby ťa bolo cítiť ešte dlho po odchode z miestnosti.
          </p>
        </div>

        <div class="kv-pl-hero-visual">
          <div class="kv-pl-hero-gallery">
            <div class="kv-pl-hero-photo-main">
              <!-- Plačková veľká -->
              <img
                src="${sugarImgs[2]}"
                alt="Zuzana Plačková so Sugar Mommy parfumom"
              />
            </div>
            <div class="kv-pl-hero-photo-side">
              <div class="kv-pl-hero-photo">
                <!-- Rendy -->
                <img
                  src="${blackImgs[3]}"
                  alt="René Rendy s Black Ombre parfumom"
                />
              </div>
              <div class="kv-pl-hero-photo">
                <!-- Duo vibe – Sugar Mommy detail -->
                <img
                  src="${sugarImgs[4]}"
                  alt="Detail kampane Sugar Mommy by Plačková"
                />
              </div>
            </div>
          </div>

          <!-- Plávajúca kartička s oboma flakónmi -->
          <div class="kv-pl-hero-floating">
            <div class="kv-pl-hero-floating-img-row">
              <div class="kv-pl-hero-floating-img">
                <img
                  src="https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20298-1_sugarmommyflakon--1.png?693a1265"
                  alt="Sugar Mommy flakón"
                  style="left:-90px;"
                />
              </div>
              <div class="kv-pl-hero-floating-img">
                <img
                  src="https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20301-1_blackombresolo.png?693a1f6f"
                  alt="Black Ombre flakón"
                  style="left:-20px;"
                />
              </div>
            </div>
            <div class="kv-pl-hero-floating-text">
              <strong>Sugar Mommy &amp; Black Ombre</strong>
              <span>Extrait de Parfum 25&nbsp;% · 50&nbsp;ml</span>
              <span>Každý za 29,90&nbsp;€ · unisex</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- PLAČKOVÁ + SUGAR MOMMY – FOTKY + TEXT -->
    <section class="kv-pl-section">
      <div class="kv-pl-split-grid">
        <div>
          <div class="kv-pl-heading-sm kv-pl-influencer">Sugar Mommy by Plačková</div>
          <h2 class="kv-pl-heading kv-pl-heading-lg">
            Sladký gurmánsky elixír pre všetkých milovníkov „dessert“ vôní.
          </h2>
          <p class="kv-pl-text">
            <span class="kv-pl-inline-chip">Pre koho</span>&nbsp; pre ženy aj mužov, ktorí chcú voňať sladko, hravo a zároveň luxusne. 
            Zuzana Strausz Plačková miluje sladké, gurmánske a výrazné vône – a Sugar Mommy je presne jej podpis.
          </p>
          <p class="kv-pl-text" style="margin-top:0.8rem;">
            <span class="kv-pl-inline-chip">Ako vonia</span>&nbsp; moderný „dessert parfum“, ktorý pôsobí ako malinový sorbet a cukrová vata vo flakóne, 
            no stále elegantne a nositeľne. Spojuje <strong>hebkosť vanilky</strong>, <strong>sviežosť lesných plodov</strong> 
            a <strong>jemný kvet pomarančovníka</strong>. Na pokožke sa mení na krémovo-vanilkový závoj, ktorý ťa bude 
            rozmaznávať celý deň.
          </p>
          <p class="kv-pl-text" style="margin-top:0.8rem;">
            <span class="kv-pl-inline-chip">Výdrž</span>&nbsp; vďaka koncentrácii <strong>Extrait de Parfum 25&nbsp;%</strong> ide o parfumový elixír, 
            ktorý na pokožke drží dlhé hodiny a zanecháva sladký, zapamätateľný dojem.
          </p>
          <div class="kv-pl-pill-row">
            <span class="kv-pl-pill">Kvetinovo-ovocná · gurmánska</span>
            <span class="kv-pl-pill">Unisex</span>
            <span class="kv-pl-pill">Extrait de Parfum 25&nbsp;%</span>
            <span class="kv-pl-pill">50&nbsp;ml · 29,90&nbsp;€</span>
          </div>
          <p class="kv-pl-text-muted">
            Ideálna na každý deň, rande, večer v meste aj stav „celý deň chcem voňať ako dezert“.
          </p>
          <div class="kv-pl-btn-row" style="margin-top:1.3rem;">
            <a href="https://krasnevone.sk/sugar-mommy-by-plackova" target="_top" class="kv-pl-btn kv-pl-btn-primary">Kúpiť SUGAR MOMMY</a>
            <a href="https://krasnevone.sk/sugar-mommy-by-plackova" target="_top" class="kv-pl-btn kv-pl-btn-outline">Pozrieť detaily vône</a>
          </div>
        </div>
        <div class="kv-pl-photo-grid">
          <div class="kv-pl-photo-main">
            <img
              src="${sugarImgs[4]}"
              alt="Plačková a Sugar Mommy – produktová fotka"
            />
          </div>
          <div class="kv-pl-photo-small">
            <img
              src="${sugarImgs[3]}"
              alt="Detail kampane Sugar Mommy by Plačková"
            />
          </div>
          <div class="kv-pl-photo-small">
            <img
              src="${sugarImgs[2]}"
              alt="Zuzana Plačková so Sugar Mommy parfumom"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- SUGAR MOMMY – PRODUKT + FLAKÓN -->
    <section id="sugar-mommy" class="kv-pl-section">
      <div class="kv-pl-product-grid">
        <div>
          <div class="kv-pl-heading-sm">Produkt č. 1</div>
          <h2 class="kv-pl-heading kv-pl-heading-lg">Sugar Mommy by Plačková</h2>
          <p class="kv-pl-text">
            <span class="kv-pl-inline-chip">Inšpirácia</span>&nbsp; vôňa je inšpirovaná ikonickou niche kompozíciou 
            <strong>Profumum Roma Acqua e Zucchero</strong>. Sladká, ale nie ťažká. Gurmánska, ale stále elegantná.
          </p>
          <p class="kv-pl-text" style="margin-top:0.8rem;">
            Kombinuje <strong>vanilku</strong>, <strong>lesné ovocie</strong> a <strong>kvet pomarančovníka</strong> do vône, 
            ktorá pôsobí ako sladký komfort zabalený v luxusnom flakóne. Najprv malinový sorbet a cukrová vata, neskôr 
            jemný, krémovo-vanilkový "obláčik".
          </p>
          <p class="kv-pl-product-meta">
            Pre koho: <span>milovníci sladkých, gurmánskych a hravých vôní</span> · Objem:
            <span>50&nbsp;ml</span> · Koncentrácia: <span>Extrait de Parfum 25&nbsp;%</span> ·
            Cena: <span>29,90&nbsp;€</span>
          </p>
          <div class="kv-pl-btn-row" style="margin-top:1.3rem;">
            <a href="https://krasnevone.sk/sugar-mommy-by-plackova" target="_top" class="kv-pl-btn kv-pl-btn-primary">Kúpiť SUGAR MOMMY – 29,90&nbsp;€</a>
          </div>
        </div>
        <div>
          <div class="kv-pl-product-visual">
            <div class="kv-pl-product-tag">
              <strong>Sugar Mommy</strong> · by Plačková
            </div>
            <div class="kv-pl-product-img-main">
              <img
                src="https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20298-1_sugarmommyflakon--1.png?693a1265"
                alt="Parfum Sugar Mommy – flakón"
              />
            </div>
            <div class="kv-pl-product-img-alt">
              <img
                src="https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20298_smommy--1-1.png?693a0df1"
                alt="Parfum Sugar Mommy – flakón s krabičkou"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- RENDY + BLACK OMBRE – FOTKY + TEXT -->
    <section class="kv-pl-section">
      <div class="kv-pl-split-grid">
        <div class="kv-pl-photo-grid">
          <div class="kv-pl-photo-main">
            <img
              src="${blackImgs[3]}"
              alt="René Rendy s Black Ombre parfumom"
            />
          </div>
          <div class="kv-pl-photo-small">
            <img
              src="${blackImgs[1]}"
              alt="Portrét René Rendyho s Black Ombre"
            />
          </div>
          <div class="kv-pl-photo-small">
            <img
              src="https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20301_blackombre.png"
              alt="Black Ombre parfum – flakón s krabičkou"
            />
          </div>
        </div>
        <div>
          <div class="kv-pl-heading-sm kv-pl-influencer">Black Ombre</div>
          <h2 class="kv-pl-heading kv-pl-heading-lg">
            Temný orientálny elixír pre tých, ktorí nechcú zostať bez povšimnutia.
          </h2>
          <p class="kv-pl-text">
            <span class="kv-pl-inline-chip">Pre koho</span>&nbsp; pre sebavedomé ženy aj mužov, ktorí milujú tmavé, intenzívne a luxusné kompozície. 
            René Rendy je synonymom luxusu, sebavedomia a temnej estetiky – Black Ombre presne odráža jeho svet.
          </p>
          <p class="kv-pl-text" style="margin-top:0.8rem;">
            <span class="kv-pl-inline-chip">Ako vonia</span>&nbsp; intenzívny <strong>oud</strong>, korenistý <strong>šafrán</strong>, sladká 
            <strong>malina</strong> a dymové <strong>kadidlo</strong> vytvárajú podpis, ktorý si každý zapamätá. Vôňa pôsobí 
            ako luxusný večerný outfit v tekutej forme – hlboká, hrejivá, dymová.
          </p>
          <p class="kv-pl-text" style="margin-top:0.8rem;">
            <span class="kv-pl-inline-chip">Výdrž</span>&nbsp; vďaka koncentrácii <strong>Extrait de Parfum 25&nbsp;%</strong> ide o výrazný elixír, ktorý 
            na pokožke drží extrémne dlho a zanecháva zmyselnú, dymovú stopu.
          </p>
          <div class="kv-pl-pill-row">
            <span class="kv-pl-pill">Orientálna · drevito-oudová</span>
            <span class="kv-pl-pill">Unisex</span>
            <span class="kv-pl-pill">Extrait de Parfum 25&nbsp;%</span>
            <span class="kv-pl-pill">50&nbsp;ml · 29,90&nbsp;€</span>
          </div>
          <div class="kv-pl-btn-row" style="margin-top:1.3rem;">
            <a href="https://krasnevone.sk/black-ombre" target="_top" class="kv-pl-btn kv-pl-btn-primary">Kúpiť BLACK OMBRE</a>
          </div>
        </div>
      </div>
    </section>

    <!-- BLACK OMBRE – PRODUKT + FLAKÓN -->
    <section id="black-ombre" class="kv-pl-section">
          <div class="kv-pl-product-grid kv-pl-reverse">
            <div>
              <div class="kv-pl-heading-sm">Produkt č. 2</div>
              <h2 class="kv-pl-heading kv-pl-heading-lg">Black Ombre</h2>
              <p class="kv-pl-text">
                <span class="kv-pl-inline-chip">Inšpirácia</span>&nbsp; kompozícia je inšpirovaná ikonickou niche vôňou 
                <strong>Louis Vuitton Ombre Nomade</strong>. Oud, šafrán, malina a kadidlo vytvárajú dymový, orientálny podpis, 
                ktorý pôsobí vznešene a luxusne už na prvé privoňanie.
              </p>
          <p class="kv-pl-text" style="margin-top:0.8rem;">
            V základe sa usádza <strong>ambra</strong>, <strong>benzoin</strong> a <strong>drevité tóny</strong>. Výsledok? 
            Hladká, zmyselná a extrémne dlhotrvajúca vôňa, podľa ktorej si ťa budú pamätať.
          </p>
          <p class="kv-pl-product-meta">
            Pre koho: <span>milovníci temných, orientálnych a oudových vôní</span> · Objem:
            <span>50&nbsp;ml</span> · Koncentrácia: <span>Extrait de Parfum 25&nbsp;%</span> ·
            Cena: <span>29,90&nbsp;€</span>
          </p>
          <div class="kv-pl-btn-row" style="margin-top:1.3rem;">
            <a href="https://krasnevone.sk/black-ombre" target="_top" class="kv-pl-btn kv-pl-btn-primary">Kúpiť BLACK OMBRE – 29,90&nbsp;€</a>
            <a href="https://krasnevone.sk/sugar-mommy-by-plackova" target="_top" class="kv-pl-btn kv-pl-btn-outline">Pozrieť SUGAR MOMMY</a>
          </div>
        </div>
        <div>
          <div class="kv-pl-product-visual kv-pl-product-visual-dark">
            <div class="kv-pl-product-tag">
              <strong>Black Ombre</strong>
            </div>
            <div class="kv-pl-product-img-main">
              <img
                src="https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20301-1_blackombresolo.png?693a1f6f"
                alt="Parfum Black Ombre – flakón"
              />
            </div>
            <div class="kv-pl-product-img-alt">
              <img
                src="https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/20301_blackombre.png"
                alt="Parfum Black Ombre – flakón s krabičkou"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ZÁVĚREČNÁ CTA -->
    <section class="kv-pl-section kv-pl-final">
      <div class="kv-pl-landing-container">
        <div class="kv-pl-final-inner">
          <h2 class="kv-pl-heading kv-pl-heading-lg">
            Vyber si svoju ikonu a staň sa nezabudnuteľný.
          </h2>
          <p>
            Či už si viac „sweet life“ so Sugar Mommy, alebo „dark luxury“ s Black Ombre – tvoja
            nová obľúbená vôňa ťa už čaká. Obe za 29,90&nbsp;€ vo veľkosti 50&nbsp;ml, v
            koncentrácii Extrait de Parfum 25&nbsp;%.
          </p>
          <div class="kv-pl-btn-row" style="justify-content:center;">
            <a href="https://krasnevone.sk/sugar-mommy-by-plackova" target="_top" class="kv-pl-btn kv-pl-btn-primary">Kúpiť SUGAR MOMMY</a>
            <a href="https://krasnevone.sk/black-ombre" target="_top" class="kv-pl-btn kv-pl-btn-outline">Kúpiť BLACK OMBRE</a>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>
  `;


  return {
    ...payload,
    tenant: { ...payload.tenant, locale: "sk-SK" },
    builder: { html, css },
  };
};

const applyKayaliOverrides = (payload: StorefrontPayload): StorefrontPayload => {
  if (payload.microsite.slug !== "kayali") {
    return payload;
  }

  const customProducts: StorefrontProduct[] = [
    {
      id: "demo-black-ombre",
      slug: "black-ombre",
      name: "BLACK OMBRE",
      subtitle: "Parfémový extrakt, inšpirovaný: Louis Vuitton Ombre Nomade",
      excerpt: "Dymový oud, šafran a ružové drevo pre klientov, ktorí chcú temný podpis.",
      imageUrl:
        "https://images.unsplash.com/photo-1530630458144-014709e10016?auto=format&fit=crop&w=1200&q=80&sat=-12",
      priceCents: 289000,
      priceCurrency: "CZK",
      tags: ["Influencer limitka", "Inšpirácia: Ombre Nomade", "Unisex oud"],
      available: true,
      badge: "Influencer",
      cta: { label: "Pozrieť detail", href: "#kolekcia" },
      detailUrl: "#kolekcia",
    },
    {
      id: "demo-sugar-mommy",
      slug: "sugar-mommy",
      name: "SUGAR MOMMY by Plačková",
      subtitle: "Parfum, inšpirovaný: Profumum Roma – Acqua e Zucchero",
      excerpt: "Púdrový cukor, malina a vanilka – sladká závislosť pre divy aj gentlewomen.",
      imageUrl:
        "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=1200&q=80&sat=10",
      priceCents: 199000,
      priceCurrency: "CZK",
      tags: ["Sladká limitka", "Inšpirácia: Acqua e Zucchero", "Exkluzív"],
      available: true,
      badge: "Influencer",
      cta: { label: "Ochutnať vôňu", href: "#kolekcia" },
      detailUrl: "#kolekcia",
    },
    {
      id: "demo-jasmine-couture",
      slug: "jasmine-couture",
      name: "JASMINE COUTURE",
      subtitle: "Parfum, inšpirovaný: Dior Jasmin des Anges",
      excerpt: "Jazmín, marhuľa a biele pižmo – jemná záclona luxusu pre každodenný glam.",
      imageUrl:
        "https://images.unsplash.com/photo-1547887537-6158d64c4705?auto=format&fit=crop&w=1200&q=80&sat=-8",
      priceCents: 169000,
      priceCurrency: "CZK",
      tags: ["Jazmín", "Inšpirácia: Jasmin des Anges", "Ľahká elegancia"],
      available: true,
      badge: "Kurátor",
      cta: { label: "Detail", href: "#kolekcia" },
      detailUrl: "#kolekcia",
    },
  ];

  const builderHtml = `<section class="microshop-hero" data-align="center" style="--microshop-hero-bg: linear-gradient(135deg, #0f0a1f, #2a1b3f); --microshop-hero-overlay: radial-gradient(circle at 25% 20%, rgba(255,255,255,0.18), transparent 55%); --microshop-hero-image: url('https://images.unsplash.com/photo-1530630458144-014709e10016?auto=format&fit=crop&w=1400&q=80&sat=-12');">
  <div class="microshop-hero-eyebrow">Nová kolekcia</div>
  <h1>Podpisové vône s jasnou inšpiráciou</h1>
  <p>Limitky od influencerov a kurátorov. Každá vôňa otvorene hovorí, čím je inšpirovaná – pripravená na zdieľanie s tvojimi VIP klientmi.</p>
  <div class="microshop-hero-actions">
    <a class="cta" href="#kolekcia">Pozrieť kolekciu</a>
    <a class="microshop-hero-link" href="#kontakt">Rezervovať concierge</a>
  </div>
</section>

<section id="kolekcia" class="microshop-product-grid" data-microshop-block="product-grid" data-limit="6" data-columns="3" data-card-style="elevated">
  <p style="text-align:center; letter-spacing:0.24em; text-transform:uppercase;">Kolekcia tvorcov</p>
  <h2>Nové podpisové vône</h2>
  <p style="text-align:center;color:#475569;max-width:580px;margin:0 auto 32px;">Každý produkt jasne uvádza, čím je inšpirovaný. Vyber si mix tmavého oudu, cukrovej eufórie a jemného jazmínu.</p>
  <div class="grid" data-sample="true">
    <article class="microshop-product-card" data-style="elevated" data-sample="true">
      <div class="microshop-product-image-placeholder" data-sample="true">Obrázok produktu</div>
      <div class="microshop-product-tags" data-sample="true">
        <span>Inšpirácia</span>
        <span>Limitka</span>
      </div>
      <h3 data-sample="true">Podpisová vôňa</h3>
      <p data-sample="true">Skutočné produkty sa zobrazia po načítaní kolekcie.</p>
      <div class="microshop-product-footer">
        <span class="price" data-sample="true">2 490 CZK</span>
        <span class="cta" data-sample="true">Detail</span>
      </div>
    </article>
  </div>
</section>`;

  return {
    ...payload,
    tenant: { ...payload.tenant, locale: "sk-SK" },
    products: customProducts,
    builder: {
      ...(payload.builder ?? {}),
      html: builderHtml,
    },
  };
};

export const resolveStorefrontPayload = cache(async (host: string, slug?: string | null): Promise<StorefrontPayload> => {
  const normalizedHost = sanitizeHost(host);
  if (!HUB_API_URL) {
    return FALLBACK_PAYLOAD;
  }

  try {
    const query = new URLSearchParams();
    if (slug) {
      query.set("slug", slug);
    } else {
      query.set("host", normalizedHost);
    }
    const payload = await hubFetch<StorefrontPayload>(`/api/storefront/microshops/resolve?${query.toString()}`);
    const withLanding = applyLandingOverrides(payload);
    return applyKayaliOverrides(withLanding);
  } catch (error) {
    console.error("[storefront] Falling back to demo payload:", error);
    return FALLBACK_PAYLOAD;
  }
});

export const getStorefrontPayload = cache(async (slugOverride?: string): Promise<StorefrontPayload> => {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const slugHeader = headerList.get("x-microsite-slug");
  const slug = slugOverride ?? slugHeader ?? undefined;
  return resolveStorefrontPayload(sanitizeHost(host), slug);
});

export const getProductBySlug = cache(async (slug: string): Promise<StorefrontProduct | null> => {
  const payload = await getStorefrontPayload();
  return payload.products.find((product) => product.slug === slug) ?? null;
});

const normalizePath = (path: string): string => {
  if (!path) {
    return "/";
  }

  const trimmed = path.startsWith("/") ? path : `/${path}`;
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
};

export const getPageByPath = cache(async (path: string, slugOverride?: string): Promise<StorefrontPage | null> => {
  const normalized = normalizePath(path);
  const payload = await getStorefrontPayload(slugOverride);

  const direct = payload.pages.find((page) => normalizePath(page.path) === normalized);
  if (direct) return direct;

  const withTrailing = payload.pages.find((page) => normalizePath(page.path) === `${normalized}/`);
  return withTrailing ?? null;
});
