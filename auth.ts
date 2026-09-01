import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { magicLinkProvider } from "@/lib/magic-link";
import { belongsToAllowedDomain } from "@/lib/access-control";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [magicLinkProvider],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      return belongsToAllowedDomain(user.email);
    },
    async session({ session, user }) {
      if (session.user && user.email) session.user.email = user.email.toLowerCase();
      return session;
    },
  },
  session: { strategy: "database", maxAge: 8 * 60 * 60 },
});
