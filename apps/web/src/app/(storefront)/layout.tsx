import Link from "next/link";
import { ShoppingCart, User, Search, Menu, Phone } from "lucide-react";
import { auth } from "@/auth";
import { getOrCreateCartId, cartCount } from "@/lib/cart";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const cartId = await getOrCreateCartId();
  const count = await cartCount(cartId);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-olive-200 bg-cream/95 backdrop-blur">
        <div className="bg-olive-600 text-cream text-xs">
          <div className="container flex items-center justify-between py-1.5">
            <span className="hidden sm:inline">Free shipping on orders over ₹2,000. Made in India.</span>
            <a href="tel:+91" className="flex items-center gap-1 ml-auto">
              <Phone className="size-3" /> +91 contact pending
            </a>
          </div>
        </div>
        <div className="container flex items-center gap-4 py-3">
          <Link href="/" className="font-display text-2xl uppercase tracking-wider text-olive-700">
            BharatBoot
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium uppercase tracking-wide ml-6">
            <Link href="/products?category=army_boots" className="hover:text-olive-700">Army Boots</Link>
            <Link href="/products?category=oxford_shoes" className="hover:text-olive-700">Oxford Shoes</Link>
            <Link href="/products?category=jackets" className="hover:text-olive-700">Jackets</Link>
            <Link href="/wholesale" className="hover:text-olive-700">Wholesale</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/search" aria-label="Search" className="rounded p-2 hover:bg-olive-50">
              <Search className="size-5" />
            </Link>
            <Link href={session?.user ? "/account" : "/login"} aria-label="Account" className="rounded p-2 hover:bg-olive-50">
              <User className="size-5" />
            </Link>
            <Link href="/cart" aria-label="Cart" className="relative rounded p-2 hover:bg-olive-50">
              <ShoppingCart className="size-5" />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-umber-400 px-1 text-[10px] font-bold text-cream">
                  {count}
                </span>
              )}
            </Link>
            <button aria-label="Menu" className="md:hidden rounded p-2 hover:bg-olive-50">
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-olive-100 bg-olive-700 text-cream">
        <div className="container py-10 grid gap-8 md:grid-cols-4">
          <div>
            <h3 className="font-display text-xl uppercase tracking-wider">BharatBoot</h3>
            <p className="mt-2 text-sm text-cream/70">Defense-grade footwear and jackets. Built to last. Made in India.</p>
          </div>
          <div>
            <h4 className="font-display uppercase text-sm tracking-wide">Shop</h4>
            <ul className="mt-2 space-y-1 text-sm text-cream/80">
              <li><Link href="/products?category=army_boots">Army Boots</Link></li>
              <li><Link href="/products?category=oxford_shoes">Oxford Shoes</Link></li>
              <li><Link href="/products?category=jackets">Jackets</Link></li>
              <li><Link href="/products">All Products</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display uppercase text-sm tracking-wide">Business</h4>
            <ul className="mt-2 space-y-1 text-sm text-cream/80">
              <li><Link href="/wholesale">Wholesale / Dealer</Link></li>
              <li><Link href="/tenders">Government Tenders</Link></li>
              <li><Link href="/about">About Us</Link></li>
              <li><Link href="/contact">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display uppercase text-sm tracking-wide">Support</h4>
            <ul className="mt-2 space-y-1 text-sm text-cream/80">
              <li><Link href="/account/orders">Track Order</Link></li>
              <li><Link href="/returns">Returns &amp; RMA</Link></li>
              <li><Link href="/shipping">Shipping Policy</Link></li>
              <li><Link href="/terms">Terms</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-cream/10 py-4 text-center text-xs text-cream/60">
          © {new Date().getFullYear()} BharatBoot. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
