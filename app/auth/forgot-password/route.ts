import {requestPasswordReset} from '../../../lib/password-recovery';
import {supabaseServer} from '../../../lib/supabase-server';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return requestPasswordReset(request, supabaseServer);
}
