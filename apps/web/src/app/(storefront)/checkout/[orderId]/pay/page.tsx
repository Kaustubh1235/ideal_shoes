import { createHmac, randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import env from "@/env";
import { localMocks } from "@/lib/local-mocks";
import { apiFetch } from "@/lib/api";
import { auth } from "@/auth";
import { inr } from "@/lib/money";
import { PayButton } from "@/components/storefront/pay-button";
import { Button } from "@bharatboot/ui";

export const metadata = { title: "Payment", robots: { index: false } };

export const dynamic = "force-dynamic";

/** Local test only: do what Razorpay does after a payment, i.e. send the signed "payment.captured" webhook. */
async function payLocally(formData: FormData) {
  "use server";
  if (!localMocks()) notFound();
  const id = String(formData.get("orderId") ?? "");
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) notFound();
  if (order.status === "draft" || order.status === "pending_payment") {
    const gatewayOrderId = `order_LOCAL${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    await prisma.payment.create({ data: { orderId: id, gateway: "razorpay", gatewayOrderId, amount: order.grandTotal, currency: "INR", status: "created" } });
    const event = JSON.stringify({
      id: `evt_LOCAL${randomUUID().slice(0, 8)}`,
      event: "payment.captured",
      payload: { payment: { entity: { id: `pay_LOCAL${randomUUID().slice(0, 8)}`, order_id: gatewayOrderId, amount: order.grandTotal, method: "upi" } } },
    });
    const signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET ?? "").update(event).digest("hex");
    await fetch(`${env.INTERNAL_API_URL}/payments/razorpay/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature },
      body: event,
    });
  }
  redirect(`/checkout/${id}/pay?paid=1`);
}

export default async function PayPage(
  props: { params: Promise<{ orderId: string }>; searchParams: Promise<{ paid?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { items: true, invoices: { take: 1, select: { id: true } } },
  });
  if (!order) notFound();
  // Guest orders are reachable only through their unguessable id; a signed-in buyer's only by them.
  const session = await auth();
  if (order.userId && order.userId !== session?.user?.id && session?.user?.userType !== "staff") notFound();
  if (order.status === "paid" || order.status === "processing" || order.status === "shipped" || order.status === "delivered") {
    return (
      <div className="container py-16 text-center">
        <h1 className="font-display text-3xl">Thank you</h1>
        <p className="mt-2 text-ink/70">Order {order.orderNo} is paid and is now {order.status}.</p>
        {order.invoices[0] ? (
          <p className="mt-4"><a className="underline" href={`/files/orders/${order.id}/invoice`}>Download GST invoice</a></p>
        ) : (
          <><meta httpEquiv="refresh" content="10" /><p className="mt-2 text-ink/60 text-sm">Your GST invoice is being prepared; this page updates by itself.</p></>
        )}
      </div>
    );
  }

  if (searchParams.paid) {
    // Razorpay confirms the payment to us by webhook, usually within seconds of the redirect.
    return (
      <div className="container py-16 text-center">
        <meta httpEquiv="refresh" content="5" />
        <h1 className="font-display text-3xl">Payment received</h1>
        <p className="mt-2 text-ink/70">We are confirming order {order.orderNo} with the bank. This page updates by itself.</p>
      </div>
    );
  }

  let rzp: any = null;
  try {
    rzp = await apiFetch<any>("/payments/razorpay/order", {
      method: "POST",
      body: JSON.stringify({ order_id: order.id }),
    }, { asService: true });
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
      ) : localMocks() ? (
        <form action={payLocally} className="mt-6 space-y-2">
          <input type="hidden" name="orderId" value={order.id} />
          <Button type="submit" size="lg" className="w-full">Pay {inr(order.grandTotal)} (test)</Button>
          <p className="text-xs text-ink/60">Local test: no money moves. Razorpay&apos;s &ldquo;payment captured&rdquo; message is simulated.</p>
        </form>
      ) : (
        <div className="mt-6 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          <p className="font-medium">Online payment is not available yet.</p>
          <p className="mt-1">
            Your order {order.orderNo} is saved. Please contact us with the order number to pay, or try again later.
          </p>
        </div>
      )}
    </div>
  );
}
