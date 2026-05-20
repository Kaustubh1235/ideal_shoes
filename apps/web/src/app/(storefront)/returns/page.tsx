export default function ReturnsPage() {
  return (
    <div className="container py-12 max-w-2xl prose prose-sm">
      <h1 className="font-display text-3xl uppercase not-prose">Returns &amp; RMA</h1>
      <p className="mt-4">
        Returns accepted within 30 days of delivery for manufacturing defects or fit issues.
      </p>
      <ol className="mt-2">
        <li>Email <a href="mailto:returns@bharatboot.local">returns@bharatboot.local</a> with your order number and reason.</li>
        <li>We&apos;ll issue a return authorisation + prepaid shipping label.</li>
        <li>Pack and ship the item back unworn (except for fit-trial inside the house).</li>
        <li>Inspection takes 2-3 business days. Approved returns get a credit note + refund within 5 business days.</li>
      </ol>
      <p>
        Sale items, customised orders, and accessories are non-returnable unless defective.
      </p>
    </div>
  );
}
