import { LegalPage, Contact } from "@/components/storefront/legal-page";
import { seller } from "@/lib/seller";

export const metadata = { title: "Exchanges & returns", description: "30-day exchange on size and fit; defects replaced or refunded." };

export default function ReturnsPage() {
  const s = seller();
  return (
    <LegalPage title="Exchanges & returns" updated="25 October 2026">
      <h2>30-day exchange</h2>
      <p>
        If the size or fit is not right, you can exchange the pair for another size or another article within 30 days of
        delivery. Try shoes indoors on a clean floor: they must come back unworn outside, with the box.
      </p>

      <h2>Defects</h2>
      <p>
        If something is wrong with how a product was made (stitching, sole, hardware), tell us within 30 days of delivery.
        We repair or replace it, and if neither is possible we refund it in full. We pay the return shipping for defects.
      </p>

      <h2>How to ask</h2>
      <ol>
        <li>Write to <Contact email={s.email} phone={s.phone} /> with your order number, the item and a photo if it is a defect.</li>
        <li>We reply within one working day with how to send it back.</li>
        <li>We check the item within 2–3 working days of receiving it and send the exchange, or refund to your original payment method within 7 working days.</li>
      </ol>

      <h2>What we cannot take back</h2>
      <ul>
        <li>Items worn outdoors or damaged after delivery.</li>
        <li>Made-to-order or customised items, unless they are defective.</li>
      </ul>
      <p>Your rights under the Consumer Protection Act, 2019 are not affected by this policy.</p>
    </LegalPage>
  );
}
