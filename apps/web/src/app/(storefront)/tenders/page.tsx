import Link from "next/link";
import { Button } from "@bharatboot/ui";

export const metadata = { title: "Institutional & GeM supply" };

export default function PublicTendersPage() {
  const email = process.env.SELLER_EMAIL;
  return (
    <div className="container py-12 max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-[0.25em] text-oxblood-500">Institutional buyers</p>
      <h1 className="mt-2 font-display text-4xl">Service boots to specification, from our own factory in Agra.</h1>
      <p className="mt-4 text-ink/70 leading-relaxed">
        IDEALX supplies service and army boots, formal footwear and jackets to government departments, security and
        industrial buyers and institutions, through GeM and direct purchase orders. Because we make in our own
        factory, we can hold a specification across a full size run and a large order.
      </p>
      <h2 className="mt-8 font-display text-2xl">What we can do</h2>
      <ul className="mt-3 ml-4 list-disc text-ink/80 space-y-1.5">
        <li>DMS and high-ankle service boots built to your specification and size breakup</li>
        <li>Formal shoes and jackets in full size runs</li>
        <li>Full-grain leather bags and accessories for corporate gifting, in limited runs</li>
        <li>GST-compliant invoicing, with IRN where applicable</li>
        <li>E-way bills for inter-state dispatch</li>
        <li>BIS certification for leather footwear under the 2024 Quality Control Order is in progress; ask us for the current status before a bid</li>
      </ul>

      <h2 className="mt-8 font-display text-2xl">Send a requirement</h2>
      <p className="mt-2 text-ink/70">
        {email ? (
          <>Email the specification, size breakup and quantities to <span className="font-medium">{email}</span>; we reply within two business days with a sample timeline and a quote.</>
        ) : (
          <>Use the buyer application below with your specification, size breakup and quantities; we reply within two business days with a sample timeline and a quote.</>
        )}
      </p>
      <Button asChild className="mt-6">
        <Link href="/dealer-application">Open a buyer account</Link>
      </Button>
    </div>
  );
}
