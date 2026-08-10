import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },

  async redirects() {
    return [
      { source: "/machine-health", destination: "/maintenance", permanent: true },
      { source: "/product-history", destination: "/traceability", permanent: true },
      { source: "/ai-assistant", destination: "/copilot", permanent: true },
      { source: "/assistant", destination: "/copilot", permanent: true },
    ];
  },

  async headers() {
    const headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> = [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];

    // LOW fix: this used to default to a hardcoded third-party demo URL
    // (https://mes-app-omega.vercel.app) whenever ALLOWED_ORIGIN was unset,
    // so a self-hosted deployment that forgot to set it would advertise
    // someone else's origin as CORS-allowed instead of its own. Only emit
    // the CORS headers when ALLOWED_ORIGIN is explicitly configured — no
    // header means the browser's default same-origin policy applies, which
    // is the safe default for an unconfigured deployment.
    if (process.env.ALLOWED_ORIGIN) {
      headers.push({
        source: "/api/(.*)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: process.env.ALLOWED_ORIGIN },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-API-Key" },
        ],
      });
    }

    return headers;
  },

  serverExternalPackages: ["puppeteer", "puppeteer-core"],
  compress: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
};

export default nextConfig;

