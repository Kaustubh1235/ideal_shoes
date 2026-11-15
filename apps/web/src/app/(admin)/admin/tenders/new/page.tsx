import { Button, Input, Label, Textarea } from "@bharatboot/ui";
import { createTenderAction } from "@/app/actions/admin-tenders-manual";

export default function NewTenderPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl uppercase">New Tender</h1>
      <form action={createTenderAction} className="mt-6 space-y-4 rounded-lg border border-leather-100 bg-cream p-6">
        <div><Label>Title</Label><Input name="title" required /></div>
        <div><Label>Buyer Organisation</Label><Input name="buyer_org" required /></div>
        <div><Label>Description</Label><Textarea name="description" rows={4} /></div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Submission Deadline</Label><Input name="submission_deadline" type="datetime-local" /></div>
          <div><Label>Estimated Value (₹)</Label><Input name="estimated_value" type="number" min={0} /></div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>URL</Label><Input name="url" type="url" /></div>
          <div><Label>Category</Label><Input name="category" /></div>
        </div>
        <Button type="submit" size="lg">Create Tender</Button>
      </form>
    </div>
  );
}
