import {redirect} from 'next/navigation';
import {supabaseServer} from '../lib/supabase-server';
export type ChatGPTUser={userId:string;displayName:string;email:string;fullName:string|null};
// On Vercel, identity comes only from a verified Supabase session.
export async function getChatGPTUser():Promise<ChatGPTUser|null>{
 const {data,error}=await(await supabaseServer()).auth.getUser();
 if(error||!data.user?.email||!data.user.email_confirmed_at)return null;
 return {userId:data.user.id,displayName:data.user.email,email:data.user.email,fullName:null};
}
export async function requireChatGPTUser(_returnTo:string):Promise<ChatGPTUser>{const user=await getChatGPTUser();if(!user)redirect('/login');return user;}
export const chatGPTSignInPath=(_returnTo:string)=>'/login';
export const chatGPTSignOutPath=(_returnTo='/')=>'/auth/logout';
