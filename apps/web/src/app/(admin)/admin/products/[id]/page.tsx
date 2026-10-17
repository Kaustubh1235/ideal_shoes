import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge, Button, Input, Label, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";
import { rupeesOnly } from "@/lib/money";
import { addVariantAction, toggleStatusAction } from "@/app/actions/admin-products-detail";

export const dynamic = "force-dynamic";

export default async function AdminProductDetail({ params }: { params: { id: string } }) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { variants: { orderBy: { size: "asc" } }, images: true, category: true },
  });
  if (!product) notFound();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display text-2xl uppercase">{product.name}</h1>
          <p className="text-sm text-ink/60">{product.sku} · HSN {product.hsnCode}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={product.status === "active" ? "success" : "outline"}>{product.status}</Badge>
          <form action={toggleStatusAction.bind(null, product.id)}>
            <Button type="submit" variant="outline" size="sm">
              {product.status === "active" ? "Move to Draft" : "Publish"}
            </Button>
          </form>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Variants</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.variants.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                  <TableCell>UK {v.size}</TableCell>
                  <TableCell>{v.color}</TableCell>
                  <TableCell>{rupeesOnly(v.priceOverride ?? product.basePrice)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <form action={addVariantAction.bind(null, product.id)} className="mt-4 grid grid-cols-4 gap-2">
            <Input name="size" placeholder="Size (e.g. 9)" required />
            <Input name="color" placeholder="Color" required />
            <Input name="priceOverride" type="number" placeholder="Price override (₹)" />
            <Button type="submit">Add Variant</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Images</CardTitle></CardHeader>
        <CardContent>
          {product.images.length === 0 ? (
            <p className="text-ink/60 text-sm">No images uploaded. Use the upload endpoint with a presigned URL.</p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {product.images.map((img) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={img.id} src={img.url} alt={img.alt ?? ""} className="aspect-square rounded border border-leather-100 object-cover" />
              ))}
            </div>
          )}
          <p className="text-xs text-ink/60 mt-2">Use POST /uploads/presign on the API to obtain a signed PUT URL. Object key returned is then saved as a ProductImage.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>AR / 3D Model</CardTitle></CardHeader>
        <CardContent>
          {product.arEnabled && product.arModelUrl ? (
            <p className="text-sm">Model URL: <a className="underline" href={product.arModelUrl}>{product.arModelUrl}</a></p>
          ) : product.arEnabled ? (
            <p className="text-sm text-yellow-700">AR enabled but no .glb uploaded yet.</p>
          ) : (
            <p className="text-sm text-ink/60">AR disabled.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
