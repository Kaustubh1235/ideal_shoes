export const metadata = { title: "Contact" };

export default function ContactPage() {
  const email = process.env.SELLER_EMAIL;
  const phone = process.env.SELLER_PHONE;
  let address: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string } | null = null;
  try {
    address = process.env.SELLER_ADDRESS_JSON ? JSON.parse(process.env.SELLER_ADDRESS_JSON) : null;
  } catch {
    address = null;
  }
  const addressLine = address
    ? [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(", ")
    : "";

  return (
    <div className="container py-12 max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-[0.25em] text-oxblood-500">Contact</p>
      <h1 className="mt-2 font-display text-4xl">Come to the shop, or write to us.</h1>
      <p className="mt-4 text-ink/70">
        The IDEALX workshop and the Ideal Shoes shop are both in Agra. For orders, exchanges and wholesale enquiries:
      </p>
      <dl className="mt-6 space-y-3 text-sm">
        <div><dt className="text-ink/60 inline-block w-28">Shop</dt><dd className="inline">{addressLine || "Ideal Shoes, Agra, Uttar Pradesh (set SELLER_ADDRESS_JSON in .env)"}</dd></div>
        <div><dt className="text-ink/60 inline-block w-28">WhatsApp</dt><dd className="inline">{phone || "(set SELLER_PHONE in .env)"}</dd></div>
        <div><dt className="text-ink/60 inline-block w-28">Email</dt><dd className="inline">{email || "(set SELLER_EMAIL in .env)"}</dd></div>
      </dl>
      <p className="mt-6 text-sm text-ink/60">
        Dealers and institutional buyers: use the <a className="underline underline-offset-4" href="/dealer-application">dealer application</a> and we will call you back.
      </p>
    </div>
  );
}
