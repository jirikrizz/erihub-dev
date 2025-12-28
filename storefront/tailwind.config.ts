import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Playfair Display", "serif"],
      },
      colors: {
        brand: {
          primary: "var(--brand-primary)",
          accent: "var(--brand-accent)",
          surface: "var(--brand-surface)",
          muted: "var(--brand-muted)",
          "on-primary": "var(--brand-on-primary)",
          "on-surface": "var(--brand-on-surface)",
        },
      },
      backgroundImage: {
        "brand-radial":
          "radial-gradient(circle at top, rgba(148, 163, 184, 0.25), rgba(11, 17, 31, 0.9) 70%)",
        "brand-glass":
          "linear-gradient(135deg, rgba(15, 23, 42, 0.88), rgba(15, 23, 42, 0.6))",
      },
      boxShadow: {
        brand: "0 28px 80px rgba(15, 23, 42, 0.45)",
        "brand-soft": "0 16px 40px rgba(15, 23, 42, 0.28)",
      },
      borderRadius: {
        "4xl": "2.5rem",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(150%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.9s ease-out forwards",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
