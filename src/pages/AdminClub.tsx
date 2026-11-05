import {useEffect,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowUpRight,BookOpen,FileText,Plus,Save,Trash2,Video,ExternalLink} from 'lucide-react';
import {supabase} from '../lib/core';

type Settings={hero_title:string;hero_description:string;hero_eyebrow:string;hero_video_url:string|null;layout_config:Record<string,unknown>};
type Course={id:string;title:string;slug:string;description:string;cover_url:string;sort_order:number;featured:boolean;published:boolean};
type Module={id:string;course_id:string;position:number;title:string;description:string;published:boolean};
type Lesson={id:string;module_id:string;position:number;title:string;description:string;youtube_url:string;duration_seconds:number|null;pdf_url:string|null;resource_url:string|null;published:boolean};
type ClubData={settings:Settings;courses:Course[];modules:Module[];lessons:Lesson[]};
async function invoke(action:string,body:Record<string,unknown>={}){
 const {data,error}=await supabase.functions.invoke('member-club-admin',{body:{action,...body}});
 if(error){
  let message=error.message;
  if('context' in error&&error.context instanceof Response){
   try{const content=await error.context.clone().json();message=content?.message||content?.error||message;}catch{ /* Preserve the original error when response parsing fails. */ }
  }
  throw Error(message);
 }
 return data;
}
function slugify(text:string){return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);}
function nextPosition(used:number[],max:number){for(let n=1;n<=max;n++)if(!used.includes(n))return n;return max+1;}
export function AdminClub(){
 const qc=useQueryClient();
 const [courseId,setCourseId]=useState('');
 const [moduleId,setModuleId]=useState('');
 const {data,isLoading,error}=useQuery({queryKey:['admin-club'],queryFn:async()=>await invoke('list') as ClubData});
 const refresh=async()=>{await qc.invalidateQueries({queryKey:['admin-club']});};
 const courses=data?.courses||[];
 const current=courses.find(c=>c.id===courseId);
 const modules=(data?.modules||[]).filter(m=>m.course_id===courseId).sort((a,b)=>a.position-b.position);
 const currentModule=modules.find(m=>m.id===moduleId);
 const lessons=(data?.lessons||[]).filter(l=>l.module_id===moduleId).sort((a,b)=>a.position-b.position);
 useEffect(()=>{if(courseId&&!courses.some(c=>c.id===courseId)){setCourseId('');setModuleId('');}},[courseId,data?.courses]);
 useEffect(()=>{if(moduleId&&!modules.some(m=>m.id===moduleId))setModuleId('');},[moduleId,courseId,data?.modules]);
 return <div className="clubAdminPage">
   <div className="pageHeading"><div><span className="eyebrow">ADMINISTRATION · CONTENT STUDIO</span><h1>Member Club</h1><p>Manage the hero, course posters, up to 30 modules per course and 10 lessons per module.</p></div>
    <Link className="outlineButton" to="/app/member-club"><ArrowUpRight size={16}/> Member preview</Link></div>
   {isLoading&&<div className="skeletonBox">Loading content studio…</div>}
   {error&&<p role="alert" className="error">Unable to load Member Club administration. Check MFA and reload the page.</p>}
   {data&&<>
     <HeroEditor settings={data.settings} reload={refresh}/>
     <div className="clubAdminGrid">
      <section><CourseEditor courses={courses} selected={current} selectedId={courseId} onSelect={id=>{setCourseId(id);setModuleId('');}} reload={refresh}/></section>
      <section><ModuleEditor course={current} modules={modules} selected={currentModule} selectedId={moduleId} onSelect={setModuleId} reload={refresh}/></section>
     </div>
     <LessonEditor module={currentModule} lessons={lessons} reload={refresh}/>
   </>}
 </div>;
}
function HeroEditor({settings,reload}:{settings:Settings;reload:()=>Promise<void>}){
 const [form,setForm]=useState({hero_title:'',hero_description:'',hero_eyebrow:'',hero_video_url:'',courses_per_row:6});
 const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>setForm({hero_title:settings.hero_title,hero_description:settings.hero_description,
  hero_eyebrow:settings.hero_eyebrow,hero_video_url:settings.hero_video_url||'',courses_per_row:Number(settings.layout_config?.courses_per_row)||6}),[settings]);
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setMessage('');
  try{await invoke('save-hero',{values:{hero_title:form.hero_title,hero_description:form.hero_description,
    hero_eyebrow:form.hero_eyebrow,hero_video_url:form.hero_video_url||null,
    layout_config:{...(settings.layout_config||{}),courses_per_row:form.courses_per_row}}});setMessage('Member Club hero saved.');await reload();}
  catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel clubEditor"><div className="sectionHeading"><h2>Hero and visual layout</h2><span className="eyebrow">LIVE SETTINGS</span></div>
  <form className="formStack" onSubmit={e=>void save(e)}>
   <div className="clubEditorTwo">
    <label>Hero eyebrow<input required maxLength={80} value={form.hero_eyebrow} onChange={e=>setForm({...form,hero_eyebrow:e.target.value})}/></label>
    <label>Hero title<input required maxLength={160} value={form.hero_title} onChange={e=>setForm({...form,hero_title:e.target.value})}/></label>
   </div>
   <label>Hero description<textarea value={form.hero_description} onChange={e=>setForm({...form,hero_description:e.target.value})}/></label>
   <div className="clubEditorTwo">
    <label>Background video URL (MP4 or YouTube)<input type="url" placeholder="https://..." value={form.hero_video_url} onChange={e=>setForm({...form,hero_video_url:e.target.value})}/></label>
    <label>Posters per row (desktop)<select value={form.courses_per_row} onChange={e=>setForm({...form,courses_per_row:Number(e.target.value)})}>{[3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} covers</option>)}</select></label>
   </div>
   <button className="primary" disabled={busy}><Save size={16}/> Save Member Club appearance</button>
  </form>
  {message&&<p role="status" className="notice">{message}</p>}
 </section>;
}
const emptyCourse={title:'',slug:'',description:'',cover_url:'',sort_order:100,featured:false,published:false};
function CourseEditor({courses,selected,selectedId,onSelect,reload}:{courses:Course[];selected:Course|undefined;selectedId:string;onSelect:(id:string)=>void;reload:()=>Promise<void>}){
 const [form,setForm]=useState(emptyCourse);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 useEffect(()=>{setForm(selected?{title:selected.title,slug:selected.slug,description:selected.description,cover_url:selected.cover_url,sort_order:selected.sort_order,featured:selected.featured,published:selected.published}:{...emptyCourse,sort_order:courses.length*10+10});},[selectedId,courses.length,selected?.title,selected?.cover_url,selected?.sort_order,selected?.featured,selected?.published]);
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setMessage('');
  try{const action=selected?'update-course':'create-course';const slug=form.slug.trim()||slugify(form.title);
   if(!slug)throw Error('A valid course slug is required.');
   const data=await invoke(action,{...(selected?{id:selected.id}:{}),values:{...form,slug}});
   setMessage('Course saved.');if(!selected)onSelect(data.item.id);await reload();
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function remove(){if(!selected||!window.confirm('Delete this course and all its modules and lessons permanently?'))return;
  setBusy(true);try{await invoke('delete-course',{id:selected.id,confirm:true});onSelect('');await reload();setMessage('Course deleted.');}
  catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="panel clubEditor"><div className="sectionHeading"><h2>Courses</h2><button className="outlineButton" onClick={()=>onSelect('')}><Plus size={15}/> New course</button></div>
  <label className="clubChooserLabel">Select course to edit<select value={selectedId} onChange={e=>onSelect(e.target.value)}><option value="">Create a new course</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title} · {c.published?'Published':'Draft'}</option>)}</select></label>
  <form className="formStack" onSubmit={e=>void save(e)}>
   <div className="clubEditorTwo">
    <label>Course title<input required minLength={2} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>Slug<input placeholder="Generated from title if blank" value={form.slug} onChange={e=>setForm({...form,slug:e.target.value})}/></label>
   </div>
   <label>Course description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
   <div className="clubPosterEditor">
    <div className="clubPosterPreview">{form.cover_url?<img src={form.cover_url} alt="Portrait course cover preview"/>:<BookOpen size={30}/>}</div>
    <div className="formStack"><label>9:16 course cover URL<input type="url" required value={form.cover_url} onChange={e=>setForm({...form,cover_url:e.target.value})} placeholder="https://.../cover.jpg"/></label>
      <label>Display order<input type="number" min={0} max={100000} required value={form.sort_order} onChange={e=>setForm({...form,sort_order:Number(e.target.value)})}/></label>
      <label className="clubCheck"><input type="checkbox" checked={form.featured} onChange={e=>setForm({...form,featured:e.target.checked})}/> Featured course</label>
      <label className="clubCheck"><input type="checkbox" checked={form.published} onChange={e=>setForm({...form,published:e.target.checked})}/> Published to members</label>
    </div>
   </div>
   <div className="inlineActions"><button disabled={busy} className="primary"><Save size={16}/> Save course</button>
    {selected&&<button type="button" disabled={busy} className="outlineButton" onClick={()=>void remove()}><Trash2 size={15}/> Delete course</button>}</div>
   {selected?.published&&<Link to={'/app/member-club/'+selected.slug} className="textLink"><ExternalLink size={15}/> Preview published course</Link>}
  </form>
  {message&&<p role="status" className="notice">{message}</p>}
 </div>;
}
const emptyModule={title:'',description:'',position:1,published:true};
function ModuleEditor({course,modules,selected,selectedId,onSelect,reload}:{course:Course|undefined;modules:Module[];selected:Module|undefined;selectedId:string;onSelect:(id:string)=>void;reload:()=>Promise<void>}){
 const [form,setForm]=useState(emptyModule);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 useEffect(()=>setForm(selected?{title:selected.title,description:selected.description,position:selected.position,published:selected.published}:{...emptyModule,position:nextPosition(modules.map(m=>m.position),30)}),[selectedId,course?.id,modules.length,selected?.title,selected?.position,selected?.published]);
 async function save(e:FormEvent){e.preventDefault();if(!course)return;setBusy(true);setMessage('');
  try{const d=await invoke(selected?'update-module':'create-module',{...(selected?{id:selected.id}:{}),values:{...form,course_id:course.id}});
   if(!selected)onSelect(d.item.id);await reload();setMessage('Module saved.');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function remove(){if(!selected||!window.confirm('Delete this module and all its lessons?'))return;setBusy(true);
  try{await invoke('delete-module',{id:selected.id,confirm:true});onSelect('');await reload();setMessage('Module deleted.');}
  catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="panel clubEditor"><div className="sectionHeading"><h2>Modules <span className="muted">({modules.length}/30)</span></h2>
   <button className="outlineButton" disabled={!course||modules.length>=30} onClick={()=>onSelect('')}><Plus size={15}/> New module</button></div>
  {!course?<p className="muted">Select or create a course to organise its modules.</p>:<>
   <label className="clubChooserLabel">Select module<select value={selectedId} onChange={e=>onSelect(e.target.value)}><option value="">Create a new module</option>{modules.map(m=><option key={m.id} value={m.id}>#{m.position} · {m.title}</option>)}</select></label>
   <form className="formStack" onSubmit={e=>void save(e)}>
     <label>Module title<input minLength={2} required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
     <label>Module description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
     <div className="clubEditorTwo"><label>Position (1–30)<select value={form.position} onChange={e=>setForm({...form,position:Number(e.target.value)})}>{Array.from({length:30},(_,i)=>i+1).filter(p=>p===selected?.position||!modules.some(m=>m.position===p)).map(p=><option key={p} value={p}>{p}</option>)}</select></label>
      <label className="clubCheck"><input type="checkbox" checked={form.published} onChange={e=>setForm({...form,published:e.target.checked})}/> Visible to members</label></div>
     <div className="inlineActions"><button disabled={busy||(!selected&&modules.length>=30)} className="primary"><Save size={15}/> Save module</button>
      {selected&&<button type="button" className="outlineButton" disabled={busy} onClick={()=>void remove()}><Trash2 size={15}/> Delete</button>}</div>
   </form>
  </>}
  {message&&<p role="status" className="notice">{message}</p>}
 </div>;
}
const emptyLesson={title:'',description:'',position:1,youtube_url:'',duration_seconds:'',pdf_url:'',resource_url:'',published:true};
function LessonEditor({module,lessons,reload}:{module:Module|undefined;lessons:Lesson[];reload:()=>Promise<void>}){
 const [id,setId]=useState('');const selected=lessons.find(l=>l.id===id);
 const [form,setForm]=useState(emptyLesson);const [pdf,setPdf]=useState<File|null>(null);
 const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{setId('');setForm({...emptyLesson,position:nextPosition(lessons.map(l=>l.position),10)});setPdf(null);},[module?.id]);
 useEffect(()=>{setForm(selected?{title:selected.title,description:selected.description,position:selected.position,youtube_url:selected.youtube_url,
  duration_seconds:selected.duration_seconds===null?'':String(selected.duration_seconds),pdf_url:selected.pdf_url||'',resource_url:selected.resource_url||'',published:selected.published}:
  {...emptyLesson,position:nextPosition(lessons.map(l=>l.position),10)});setPdf(null);},[id,selected?.title,selected?.position,selected?.pdf_url,lessons.length]);
 async function save(e:FormEvent){e.preventDefault();if(!module)return;setBusy(true);setMessage('');
  try{
    let pdfUrl=form.pdf_url||null;
    if(pdf){
      if(pdf.type!=='application/pdf'||pdf.size>15728640)throw Error('Select a PDF under 15 MB.');
      const {data:grant,error:grantError}=await supabase.functions.invoke('member-club-files',{body:{action:'grant-pdf-upload'}});
      if(grantError||!grant?.token)throw Error(grantError?.message||'PDF upload could not be authorised');
      const {error:uploadError}=await supabase.storage.from('club-materials').uploadToSignedUrl(grant.upload_path,grant.token,pdf,{contentType:'application/pdf'});
      if(uploadError)throw uploadError;
      pdfUrl=grant.storage_path;
    }
    const payload={module_id:module.id,title:form.title,description:form.description,
      position:form.position,youtube_url:form.youtube_url,duration_seconds:form.duration_seconds?Number(form.duration_seconds):null,
      pdf_url:pdfUrl,resource_url:form.resource_url||null,published:form.published};
    const data=await invoke(selected?'update-lesson':'create-lesson',{...(selected?{id:selected.id}:{}),values:payload});
    setId(data.item.id);await reload();setPdf(null);setMessage('Lesson saved.');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function remove(){if(!selected||!window.confirm('Delete this lesson permanently?'))return;setBusy(true);
   try{await invoke('delete-lesson',{id:selected.id,confirm:true});setId('');await reload();setMessage('Lesson deleted.');}
   catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel clubEditor"><div className="sectionHeading"><h2>Lessons <span className="muted">({lessons.length}/10)</span></h2>
  <button className="outlineButton" disabled={!module||lessons.length>=10} onClick={()=>setId('')}><Plus size={16}/> New lesson</button></div>
  {!module?<p className="muted">Select a module above to add up to 10 lessons.</p>:<>
   <label className="clubChooserLabel">Edit lesson<select value={id} onChange={e=>setId(e.target.value)}><option value="">Create a new lesson</option>{lessons.map(l=><option key={l.id} value={l.id}>#{l.position} · {l.title}</option>)}</select></label>
   <form className="formStack" onSubmit={e=>void save(e)}>
    <div className="clubEditorTwo"><label>Lesson title<input required minLength={2} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
      <label>Order within module (1–10)<select value={form.position} onChange={e=>setForm({...form,position:Number(e.target.value)})}>{Array.from({length:10},(_,i)=>i+1).filter(p=>p===selected?.position||!lessons.some(l=>l.position===p)).map(p=><option key={p} value={p}>{p}</option>)}</select></label></div>
    <label>Private or unlisted YouTube video link<input required type="url" placeholder="https://www.youtube.com/watch?v=..." value={form.youtube_url} onChange={e=>setForm({...form,youtube_url:e.target.value})}/></label>
    <p className="muted">Unlisted YouTube videos embed without requiring individual viewer invitations. Strictly private videos require YouTube access for every viewer.</p>
    <label>Lesson description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <div className="clubEditorTwo"><label>Duration in seconds (optional)<input type="number" min="0" max="86400" value={form.duration_seconds} onChange={e=>setForm({...form,duration_seconds:e.target.value})}/></label>
      <label>Supplementary resource URL (optional)<input type="url" value={form.resource_url} onChange={e=>setForm({...form,resource_url:e.target.value})} placeholder="https://..."/></label></div>
    <div className="clubEditorTwo"><label>PDF link or existing private PDF path<input value={form.pdf_url} onChange={e=>setForm({...form,pdf_url:e.target.value})} placeholder="https://... or club-materials/..."/></label>
      <label><FileText size={14}/> Upload an optional PDF (max. 15 MB)<input type="file" accept="application/pdf,.pdf" onChange={e=>setPdf(e.target.files?.[0]||null)}/></label></div>
    <label className="clubCheck"><input type="checkbox" checked={form.published} onChange={e=>setForm({...form,published:e.target.checked})}/> Published lesson</label>
    <div className="inlineActions"><button className="primary" disabled={busy||(!selected&&lessons.length>=10)}><Video size={16}/> Save lesson</button>
     {selected&&<button className="outlineButton" disabled={busy} type="button" onClick={()=>void remove()}><Trash2 size={16}/> Delete lesson</button>}</div>
   </form>
  </>}
  {message&&<p role="status" className="notice">{message}</p>}
 </section>;
}
