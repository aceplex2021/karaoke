import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { supabaseAdmin } from '@/server/lib/supabase';

export async function requireKaraSession() {
  const session = await getServerSession(authOptions);
  const karaUserId = session?.karaUserId;
  if (!session || !karaUserId) {
    return { session: null, user: null, error: 'Sign in with Google required' as const };
  }

  const { data: user, error } = await supabaseAdmin
    .from('kara_users')
    .select('*')
    .eq('id', karaUserId)
    .single();

  if (error || !user) {
    return { session, user: null, error: 'Signed-in user not found' as const };
  }

  return { session, user, error: null };
}
