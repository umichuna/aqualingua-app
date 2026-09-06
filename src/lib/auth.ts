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
        // ここで false を返すと、DB障害時にログイン自体ができなくなる。
        // このアプリはローカル（IndexedDB）が正でオフラインでも学習できる設計なので、
        // users テーブルへの登録失敗は致命的ではなく、意図的に握りつぶして続行する。
        // ただしこの結果「ログインは通るのに同期だけ失敗する」状態になり原因が見えにくいため、
        // 同期側は friendlySyncErrorMessage で理由を日本語表示する（sync.ts 参照）。
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
