import Link from "next/link";
import { Button } from "@bharatboot/ui";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-cream">
      <div className="text-center">
        <p className="font-display text-6xl uppercase tracking-widest text-olive-700">404</p>
        <h1 className="mt-3 font-display text-2xl uppercase">Page not found</h1>
        <p className="mt-2 text-ink/60 max-w-sm mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or was moved.
        </p>
        <Button asChild className="mt-6"><Link href="/">Back to home</Link></Button>
      </div>
    </div>
  );
}
