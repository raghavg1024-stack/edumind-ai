import { createClient } from '@supabase/supabase-js';
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'';
export const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (key.startsWith('sb_publishable_')||key.startsWith('eyJ')));
let client:ReturnType<typeof createClient>|undefined;
export const browserDb = () => {
 if(!configured)throw new Error('Configure a valid Supabase publishable key. Secret keys cannot be used in the browser.');
 return client ||= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key);
};
