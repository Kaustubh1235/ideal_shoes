import { NextResponse } from "next/server";
import { z } from "zod";
import env from "@/env";

const Body = z.object({ phone: z.string().regex(/^[6-9][0-9]{9}$/) });

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const r = await fetch(`${env.INTERNAL_API_URL}/auth/otp/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: parsed.data.phone, purpose: "login" }),
  });
  if (!r.ok) return NextResponse.json({ ok: false }, { status: 502 });
  const data = await r.json();
  return NextResponse.json({ ok: true, dev_code: data.dev_code });
}
