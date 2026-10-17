import Link from "next/link";
import { ArrowRight, Scissors, Hand, Store } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { rupeesOnly } from "@/lib/money";
import { Button } from "@bharatboot/ui";

const CATEGORIES = [
  { slug: "bags", name: "Bags", blurb: "Messengers, laptop bags, totes and duffels." },
  { slug: "shoes", name: "Shoes", blurb: "Chelsea boots, derbies, loafers and formals." },
  { slug: "belts_wallets", name: "Belts & Wallets", blurb: "Cut from the same hides as the bags." },
];

const CRAFT = [
  { step: "Hide", body: "We buy whole full-grain hides and grade each one by hand. Only the best cuts become IDEALX." },
  { step: "Cut", body: "Patterns are clicked by hand so the grain runs the right way on every panel." },
  { step: "Stitch", body: "Saddle-stitched stress points, edge-painted seams, solid brass fittings." },
  { step: "Finish", body: "Burnished, conditioned, and checked twice before it goes into the dust bag." },
];

export default async function HomePage() {
  const featured = await prisma.product.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { images: { where: { isPrimary: true }, take: 1 } },
  });

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-leather-800 text-cream">
        <div className="container py-16 md:py-24 grid gap-10 md:grid-cols-[1.1fr_1fr] items-center">
          <div>
            <p className="text-sand-300 text-xs font-medium uppercase tracking-[0.25em]">Handcrafted in Agra</p>
            <h1 className="mt-4 font-display text-5xl md:text-6xl font-medium leading-[1.02]">
              Leather that gets better<br className="hidden md:block" /> the longer you carry it.
            </h1>
            <p className="mt-6 max-w-md text-cream/80 text-lg">
              Full-grain leather bags, shoes and belts, cut and stitched by hand in Agra and sold direct
              from the family that makes them. No middlemen, no mall markup.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link href="/products?category=bags">
                  Shop bags <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-cream/60 text-cream hover:bg-cream/10">
                <Link href="/products?category=shoes">Shop shoes</Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[4/5] w-full max-w-md md:ml-auto rounded-sm bg-gradient-to-br from-leather-600 to-leather-900 border border-cream/10 grid place-items-center text-cream/40 text-xs uppercase tracking-wider text-center p-6">
              Hero photograph<br />(a bag on the cutting bench, hides behind)<br />Upload via /admin/cms/hero
            </div>
          </div>
        </div>
      </section>

      {/* Three reasons */}
      <section className="container py-12 grid gap-6 md:grid-cols-3">
        {[
          { icon: Hand, title: "Full-grain, not 'genuine'", body: "The top layer of the hide, with its natural grain. It scuffs, softens and darkens into a patina instead of peeling." },
          { icon: Scissors, title: "Made by hand in Agra", body: "India's oldest leather footwear cluster, whose leather footwear carries a GI tag. Our workshop and shop are both here." },
          { icon: Store, title: "Direct from the maker", body: "You buy from the family that cuts and stitches it, at workshop prices. Exchange within 30 days if it isn't right." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="border-t-2 border-oxblood-500 pt-5">
            <Icon className="size-6 text-leather-600" />
            <h3 className="mt-3 font-display text-xl">{title}</h3>
            <p className="mt-2 text-sm text-ink/70 leading-relaxed">{body}</p>
          </div>
        ))}
      </section>

      {/* Categories */}
      <section className="container py-8 grid gap-4 md:grid-cols-3">
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/products?category=${c.slug}`}
            className="group relative overflow-hidden rounded-sm bg-sand-100 border border-sand-200 p-6 min-h-[11rem] flex flex-col justify-end hover:bg-sand-200 transition"
          >
            <h3 className="font-display text-2xl text-leather-800">{c.name}</h3>
            <p className="mt-1 text-sm text-ink/60">{c.blurb}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs uppercase tracking-wider text-oxblood-500">
              Browse <ArrowRight className="size-3" />
            </span>
          </Link>
        ))}
      </section>

      {/* Featured */}
      <section className="container py-12">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-3xl">New in the workshop</h2>
          <Link href="/products" className="text-sm text-oxblood-500 hover:underline flex items-center gap-1">
            View all <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-6 grid gap-6 grid-cols-2 md:grid-cols-4">
          {featured.length === 0 && (
            <div className="col-span-full rounded-sm border border-dashed border-sand-300 p-10 text-center text-ink/60 text-sm">
              No products yet. Seed demo data via <code>pnpm db:seed</code> or add products in <Link href="/admin/products" className="underline">/admin</Link>.
            </div>
          )}
          {featured.map((p) => (
            <Link key={p.id} href={`/products/${p.slug}`} className="group block">
              <div className="relative aspect-square bg-sand-100 rounded-sm overflow-hidden">
                {p.images[0]?.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.images[0].url} alt={p.name} className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                ) : (
                  <div className="h-full w-full grid place-items-center text-ink/30 text-xs uppercase tracking-wider">Photo pending</div>
                )}
              </div>
              <div className="pt-3">
                <h3 className="font-display text-lg text-leather-800 group-hover:text-oxblood-500">{p.name}</h3>
                <p className="mt-0.5 text-sm text-ink/70">
                  {rupeesOnly(p.basePrice)}
                  {p.mrp && p.mrp > p.basePrice && <span className="ml-2 text-ink/40 line-through">{rupeesOnly(p.mrp)}</span>}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Craft */}
      <section className="bg-leather-50 py-14">
        <div className="container">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-oxblood-500">From hide to hand</p>
          <h2 className="mt-2 font-display text-3xl max-w-xl">Four steps, all of them in our own workshop.</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {CRAFT.map((c, i) => (
              <li key={c.step} className="border-l border-sand-300 pl-4">
                <span className="font-display text-sm text-ink/40">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-display text-xl text-leather-800">{c.step}</h3>
                <p className="mt-2 text-sm text-ink/70 leading-relaxed">{c.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Wholesale */}
      <section className="container py-14 grid gap-8 md:grid-cols-2 items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-oxblood-500">For retailers and institutions</p>
          <h2 className="mt-2 font-display text-3xl">Stock IDEALX in your store, or buy for your organisation.</h2>
          <p className="mt-3 text-ink/70 max-w-md">
            Tiered dealer pricing, GST-compliant invoicing, and supply through GeM for office bags, laptop bags and formal footwear.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dealer-application">Apply for a dealer account</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/tenders">Institutional &amp; GeM supply</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-sm border border-sand-200 bg-sand-50 p-6">
          <h3 className="font-display text-xl">What dealers get</h3>
          <ul className="mt-3 space-y-2 text-sm text-ink/80">
            <li>· Tier-based wholesale pricing (A / B / C)</li>
            <li>· Net-30 credit, subject to approval</li>
            <li>· Bulk CSV order upload</li>
            <li>· GST tax invoices and e-invoicing where applicable</li>
            <li>· Dispatch from the Agra workshop</li>
          </ul>
        </div>
      </section>
    </>
  );
}
