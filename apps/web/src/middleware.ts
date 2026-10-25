import { NextResponse, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const ADMIN_PREFIX = "/admin";
const WHOLESALE_PREFIX = "/wholesale";

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // IP allowlist for admin
  if (pathname.startsWith(ADMIN_PREFIX)) {
    const allowlist = (process.env.ADMIN_IP_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (allowlist.length > 0) {
      // The proxy overwrites X-Real-IP with the connecting address; the first X-Forwarded-For entry is client-supplied.
      const ip = (req.headers.get("x-real-ip") ?? "").trim();
      if (!ip || !allowlist.some((cidr) => matchCidr(ip, cidr))) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }
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

// Very lightweight CIDR matcher (IPv4 only). For richer matching, switch to a library.
function matchCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [base, bitsStr] = cidr.split("/");
  if (!base || !bitsStr) return false;
  const bits = Number.parseInt(bitsStr, 10);
  const ipNum = ipv4ToNum(ip);
  const baseNum = ipv4ToNum(base);
  if (ipNum === null || baseNum === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

function ipv4ToNum(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number.parseInt(p, 10);
    if (Number.isNaN(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

export const config = {
  matcher: ["/admin/:path*", "/wholesale/:path*", "/account/:path*"],
};
