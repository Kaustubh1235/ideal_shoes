import { NextResponse } from "next/server";
import { z } from "zod";
import env from "@/env";

const Body = z.object({ phone: z.string().regex(/^[6-9][0-9]{9}$/) });

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const r = await fetch(`${env.INTERNAL_API_URL}/auth/otp/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: parsed.data.phone, purpose: "login" }),
  });
  if (r.status === 429) return NextResponse.json({ ok: false, error: "Too many codes for this number. Try again in 10 minutes." }, { status: 429 });
  if (r.status === 503) return NextResponse.json({ ok: false, error: "Sign-in by SMS is not available yet. Please use email." }, { status: 503 });
  if (!r.ok) return NextResponse.json({ ok: false, error: "Could not send the code. Try again." }, { status: 502 });
  const data = await r.json();
  return NextResponse.json({ ok: true, dev_code: data.dev_code });
}
