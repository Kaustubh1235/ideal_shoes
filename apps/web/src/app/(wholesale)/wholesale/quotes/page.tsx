import { Card, CardContent, CardHeader, CardTitle, Button } from "@bharatboot/ui";
import Link from "next/link";

export default function QuotesPage() {
  return (
    <div className="container py-8 max-w-2xl">
      <h1 className="font-display text-3xl uppercase">Quotes</h1>
      <p className="text-sm text-ink/60 mt-2">
        Need a custom price for large quantities or special-spec items? Request a quote.
      </p>
      <Card className="mt-6">
        <CardHeader><CardTitle>Request Quote</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-ink/70">
            Email <a className="underline" href="mailto:wholesale@bharatboot.local">wholesale@bharatboot.local</a> with:
          </p>
          <ul className="mt-2 ml-4 list-disc text-sm text-ink/70 space-y-1">
            <li>Product SKUs or descriptions</li>
            <li>Quantities and required sizes</li>
            <li>Delivery deadline</li>
            <li>Any custom requirements (color, branding, packaging)</li>
          </ul>
          <Button asChild className="mt-4"><Link href="/wholesale/catalog">Browse Catalog</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
