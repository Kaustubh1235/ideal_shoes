import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@bharatboot/ui";

export default async function WholesaleLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/wholesale");

  let dealer: { businessName: string; status: string; priceTier: string; creditLimit: number; creditUsed: number } | null = null;
  if (session.user.userType === "dealer") {
    dealer = await prisma.dealerProfile.findUnique({
      where: { userId: session.user.id },
      select: { businessName: true, status: true, priceTier: true, creditLimit: true, creditUsed: true },
    });
  }
  if (!dealer || dealer.status !== "approved") {
    return (
      <div className="container py-16 max-w-md text-center">
        <h1 className="font-display text-3xl uppercase">Account Pending</h1>
        <p className="text-ink/70 mt-2">
          Your dealer account is {dealer?.status ?? "not yet set up"}. Approval typically takes 2 business days.
        </p>
        <Link href="/" className="mt-6 inline-block text-leather-700 underline">Back to storefront</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-leather-200 bg-leather-700 text-cream">
        <div className="container py-3 flex items-center gap-4">
          <Link href="/wholesale" className="font-display uppercase tracking-wider text-xl">
            IDEALX · Wholesale
          </Link>
          <nav className="ml-6 flex items-center gap-5 text-sm uppercase tracking-wide">
            <Link href="/wholesale/catalog" className="hover:text-sand-400">Catalog</Link>
            <Link href="/wholesale/quotes" className="hover:text-sand-400">Quotes</Link>
            <Link href="/wholesale/bulk-upload" className="hover:text-sand-400">Bulk Upload</Link>
            <Link href="/wholesale/orders" className="hover:text-sand-400">Orders</Link>
            <Link href="/wholesale/credit" className="hover:text-sand-400">Credit</Link>
          </nav>
          <div className="ml-auto text-right text-xs text-cream/80">
            <p className="font-medium">{dealer.businessName}</p>
            <p>{dealer.priceTier} · Credit ₹{((dealer.creditLimit - dealer.creditUsed) / 100).toLocaleString("en-IN")} avail</p>
          </div>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button className="rounded px-2 py-1 hover:bg-cream/10 text-xs">Sign out</button>
          </form>
        </div>
      </header>
      <main className="flex-1 bg-cream">{children}</main>
    </div>
  );
}
