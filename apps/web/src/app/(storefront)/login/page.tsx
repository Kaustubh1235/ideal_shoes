import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { from?: string; error?: string } }) {
  return (
    <div className="container py-16 max-w-md">
      <h1 className="font-display text-3xl uppercase tracking-wide">Sign In</h1>
      <p className="text-ink/60 mt-1 text-sm">Welcome back. Use email/password or phone OTP.</p>
      <div className="mt-8">
        <LoginForm callbackUrl={searchParams.from ?? "/"} initialError={searchParams.error} />
      </div>
    </div>
  );
}
