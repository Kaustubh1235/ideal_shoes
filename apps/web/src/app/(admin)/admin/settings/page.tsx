import { Card, CardContent, CardHeader, CardTitle } from "@bharatboot/ui";

export default function AdminSettingsPage() {
  const flags = [
    { key: "RAZORPAY_KEY_ID", set: !!process.env.RAZORPAY_KEY_ID, note: "Payments — NEXT-STEPS step 1" },
    { key: "MSG91_AUTH_KEY", set: !!process.env.MSG91_AUTH_KEY, note: "Phone OTP — NEXT-STEPS step 2" },
    { key: "SELLER_GSTIN", set: !!process.env.SELLER_GSTIN, note: "GST invoicing — NEXT-STEPS step 4" },
    { key: "IRP_ENABLED", set: process.env.IRP_ENABLED === "true", note: "E-invoicing — NEXT-STEPS step 7" },
    { key: "TENDER_INBOX_HOST", set: !!process.env.TENDER_INBOX_HOST, note: "Email tender ingestion — NEXT-STEPS step 8" },
    { key: "SHIPROCKET_EMAIL", set: !!process.env.SHIPROCKET_EMAIL, note: "Shipping — NEXT-STEPS step 9" },
    { key: "WHATSAPP_ACCESS_TOKEN", set: !!process.env.WHATSAPP_ACCESS_TOKEN, note: "WhatsApp notifications — NEXT-STEPS step 10" },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-display text-2xl uppercase">Settings &amp; Integrations</h1>

      <Card>
        <CardHeader><CardTitle>Integration Status</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {flags.map((f) => (
              <li key={f.key} className="flex justify-between border-b border-leather-100 pb-2">
                <div>
                  <span className="font-mono text-xs mr-3">{f.key}</span>
                  <span className="text-ink/60">{f.note}</span>
                </div>
                <span className={f.set ? "text-green-700 font-medium" : "text-ink/40"}>
                  {f.set ? "✓ Configured" : "Not set"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink/60">
            Edit values in <code>.env</code> and restart. See repo-root <code>NEXT-STEPS.md</code> for step-by-step.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Seller Identity (used on invoices)</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-ink/60">GSTIN</dt><dd className="font-mono">{process.env.SELLER_GSTIN || "(not set)"}</dd>
            <dt className="text-ink/60">Legal Name</dt><dd>{process.env.SELLER_LEGAL_NAME || "(not set)"}</dd>
            <dt className="text-ink/60">Trade Name</dt><dd>{process.env.SELLER_TRADE_NAME || "(not set)"}</dd>
            <dt className="text-ink/60">State Code</dt><dd>{process.env.SELLER_STATE_CODE || "(not set)"}</dd>
            <dt className="text-ink/60">Financial Year</dt><dd>{process.env.SELLER_FINANCIAL_YEAR || "(not set)"}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
