import { withAuth } from 'next-auth/middleware';

/**
 * Require Google session before enter/create/join room flows.
 * TV / public landing / auth endpoints stay open.
 */
export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: [
    '/join',
    '/join/:path*',
    '/create',
    '/create/:path*',
    '/room/:path*',
    '/share-target',
    '/share-target/:path*',
  ],
};
