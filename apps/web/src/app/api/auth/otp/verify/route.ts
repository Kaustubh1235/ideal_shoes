import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import env from "@/env";
import { redis } from "@/lib/redis";

const Body = z.object({
  phone: z.string().regex(/^[6-9][0-9]{9}$/),
  code: z.string().regex(/^[0-9]{6}$/),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const r = await fetch(`${env.INTERNAL_API_URL}/auth/otp/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...parsed.data, purpose: "login" }),
  });
  if (!r.ok) return NextResponse.json({ ok: false }, { status: 400 });

  const token = nanoid(40);
  // 5-minute window to complete signIn
  await redis.set(`otp:verified:${parsed.data.phone}`, token, "EX", 300);
  return NextResponse.json({ ok: true, otpVerified: token });
}
