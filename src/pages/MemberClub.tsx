import {useMemo,useState,type CSSProperties} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowLeft,ArrowRight,BookOpen,CheckCircle2,Download,ExternalLink,PlayCircle} from 'lucide-react';
import {supabase} from '../lib/core';
import {useAuth} from '../context/Auth';

type ClubSettings={hero_title:string;hero_description:string;hero_eyebrow:string;hero_video_url:string|null;layout_config:Record<string,unknown>};
type Course={id:string;title:string;slug:string;description:string;cover_url:string;sort_order:number;featured:boolean;published:boolean};
type Module={id:string;title:string;position:number;description:string;course_id:string};
type Lesson={id:string;module_id:string;title:string;description:string;position:number;youtube_url:string;duration_seconds:number|null;pdf_url:string|null;resource_url:string|null};

export function youtubeEmbed(value:string|null|undefined,background=false){
 if(!value)return null;
 try{
  const url=new URL(value);
  const host=url.hostname.replace(/^www\./,'');
  let id:string|null=null;
  if(host==='youtu.be')id=url.pathname.split('/')[1];
  if(host==='youtube.com'||host==='youtube-nocookie.com'){
   id=url.searchParams.get('v')||url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]||null;
  }
  if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id))return null;
  const qs=background?'?autoplay=1&mute=1&controls=0&loop=1&playlist='+id+'&playsinline=1':'?rel=0&modestbranding=1';
  return 'https://www.youtube-nocookie.com/embed/'+id+qs;
 }catch{return null;}
}

export function MemberClub(){
 const {data,isLoading,error}=useQuery({
  queryKey:['member-club-home'],staleTime:30000,
  queryFn:async()=>{
   const [hero,courses]=await Promise.all([
     supabase.from('club_settings').select('*').eq('id',1).single(),
     supabase.from('club_courses').select('id,title,slug,description,cover_url,sort_order,featured,published').eq('published',true).order('sort_order',{ascending:true})
   ]);
   if(hero.error||courses.error)throw hero.error||courses.error;
   return {hero:hero.data as ClubSettings,courses:(courses.data||[]) as Course[]};
  }
 });
 const featured=data?.courses.filter(c=>c.featured)||[];
 const others=data?.courses.filter(c=>!c.featured)||[];
 const hero=data?.hero;const columns=Math.max(3,Math.min(8,Number(hero?.layout_config?.courses_per_row)||6));
 const youtubeBackground=youtubeEmbed(hero?.hero_video_url,true);
 return <div className="clubPage">
   <section className="clubHero">
    {hero?.hero_video_url&&(
      youtubeBackground?<iframe title="Member Club background" className="clubHeroVideo" src={youtubeBackground} tabIndex={-1} aria-hidden="true" allow="autoplay; encrypted-media" />:
      <video className="clubHeroVideo" src={hero.hero_video_url} muted loop autoPlay playsInline preload="metadata" aria-hidden="true"/>
    )}
    <div className="clubHeroShade"/>
    <div className="clubHeroContent">
      <span className="eyebrow">{hero?.hero_eyebrow||'VOICETASK · MEMBER CLUB'}</span>
      <h1>{hero?.hero_title||'Your learning starts here'}</h1>
      <p>{hero?.hero_description||'Discover courses and resources prepared for the VoiceTask community.'}</p>
      {featured[0]&&<Link to={'/app/member-club/'+featured[0].slug} className="primary"><PlayCircle size={18}/> Start learning <ArrowRight size={16}/></Link>}
    </div>
   </section>
   {error&&<div className="error" role="alert">Member Club could not be loaded. Please refresh the page.</div>}
   {isLoading&&<div className="skeletonBox">Loading your Member Club…</div>}
   {!isLoading&&!error&&(!data?.courses.length?<section className="panel clubEmpty"><BookOpen size={36}/><h2>Courses are coming soon</h2><p>New training modules will appear here as soon as they are published.</p></section>:
    <>
      {featured.length>0&&<ClubCollection heading="Featured learning" courses={featured} columns={columns}/>}
      {others.length>0&&<ClubCollection heading={featured.length?'Explore all courses':'Your courses'} courses={others} columns={columns}/>}
    </>)}
 </div>;
}

function ClubCollection({heading,courses,columns}:{heading:string;courses:Course[];columns:number}){
 return <section className="clubCollection"><div className="sectionHeading"><h2>{heading}</h2><span className="muted">{courses.length} courses</span></div>
  <div className="clubCourseShelf" style={{"--club-columns":columns} as CSSProperties}>{courses.map(course=><Link className="clubCourseCard" key={course.id} to={'/app/member-club/'+course.slug}>
   <div className="clubPoster"><img loading="lazy" src={course.cover_url} alt={'Cover for '+course.title}/><div className="clubPosterGradient"/><PlayCircle className="clubPosterPlay" size={34}/></div>
   <h3>{course.title}</h3><p>{course.description}</p>
  </Link>)}</div>
 </section>;
}

export function MemberClubCourse(){
 const {slug}=useParams();const {user}=useAuth();const qc=useQueryClient();const [search,setSearch]=useSearchParams();
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [pdfLink,setPdfLink]=useState<string|null>(null);
 const {data,isLoading,error}=useQuery({
  queryKey:['club-course',slug,user?.id],enabled:!!slug&&!!user,
  queryFn:async()=>{
   const {data:course,error:courseError}=await supabase.from('club_courses')
      .select('id,title,slug,description,cover_url,sort_order,featured,published')
      .eq('slug',slug!).eq('published',true).single();
   if(courseError)throw courseError;
   const {data:modules,error:moduleError}=await supabase.from('club_modules')
      .select('id,title,position,description,course_id').eq('course_id',course.id)
      .eq('published',true).order('position');
   if(moduleError)throw moduleError;
   const modIds=(modules||[]).map(m=>m.id);
   const {data:lessons,error:lessonError}=modIds.length
    ?await supabase.from('club_lessons')
      .select('id,module_id,title,description,position,youtube_url,duration_seconds,pdf_url,resource_url')
      .in('module_id',modIds).eq('published',true).order('position')
    :{data:[] as Lesson[],error:null};
   if(lessonError)throw lessonError;
   const ids=(lessons||[]).map(l=>l.id);
   const {data:progress,error:progressError}=ids.length
    ?await supabase.from('club_lesson_progress').select('lesson_id').eq('user_id',user!.id).in('lesson_id',ids)
    :{data:[] as {lesson_id:string}[],error:null};
   if(progressError)throw progressError;
   return {course:course as Course,modules:(modules||[]) as Module[],lessons:(lessons||[]) as Lesson[],done:new Set((progress||[]).map(x=>x.lesson_id))};
  }
 });
 const lessonId=search.get('lesson');
 const sorted=useMemo(()=>data?.modules.flatMap(m=>data.lessons.filter(l=>l.module_id===m.id).sort((a,b)=>a.position-b.position))||[],[data]);
 const current=sorted.find(l=>l.id===lessonId)||sorted[0];
 const video=youtubeEmbed(current?.youtube_url);
 async function markComplete(){
  if(!current||!user||data?.done.has(current.id))return;
  setBusy(true);setMessage('');
  const {error}=await supabase.from('club_lesson_progress').insert({lesson_id:current.id,user_id:user.id});
  if(error&&error.code!=='23505')setMessage(error.message);
  else await qc.invalidateQueries({queryKey:['club-course',slug,user.id]});
  setBusy(false);
 }
 async function getPdf(){
  if(!current)return;
  setBusy(true);setMessage('');
  const {data:result,error}=await supabase.functions.invoke('member-club-files',{body:{action:'get-lesson-pdf',lesson_id:current.id}});
  if(error||!result?.url)setMessage(error?.message||'The PDF is currently unavailable.');
  else setPdfLink(result.url);
  setBusy(false);
 }
 if(isLoading)return <div className="skeletonBox">Loading your course…</div>;
 if(error||!data)return <div className="emptyState"><h2>Course unavailable</h2><Link className="outlineButton" to="/app/member-club">Return to Member Club</Link></div>;
 return <div className="clubPage">
  <Link className="backLink" to="/app/member-club"><ArrowLeft size={16}/> Member Club</Link>
  <div className="clubCourseHeading"><div><span className="eyebrow">MEMBER CLUB · COURSE</span><h1>{data.course.title}</h1><p>{data.course.description}</p></div>
   <span className="clubCourseProgress"><CheckCircle2 size={17}/>{data.done.size} / {sorted.length} lessons completed</span></div>
  <div className="clubPlayerGrid">
   <section className="clubPlayerMain">
    <div className="clubVideoFrame">
     {video?<iframe title={current?.title||'Course lesson'} src={video} allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/>:
      <div className="clubNoVideo"><PlayCircle size={36}/><p>{current?'This lesson video is unavailable.':'Select a lesson to begin.'}</p></div>}
    </div>
    {current&&<div className="panel clubLessonDetails">
      <span className="eyebrow">NOW PLAYING</span><h2>{current.title}</h2>
      {current.description&&<p>{current.description}</p>}
      <div className="clubLessonButtons">
       <button className="primary" disabled={busy||data.done.has(current.id)} onClick={()=>void markComplete()}><CheckCircle2 size={17}/>{data.done.has(current.id)?'Lesson completed':'Mark as completed'}</button>
       {current.pdf_url&&<button className="outlineButton" disabled={busy} onClick={()=>{setPdfLink(null);void getPdf()}}><Download size={16}/> Prepare lesson PDF</button>}
       {pdfLink&&<a className="outlineButton" href={pdfLink} target="_blank" rel="noopener noreferrer"><Download size={16}/> Open prepared PDF (expires shortly)</a>}
       {current.resource_url&&<a className="outlineButton" href={current.resource_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> Extra resource</a>}
      </div>
      {message&&<p role="status" className="notice">{message}</p>}
     </div>}
   </section>
   <aside className="panel clubCurriculum"><h2>Course content</h2><p className="muted">{data.modules.length} modules · {sorted.length} lessons</p>
    <div className="clubModuleList">{data.modules.map(m=><section key={m.id} className="clubModule">
      <h3><BookOpen size={16}/> Module {m.position} · {m.title}</h3>{m.description&&<p className="muted">{m.description}</p>}
      {data.lessons.filter(l=>l.module_id===m.id).sort((a,b)=>a.position-b.position).map(l=><button key={l.id} className={'clubLessonItem '+(l.id===current?.id?'current':'')} onClick={()=>setSearch({lesson:l.id})}>
        <span>{data.done.has(l.id)?<CheckCircle2 size={16}/>:<PlayCircle size={16}/>}</span>
        <span className="clubLessonItemText"><strong>{l.position}. {l.title}</strong>{l.duration_seconds&&<small>{Math.ceil(l.duration_seconds/60)} min</small>}</span>
       </button>)}
    </section>)}</div>
   </aside>
  </div>
 </div>;
}
