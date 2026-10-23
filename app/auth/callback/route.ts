import {completePasswordRecovery} from '../../../lib/password-recovery';
import {supabaseServer} from '../../../lib/supabase-server';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return completePasswordRecovery(request, supabaseServer);
}
