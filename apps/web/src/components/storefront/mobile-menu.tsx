"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, User, ShoppingBag, Search } from "lucide-react";
import type { NavItem } from "@/lib/nav";

export function MobileMenu({
  nav,
  signedIn,
  cartCount,
}: {
  nav: NavItem[];
  signedIn: boolean;
  cartCount: number;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const close = () => setOpen(false);

  // Close whenever the route changes (links also close on click, which covers
  // same-path navigations such as /products?category=boots -> ?category=shoes).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes; Tab stays inside the panel; body scroll is locked while open.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [],
      );
    focusables()[0]?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "Tab") {
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      openerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
        className="md:hidden rounded p-2 hover:bg-sand-100"
      >
        <Menu className="size-5" />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div
            id="mobile-menu"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute right-0 top-0 h-full w-[84vw] max-w-sm bg-cream shadow-xl flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-leather-100 px-5 py-4">
              <span className="font-display text-xl font-semibold tracking-[0.18em] text-leather-800">IDEALX</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="rounded p-2 hover:bg-sand-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="space-y-1">
                {nav.map((n) => (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      onClick={close}
                      className="block rounded px-2 py-3 font-display text-lg text-leather-800 hover:bg-sand-100"
                    >
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-6 border-t border-leather-100 pt-4 space-y-1 text-sm">
                <Link href="/search" onClick={close} className="flex items-center gap-3 rounded px-2 py-3 hover:bg-sand-100">
                  <Search className="size-4" /> Search
                </Link>
                <Link
                  href={signedIn ? "/account" : "/login"}
                  onClick={close}
                  className="flex items-center gap-3 rounded px-2 py-3 hover:bg-sand-100"
                >
                  <User className="size-4" /> {signedIn ? "My account" : "Sign in"}
                </Link>
                <Link href="/cart" onClick={close} className="flex items-center gap-3 rounded px-2 py-3 hover:bg-sand-100">
                  <ShoppingBag className="size-4" /> Cart{cartCount > 0 ? ` (${cartCount})` : ""}
                </Link>
              </div>
            </nav>
            <div className="border-t border-leather-100 px-5 py-4 text-xs text-ink/50">
              Ideal Shoes, Agra · <Link href="/contact" onClick={close} className="underline underline-offset-4">Visit the shop</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
