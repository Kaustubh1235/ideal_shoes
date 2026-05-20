import Link from "next/link";
import { Button } from "@bharatboot/ui";

export default function PublicTendersPage() {
  return (
    <div className="container py-12 max-w-2xl">
      <h1 className="font-display text-3xl uppercase">Government Tenders</h1>
      <p className="mt-3 text-ink/70">
        BharatBoot supplies army boots, jackets, and footwear to defense procurement and government agencies via GeM and direct tenders.
      </p>
      <h2 className="mt-8 font-display text-xl uppercase">Capabilities</h2>
      <ul className="mt-3 ml-4 list-disc text-ink/80 space-y-1">
        <li>ISO 9001:2015 certified manufacturing</li>
        <li>BIS-conformant DMS army boots</li>
        <li>Capacity: 5,000+ pairs / month</li>
        <li>Lead time: 4-6 weeks for fresh tender awards</li>
        <li>GST-compliant invoicing with IRN where applicable</li>
        <li>E-way bill generation for inter-state dispatches</li>
      </ul>

      <h2 className="mt-8 font-display text-xl uppercase">Submit RFQ</h2>
      <p className="mt-2 text-ink/70">
        Email tender documents to <a className="underline" href="mailto:tenders@bharatboot.local">tenders@bharatboot.local</a> for fastest response. Our team will revert within 2 business days.
      </p>
      <Button asChild className="mt-6">
        <Link href="/dealer-application">Become an Authorised Supplier</Link>
      </Button>
    </div>
  );
}
