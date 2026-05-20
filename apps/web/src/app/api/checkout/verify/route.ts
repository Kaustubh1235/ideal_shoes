import { NextResponse } from "next/server";
import { z } from "zod";
import { apiFetch } from "@/lib/api";

const Body = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
  order_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const res = await apiFetch<{ verified: boolean }>("/payments/razorpay/verify", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    return NextResponse.json({ ok: !!res.verified });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
