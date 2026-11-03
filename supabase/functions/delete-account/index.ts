import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
Deno.serve(async request => {
  if(request.method === 'OPTIONS') return new Response('ok',{headers:cors});
  if(request.method !== 'POST') return new Response('Method not allowed',{status:405,headers:cors});
  const token = request.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!token) return new Response('Unauthorized',{status:401,headers:cors});
  const admin = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data,error} = await admin.auth.getUser(token);
  if(error || !data.user) return new Response('Unauthorized',{status:401,headers:cors});
  // FK cascade deletes private documents, invitations, rates and votes; SET NULL anonymizes public contributions.
  const deleted = await admin.auth.admin.deleteUser(data.user.id);
  return new Response(JSON.stringify(deleted.error ? {error:'Suppression impossible, réessayez.'} : {ok:true}),{status:deleted.error ? 500 : 200,headers:{...cors,'Content-Type':'application/json'}});
});
