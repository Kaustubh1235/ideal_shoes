import { LegalPage, Contact } from "@/components/storefront/legal-page";
import { seller } from "@/lib/seller";

export const metadata = { title: "Privacy", description: "What IDEALX collects, why, and who it is shared with." };

export default function PrivacyPage() {
  const s = seller();
  return (
    <LegalPage title="Privacy" updated="25 October 2026">
      <p>
        {s.legalName} ({s.tradeName}), {s.address}, decides how your personal data is used on this website. We follow the
        Digital Personal Data Protection Act, 2023. We do not sell your data and we do not show you third-party ads.
      </p>

      <h2>What we collect and why</h2>
      <ul>
        <li><b>Name, phone, email and addresses</b>: to deliver your order, issue the GST invoice and contact you about it.</li>
        <li><b>GSTIN and business details</b>, if you give them: to put them on a B2B invoice, or to assess a dealer application.</li>
        <li><b>Orders and payments</b>: what you bought and the payment reference. Card and UPI details go to Razorpay, never to us.</li>
        <li><b>Sign-in data</b>: your phone number for one-time codes, or email and a password stored only as a hash.</li>
      </ul>

      <h2>Messages</h2>
      <p>
        We send order messages (confirmation, dispatch, delivery) by WhatsApp to the phone number on the order, and by email if
        you gave one. These are about your order only, not marketing. Tell us if you would rather not receive WhatsApp
        updates and we will stop.
      </p>

      <h2>Who we share it with</h2>
      <p>Only what each needs to do its job for your order:</p>
      <ul>
        <li>Razorpay, for payment;</li>
        <li>the courier that delivers your parcel;</li>
        <li>Meta (WhatsApp Business) and our email provider, for order messages;</li>
        <li>MSG91, to send sign-in codes by SMS;</li>
        <li>tax authorities, as GST law requires (invoices, returns, e-invoicing where it applies).</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Invoices and the order details on them are kept for as long as GST law requires (at least six years). Your account
        and saved addresses are kept until you ask us to delete them.
      </p>

      <h2>Cookies</h2>
      <p>We use two kinds, both needed for the site to work: one keeps you signed in, one remembers your cart. No tracking cookies.</p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct or delete your data, or withdraw consent for messages, by writing to{" "}
        <Contact email={s.email} phone={s.phone} />. We answer within 30 days. Data we must keep for tax law is kept until that
        period ends. If you are not satisfied, you can complain to the Data Protection Board of India.
      </p>
    </LegalPage>
  );
}
