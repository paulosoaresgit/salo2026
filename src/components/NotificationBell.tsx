import {useEffect,useState} from 'react';import {useQuery,useQueryClient} from '@tanstack/react-query';import {Bell,Check} from 'lucide-react';import {useNavigate} from 'react-router-dom';import {supabase,dates} from '../lib/core';import {useAuth} from '../context/Auth';
export function NotificationBell(){
 const {user}=useAuth();const [open,setOpen]=useState(false);const qc=useQueryClient();const navigate=useNavigate();
 const {data=[]}=useQuery({queryKey:['notifications',user?.id],enabled:!!user,queryFn:async()=>{
  const {data,error}=await supabase.from('notifications').select('id,title,body,type,deep_link,read_at,created_at').eq('user_id',user!.id).order('created_at',{ascending:false}).limit(25);
  if(error)throw error;return data||[];
 }});
 useEffect(()=>{if(!user)return;const channel=supabase.channel('notifications:'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'user_id=eq.'+user.id},()=>void qc.invalidateQueries({queryKey:['notifications',user.id]})).subscribe();return()=>{void supabase.removeChannel(channel)}},[user?.id,qc]);
 const unread=data.filter(n=>!n.read_at).length;
 async function openNotification(id:string,link:string|null){await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id);void qc.invalidateQueries({queryKey:['notifications',user?.id]});setOpen(false);if(link?.startsWith('/'))navigate(link)}
 return <div className="notificationWidget"><button className="iconButton" title="Notifications" aria-label={'Notifications'+(unread?' ('+unread+' unread)':'')} aria-expanded={open} onClick={()=>setOpen(!open)}><Bell size={18}/>{unread>0&&<span className="notificationCount">{unread}</span>}</button>
 {open&&<div className="notificationPanel" role="region" aria-label="Notifications"><strong>Notifications</strong>{data.length?data.map(n=><button key={n.id} onClick={()=>void openNotification(n.id,n.deep_link)} className={'notificationItem '+(!n.read_at?'isUnread':'')}><span className="notificationTitle">{n.read_at?<Check size={12}/>:<span className="onlineDot"/>}{n.title}</span><span>{n.body.replace(/(?:[;,]\s*)?speech quality was not evaluated[.!]?/gi,'').trim()}</span><small>{dates(n.created_at)}</small></button>):<p className="muted">No notifications yet.</p>}</div>}</div>
}
