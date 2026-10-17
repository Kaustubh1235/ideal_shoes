import Link from "next/link";

export const metadata = { title: "Our Craft" };

export default function AboutPage() {
  return (
    <div className="container py-12 max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-[0.25em] text-oxblood-500">Our craft</p>
      <h1 className="mt-2 font-display text-4xl">A shoe shop in Agra, a leather workshop behind it, and a name on the box.</h1>
      <div className="mt-6 space-y-5 text-ink/80 leading-relaxed">
        <p>
          Ideal Shoes is a family footwear shop in Agra. Behind the counter is the part most customers never see: a
          store room of full-grain hides and the workshop where our bags, belts and wallets are cut and stitched.
          IDEALX is what we put on the box when it comes from that workshop.
        </p>
        <p>
          Agra has made leather footwear since the Mughal court, and today it is India&apos;s oldest leather
          footwear cluster, with a Geographical Indication tag for its leather footwear. The skills are local and
          generational: clicking, closing, lasting, edge-finishing. We make a small range well rather than a large
          range cheaply.
        </p>
        <p>
          We sell direct, from our own shop and from this site, so the price you pay is the maker&apos;s price. Every
          piece is full-grain leather from the top of the hide, with solid fittings and stitched (not glued) stress
          points. It will scuff and darken with use. That is the point.
        </p>
        <p>
          If something isn&apos;t right, exchange it within 30 days. If it wears, bring it back to the shop and we
          will tell you what can be done.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link href="/products?category=bags" className="underline underline-offset-4 text-oxblood-500">Shop bags</Link>
        <Link href="/products?category=shoes" className="underline underline-offset-4 text-oxblood-500">Shop shoes</Link>
        <Link href="/contact" className="underline underline-offset-4 text-oxblood-500">Visit the shop</Link>
      </div>
    </div>
  );
}
