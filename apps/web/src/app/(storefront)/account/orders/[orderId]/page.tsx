import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { inr } from "@/lib/money";
import { Badge, Button } from "@bharatboot/ui";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: { orderId: string } }) {
  const session = await auth();
  const order = await prisma.order.findFirst({
    where: { id: params.orderId, userId: session!.user.id },
    include: {
      items: true,
      invoices: { take: 1 },
      shipments: true,
      payments: { take: 1, orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();

  return (
    <div className="container py-8 max-w-3xl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">{order.orderNo}</h1>
          <p className="text-ink/60 text-sm">{order.placedAt?.toLocaleString("en-IN") ?? "—"}</p>
        </div>
        <Badge variant="outline">{order.status}</Badge>
      </div>

      <section className="mt-8 rounded-lg border border-leather-100 bg-cream">
        <div className="p-4 border-b font-display text-sm tracking-wide">Items</div>
        <div className="divide-y divide-leather-100">
          {order.items.map((it) => (
            <div key={it.id} className="p-4 flex justify-between">
              <div>
                <p className="font-medium">{it.name}</p>
                <p className="text-xs text-ink/60">{it.sku} · HSN {it.hsnCode} · GST {(it.gstRate * 100).toFixed(0)}%</p>
              </div>
              <div className="text-right">
                <p>{inr(it.unitPrice)} × {it.quantity}</p>
                <p className="text-sm text-ink/70">{inr(it.lineTotal)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{inr(order.subtotal)}</span></div>
          <div className="flex justify-between text-ink/70"><span>CGST</span><span>{inr(order.cgstTotal)}</span></div>
          <div className="flex justify-between text-ink/70"><span>SGST</span><span>{inr(order.sgstTotal)}</span></div>
          <div className="flex justify-between text-ink/70"><span>IGST</span><span>{inr(order.igstTotal)}</span></div>
          <div className="flex justify-between text-ink/70"><span>Round off</span><span>{inr(order.roundOff)}</span></div>
          <div className="flex justify-between font-medium pt-2 border-t mt-2"><span>Total</span><span>{inr(order.grandTotal)}</span></div>
        </div>
      </section>

      {order.invoices[0]?.pdfUrl && (
        <Button asChild className="mt-6">
          <a href={order.invoices[0].pdfUrl} target="_blank" rel="noreferrer">Download Tax Invoice ({order.invoices[0].invoiceNo})</a>
        </Button>
      )}

      {order.shipments[0] && (
        <section className="mt-6 rounded-lg border border-leather-100 bg-cream p-4">
          <h2 className="font-display text-sm tracking-wide">Shipment</h2>
          <p className="mt-2 text-sm">
            {order.shipments[0].courier ?? "Pending courier"} · AWB {order.shipments[0].awb ?? "—"} · <Badge variant="outline">{order.shipments[0].status}</Badge>
          </p>
          {order.shipments[0].trackingUrl && (
            <a className="text-sm text-leather-700 underline" href={order.shipments[0].trackingUrl} target="_blank" rel="noreferrer">Track package</a>
          )}
        </section>
      )}

      <Link href="/account/orders" className="mt-8 inline-block text-sm text-leather-700 underline">← All orders</Link>
    </div>
  );
}
