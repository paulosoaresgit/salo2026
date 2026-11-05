import {useEffect,useState,type FormEvent} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Search,Trophy,Save,UserPlus} from 'lucide-react';
import {supabase} from '../lib/core';

type Period='week'|'month'|'year';
type Ranked={user_id:string;display_name:string;approved_tasks:number;approved_seconds:number;points:number};
type Member={id:string;full_name:string;public_display_name:string|null;email_display:string|null;status:string};
async function post(action:string,body:Record<string,unknown>={}){
 const {data,error}=await supabase.functions.invoke('member-club-admin',{body:{action,...body}});
 if(error){let message=error.message;
  if('context' in error&&error.context instanceof Response){
   try{const payload=await error.context.clone().json();message=payload?.message||payload?.error||message;}catch{ /* Preserve the original error when response parsing fails. */ }
  }
  throw Error(message);
 }
 return data;
}
export function AdminLeaderboard(){
 const [period,setPeriod]=useState<Period>('week');
 const [search,setSearch]=useState('');
 const [members,setMembers]=useState<Member[]>([]);
 const [selected,setSelected]=useState<Member|null>(null);
 const [points,setPoints]=useState('0');
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const qc=useQueryClient();
 const {data:ranking=[],isLoading,error}=useQuery({queryKey:['admin-leaderboard',period],queryFn:async()=>{
  const {data,error}=await supabase.rpc('community_leaderboard',{p_period:period});
  if(error)throw error;return (data||[]) as Ranked[];
 }});
 useEffect(()=>{if(selected){const existing=ranking.find(r=>r.user_id===selected.id);setPoints(String(existing?.points||0));}},[selected,period,ranking]);
 async function find(e:FormEvent){e.preventDefault();setBusy(true);setMessage('');
  try{const data=await post('find-members',{search:search.trim()});setMembers((data.members||[]) as Member[]);
    if(!data.members?.length)setMessage('No matching registered members were found.');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function save(e:FormEvent){e.preventDefault();if(!selected)return;setBusy(true);setMessage('');
  try{const value=Number(points);if(!Number.isInteger(value)||value<0||value>10000000)throw Error('Enter a whole-number score between 0 and 10,000,000.');
   if(reason.trim().length<10)throw Error('Provide a reason of at least 10 characters.');
   await post('set-ranking-points',{user_id:selected.id,period,points:value,reason:reason.trim()});
   await qc.invalidateQueries({queryKey:['admin-leaderboard']});
   setReason('');setMessage('The member’s '+period+' leaderboard score was updated and audited.');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="clubAdminPage">
  <div className="pageHeading"><div><span className="eyebrow">ADMINISTRATION · COMMUNITY RANKING</span><h1>Leaderboard management</h1><p>Add registered members to the leaderboard and adjust scores for work completed outside VoiceTask.</p></div></div>
  <section className="panel clubEditor">
   <div className="sectionHeading"><h2><Trophy size={20}/> Ranking period</h2><span className="muted">Every score change has an audit trail</span></div>
   <div className="inlineActions">{(['week','month','year'] as Period[]).map(p=><button type="button" key={p} className={period===p?'primary':'outlineButton'} onClick={()=>setPeriod(p)}>{p==='week'?'This week':p==='month'?'This month':'This year'}</button>)}</div>
  </section>
  <div className="clubAdminGrid">
   <section className="panel clubEditor"><h2><UserPlus size={20}/> Find and add a member</h2>
    <form className="formStack" onSubmit={e=>void find(e)}><label>Search registered members by name or email<input value={search} minLength={2} required onChange={e=>setSearch(e.target.value)} placeholder="Enter name or email"/></label>
     <button className="outlineButton" disabled={busy}><Search size={16}/> Search members</button></form>
    <div className="clubMemberResults">{members.map(m=><button key={m.id} className={'clubMemberResult '+(selected?.id===m.id?'chosen':'')} onClick={()=>setSelected(m)}>
      <span><strong>{m.public_display_name||m.full_name||'VoiceTask member'}</strong><small>{m.email_display||'Member'} · {m.status}</small></span><UserPlus size={16}/></button>)}</div>
   </section>
   <section className="panel clubEditor"><h2>Set points for {period}</h2>
    {!selected?<p className="muted">Select a registered member from the search results or the leaderboard below.</p>:
     <form className="formStack" onSubmit={e=>void save(e)}>
      <p className="muted">Selected member: <strong>{selected.public_display_name||selected.full_name||selected.email_display}</strong></p>
      <label>Total points for the selected period<input type="number" required min={0} max={10000000} step={1} value={points} onChange={e=>setPoints(e.target.value)}/></label>
      <label>Reason for manual adjustment<textarea required minLength={10} value={reason} onChange={e=>setReason(e.target.value)} placeholder="For example: voice tasks completed outside the platform, verified by staff."/></label>
      <p className="muted">This sets the member’s displayed score for the current period. The database calculates the adjustment and records who made it.</p>
      <button className="primary" disabled={busy}><Save size={16}/> Save audited score</button>
     </form>}
   </section>
  </div>
  <section className="panel"><div className="sectionHeading"><h2>Live ranking · {period}</h2><span className="muted">{ranking.length} ranked members</span></div>
   {error&&<p role="alert" className="error">Leaderboard could not be loaded.</p>}
   {isLoading?<div className="skeletonBox">Loading leaderboard…</div>:ranking.length?<div className="tableWrap"><table><thead><tr><th>Position</th><th>Member</th><th>Approved tasks</th><th>Approved recording time</th><th>Points</th><th>Action</th></tr></thead><tbody>
    {ranking.map((r,i)=><tr key={r.user_id}><td>#{i+1}</td><td>{r.display_name}</td><td>{r.approved_tasks}</td><td>{Math.floor(r.approved_seconds/60)} min</td><td><strong>{r.points}</strong></td><td>
      <button className="outlineButton" onClick={()=>setSelected({id:r.user_id,full_name:r.display_name,public_display_name:r.display_name,email_display:null,status:'active'})}>Edit points</button>
    </td></tr>)}</tbody></table></div>:
    <p className="muted">No ranking entries yet. Search for a member to add a manual score.</p>}
  </section>
  {message&&<p role="status" className="notice">{message}</p>}
 </div>;
}
