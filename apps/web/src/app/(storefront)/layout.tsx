import Link from "next/link";
import { ShoppingBag, User, Search } from "lucide-react";
import { auth } from "@/auth";
import { getOrCreateCartId, cartCount } from "@/lib/cart";
import { MobileMenu } from "@/components/storefront/mobile-menu";
import { NAV } from "@/lib/nav";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const cartId = await getOrCreateCartId();
  const count = await cartCount(cartId);
  const phone = process.env.SELLER_PHONE;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-leather-100 bg-cream/95 backdrop-blur">
        <div className="bg-leather-700 text-cream text-xs tracking-wide">
          <div className="container flex items-center justify-between py-1.5">
            <span>Made in our Agra factory · Full-grain leather · Free shipping over ₹1,999</span>
            {phone ? (
              <span className="hidden sm:inline text-cream/80">WhatsApp {phone}</span>
            ) : (
              <Link href="/contact" className="hidden sm:inline text-cream/80 hover:text-cream">Contact</Link>
            )}
          </div>
        </div>
        <div className="container flex items-center gap-4 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-semibold tracking-[0.18em] text-leather-800">IDEALX</span>
            <span className="hidden md:inline text-[10px] uppercase tracking-[0.2em] text-ink/50">by Ideal Shoes, Agra</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium uppercase tracking-wider ml-8">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-ink/80 hover:text-oxblood-500">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/search" aria-label="Search" className="rounded p-2 hover:bg-sand-100">
              <Search className="size-5" />
            </Link>
            <Link href={session?.user ? "/account" : "/login"} aria-label="Account" className="rounded p-2 hover:bg-sand-100">
              <User className="size-5" />
            </Link>
            <Link href="/cart" aria-label="Cart" className="relative rounded p-2 hover:bg-sand-100">
              <ShoppingBag className="size-5" />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-oxblood-500 px-1 text-[10px] font-bold text-cream">
                  {count}
                </span>
              )}
            </Link>
            <MobileMenu nav={NAV} signedIn={Boolean(session?.user)} cartCount={count} />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 bg-leather-800 text-cream">
        <div className="container py-12 grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <p className="font-display text-2xl font-semibold tracking-[0.18em]">IDEALX</p>
            <p className="mt-3 text-sm text-cream/70 max-w-xs">
              Service boots, formal shoes and jackets from our own factory in Agra, sold direct. The factory that
              makes boots for service makes your formal shoes.
            </p>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-sand-300">Shop</h4>
            <ul className="mt-3 space-y-1.5 text-sm text-cream/80">
              <li><Link href="/products?category=boots">Service &amp; army boots</Link></li>
              <li><Link href="/products?category=shoes">Formal shoes</Link></li>
              <li><Link href="/products?category=jackets">Jackets</Link></li>
              <li><Link href="/products?category=bags">Leather bags</Link></li>
              <li><Link href="/products">Everything</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-sand-300">IDEALX</h4>
            <ul className="mt-3 space-y-1.5 text-sm text-cream/80">
              <li><Link href="/about">Our factory</Link></li>
              <li><Link href="/wholesale">Wholesale &amp; dealers</Link></li>
              <li><Link href="/tenders">Institutional &amp; GeM supply</Link></li>
              <li><Link href="/contact">Visit the shop in Agra</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-sand-300">Help</h4>
            <ul className="mt-3 space-y-1.5 text-sm text-cream/80">
              <li><Link href="/account/orders">Track an order</Link></li>
              <li><Link href="/returns">Exchanges &amp; returns</Link></li>
              <li><Link href="/shipping">Shipping</Link></li>
              <li><Link href="/terms">Terms</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-cream/10 py-4 text-center text-xs text-cream/50">
          © {new Date().getFullYear()} Ideal Shoes, Agra. IDEALX™ is a trademark of Ideal Shoes.
        </div>
      </footer>
    </div>
  );
}
