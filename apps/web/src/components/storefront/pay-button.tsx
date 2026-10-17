"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@bharatboot/ui";
import { toast } from "sonner";

declare global {
  interface Window { Razorpay: any }
}

export function PayButton({
  orderId,
  orderNo,
  amount,
  rzpOrderId,
  keyId,
}: {
  orderId: string;
  orderNo: string;
  amount: number;
  rzpOrderId: string;
  keyId: string;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window.Razorpay) {
      setReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => setReady(true);
    script.onerror = () => toast.error("Could not load Razorpay");
    document.body.appendChild(script);
  }, []);

  const open = () => {
    if (!window.Razorpay) return;
    setLoading(true);
    const rzp = new window.Razorpay({
      key: keyId,
      amount,
      currency: "INR",
      order_id: rzpOrderId,
      name: "IDEALX",
      description: `Order ${orderNo}`,
      handler: async (response: any) => {
        try {
          const r = await fetch("/api/checkout/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              order_id: orderId,
            }),
          });
          if (!r.ok) throw new Error("Verification failed");
          router.push(`/account/orders/${orderId}?ok=1`);
        } catch (e) {
          toast.error("Payment verification failed. We'll reconcile via webhook.");
        } finally {
          setLoading(false);
        }
      },
      modal: {
        ondismiss: () => setLoading(false),
      },
      theme: { color: "#3D4F27" },
    });
    rzp.open();
  };

  return (
    <Button size="lg" className="mt-6 w-full" disabled={!ready || loading} onClick={open}>
      {loading ? "Processing…" : `Pay ₹${(amount / 100).toLocaleString("en-IN")}`}
    </Button>
  );
}
