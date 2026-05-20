"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@bharatboot/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen grid place-items-center bg-cream">
      <div className="text-center max-w-md">
        <p className="font-display text-5xl uppercase tracking-widest text-umber-400">Error</p>
        <h1 className="mt-3 font-display text-2xl uppercase">Something broke</h1>
        <p className="mt-2 text-ink/60 text-sm">
          {error.message || "An unexpected error occurred."}
          {error.digest && <span className="block opacity-50 mt-1 text-xs">Digest: {error.digest}</span>}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline"><Link href="/">Home</Link></Button>
        </div>
      </div>
    </div>
  );
}
