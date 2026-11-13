import * as OTPAuth from "otpauth";
import { LoginForm } from "@/components/auth/login-form";
import { prisma } from "@/lib/prisma";
import { localMocks } from "@/lib/local-mocks";

export const metadata = { title: "Sign in", robots: { index: false } };

export const dynamic = "force-dynamic";

/** Only same-site paths: ?from=https://evil.example (or //evil.example) would be an open redirect. */
function safeFrom(from: string | undefined): string {
  return from && /^\/(?![\/\\])/.test(from) ? from : "/";
}

/** Local test only: each admin's current 6-digit code, so no authenticator app is needed. */
async function localCodes(): Promise<{ email: string; code: string }[]> {
  if (!localMocks()) return [];
  const staff = await prisma.staffProfile.findMany({ where: { totpEnabled: true, totpSecret: { not: null } }, include: { user: true } });
  return staff.map((s) => ({
    email: s.user.email ?? s.fullName,
    code: new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(s.totpSecret!) }).generate(),
  }));
}

export default async function LoginPage(props: { searchParams: Promise<{ from?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const codes = await localCodes();
  return (
    <div className="container py-16 max-w-md">
      <h1 className="font-display text-3xl">Sign In</h1>
      <p className="text-ink/60 mt-1 text-sm">Welcome back. Use email/password or phone OTP.</p>
      {codes.length > 0 && (
        <div className="mt-6 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
          <p className="font-medium">Local test: admin codes right now (reload for a new one)</p>
          {codes.map((c) => (
            <p key={c.email} className="font-mono">{c.email}: {c.code}</p>
          ))}
        </div>
      )}
      <div className="mt-8">
        <LoginForm callbackUrl={safeFrom(searchParams.from)} initialError={searchParams.error} />
      </div>
    </div>
  );
}
