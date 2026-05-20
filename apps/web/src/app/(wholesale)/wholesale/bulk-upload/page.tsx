import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@bharatboot/ui";
import { bulkUploadAction } from "@/app/actions/wholesale-bulk";

export default function BulkUploadPage() {
  return (
    <div className="container py-8 max-w-2xl">
      <h1 className="font-display text-3xl uppercase">Bulk CSV Upload</h1>
      <p className="text-sm text-ink/60 mt-2">
        Upload a CSV with columns: <code>sku, size, color, quantity</code>. Matching variants are added to your cart.
      </p>

      <Card className="mt-6">
        <CardHeader><CardTitle>Upload</CardTitle></CardHeader>
        <CardContent>
          <form action={bulkUploadAction} className="space-y-4">
            <div>
              <Label htmlFor="csv">CSV File</Label>
              <input
                id="csv"
                name="csv"
                type="file"
                accept=".csv,text/csv"
                required
                className="flex h-10 w-full rounded-md border border-olive-200 bg-cream px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" size="lg">Upload &amp; Add to Cart</Button>
          </form>
        </CardContent>
      </Card>

      <details className="mt-6 text-sm">
        <summary className="cursor-pointer font-medium">Example CSV</summary>
        <pre className="mt-2 rounded bg-olive-50 p-3 text-xs">
sku,size,color,quantity{"\n"}
BBT-ARMY-001,9,Olive,50{"\n"}
BBT-ARMY-001,10,Olive,30{"\n"}
BBT-OXF-002,8,Black,20
        </pre>
      </details>
    </div>
  );
}
