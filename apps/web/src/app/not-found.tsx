import Link from "next/link";
import { Button } from "@bharatboot/ui";

export const metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-cream px-4">
      <div className="text-center">
        <p className="font-display text-6xl uppercase tracking-widest text-leather-700">404</p>
        <h1 className="mt-3 font-display text-2xl">This page isn&apos;t on our shelves</h1>
        <p className="mt-2 text-ink/60 max-w-sm mx-auto">
          The link may be old, or the product may have sold out of its run. Everything we make is in the shop.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild><Link href="/products">Browse boots and shoes</Link></Button>
          <Button asChild variant="outline"><Link href="/contact">Contact us</Link></Button>
        </div>
      </div>
    </div>
  );
}
