import {updateRecoveredPassword} from '../../../lib/password-recovery';
import {supabaseServer} from '../../../lib/supabase-server';
import {requestContext, logAccess} from '../../../lib/audit-request';
import {withAuditContext} from '../../../lib/audit-context';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return updateRecoveredPassword(request, supabaseServer, async () => {
    const context = await requestContext(request);
    context.action = 'password-reset';
    await withAuditContext(context, () => logAccess(context, 200));
  });
}
