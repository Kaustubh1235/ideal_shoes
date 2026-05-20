import Link from "next/link";
import { ArrowRight, ShieldCheck, Truck, BadgeCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { rupeesOnly } from "@/lib/money";
import { Button } from "@bharatboot/ui";

export default async function HomePage() {
  const featured = await prisma.product.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: 6,
    include: { images: { where: { isPrimary: true }, take: 1 } },
  });

  return (
    <>
      <section className="relative isolate overflow-hidden bg-olive-700 text-cream">
        <div className="container py-20 md:py-28 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <p className="text-khaki-400 text-xs font-medium uppercase tracking-[0.2em]">
              Defense-grade. D2C-priced.
            </p>
            <h1 className="mt-3 font-display text-5xl md:text-6xl leading-[0.95] uppercase">
              Built to outlast<br /> the terrain.
            </h1>
            <p className="mt-6 max-w-md text-cream/80">
              Army boots, Oxford shoes, and combat-tested jackets — manufactured in India
              for service personnel, professionals, and people who don&apos;t replace gear
              every season.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link href="/products">
                  Shop the Range <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-cream text-cream hover:bg-cream/10">
                <Link href="/wholesale">For Dealers &amp; Tenders</Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[4/5] w-full max-w-md ml-auto rounded-md bg-gradient-to-br from-olive-500 to-olive-900 border border-cream/10 grid place-items-center text-cream/40 text-sm uppercase tracking-wider">
              Hero photography placeholder<br/>
              (Upload via /admin/cms/hero)
            </div>
          </div>
        </div>
      </section>

      <section className="container py-12 grid gap-6 md:grid-cols-3">
        {[
          { icon: ShieldCheck, title: "Made in India", body: "Manufactured at our Pune facility. ISO-9001 quality system." },
          { icon: Truck, title: "Free shipping ₹2,000+", body: "Pan-India delivery via Shiprocket. Tracked, insured." },
          { icon: BadgeCheck, title: "30-day returns", body: "If a boot doesn't fit, send it back. We re-stitch and reissue." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-lg border border-olive-100 p-6 bg-cream">
            <Icon className="size-7 text-olive-600" />
            <h3 className="mt-3 font-display uppercase tracking-wide">{title}</h3>
            <p className="mt-1 text-sm text-ink/70">{body}</p>
          </div>
        ))}
      </section>

      <section className="container py-12">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-3xl uppercase">Featured Range</h2>
          <Link href="/products" className="text-sm text-olive-700 hover:underline flex items-center gap-1">
            View all <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-6 grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {featured.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-olive-200 p-10 text-center text-ink/60 text-sm">
              No products yet. Seed demo data via <code>pnpm db:seed</code> or add products in <Link href="/admin/products" className="underline">/admin</Link>.
            </div>
          )}
          {featured.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.slug}`}
              className="group block overflow-hidden rounded-md border border-olive-100 bg-cream"
            >
              <div className="relative aspect-square bg-olive-50">
                {p.images[0]?.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.images[0].url} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full grid place-items-center text-ink/30 text-xs uppercase">
                    Photo pending
                  </div>
                )}
              </div>
              <div className="p-3">
                <h3 className="font-display text-base uppercase tracking-wide group-hover:text-olive-700">{p.name}</h3>
                <p className="mt-1 text-sm text-ink/70">{rupeesOnly(p.basePrice)}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-khaki-50 py-12">
        <div className="container grid gap-8 md:grid-cols-2 items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-olive-700">For dealers & defense buyers</p>
            <h2 className="mt-2 font-display text-3xl uppercase">Bulk pricing. Net-30 terms.</h2>
            <p className="mt-3 text-ink/70 max-w-md">
              Authorised dealer pricing across tiers. GST-compliant invoicing, e-way bill
              generation, and direct logistics to your warehouse.
            </p>
            <div className="mt-6 flex gap-3">
              <Button asChild>
                <Link href="/dealer-application">Apply for Dealer Account</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/tenders">View Government Tenders</Link>
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-olive-200 bg-cream p-6">
            <h3 className="font-display uppercase tracking-wide">What you get</h3>
            <ul className="mt-3 space-y-2 text-sm text-ink/80">
              <li>• Tier-based wholesale pricing (A / B / C)</li>
              <li>• Net-30 credit (subject to approval)</li>
              <li>• Bulk CSV order upload</li>
              <li>• GST-compliant tax invoices &amp; e-invoicing (IRP)</li>
              <li>• Priority dispatch from Pune warehouse</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
