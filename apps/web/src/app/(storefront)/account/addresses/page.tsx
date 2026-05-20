import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@bharatboot/ui";

export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const session = await auth();
  const addresses = await prisma.address.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl uppercase">Addresses</h1>
      <p className="text-sm text-ink/60 mt-1">Addresses are saved when you place orders. Add new ones at checkout.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {addresses.length === 0 && (
          <p className="text-ink/60 text-sm col-span-full">No saved addresses yet.</p>
        )}
        {addresses.map((a) => (
          <Card key={a.id}>
            <CardHeader><CardTitle className="text-base">{a.fullName}</CardTitle></CardHeader>
            <CardContent className="text-sm text-ink/80">
              <p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
              <p>{a.city}, {a.state} - {a.pincode}</p>
              <p className="text-ink/60 mt-1">Phone: {a.phone}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
