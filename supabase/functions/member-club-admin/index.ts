
import {service,reply,cors,admin,fail,requirePost} from '../_shared/server.ts';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const definitions: Record<string,{table:string;keys:string[]}>={
  course:{table:'club_courses',keys:['title','slug','description','cover_url','sort_order','featured','published']},
  module:{table:'club_modules',keys:['course_id','title','position','description','published']},
  lesson:{table:'club_lessons',keys:['module_id','title','position','description','youtube_url','duration_seconds','pdf_url','resource_url','published']}
};
function safeString(v:unknown,n=5000){if(v===null)return null;if(typeof v!=='string'||v.length>n)throw Error('Invalid or excessive text field');return v.trim();}
function filter(input:Record<string,unknown>,keys:string[]){
  const obj:Record<string,unknown>={};
  for(const key of keys){if(!(key in input))continue;
    const value=input[key];
    if(key==='layout_config'){if(value===null||typeof value!=='object'||Array.isArray(value))throw Error('Invalid layout object');obj[key]=value;continue;} if(['sort_order','position','duration_seconds'].includes(key)){
      if(value!==null&&(!Number.isInteger(value)||!Number.isSafeInteger(value)))throw Error(key+' requires an integer');
    }else if(['published','featured'].includes(key)){
      if(typeof value!=='boolean')throw Error(key+' must be a boolean');
    }else if(['course_id','module_id'].includes(key)){
      if(typeof value!=='string'||!uuid.test(value))throw Error(key+' requires a valid identifier');
    }else obj[key]=safeString(value,key==='description'?12000:1500);
    if(!(['sort_order','position','duration_seconds','published','featured','course_id','module_id'].includes(key)))continue;
    obj[key]=value;
  }
  if(Object.keys(obj).length===0)throw Error('No editable fields supplied');
  if(typeof obj.youtube_url==='string'){
    const u=new URL(obj.youtube_url);
    if(!['youtube.com','www.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com','youtu.be'].includes(u.hostname))throw Error('A genuine YouTube link is required');
  }
  for(const k of ['cover_url','pdf_url','resource_url']){
    if(typeof obj[k]!=='string')continue;
    if(k==='pdf_url'&&/^club-materials\/[a-f0-9-]+[.]pdf$/.test(obj[k] as string))continue;
    const u=new URL(obj[k] as string);
    if(u.protocol!=='https:')throw Error(k+' must be an HTTPS link');
  }
  if(typeof obj.hero_video_url==='string'&&obj.hero_video_url){
    const u=new URL(obj.hero_video_url as string);
    if(u.protocol!=='https:')throw Error('Video URL must be HTTPS');
  }
  return obj;
}
Deno.serve(async req=>{
 try{
  const pre=cors(req);if(pre)return pre;requirePost(req);
  const user=await admin(req);
  const body=await req.json();
  const action=String(body?.action||'');
  if(action==='list'){
    const [settings,courses,modules,lessons]=await Promise.all([
     service.from('club_settings').select('*').eq('id',1).single(),
     service.from('club_courses').select('*').order('sort_order').limit(500),
     service.from('club_modules').select('*').order('position').limit(15000),
     service.from('club_lessons').select('*').order('position').limit(10000)
    ]);
    for(const v of [settings,courses,modules,lessons])if(v.error)throw v.error;
    return reply({settings:settings.data,courses:courses.data,modules:modules.data,lessons:lessons.data});
  }
  if(action==='save-hero'){
    const vals=filter(body.values||{},['hero_title','hero_description','hero_eyebrow','hero_video_url','layout_config']);
    if(vals.layout_config!==undefined){
      if(typeof vals.layout_config!=='object'||!vals.layout_config||Array.isArray(vals.layout_config))throw Error('Layout settings must be an object');
    }
    const {data,error}=await service.from('club_settings').update({...vals,updated_at:new Date().toISOString()}).eq('id',1).select('*').single();
    if(error)throw error;
    await service.from('audit_logs').insert({actor_user_id:user.id,action:'club.hero_updated',entity_type:'club_settings',after_filtered:{updated_fields:Object.keys(vals)}});
    return reply({item:data});
  }
  if(action==='find-members'){
    const search=String(body.search||'').trim().slice(0,70).replace(/[^A-Za-z0-9\\s@.-]/g,' ');
    if(search.length<2)throw Error('Enter at least two search characters');
    const {data,error}=await service.from('profiles').select('id,full_name,public_display_name,email_display,status').or('full_name.ilike.%'+search+'%,email_display.ilike.%'+search+'%,public_display_name.ilike.%'+search+'%').limit(20);
    if(error)throw error;
    return reply({members:data});
  }
  if(action==='set-ranking-points'){
    if(!uuid.test(String(body.user_id||'')))throw Error('Select a registered user');
    if(!Number.isInteger(body.points))throw Error('Points must be an integer');
    const reason=String(body.reason||'').trim();
    const period=String(body.period||'');
    const {data,error}=await service.rpc('staff_set_leaderboard_points',{p_user:body.user_id,p_period:period,p_points:body.points,p_actor:user.id,p_reason:reason});
    if(error)throw error;
    return reply({points:data,message:'Leaderboard points updated for '+period+'.'});
  }
  const match=action.match(/^(create|update|delete)-(course|module|lesson)$/);
  if(!match)throw Error('Unsupported Member Club action');
  const [,method,entity]=match;const def=definitions[entity];
  if(method==='create'){
    const vals=filter(body.values||{},def.keys);
    const {data,error}=await service.from(def.table).insert(vals).select('*').single();
    if(error)throw error;
    await service.from('audit_logs').insert({actor_user_id:user.id,action:'club.'+action,entity_type:def.table,entity_id:data.id,after_filtered:{title:data.title}});
    return reply({item:data});
  }
  const id=String(body.id||'');
  if(!uuid.test(id))throw Error('Valid course, module or lesson identifier required');
  if(method==='update'){
    const vals=filter(body.values||{},def.keys);
    const {data,error}=await service.from(def.table).update({...vals,...(entity==='course'?{updated_at:new Date().toISOString()}: {})}).eq('id',id).select('*').single();
    if(error)throw error;
    await service.from('audit_logs').insert({actor_user_id:user.id,action:'club.'+action,entity_type:def.table,entity_id:id,after_filtered:{updated_fields:Object.keys(vals)}});
    return reply({item:data});
  }
  if(body.confirm!==true)throw Error('Explicit confirmation required to delete course content');
  const {data,error}=await service.from(def.table).delete().eq('id',id).select('id').single();
  if(error)throw error;
  await service.from('audit_logs').insert({actor_user_id:user.id,action:'club.'+action,entity_type:def.table,entity_id:id});
  return reply({item:data});
 }catch(e){return fail(e)}
});
