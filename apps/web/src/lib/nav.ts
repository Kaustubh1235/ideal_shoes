export type NavItem = { href: string; label: string };

/** Storefront primary navigation. Category slugs match `categories.slug` seeded in scripts/seed.ts. */
export const NAV: NavItem[] = [
  { href: "/products?category=boots", label: "Boots" },
  { href: "/products?category=shoes", label: "Formal Shoes" },
  { href: "/products?category=jackets", label: "Jackets" },
  { href: "/products?category=bags", label: "Bags" },
  { href: "/about", label: "Our Factory" },
  { href: "/wholesale", label: "Wholesale" },
];

export const CATEGORY_LABELS: Record<string, string> = {
  boots: "Service & Army Boots",
  shoes: "Formal Shoes",
  jackets: "Jackets",
  bags: "Leather Bags",
};
