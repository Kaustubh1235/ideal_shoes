import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in", robots: { index: false } };

export const dynamic = "force-dynamic";

/** Only same-site paths: ?from=https://evil.example (or //evil.example) would be an open redirect. */
function safeFrom(from: string | undefined): string {
  return from && /^\/(?![\/\\])/.test(from) ? from : "/";
}

export default function LoginPage({ searchParams }: { searchParams: { from?: string; error?: string } }) {
  return (
    <div className="container py-16 max-w-md">
      <h1 className="font-display text-3xl">Sign In</h1>
      <p className="text-ink/60 mt-1 text-sm">Welcome back. Use email/password or phone OTP.</p>
      <div className="mt-8">
        <LoginForm callbackUrl={safeFrom(searchParams.from)} initialError={searchParams.error} />
      </div>
    </div>
  );
}
