import { Button, Input, Label, Textarea } from "@bharatboot/ui";
import { dealerApplyAction } from "@/app/actions/dealer";

export const metadata = { title: "Become a dealer", description: "Stock IDEALX boots and formal shoes: apply for a dealer account with your GSTIN for wholesale prices and GST invoices." };

export default function DealerApplicationPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="container py-12 max-w-2xl">
      <h1 className="font-display text-3xl">Become a Dealer</h1>
      <p className="text-ink/70 mt-2">
        Apply for an authorised dealer account. We&apos;ll review your application and
        provision login + price tier within 2 business days.
      </p>

      {searchParams.error && (
        <p role="alert" className="mt-6 rounded-md border border-oxblood-200 bg-oxblood-50 p-3 text-sm text-oxblood-700">
          {searchParams.error === "exists"
            ? "There is already an account with this email, phone or GSTIN. Sign in, or contact us and we will sort it out."
            : "Too many applications from this connection. Please try again in an hour."}
        </p>
      )}

      <form action={dealerApplyAction} className="mt-8 space-y-6 rounded-lg border border-leather-100 bg-cream p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label htmlFor="businessName">Business / Firm Name</Label><Input name="businessName" required /></div>
          <div><Label htmlFor="contactName">Contact Person</Label><Input name="contactName" required /></div>
          <div><Label htmlFor="email">Email</Label><Input name="email" type="email" required /></div>
          <div><Label htmlFor="phone">Phone</Label><Input name="phone" pattern="[6-9][0-9]{9}" required /></div>
          <div><Label htmlFor="gstin">GSTIN</Label><Input name="gstin" required /></div>
          <div><Label htmlFor="pan">PAN</Label><Input name="pan" pattern="[A-Z]{5}[0-9]{4}[A-Z]{1}" required /></div>
          <div><Label htmlFor="yearsInBusiness">Years in Business</Label><Input name="yearsInBusiness" type="number" min={0} /></div>
          <div><Label htmlFor="monthlyValue">Estimated Monthly Orders (₹)</Label><Input name="monthlyValue" type="number" min={0} /></div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Label htmlFor="line1">Billing Address Line 1</Label><Input name="line1" required /></div>
          <div><Label htmlFor="city">City</Label><Input name="city" required /></div>
          <div><Label htmlFor="pincode">Pincode</Label><Input name="pincode" pattern="[1-9][0-9]{5}" required /></div>
          <div><Label htmlFor="state">State</Label><Input name="state" required /></div>
          <div><Label htmlFor="stateCode">State Code</Label><Input name="stateCode" pattern="[0-9]{2}" required /></div>
        </div>

        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea name="notes" rows={3} />
        </div>

        <Button type="submit" size="lg" className="w-full">Submit Application</Button>
      </form>
    </div>
  );
}
