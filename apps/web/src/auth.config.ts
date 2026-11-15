import type { NextAuthConfig } from "next-auth";

// The part of the Auth.js config that is safe for the Edge runtime: middleware imports this,
// so nothing here may touch Prisma, Redis, bcrypt or other Node-only modules. Providers live in auth.ts.
export const authConfig = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id;
        token.userType = (user as any).userType;
        token.role = (user as any).role ?? null;
        token.dealerId = (user as any).dealerId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string) ?? session.user.id;
        session.user.userType = (token.userType as any) ?? "customer";
        session.user.role = (token.role as any) ?? null;
        session.user.dealerId = (token.dealerId as any) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
