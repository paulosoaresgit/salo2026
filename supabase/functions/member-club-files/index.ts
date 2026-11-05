
import {service,reply,cors,actor,admin,fail,requirePost} from '../_shared/server.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async req=>{
 try{
 const pre=cors(req);if(pre)return pre;requirePost(req);
 const b=await req.json();
 if(b.action==='grant-pdf-upload'){
   const staff=await admin(req);
   const path=crypto.randomUUID()+'.pdf';
   const {data,error}=await service.storage.from('club-materials').createSignedUploadUrl(path);
   if(error)throw error;
   await service.from('audit_logs').insert({actor_user_id:staff.id,action:'club.pdf_upload_granted',entity_type:'club_lessons',after_filtered:{path}});
   return reply({storage_path:'club-materials/'+path,upload_path:path,token:data.token,max_bytes:15728640,content_type:'application/pdf'});
 }
 const user=await actor(req);
 if(b.action!=='get-lesson-pdf'||!uuid.test(b.lesson_id||''))throw Error('Valid lesson required');
 const {data:lesson,error}=await service.from('club_lessons').select('id,module_id,pdf_url,published').eq('id',b.lesson_id).single();
 if(error||!lesson||!lesson.pdf_url)throw Error('No PDF available for this lesson');
 const {data:mod}=await service.from('club_modules').select('course_id,published').eq('id',lesson.module_id).single();
 const {data:course}=mod?await service.from('club_courses').select('published').eq('id',mod.course_id).single():{data:null};
 const {data:role}=await service.from('user_roles').select('role').eq('user_id',user.id).eq('role','admin').maybeSingle();
 if((!lesson.published||!mod?.published||!course?.published)&&!role)throw Error('Course is not published');
 if(lesson.pdf_url.startsWith('https://'))return reply({url:lesson.pdf_url});
 if(!/^club-materials\/[a-f0-9-]+[.]pdf$/.test(lesson.pdf_url))throw Error('Invalid private PDF reference');
 const path=lesson.pdf_url.replace('club-materials/','');
 const {data,error:linkError}=await service.storage.from('club-materials').createSignedUrl(path,300,{download:true});
 if(linkError)throw linkError;
 await service.from('audit_logs').insert({actor_user_id:user.id,action:'club.pdf_accessed',entity_type:'club_lessons',entity_id:lesson.id});
 return reply({url:data.signedUrl,expires_seconds:300});
 }catch(e){return fail(e)}
});
