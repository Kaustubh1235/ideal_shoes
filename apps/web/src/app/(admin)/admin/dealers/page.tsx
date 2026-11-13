import { prisma } from "@/lib/prisma";
import { Badge, Input, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";
import { approveDealerAction, suspendDealerAction, setDealerPasswordAction } from "@/app/actions/admin-dealers";

export const dynamic = "force-dynamic";

export default async function AdminDealersPage() {
  const dealers = await prisma.dealerProfile.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, phone: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl uppercase">Dealers</h1>
      <div className="rounded-lg border border-leather-100 bg-cream">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dealers.map((d) => (
              <TableRow key={d.userId}>
                <TableCell><span className="font-medium">{d.businessName}</span></TableCell>
                <TableCell className="font-mono text-xs">{d.gstin}</TableCell>
                <TableCell>{d.user.email ?? d.user.phone}</TableCell>
                <TableCell>{d.priceTier}</TableCell>
                <TableCell>
                  <Badge
                    variant={d.status === "approved" ? "success" : d.status === "pending" ? "warning" : d.status === "suspended" ? "destructive" : "outline"}
                  >
                    {d.status}
                  </Badge>
                </TableCell>
                <TableCell className="flex gap-2">
                  {d.status === "pending" && (
                    <form action={approveDealerAction.bind(null, d.userId)}>
                      <Button type="submit" size="sm">Approve</Button>
                    </form>
                  )}
                  {d.status === "approved" && (
                    <>
                      <form action={suspendDealerAction.bind(null, d.userId)}>
                        <Button type="submit" size="sm" variant="outline">Suspend</Button>
                      </form>
                      <form action={setDealerPasswordAction.bind(null, d.userId)} className="flex gap-1">
                        <Input name="password" type="password" minLength={10} required placeholder="New password" className="h-8 w-36" autoComplete="new-password" aria-label={`Password for ${d.businessName}`} />
                        <Button type="submit" size="sm" variant="outline">Set</Button>
                      </form>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {dealers.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-ink/60 py-8">No dealer applications yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
