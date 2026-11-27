import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { ensureGoogleKaraUser } from '@/server/lib/auth-users';

declare module 'next-auth' {
  interface Session {
    karaUserId?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    karaUserId?: string;
    googleSub?: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID || '',
      clientSecret:
        process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET || '',
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return false;
      const sub = account.providerAccountId || (profile as { sub?: string })?.sub;
      if (!sub) return false;
      try {
        await ensureGoogleKaraUser({
          sub,
          email: (profile as { email?: string })?.email,
          name: (profile as { name?: string })?.name,
        });
        return true;
      } catch (err) {
        console.error('[auth] ensureGoogleKaraUser failed', err);
        return false;
      }
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === 'google') {
        const sub = account.providerAccountId || (profile as { sub?: string })?.sub;
        if (sub) {
          token.googleSub = sub;
          try {
            const user = await ensureGoogleKaraUser({
              sub,
              email: (profile as { email?: string })?.email || token.email,
              name: (profile as { name?: string })?.name || token.name,
            });
            token.karaUserId = user.id;
          } catch (err) {
            console.error('[auth] jwt upsert failed', err);
          }
        }
      } else if (token.googleSub && !token.karaUserId) {
        try {
          const user = await ensureGoogleKaraUser({
            sub: token.googleSub,
            email: token.email,
            name: token.name,
          });
          token.karaUserId = user.id;
        } catch (err) {
          console.error('[auth] jwt refresh upsert failed', err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.karaUserId) {
        session.karaUserId = token.karaUserId;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
};
