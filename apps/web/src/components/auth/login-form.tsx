"use client";
import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger } from "@bharatboot/ui";
import { toast } from "sonner";

export function LoginForm({ callbackUrl, initialError }: { callbackUrl: string; initialError?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"email" | "phone">("email");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [requiresTotp, setRequiresTotp] = useState(false);

  // Email form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");

  // Phone OTP state
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpToken, setOtpToken] = useState<string | null>(null);

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      // Only send totpCode when asked for: signIn() form-encodes undefined as the string "undefined".
      const res = await signIn("credentials", {
        email,
        password,
        ...(requiresTotp ? { totpCode } : {}),
        redirect: false,
        callbackUrl,
      });
      if ((res as { code?: string } | undefined)?.code === "totp_required") {
        setRequiresTotp(true);
        setError(requiresTotp ? "Enter the 6-digit code from your authenticator app" : null);
        return;
      }
      if (res?.error) {
        setError(requiresTotp ? "Wrong password or authenticator code" : "Wrong email or password");
        return;
      }
      if (res?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    });
  };

  const requestOtp = () => {
    if (!/^[6-9][0-9]{9}$/.test(phone)) {
      setError("Enter a valid 10-digit Indian mobile");
      return;
    }
    setError(null);
    start(async () => {
      const r = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!r.ok) {
        setError((await r.json().catch(() => null))?.error ?? "Could not send OTP");
        return;
      }
      const data = await r.json();
      if (data.dev_code) toast(`Dev OTP: ${data.dev_code}`);
      setOtpSent(true);
    });
  };

  const submitOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code: otp }),
      });
      if (!r.ok) {
        setError((await r.json().catch(() => null))?.error ?? "Invalid OTP");
        return;
      }
      const data = await r.json();
      setOtpToken(data.otpVerified);
      const res = await signIn("phone-otp", {
        phone,
        otpVerified: data.otpVerified,
        redirect: false,
        callbackUrl,
      });
      if (res?.ok) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        setError("Sign-in failed");
      }
    });
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="email">Email</TabsTrigger>
        <TabsTrigger value="phone">Phone OTP</TabsTrigger>
      </TabsList>

      <TabsContent value="email">
        <form onSubmit={submitEmail} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {requiresTotp && (
            <div>
              <Label htmlFor="totp">TOTP code (admin)</Label>
              <Input id="totp" inputMode="numeric" pattern="[0-9]{6}" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="phone">
        <form onSubmit={otpSent ? submitOtp : (e) => { e.preventDefault(); requestOtp(); }} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="phone">Mobile Number</Label>
            <Input id="phone" type="tel" pattern="[6-9][0-9]{9}" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          {otpSent && (
            <div>
              <Label htmlFor="otp">6-digit OTP</Label>
              <Input id="otp" inputMode="numeric" pattern="[0-9]{6}" value={otp} onChange={(e) => setOtp(e.target.value)} required />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {otpSent ? (pending ? "Verifying…" : "Verify &amp; Sign In") : (pending ? "Sending…" : "Send OTP")}
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}
