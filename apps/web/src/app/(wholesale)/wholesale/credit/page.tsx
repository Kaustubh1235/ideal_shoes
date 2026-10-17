import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@bharatboot/ui";
import { inr } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function CreditPage() {
  const session = await auth();
  const dealer = await prisma.dealerProfile.findUnique({ where: { userId: session!.user.id } });

  return (
    <div className="container py-8 max-w-2xl">
      <h1 className="font-display text-3xl uppercase">Credit</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Limit</CardTitle></CardHeader>
          <CardContent><p className="font-display text-2xl">{inr(dealer?.creditLimit ?? 0)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Used</CardTitle></CardHeader>
          <CardContent><p className="font-display text-2xl">{inr(dealer?.creditUsed ?? 0)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Available</CardTitle></CardHeader>
          <CardContent><p className="font-display text-2xl text-leather-700">{inr((dealer?.creditLimit ?? 0) - (dealer?.creditUsed ?? 0))}</p></CardContent>
        </Card>
      </div>
      <p className="mt-6 text-sm text-ink/70">
        Payment terms: <strong>Net-{dealer?.paymentTermsDays ?? 0} days</strong>.
        Contact your account manager to request a credit limit increase.
      </p>
    </div>
  );
}
