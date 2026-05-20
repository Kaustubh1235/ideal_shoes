"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isValidGstin } from "@bharatboot/gst";

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

  // Create user + dealer profile (pending). No password; will be set after approval.
  await prisma.user.upsert({
    where: { email: parsed.email },
    update: {},
    create: {
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
    },
  });

  redirect("/dealer-application/thanks");
}
