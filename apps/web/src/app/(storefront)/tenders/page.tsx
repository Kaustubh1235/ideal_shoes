import Link from "next/link";
import { Button } from "@bharatboot/ui";

export const metadata = { title: "Institutional & GeM supply" };

export default function PublicTendersPage() {
  const email = process.env.SELLER_EMAIL;
  return (
    <div className="container py-12 max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-[0.25em] text-oxblood-500">Institutional buyers</p>
      <h1 className="mt-2 font-display text-4xl">Office bags, laptop bags and formal footwear, supplied in bulk.</h1>
      <p className="mt-4 text-ink/70 leading-relaxed">
        IDEALX supplies corporate gifting programmes, institutions and government buyers through GeM and direct
        purchase orders. Everything is made in our own Agra workshop, so we can hold a specification across a large
        order and brand pieces for your organisation.
      </p>
      <h2 className="mt-8 font-display text-2xl">What we can do</h2>
      <ul className="mt-3 ml-4 list-disc text-ink/80 space-y-1.5">
        <li>Full-grain leather bags, belts and wallets to a fixed specification</li>
        <li>Formal and casual footwear in full size runs</li>
        <li>Embossed or debossed logos and gift packaging</li>
        <li>GST-compliant invoicing, with IRN where applicable</li>
        <li>E-way bills for inter-state dispatch</li>
        <li>Udyam-registered MSME supplier; GeM catalogue on request</li>
      </ul>

      <h2 className="mt-8 font-display text-2xl">Send a requirement</h2>
      <p className="mt-2 text-ink/70">
        {email ? (
          <>Email the specification and quantities to <span className="font-medium">{email}</span>; we reply within two business days with a sample timeline and a quote.</>
        ) : (
          <>Use the dealer application below with your specification and quantities; we reply within two business days with a sample timeline and a quote.</>
        )}
      </p>
      <Button asChild className="mt-6">
        <Link href="/dealer-application">Open a buyer account</Link>
      </Button>
    </div>
  );
}
