import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import env from "@/env";
import * as OTPAuth from "otpauth";
import { authConfig } from "@/auth.config";
import { clear, clientIp, hit } from "@/lib/rate-limit";

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

/** Password was right; the staff member's authenticator code is still needed. */
class TotpRequired extends CredentialsSignin {
  code = "totp_required";
}

// Credentials arrive form-encoded, so an absent field can show up as "" or "undefined".
const blank = (v: unknown) => (v === "" || v === "undefined" || v === "null" ? undefined : v);
const CredsSchema = z.object({
  email: z.preprocess(blank, z.string().email().optional()),
  phone: z.preprocess(blank, z.string().regex(/^[6-9][0-9]{9}$/).optional()),
  password: z.preprocess(blank, z.string().min(8).optional()),
  otpVerified: z.preprocess(blank, z.string().optional()),
  totpCode: z.preprocess(blank, z.string().regex(/^[0-9]{6}$/).optional()),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
  callbacks: {
    ...authConfig.callbacks,
    // Re-check the account every 5 minutes so a deactivated user or dealer loses access quickly
    // instead of keeping a valid session cookie until it expires. (Middleware, on the Edge,
    // cannot reach the database; every page and action that reads the session goes through here.)
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (params.user) {
        token.checkedAt = Date.now();
        return token;
      }
      if (token.userId && Date.now() - Number(token.checkedAt ?? 0) > 5 * 60 * 1000) {
        const u = await prisma.user.findUnique({ where: { id: token.userId as string }, select: { isActive: true } });
        if (!u?.isActive) return null;
        token.checkedAt = Date.now();
      }
      return token;
    },
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "TOTP code", type: "text" },
      },
      async authorize(raw, request) {
        const parsed = CredsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { password, totpCode } = parsed.data;
        const email = parsed.data.email?.trim().toLowerCase();
        if (!email || !password) return null;
        // Password guessing: 10 failed tries per account and 30 per address in 15 minutes.
        const ip = clientIp(request);
        const acct = `login:acct:${email.toLowerCase()}`;
        if (!(await hit(`login:ip:${ip}`, 30, 900)) || !(await hit(acct, 10, 900))) return null;
        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          include: { customer: true, dealer: true, staff: true },
        });
        if (!user || !user.passwordHash || !user.isActive) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Staff requires TOTP
        if (user.userType === "staff" && user.staff?.totpEnabled) {
          // Auth.js turns a plain Error into a generic configuration error; this reaches the form as code.
          if (!totpCode) throw new TotpRequired();
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
        await clear(acct);

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

/**
 * Token for calls the web server makes on its own behalf, e.g. creating the Razorpay order for a
 * guest checkout. The API treats it like staff for order access, so only server code that has
 * already checked the visitor may use it.
 */
export async function getServiceToken(): Promise<string> {
  const { SignJWT } = await import("jose");
  const secret = new TextEncoder().encode(env.AUTH_SECRET);
  return await new SignJWT({ sub: "web", userType: "service", role: null })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setExpirationTime("2m")
    .sign(secret);
}
