import {createClient} from 'npm:@supabase/supabase-js@2';
export const url=Deno.env.get('SUPABASE_URL')!;
export const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const service=createClient(url,serviceKey,{auth:{persistSession:false}});
// The allowlist protects actions independently of the Access-Control response header.
// Requests use bearer tokens, never cross-site cookies, so a wildcard response header
// works for both supported frontends while server-side Origin validation stays strict.
const allowedOrigins = new Set([
  'https://voicetask-staging.vercel.app',
  'https://voicetask.online',
  'https://www.voicetask.online',
  ...(Deno.env.get('ALLOWED_ORIGIN')||'').split(',').map(value=>value.trim()).filter(Boolean)
]);
export function reply(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*',
    'Vary':'Origin'
  }});
}
export function cors(req:Request){
  const origin=req.headers.get('origin');
  if(origin&&!allowedOrigins.has(origin))throw new Error('Origin not allowed');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':origin||'https://invalid.example',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'
  }});
  return null;
}
export async function actor(req:Request){const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token)throw Error('Sign in required');const {data,error}=await service.auth.getUser(token);if(error||!data.user)throw Error('Unauthenticated');const {data:profile,error:statusError}=await service.from('profiles').select('status').eq('id',data.user.id).maybeSingle();if(statusError||!profile||profile.status!=='active')throw Error('Account is suspended or unavailable');return data.user;}
export async function admin(req:Request){const user=await actor(req);const {data,error}=await service.from('user_roles').select('role').eq('user_id',user.id).eq('role','admin').maybeSingle();if(error||!data)throw Error('Administrator permissions required');const factors=await service.auth.admin.getUserById(user.id);if(factors.error)throw Error('Could not validate account');const token=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));const mfa=user.factors?.some(f=>f.status==='verified');if(!mfa||payload.aal!=='aal2')throw Error('Admin MFA is required');return user;}
export function fail(e:unknown){const m=e instanceof Error?e.message:'Server error';return reply({error:m,message:m},/Unauthenticated|Sign in/.test(m)?401:/permissions|MFA|Origin/.test(m)?403:400)}
export function requirePost(req:Request){if(req.method!=='POST')throw Error('POST required')}
export async function sha256(value:string){const raw=new TextEncoder().encode(value);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(n=>n.toString(16).padStart(2,'0')).join('')}
