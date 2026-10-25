import type { MetadataRoute } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CATEGORY_LABELS } from "@/lib/nav";


// Per request, as robots.ts: at build time there is no database, so it would list no products.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  noStore();
  const base = (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const fixed = ["", "/products", "/about", "/contact", "/tenders", "/dealer-application", "/shipping", "/returns", "/terms", "/privacy"];
  let products: { slug: string; updatedAt: Date }[] = [];
  try {
    products = await prisma.product.findMany({ where: { status: "active" }, select: { slug: true, updatedAt: true }, take: 5000 });
  } catch {
    products = [];
  }
  return [
    ...fixed.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.5 })),
    ...Object.keys(CATEGORY_LABELS).map((c) => ({ url: `${base}/products?category=${c}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...products.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
