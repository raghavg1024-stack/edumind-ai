import { createClient } from '@supabase/supabase-js';
export class HttpError extends Error {constructor(message:string,public status=400){super(message);}}
export async function authenticatedDb(request:Request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key||key.startsWith('sb_secret_'))throw new HttpError('Supabase publishable settings are missing or invalid.',503);
 const header=request.headers.get('authorization');if(!header?.startsWith('Bearer '))throw new HttpError('Sign in to access Smart Classroom.',401);
 const token=header.slice(7);const db=createClient(url,key,{global:{headers:{Authorization:header}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await db.auth.getUser(token);if(error||!user)throw new HttpError('Session expired. Sign in again.',401);return {db,user};
}
export function dbCheck(error:{message:string}|null){if(error)throw new HttpError(error.message);}
