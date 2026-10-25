import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
    // Trace from the monorepo root so the standalone server includes the workspace packages
    // and pnpm's hoisted modules (Prisma's engine among them).
    outputFileTracingRoot: root,
  },
  transpilePackages: ["@bharatboot/ui", "@bharatboot/types", "@bharatboot/gst", "@bharatboot/db"],
  // No page uses next/image; with remotePatterns "**" its /_next/image endpoint was an open proxy.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
