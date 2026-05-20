import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import env from "@/env";
import * as OTPAuth from "otpauth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      userType: "customer" | "dealer" | "staff";
      role?: string | null;
      dealerId?: string | null;
      requiresTotp?: boolean;
    } & DefaultSession["user"];
  }
}

const CredsSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(/^[6-9][0-9]{9}$/).optional(),
  password: z.string().min(8).optional(),
  otpVerified: z.string().optional(),
  totpCode: z.string().regex(/^[0-9]{6}$/).optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  trustHost: true,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "TOTP code", type: "text" },
      },
      async authorize(raw) {
        const parsed = CredsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, totpCode } = parsed.data;
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({
          where: { email },
          include: { customer: true, dealer: true, staff: true },
        });
        if (!user || !user.passwordHash || !user.isActive) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Staff requires TOTP
        if (user.userType === "staff" && user.staff?.totpEnabled) {
          if (!totpCode) {
            // Caller flow: surface this so the UI prompts for TOTP
            throw new Error("REQUIRES_TOTP");
          }
          if (!user.staff?.totpSecret) return null;
          const totp = new OTPAuth.TOTP({
            issuer: env.ADMIN_TOTP_ISSUER,
            label: user.email ?? user.id,
            algorithm: "SHA1",
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(user.staff.totpSecret),
          });
          const delta = totp.validate({ token: totpCode, window: 1 });
          if (delta === null) return null;
        }

        return {
          id: user.id,
          email: user.email,
          name:
            user.customer?.name ??
            user.dealer?.businessName ??
            user.staff?.fullName ??
            user.email ??
            "User",
          userType: user.userType,
          role: user.staff?.role ?? null,
          dealerId: user.dealer?.userId ?? null,
        } as any;
      },
    }),
    Credentials({
      id: "phone-otp",
      name: "Phone OTP",
      credentials: {
        phone: { label: "Phone", type: "tel" },
        otpVerified: { label: "OTP verified token", type: "text" },
      },
      async authorize(raw) {
        const parsed = CredsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { phone, otpVerified } = parsed.data;
        if (!phone || !otpVerified) return null;
        // The OTP itself was verified server-side via FastAPI /auth/otp/verify.
        // The Next-side action sets a short-lived signed token in Redis under `otp:verified:<phone>`,
        // which we re-check here.
        const { redis } = await import("@/lib/redis");
        const stored = await redis.get(`otp:verified:${phone}`);
        if (!stored || stored !== otpVerified) return null;
        await redis.del(`otp:verified:${phone}`);

        let user = await prisma.user.findUnique({
          where: { phone },
          include: { customer: true, dealer: true, staff: true },
        });
        if (!user) {
          user = await prisma.user.create({
            data: {
              phone,
              userType: "customer",
              phoneVerifiedAt: new Date(),
              customer: { create: { name: "Customer" } },
            },
            include: { customer: true, dealer: true, staff: true },
          });
        } else if (!user.phoneVerifiedAt) {
          await prisma.user.update({
            where: { id: user.id },
            data: { phoneVerifiedAt: new Date() },
          });
        }

        return {
          id: user.id,
          email: user.email ?? null,
          name: user.customer?.name ?? "Customer",
          userType: user.userType,
          role: user.staff?.role ?? null,
          dealerId: user.dealer?.userId ?? null,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id;
        token.userType = (user as any).userType;
        token.role = (user as any).role ?? null;
        token.dealerId = (user as any).dealerId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string) ?? session.user.id;
        session.user.userType = (token.userType as any) ?? "customer";
        session.user.role = (token.role as any) ?? null;
        session.user.dealerId = (token.dealerId as any) ?? null;
      }
      return session;
    },
  },
});

/** Helper for FastAPI calls -- returns a Bearer JWT for the current session. */
export async function getInternalToken(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  // Build a short-lived HS256 JWT using the shared AUTH_SECRET so FastAPI accepts it.
  const { SignJWT } = await import("jose");
  const secret = new TextEncoder().encode(env.AUTH_SECRET);
  return await new SignJWT({
    sub: session.user.id,
    userType: session.user.userType,
    role: session.user.role ?? null,
    dealerId: session.user.dealerId ?? null,
    email: session.user.email ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setExpirationTime("15m")
    .sign(secret);
}
