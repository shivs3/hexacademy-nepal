import type { NextConfig } from "next";

// Server-side address of the Django API (container/service network in Docker).
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // CMS content lives in Django and must render at request time; see docs/decisions.md (ADR-006).
  cacheComponents: false,
  output: "standalone",
  poweredByHeader: false,
  // Django URLs end in "/"; keep them intact instead of a 308 round trip per API call.
  skipTrailingSlashRedirect: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8000", pathname: "/media/**" },
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/media/**" },
      { protocol: "https", hostname: "media.hexacademynepal.com" },
    ],
  },
  async rewrites() {
    // In production Nginx routes /api/ to Django directly. In development the
    // browser talks only to Next, so cookies stay first-party. Django expects
    // trailing slashes; the slash is not captured by :path*, so it is re-added.
    return [
      { source: "/api/:path*", destination: `${INTERNAL_API_URL}/api/:path*/` },
      { source: "/media/:path*", destination: `${INTERNAL_API_URL}/media/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
