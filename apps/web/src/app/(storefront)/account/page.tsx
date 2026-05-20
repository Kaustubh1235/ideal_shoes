import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@bharatboot/ui";
import { inr } from "@/lib/money";
import { Package, MapPin, LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    include: { customer: true, orders: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  if (!user) return null;

  return (
    <div className="container py-8">
      <h1 className="font-display text-3xl uppercase tracking-wide">My Account</h1>
      <p className="text-ink/60 mt-1 text-sm">{user.email ?? user.phone}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Package className="size-4" /> Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display">{user.orders.length}</p>
            <Link href="/account/orders" className="text-sm text-olive-700 hover:underline">View all</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MapPin className="size-4" /> Addresses</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/account/addresses" className="text-sm text-olive-700 hover:underline">Manage addresses</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Session</CardTitle></CardHeader>
          <CardContent>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
              <Button type="submit" variant="outline" size="sm"><LogOut className="size-4" /> Sign out</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-10 font-display text-xl uppercase tracking-wide">Recent Orders</h2>
      <div className="mt-3 space-y-2">
        {user.orders.length === 0 && (
          <p className="text-ink/60 text-sm">No orders yet. <Link href="/products" className="underline">Start shopping</Link>.</p>
        )}
        {user.orders.map((o) => (
          <Link
            key={o.id}
            href={`/account/orders/${o.id}`}
            className="flex justify-between items-center rounded border border-olive-100 bg-cream p-4 hover:border-olive-300"
          >
            <div>
              <p className="font-medium">{o.orderNo}</p>
              <p className="text-xs text-ink/60">{o.placedAt?.toLocaleDateString("en-IN") ?? "—"} · {o.status}</p>
            </div>
            <span className="font-medium">{inr(o.grandTotal)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
