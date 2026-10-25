import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge, Button, Input, Label, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";
import { rupeesOnly } from "@/lib/money";
import { addVariantAction, toggleStatusAction, setVariantBarcodeAction, uploadImageAction, setPrimaryImageAction, deleteImageAction } from "@/app/actions/admin-products-detail";

export const dynamic = "force-dynamic";

export default async function AdminProductDetail({ params }: { params: { id: string } }) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { variants: { orderBy: { size: "asc" } }, images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] }, category: true },
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
                <TableHead>Stock Room code</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.variants.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                  <TableCell>UK {v.size}</TableCell>
                  <TableCell>{v.color}</TableCell>
                  <TableCell>{rupeesOnly(v.priceOverride ?? product.basePrice)}</TableCell>
                  <TableCell>
                    <form action={setVariantBarcodeAction.bind(null, product.id, v.id)} className="flex gap-1">
                      <Input name="barcode" defaultValue={v.barcode ?? ""} placeholder="IDEA-…-9" className="h-8 w-44 font-mono text-xs" aria-label={`Stock Room code for UK ${v.size} ${v.color}`} />
                      <Button type="submit" size="sm" variant="outline">Save</Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <form action={addVariantAction.bind(null, product.id)} className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
            <Input name="size" placeholder="Size (e.g. 9)" required />
            <Input name="color" placeholder="Color" required />
            <Input name="priceOverride" type="number" placeholder="Price override (₹)" />
            <Input name="barcode" placeholder="Stock Room code" className="font-mono" />
            <Button type="submit">Add Variant</Button>
          </form>
          <p className="text-xs text-ink/60 mt-2">Stock Room code: the code printed on the box label. Stock levels sync from Stock Room by this code every 15 minutes.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Images</CardTitle></CardHeader>
        <CardContent>
          {product.images.length === 0 ? (
            <p className="text-ink/60 text-sm">No photos yet. The first one you add is shown on the product card.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {product.images.map((img) => (
                <figure key={img.id} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt ?? ""} className="aspect-square w-full rounded border border-leather-100 object-cover" />
                  <figcaption className="flex items-center justify-between gap-1 text-xs">
                    {img.isPrimary ? (
                      <Badge variant="success">Main photo</Badge>
                    ) : (
                      <form action={setPrimaryImageAction.bind(null, product.id, img.id)}>
                        <Button type="submit" size="sm" variant="outline">Make main</Button>
                      </form>
                    )}
                    <form action={deleteImageAction.bind(null, product.id, img.id)}>
                      <Button type="submit" size="sm" variant="ghost">Remove</Button>
                    </form>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          <form action={uploadImageAction.bind(null, product.id)} className="mt-4 flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="image">Add a photo</Label>
              <Input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" required />
            </div>
            <div className="grow">
              <Label htmlFor="alt">Describe it (for search and screen readers)</Label>
              <Input id="alt" name="alt" placeholder="Black DMS boot, side view" />
            </div>
            <Button type="submit">Upload</Button>
          </form>
          <p className="text-xs text-ink/60 mt-2">JPEG, PNG or WebP, up to 5 MB. Square photos about 2000 px look best.</p>
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
