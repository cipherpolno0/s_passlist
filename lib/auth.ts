import 'server-only';
import {redirect} from 'next/navigation';
import {createClient} from './supabase/server';
import {authConfigured} from './supabase/config';
import {safeReturnPath} from './auth-path';
export async function getCurrentUser() {
  if(!authConfigured())return null;
  const supabase=await createClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user?.email||!user.email_confirmed_at)return null;
  // User metadata is for display only. Admin access is checked with the verified email + server allowlist.
  const name=typeof user.user_metadata?.full_name==='string'?user.user_metadata.full_name:user.email;
  return {userId:user.id,email:user.email,displayName:name,fullName:name};
}
export async function requireUser(returnTo: string) {
  const user=await getCurrentUser();
  if(!user)redirect('/login?next='+encodeURIComponent(safeReturnPath(returnTo)));
  return user;
}
