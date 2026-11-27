'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

/**
 * Keep localStorage user_id aligned with Google-backed kara user.
 */
export function AuthUserSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated' || !session?.karaUserId) return;
    try {
      localStorage.setItem('user_id', session.karaUserId);
      if (session.user?.name) {
        const existing = localStorage.getItem('user_display_name');
        if (!existing) {
          localStorage.setItem('user_display_name', session.user.name);
        }
      }
    } catch {
      /* ignore */
    }
  }, [session, status]);

  return null;
}
