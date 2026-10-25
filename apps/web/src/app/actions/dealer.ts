"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { isValidGstin } from "@bharatboot/gst";
import { clientIp, hit } from "@/lib/rate-limit";

const Schema = z.object({
  businessName: z.string().min(2),
  contactName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().regex(/^[6-9][0-9]{9}$/),
  gstin: z.string().refine(isValidGstin, "Invalid GSTIN"),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/),
  yearsInBusiness: z.coerce.number().int().min(0).optional(),
  monthlyValue: z.coerce.number().int().min(0).optional(),
  line1: z.string().min(3),
  city: z.string().min(2),
  state: z.string().min(2),
  stateCode: z.string().regex(/^[0-9]{2}$/),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/),
  notes: z.string().optional(),
});

export async function dealerApplyAction(formData: FormData) {
  const parsed = Schema.parse(Object.fromEntries(formData.entries()));
  // Public form that creates an account: 5 applications an hour per address is plenty.
  const ip = clientIp(new Request("http://x", { headers: headers() }));
  if (!(await hit(`dealer-apply:${ip}`, 5, 3600))) redirect("/dealer-application?error=busy");

  const taken = await prisma.user.findFirst({
    where: { OR: [{ email: parsed.email }, { phone: parsed.phone }, { dealer: { gstin: parsed.gstin } }] },
    select: { id: true },
  });
  if (taken) redirect("/dealer-application?error=exists");

  try {
    // No password yet: the dealer signs in by phone OTP, or the admin sets one after approval.
    await prisma.user.create({
      data: {
        email: parsed.email,
        phone: parsed.phone,
        userType: "dealer",
        isActive: true,
        dealer: {
          create: {
            businessName: parsed.businessName,
            gstin: parsed.gstin,
            pan: parsed.pan,
            status: "pending",
            priceTier: "tier_b",
            yearsInBusiness: parsed.yearsInBusiness ?? null,
            estimatedMonthlyOrderValue: parsed.monthlyValue ? parsed.monthlyValue * 100 : null,
            rejectionReason: null,
          },
        },
        // The form collects these; they were dropped before.
        addresses: {
          create: {
            fullName: parsed.contactName,
            phone: parsed.phone,
            line1: parsed.line1,
            city: parsed.city,
            state: parsed.state,
            stateCode: parsed.stateCode,
            pincode: parsed.pincode,
            type: "billing",
          },
        },
      },
    });
  } catch (e) {
    // Two applications racing on the same email/phone/GSTIN.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") redirect("/dealer-application?error=exists");
    throw e;
  }
  if (parsed.notes) {
    const u = await prisma.user.findUnique({ where: { email: parsed.email }, select: { id: true } });
    await prisma.auditLog.create({
      data: { action: "dealer.apply", entityType: "dealer_profile", entityId: u?.id ?? null, after: { contactName: parsed.contactName, notes: parsed.notes.slice(0, 2000) } },
    });
  }

  redirect("/dealer-application/thanks");
}
