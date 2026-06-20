import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getPool } from "@/lib/azure-sql";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      try {
        const pool = await getPool();
        await pool.request()
          .input("id", user.email)
          .input("email", user.email)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM users WHERE id = @id)
              INSERT INTO users (id, email) VALUES (@id, @email)
          `);
      } catch (e) {
        console.error("signIn DB error", e);
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        (session.user as { id?: string }).id = token.email;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
