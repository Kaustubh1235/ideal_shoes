export default function ContactPage() {
  return (
    <div className="container py-12 max-w-2xl">
      <h1 className="font-display text-3xl uppercase">Contact</h1>
      <p className="mt-3 text-ink/70">
        For orders, returns, or general enquiries:
      </p>
      <dl className="mt-6 space-y-2 text-sm">
        <div><dt className="text-ink/60 inline-block w-24">Email</dt><dd className="inline">support@bharatboot.local</dd></div>
        <div><dt className="text-ink/60 inline-block w-24">Phone</dt><dd className="inline">(set SELLER_PHONE in .env)</dd></div>
        <div><dt className="text-ink/60 inline-block w-24">Wholesale</dt><dd className="inline">wholesale@bharatboot.local</dd></div>
        <div><dt className="text-ink/60 inline-block w-24">Tenders</dt><dd className="inline">tenders@bharatboot.local</dd></div>
      </dl>
    </div>
  );
}
