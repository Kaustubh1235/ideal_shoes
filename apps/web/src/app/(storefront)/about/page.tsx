import Link from "next/link";

export const metadata = { title: "Our Factory" };

export default function AboutPage() {
  return (
    <div className="container py-12 max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-[0.25em] text-oxblood-500">Our factory</p>
      <h1 className="mt-2 font-display text-4xl">A boot factory in Agra, a family shoe shop in front of it, and a name on the box.</h1>
      <div className="mt-6 space-y-5 text-ink/80 leading-relaxed">
        <p>
          Ideal Shoes is a family footwear business in Agra. Behind the shop is the part most customers never see:
          the factory where we make service and army boots, formal shoes and jackets. IDEALX is the name on the
          box when a pair comes off that floor.
        </p>
        <p>
          Boots for service are an unforgiving product. They are worn all day, in every season, by people who
          cannot stop to change them. Building them teaches you what matters in a shoe: the last, the leather, how
          the sole is fixed to the upper. We build our formal shoes the same way, on the same floor, with the same
          people.
        </p>
        <p>
          Agra has made leather footwear since the Mughal court and is India&apos;s oldest leather footwear cluster,
          with a Geographical Indication tag for its leather footwear. The skills are local and generational:
          clicking, closing, lasting, finishing.
        </p>
        <p>
          We sell direct, from our own shop and from this site, so the price you pay is the maker&apos;s price.
          Dealers, institutions and government buyers can order to specification through the{" "}
          <Link href="/tenders" className="underline underline-offset-4 text-oxblood-500">institutional supply</Link>{" "}
          page. If a pair isn&apos;t right, exchange it within 30 days; if it wears, bring it back to the shop and
          we will tell you what can be done.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link href="/products?category=boots" className="underline underline-offset-4 text-oxblood-500">Shop boots</Link>
        <Link href="/products?category=shoes" className="underline underline-offset-4 text-oxblood-500">Shop formal shoes</Link>
        <Link href="/contact" className="underline underline-offset-4 text-oxblood-500">Visit the shop</Link>
      </div>
    </div>
  );
}
