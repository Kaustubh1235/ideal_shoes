import { Input, Label, Button, Textarea } from "@bharatboot/ui";
import { createProductAction } from "@/app/actions/admin-products";

export default function NewProductPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl uppercase">New Product</h1>
      <form action={createProductAction} className="mt-6 space-y-4 rounded-lg border border-leather-100 bg-cream p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>SKU</Label><Input name="sku" required /></div>
          <div><Label>Slug</Label><Input name="slug" pattern="[a-z0-9-]+" required /></div>
        </div>
        <div><Label>Name</Label><Input name="name" required /></div>
        <div><Label>Short Description</Label><Input name="shortDescription" /></div>
        <div><Label>Description</Label><Textarea name="description" rows={4} /></div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Category</Label>
            <select name="categorySlug" className="flex h-10 w-full rounded-md border border-leather-200 bg-cream px-3 py-2 text-sm">
              <option value="boots">Service &amp; Army Boots</option>
              <option value="shoes">Formal Shoes</option>
              <option value="jackets">Jackets</option>
              <option value="bags">Leather Bags</option>
            </select>
          </div>
          <div><Label>HSN Code</Label><Input name="hsnCode" pattern="[0-9]{4,8}" required defaultValue="6403" /></div>
          <div><Label>Base Price (₹)</Label><Input name="basePrice" type="number" min={1} required /></div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div><Label>MRP (₹)</Label><Input name="mrp" type="number" min={1} /></div>
          <div><Label>Weight (grams)</Label><Input name="weightGrams" type="number" min={1} /></div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="arEnabled" /> AR-enabled
            </label>
          </div>
        </div>
        <Button type="submit" size="lg">Create Product</Button>
      </form>
    </div>
  );
}
