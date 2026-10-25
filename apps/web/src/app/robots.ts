import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/cart", "/checkout", "/wholesale", "/api/", "/files/", "/login", "/search"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
