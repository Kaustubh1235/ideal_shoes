import { LegalPage, Contact } from "@/components/storefront/legal-page";
import { seller } from "@/lib/seller";

export const metadata = { title: "Shipping", description: "Free shipping across India from our Agra factory." };

export default function ShippingPage() {
  const s = seller();
  return (
    <LegalPage title="Shipping" updated="25 October 2026">
      <ul>
        <li><b>Free shipping</b> on every order, anywhere in India.</li>
        <li>We dispatch from our Agra workshop within 1–2 working days of payment.</li>
        <li>Delivery usually takes 3–5 working days to metro cities and 5–8 days elsewhere.</li>
        <li>When the parcel leaves, we send you the courier name and tracking number.</li>
        <li>Payment is online only (UPI, cards, net banking through Razorpay); we do not offer cash on delivery yet.</li>
      </ul>
      <p>
        Bulk and dealer orders ship on the terms of the quotation. Questions about a delivery: <Contact email={s.email} phone={s.phone} />,
        with your order number.
      </p>
    </LegalPage>
  );
}
