import Link from "next/link";
import { Button } from "@bharatboot/ui";

export const metadata = { title: "Application received", robots: { index: false } };

export default function ThanksPage() {
  return (
    <div className="container py-24 text-center max-w-md">
      <h1 className="font-display text-3xl">Application Received</h1>
      <p className="mt-3 text-ink/70">
        Thanks for applying. Our team will review and respond within 2 business days. You will receive a setup link by email + SMS once approved.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to Home</Link>
      </Button>
    </div>
  );
}
