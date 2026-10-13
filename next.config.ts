import type { NextConfig } from "next";

/**
 * SaveSphere runs in three very different places:
 *  1. a normal deployment at the domain root,
 *  2. a sandbox preview behind a host like `3000-<id>.e2b.app`,
 *  3. embedded in another site's iframe (e.g. a benchmark harness).
 *
 * Each needs something different from the config, so everything below is driven by
 * environment variables with safe defaults.
 */
const extraOrigins = (process.env.ALLOWED_ACTION_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Set when the app is served under a path prefix (e.g. /session-id/...). Without this
// the browser asks the *host* for /_next/... instead of the prefixed path and the app
// never boots.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || undefined;
const assetPrefix = process.env.NEXT_PUBLIC_ASSET_PREFIX || basePath || undefined;

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  ...(assetPrefix ? { assetPrefix } : {}),

  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
      // Server Actions validate the Origin against the forwarded Host. A proxy that
      // rewrites the host would otherwise silently abort every form post.
      allowedOrigins: [
        "*.e2b.app",
        "*.localhost",
        "localhost",
        "127.0.0.1",
        "*.arena.ai",
        "arena.ai",
        ...extraOrigins,
      ],
    },
  },

  async headers() {
    // Explicitly permit known preview/benchmark hosts to frame the app. Anything not
    // listed here is still blocked by the browser's default deny, which keeps
    // clickjacking protection intact for the production deployment.
    const frameAncestors = [
      "'self'",
      "https://*.e2b.app",
      "https://arena.ai",
      "https://*.arena.ai",
      ...(process.env.EXTRA_FRAME_ANCESTORS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    ].join(" ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
