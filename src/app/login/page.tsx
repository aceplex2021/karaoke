'use client';

import { Suspense, useMemo, useEffect, type CSSProperties } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const callbackUrl = useMemo(() => {
    const raw = searchParams.get('callbackUrl') || '/';
    // Prevent open redirects
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
    return raw;
  }, [searchParams]);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(callbackUrl);
    }
  }, [status, router, callbackUrl]);

  if (status === 'authenticated' || status === 'loading') {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎤</div>
          <p style={{ color: '#9aa0a6' }}>Checking sign-in…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: '2rem' }}>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              marginBottom: '0.35rem',
            }}
          >
            Kara
          </div>
          <p style={{ color: '#9aa0a6', margin: 0, fontSize: '0.95rem' }}>
            Sign in to join or create a room. Favorites and history stay with your account.
          </p>
        </div>

        <button
          type="button"
          onClick={() => signIn('google', { callbackUrl })}
          style={googleBtnStyle}
        >
          <GoogleGlyph />
          <span>Sign in with Google</span>
        </button>

        <p style={{ marginTop: '1.5rem', color: '#6b7280', fontSize: '0.8rem', lineHeight: 1.4 }}>
          Required for all singers and hosts. TV displays do not need to sign in.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={shellStyle}>
          <div style={cardStyle}>
            <p style={{ color: '#9aa0a6' }}>Loading…</p>
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.1 4 9.2 8.5 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.1 39.4 15.9 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l.1.1 6.2 5.2C39.2 37.2 44 31.5 44 24c0-1.3-.1-2.5-.4-3.5z" />
    </svg>
  );
}

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  background: '#0f1115',
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '420px',
  background: '#1a1d24',
  border: '1px solid #2a2f3a',
  borderRadius: '12px',
  padding: '2rem',
  color: '#f3f4f6',
  boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
};

const googleBtnStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  padding: '0.85rem 1rem',
  borderRadius: '8px',
  border: '1px solid #3a3f4b',
  background: '#252a33',
  color: '#fff',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
};
