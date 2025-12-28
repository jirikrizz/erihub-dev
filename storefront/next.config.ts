import type { NextConfig } from "next";
import path from "path";

const rawBasePath = process.env.NEXT_PUBLIC_MICROSHOP_BASE_PATH?.trim() ?? "";
const normalizedBasePath =
  rawBasePath && rawBasePath !== "/"
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
    : "";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
      {
        protocol: "https",
        hostname: "hub.krasnevune.cz",
      },
      {
        protocol: "https",
        hostname: "static.krasnevune.cz",
      },
    ],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@": path.join(__dirname, "src"),
    };

    return config;
  },
};

export default nextConfig;
