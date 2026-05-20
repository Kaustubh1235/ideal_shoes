export default function TermsPage() {
  return (
    <div className="container py-12 max-w-2xl prose prose-sm">
      <h1 className="font-display text-3xl uppercase not-prose">Terms &amp; Conditions</h1>
      <p className="mt-4">Standard terms apply. Insert your jurisdiction-specific T&amp;C here before going live.</p>
      <ul>
        <li>All sales are subject to GST as per current rates.</li>
        <li>Subject to {process.env.SELLER_ADDRESS_JSON ? "seller-city" : "Pune"} jurisdiction.</li>
        <li>Goods once sold cannot be exchanged unless defective.</li>
        <li>Customer data is handled per our privacy policy.</li>
      </ul>
    </div>
  );
}
