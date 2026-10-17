import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { apiFetch } from "@/lib/api";
import { inr } from "@/lib/money";
import { PayButton } from "@/components/storefront/pay-button";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: { orderId: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { items: true },
  });
  if (!order) notFound();
  if (order.status === "paid" || order.status === "processing" || order.status === "shipped" || order.status === "delivered") {
    return (
      <div className="container py-16 text-center">
        <h1 className="font-display text-3xl">Already Paid</h1>
        <p className="mt-2 text-ink/70">Order {order.orderNo} is already {order.status}.</p>
      </div>
    );
  }

  let rzp: any = null;
  try {
    rzp = await apiFetch<any>("/payments/razorpay/order", {
      method: "POST",
      body: JSON.stringify({ order_id: order.id }),
    });
  } catch (e) {
    rzp = { error: (e as Error).message };
  }

  return (
    <div className="container py-12 max-w-xl">
      <h1 className="font-display text-3xl">Complete Payment</h1>
      <p className="text-ink/70 mt-1">Order {order.orderNo}</p>

      <div className="mt-6 rounded-lg border border-leather-100 bg-cream p-6">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(order.subtotal)}</dd></div>
          <div className="flex justify-between text-ink/70"><dt>GST</dt><dd>{inr(order.cgstTotal + order.sgstTotal + order.igstTotal)}</dd></div>
          <div className="flex justify-between text-ink/70"><dt>Round off</dt><dd>{inr(order.roundOff)}</dd></div>
        </dl>
        <div className="mt-4 pt-4 border-t flex justify-between font-medium text-lg">
          <span>To pay</span>
          <span>{inr(order.grandTotal)}</span>
        </div>
      </div>

      {rzp?.razorpay_order_id ? (
        <PayButton
          orderId={order.id}
          orderNo={order.orderNo}
          amount={order.grandTotal}
          rzpOrderId={rzp.razorpay_order_id}
          keyId={rzp.key_id}
        />
      ) : (
        <div className="mt-6 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          <p className="font-medium">Razorpay is not configured yet.</p>
          <p className="mt-1">Add RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET to <code>.env</code>, then restart. See <code>NEXT-STEPS.md</code> step 1.</p>
          {rzp?.error && <p className="mt-2 text-xs opacity-70">Server response: {rzp.error}</p>}
        </div>
      )}
    </div>
  );
}
