import type { MetadataRoute } from "next";
import { unstable_noStore as noStore } from "next/cache";

// Next 14 prerenders metadata routes at build (ignoring `dynamic`), when neither AUTH_URL nor
// the database is there; opt out so the domain and the product list are read per request.
export default function robots(): MetadataRoute.Robots {
  noStore();
  const base = (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/cart", "/checkout", "/wholesale", "/api/", "/files/", "/login", "/search"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
