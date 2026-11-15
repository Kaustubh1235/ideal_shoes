import { NextResponse, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { adminIpAllowed } from "@/lib/admin-ip";

const { auth } = NextAuth(authConfig);

const ADMIN_PREFIX = "/admin";
const WHOLESALE_PREFIX = "/wholesale";

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // IP allowlist for admin (also checked inside each admin server action: src/lib/require-staff.ts)
  if (pathname.startsWith(ADMIN_PREFIX) && !adminIpAllowed(req.headers.get("x-real-ip"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const session = await auth();
  const user = session?.user;

  if (pathname.startsWith(ADMIN_PREFIX)) {
    if (!user) return redirectToLogin(req, "/admin");
    if (user.userType !== "staff") {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  if (pathname.startsWith(WHOLESALE_PREFIX)) {
    if (!user) return redirectToLogin(req, "/wholesale");
    if (user.userType !== "dealer" && user.userType !== "staff") {
      return NextResponse.redirect(new URL("/dealer-application", req.url));
    }
  }

  if (pathname.startsWith("/account") && !user) {
    return redirectToLogin(req, "/account");
  }

  return NextResponse.next();
}

function redirectToLogin(req: NextRequest, callback: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("from", callback);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/wholesale/:path*", "/account/:path*"],
};
