import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Boxes,
  Users,
  FileText,
  FileSpreadsheet,
  Briefcase,
  RotateCcw,
  Truck,
  Settings,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes },
  { href: "/admin/dealers", label: "Dealers", icon: Users },
  { href: "/admin/tenders", label: "Tenders", icon: Briefcase },
  { href: "/admin/purchase-orders", label: "Purchase Orders", icon: FileText },
  { href: "/admin/returns", label: "Returns / RMA", icon: RotateCcw },
  { href: "/admin/shipments", label: "Shipments", icon: Truck },
  { href: "/admin/gstr", label: "GSTR Exports", icon: FileSpreadsheet },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/admin");
  if (session.user.userType !== "staff") redirect("/");

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-olive-200 bg-olive-700 text-cream">
        <div className="p-4 border-b border-cream/10">
          <Link href="/admin" className="font-display text-xl uppercase tracking-wider">
            BharatBoot
          </Link>
          <p className="text-xs text-cream/60 mt-1">Admin Console</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded px-3 py-2 text-sm text-cream/80 hover:bg-cream/10 hover:text-cream"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t border-cream/10">
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="flex items-center gap-2 rounded px-3 py-2 text-sm text-cream/80 hover:bg-cream/10 w-full">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 bg-cream min-w-0">
        <header className="border-b border-olive-100 bg-cream sticky top-0 z-30">
          <div className="px-6 py-3 flex items-center gap-4">
            <h1 className="font-display uppercase tracking-wide">Admin</h1>
            <span className="ml-auto text-sm text-ink/60">{session.user.email ?? session.user.name}</span>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
