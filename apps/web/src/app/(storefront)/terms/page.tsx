import Link from "next/link";
import { LegalPage, Contact } from "@/components/storefront/legal-page";
import { seller } from "@/lib/seller";

export const metadata = { title: "Terms of sale", description: "Terms for buying from IDEALX, Ideal Shoes, Agra." };

export default function TermsPage() {
  const s = seller();
  const grievance = process.env.GRIEVANCE_OFFICER || "The proprietor, " + s.legalName;
  return (
    <LegalPage title="Terms of sale" updated="25 October 2026">
      <p>
        This website is run by <b>{s.legalName}</b> (brand {s.tradeName}), {s.address}
        {s.gstin && <>, GSTIN {s.gstin}</>}. By placing an order you agree to these terms.
      </p>

      <h2>Prices, tax and invoices</h2>
      <ul>
        <li>All prices are in Indian rupees and include GST. The amount at checkout is the amount you pay.</li>
        <li>Every order gets a GST tax invoice, which you can download from the order page once it is ready. Business buyers who enter a GSTIN at checkout can claim input tax credit on it.</li>
        <li>We may correct an obvious pricing mistake before dispatch; if we do, we offer you the corrected price or a full refund.</li>
      </ul>

      <h2>Orders and payment</h2>
      <ul>
        <li>Payment is taken online through Razorpay (UPI, cards, net banking, wallets). Your order is confirmed when Razorpay confirms the payment to us.</li>
        <li>You can cancel free of charge until the order is dispatched. Write to us with the order number.</li>
        <li>If an item turns out to be out of stock after payment, we tell you and refund it in full to the original payment method.</li>
      </ul>

      <h2>Delivery, exchanges and returns</h2>
      <p>
        See <Link href="/shipping">Shipping</Link> and <Link href="/returns">Exchanges &amp; returns</Link>. In short: free
        shipping across India, and a 30-day exchange on size and fit.
      </p>

      <h2>Products</h2>
      <p>
        Our shoes and boots are made from leather, a natural material: small differences in grain and colour from the photos
        are normal and are not defects. Sizes are UK sizes.
      </p>

      <h2>Dealers and institutions</h2>
      <p>
        Wholesale (dealer) and tender/GeM supplies are governed by the quotation, purchase order or contract for that supply,
        together with these terms where they do not conflict.
      </p>

      <h2>Law and disputes</h2>
      <p>
        These terms are governed by the laws of India. Courts at Agra, Uttar Pradesh have jurisdiction, without affecting
        your right as a consumer to approach a consumer commission under the Consumer Protection Act, 2019.
      </p>

      <h2>Grievance officer</h2>
      <p>
        {grievance}. Contact: <Contact email={s.email} phone={s.phone} />. We acknowledge a complaint within 48 hours and
        resolve it within one month.
      </p>
    </LegalPage>
  );
}
