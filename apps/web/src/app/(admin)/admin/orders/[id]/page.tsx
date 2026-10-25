import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@bharatboot/ui";
import { inr } from "@/lib/money";
import { markOrderStatusAction, generateInvoiceAction } from "@/app/actions/admin-orders";

export const dynamic = "force-dynamic";

const NEXT_STATUS: Record<string, string | null> = {
  paid: "processing",
  processing: "packed",
  packed: "shipped",
  shipped: "delivered",
};

export default async function AdminOrderDetail({ params }: { params: { id: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      items: true,
      user: true,
      payments: { orderBy: { createdAt: "desc" }, take: 5 },
      invoices: true,
      shipments: true,
    },
  });
  if (!order) notFound();

  const next = NEXT_STATUS[order.status];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl uppercase">{order.orderNo}</h1>
          <p className="text-sm text-ink/60">{order.createdAt.toLocaleString("en-IN")} · {order.user?.email ?? order.user?.phone ?? "Guest"}</p>
        </div>
        <Badge variant="outline">{order.status}</Badge>
      </div>

      <div className="flex gap-2 flex-wrap">
        {next && (
          <form action={markOrderStatusAction.bind(null, order.id, next)}>
            <Button type="submit">Mark as {next}</Button>
          </form>
        )}
        {!order.invoices[0] ? (
          <form action={generateInvoiceAction.bind(null, order.id)}>
            <Button type="submit" variant="outline">Generate Invoice</Button>
          </form>
        ) : (
          <Button asChild variant="outline">
            <a href={`/files/invoices/${order.invoices[0].id}/pdf`} target="_blank" rel="noreferrer">Open Invoice {order.invoices[0].invoiceNo}</a>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-ink/60 text-left">
              <tr><th>SKU</th><th>Description</th><th>HSN</th><th>Qty</th><th className="text-right">Line Total</th></tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id} className="border-t border-leather-100">
                  <td className="py-2 font-mono text-xs">{it.sku}</td>
                  <td>{it.name}</td>
                  <td>{it.hsnCode}</td>
                  <td>{it.quantity}</td>
                  <td className="text-right">{inr(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
            <dt>Subtotal</dt><dd className="text-right">{inr(order.subtotal)}</dd>
            <dt>CGST</dt><dd className="text-right">{inr(order.cgstTotal)}</dd>
            <dt>SGST</dt><dd className="text-right">{inr(order.sgstTotal)}</dd>
            <dt>IGST</dt><dd className="text-right">{inr(order.igstTotal)}</dd>
            <dt>Round off</dt><dd className="text-right">{inr(order.roundOff)}</dd>
            <dt className="font-medium pt-2 border-t">Grand Total</dt><dd className="font-medium text-right pt-2 border-t">{inr(order.grandTotal)}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
        <CardContent>
          {order.payments.length === 0 ? (
            <p className="text-ink/60 text-sm">No payment attempts yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {order.payments.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.gateway} · {p.gatewayPaymentId ?? p.gatewayOrderId} · {p.method ?? "—"}</span>
                  <Badge variant="outline">{p.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
