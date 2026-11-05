import {useState,type FormEvent} from 'react';import {Link} from 'react-router-dom';import {useQuery,useQueryClient} from '@tanstack/react-query';import {ShieldCheck,ArrowRight,CheckCircle2,Trophy,Settings,UserRound} from 'lucide-react';import {supabase,pounds,duration,dates,levels} from '../lib/core';import {useAuth} from '../context/Auth';
import {AdminSecuritySetup} from '../components/AdminSecuritySetup';
export function WalletPage(){
 const {user}=useAuth();const {data,refetch}=useQuery({queryKey:['wallet',user?.id],enabled:!!user,queryFn:async()=>{
  const [w,l,v,p,r]=await Promise.all([
   supabase.from('wallet_accounts').select('*').eq('user_id',user!.id).maybeSingle(),
   supabase.from('wallet_ledger_entries').select('*').eq('user_id',user!.id).order('created_at',{ascending:false}).limit(50),
   supabase.from('identity_verifications').select('status').eq('user_id',user!.id).order('submitted_at',{ascending:false}).limit(1),
   supabase.from('payout_destinations').select('id,masked_display,type,verified').eq('user_id',user!.id),supabase.from('withdrawal_requests').select('id,status,requested_pence,requested_at,provider_reference').eq('user_id',user!.id).order('requested_at',{ascending:false}).limit(20)]);
  for(const x of [w,l,v,p,r])if(x.error)throw x.error;
  return {wallet:w.data,ledger:l.data||[],kyc:v.data?.[0]?.status,destinations:p.data||[],withdrawals:r.data||[]}
 }});
 const available=data?.wallet?.available_pence||0;const [dest,setDest]=useState('');const [amount,setAmount]=useState('250.00');
 const [recipient,setRecipient]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function withdraw(e:FormEvent){
  e.preventDefault();const pence=Math.round(Number(amount)*100);
  if(!Number.isSafeInteger(pence)||pence<25000||pence>available){setMessage('Enter an eligible withdrawal amount.');return}
  setBusy(true);
  const {error}=await supabase.rpc('request_my_withdrawal',{p_amount_pence:pence,p_destination_id:dest,p_idempotency_key:crypto.randomUUID()});
  setMessage(error?.message||'Your withdrawal request has been received by our payments team.');
  await refetch();setBusy(false);
 }
 async function register(e:FormEvent){
  e.preventDefault();setBusy(true);setMessage('');
  const {error,result}=await (async()=>{const r=await supabase.functions.invoke('register-payout-destination',{body:{type:'paypal',email:recipient}});return {error:r.error,result:r.data}})();
  setMessage(error?.message||result?.message||'Recipient registration requested');
  if(!error){setRecipient('');await refetch()}setBusy(false);
 }
 const eligible=data?.kyc==='verified'&&available>=25000&&data.destinations.some(d=>d.verified);
 return <><div className="pageHeading"><div><span className="eyebrow">ACCOUNT FINANCES</span><h1>Wallet</h1><p>Approved earnings, reserved amounts and payment destinations.</p></div></div>
 <div className="walletHero"><span>Available balance</span><strong>{pounds(available)}</strong><p>Reserved funds {pounds(data?.wallet?.reserved_pence||0)}</p>
 <div className="progressTrack"><div style={{width:Math.min(100,available/25000*100)+'%'}}/></div><small>{pounds(available)} of £250.00 minimum withdrawal</small></div>
 <div className="lowerGrid"><section className="panel formStack"><h2>Request withdrawal</h2>
 {data?.kyc!=='verified'?<div className="notice"><ShieldCheck size={19}/> Identity verification must be completed before withdrawal. <Link to="/app/profile#identity-verification">Verify identity <ArrowRight size={14}/></Link></div>:
 available<25000?<div className="notice">You need at least £250.00 in approved available earnings to request a withdrawal.</div>:
 !data.destinations.some(d=>d.verified)?<div className="notice">Your payment recipient is awaiting approval by our payments team. Set up a destination below.</div>:null}
 <form onSubmit={e=>void withdraw(e)} className="formStack">
 <label>Verified payment destination<select required value={dest} onChange={e=>setDest(e.target.value)}><option value="">Select a verified destination</option>{data?.destinations.filter(d=>d.verified).map(d=><option key={d.id} value={d.id}>{d.type}: {d.masked_display}</option>)}</select></label>
 <label>Amount in GBP<input type="number" min="250" max={available/100} step=".01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
 <p className="muted">Withdrawals are handled by the VoiceTask payments team.</p>
 <button className="primary" disabled={busy||!eligible||!dest}>{busy?'Submitting…':'Request withdrawal'}</button>
 </form></section>
 <section className="panel formStack"><h2>Payment destinations</h2>
 {data?.destinations.map(d=><div className="listLine" key={d.id}><div><strong>{d.type==='paypal'?'PayPal':'Bank'} · {d.masked_display}</strong><small>{d.verified?'Staff-approved recipient':'Awaiting staff review'}</small></div></div>)}
 <form onSubmit={e=>void register(e)} className="formStack"><label>PayPal recipient email<input type="email" required value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="name@example.com"/></label>
 <button className="outlineButton" disabled={busy}>Register PayPal destination</button></form>
 <p className="muted">Payments are made outside VoiceTask by our payments team, currently to staff-approved PayPal addresses. The displayed status is updated after the actual transfer. Bank details are not currently collected.</p>
 </section></div>
 <section className="panel"><h2>Withdrawal requests</h2>{data?.withdrawals.length?data.withdrawals.map(r=><div className="listLine" key={r.id}><div><strong>{r.status.replaceAll('_',' ')}</strong><small>{dates(r.requested_at)} · Handled manually by the payments team{r.provider_reference?' · Transfer ref: '+r.provider_reference:''}</small></div><strong>{pounds(r.requested_pence)}</strong></div>):<div className="emptyState">No withdrawal requests yet.</div>}</section>
 <section className="panel"><h2>Transaction history</h2>{data?.ledger.length?data.ledger.map(e=><div className="listLine" key={e.id}><div><strong>{e.entry_type.replaceAll('_',' ')}</strong><small>{dates(e.created_at)}</small></div><strong>{pounds(e.amount_pence)}</strong></div>):<div className="emptyState">No transactions yet.</div>}</section>
 {message&&<p role="status" className="notice">{message}</p>}</>
}
export function ProfilePage(){
 const {user}=useAuth();const qc=useQueryClient();
 const {data}=useQuery({queryKey:['profile',user?.id],enabled:!!user,queryFn:async()=>{
  const [p,v]=await Promise.all([supabase.from('profiles').select('*').eq('id',user!.id).maybeSingle(),supabase.from('identity_verifications').select('*').eq('user_id',user!.id).order('submitted_at',{ascending:false}).limit(1)]);
  if(p.error||v.error)throw p.error||v.error;return {profile:p.data,verification:v.data?.[0]};
 }});
 const verification=data?.verification;
 const {data:events=[]}=useQuery({queryKey:['identity-events',verification?.id],enabled:!!verification?.id,queryFn:async()=>{
  const {data,error}=await supabase.from('identity_status_events').select('id,to_status,at,reason').eq('verification_id',verification.id).order('at');
  if(error)throw error;return data||[];
 }});
 const [name,setName]=useState('');const [mobile,setMobile]=useState('');const [message,setMessage]=useState('');
 const [docType,setDocType]=useState('passport');const [front,setFront]=useState<File|null>(null);const [back,setBack]=useState<File|null>(null);const [busy,setBusy]=useState(false);
 async function save(e:FormEvent){e.preventDefault();const {error}=await supabase.from('profiles').update({full_name:name||data?.profile?.full_name,mobile_e164:mobile||data?.profile?.mobile_e164}).eq('id',user!.id);setMessage(error?.message||'Profile saved.');void qc.invalidateQueries({queryKey:['profile']})}
 async function upload(file:File,side:'front'|'back'){
  const {data:grant,error}=await supabase.functions.invoke('identity-upload',{body:{mime_type:file.type,doc_type:docType,side,size_bytes:file.size}});
  if(error||!grant?.path||!grant?.token)throw Error(error?.message||'Cannot authorise document');
  const result=await supabase.storage.from('identity-documents').uploadToSignedUrl(grant.path,grant.token,file,{contentType:file.type});
  if(result.error)throw result.error;
  return {path:grant.path,side};
 }
 async function verify(e:FormEvent){
  e.preventDefault();if(!front||!user||docType==='national_id'&&!back)return;
  setBusy(true);setMessage('');
  try{
   const paths=await Promise.all([upload(front,'front'),...(docType==='national_id'&&back?[upload(back,'back')]:[])]);
   const result=await supabase.functions.invoke('identity-upload',{body:{paths,doc_type:docType,finalise:true}});
   if(result.error)throw result.error;
   setMessage("We've received your identity documents. Verification may take up to seven days.");
   await qc.invalidateQueries({queryKey:['profile']});
  }catch(error){setMessage(error instanceof Error?error.message:'Document upload failed');}
  setBusy(false);
 }
 const due=verification?.due_at?new Date(verification.due_at):null;
 const overdue=due&&due.getTime()<Date.now()&&!['verified','rejected'].includes(verification?.status||'');
 return <><div className="pageHeading"><div><span className="eyebrow">ACCOUNT</span><h1>My Profile</h1><p>Manage your details and identity verification.</p></div></div>
 <div className="lowerGrid"><form className="panel formStack" onSubmit={e=>void save(e)}><h2><UserRound size={20}/> Personal details</h2>
 <label>Full name<input value={name} placeholder={data?.profile?.full_name||''} onChange={e=>setName(e.target.value)}/></label>
 <label>Email address<input disabled value={user?.email||''}/></label>
 <label>Mobile number<input value={mobile} placeholder={data?.profile?.mobile_e164||''} onChange={e=>setMobile(e.target.value)}/></label>
 <label>Country<input disabled value={data?.profile?.country||''}/></label>
 <button className="primary">Save changes</button></form>
 <section className="panel formStack" id="identity-verification"><h2><ShieldCheck size={20}/> ID Verification</h2>
 <p className="muted">Status: <strong>{verification?.status?.replaceAll('_',' ')||'Not started'}</strong></p>
 {verification?.status==='verified'?<p className="success"><CheckCircle2 size={20}/> Identity verified by a reviewer.</p>
 :['submitted','processing','manual_review'].includes(verification?.status||'')?<><h3>Identity verification in progress</h3><p>We've received your identity documents. Your verification is now being processed and may take up to seven days. You can track its progress here, and we'll notify you as soon as a decision is available.</p>
 {overdue&&<p className="notice">Your verification is taking longer than expected. Our team is reviewing it.</p>}
 </>:<form onSubmit={e=>void verify(e)} className="formStack">
 <label>Document type<select value={docType} onChange={e=>setDocType(e.target.value)}><option value="passport">Passport</option><option value="national_id">National ID</option></select></label>
 <label>{docType==='national_id'?'Identity document — front':'Identity document'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={e=>setFront(e.target.files?.[0]||null)}/></label>
 {docType==='national_id'&&<label>Identity document — back<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={e=>setBack(e.target.files?.[0]||null)}/></label>}
 <p className="muted">Your documents are private and are never included in AI training datasets. Our verification team reviews your documents manually. Time passing does not automatically verify your identity.</p>
 <button className="primary" disabled={busy}>{busy?'Uploading securely…':'Verify my identity'}</button></form>}
 {verification&&<div className="kycTimeline"><h3>Verification history</h3>
 {events.length?events.map((event,i)=><div className="timelineEntry timelineConfirmed" key={event.id}>
  <span>{i+1}</span><div><strong>{event.to_status.replaceAll('_',' ')}</strong><small>{dates(event.at)}{event.reason?' · '+event.reason:''}</small></div>
 </div>):<div className="timelineEntry timelineConfirmed"><span>1</span><div><strong>Documents submitted</strong><small>{dates(verification.submitted_at)}</small></div></div>}
 {['submitted','processing','manual_review'].includes(verification.status)&&<p className="muted">Awaiting a manual decision by the VoiceTask verification team. No automatic approval occurs after a fixed number of days.</p>}
 </div>}</section></div>
 {message&&<p className="notice" role="status">{message}</p>}</>
}
export function SettingsPage(){const {user}=useAuth();const [message,setMessage]=useState('');const {data,refetch}=useQuery({queryKey:['settings',user?.id],enabled:!!user,queryFn:async()=>{const {data}=await supabase.from('user_settings').select('*').eq('user_id',user!.id).maybeSingle();return data}});async function change(key:'in_app_notifications'|'email_notifications'|'whatsapp_opt_in',value:boolean){const {error}=await supabase.from('user_settings').update({[key]:value}).eq('user_id',user!.id);setMessage(error?.message||'Preferences saved');void refetch()}return <><div className="pageHeading"><div><span className="eyebrow">PREFERENCES</span><h1>Settings</h1><p>Notifications, account security and privacy.</p></div></div><div className="panel formStack"><h2><Settings size={19}/> Account notifications</h2>{([['in_app_notifications','In-app notifications'],['email_notifications','Email notifications'],['whatsapp_opt_in','WhatsApp notifications (opt-in)']] as const).map(([key,label])=><label className="settingLine" key={key}>{label}<input type="checkbox" checked={!!data?.[key]} onChange={e=>void change(key,e.target.checked)}/></label>)}<h2>Security</h2><p className="muted">Recover or update your access code through the verified email recovery flow.</p><Link to="/forgot-access" className="outlineButton">Manage account access</Link><AdminSecuritySetup/><h2>Privacy & data</h2><p className="muted">Your voice recordings and identification documents are personal data. View how your information is processed.</p><Link to="/data-use" className="textLink">Data use policy</Link><Link to="/privacy" className="textLink">Privacy policy</Link>{message&&<p role="status">{message}</p>}</div></>}
export function LeaderboardPage(){const [period,setPeriod]=useState('week');const {data=[],isLoading}=useQuery({queryKey:['leaderboard',period],queryFn:async()=>{const {data,error}=await supabase.rpc('community_leaderboard',{p_period:period});if(error)throw error;return data||[]}});return <><div className="pageHeading"><div><span className="eyebrow">COMMUNITY</span><h1>Leaderboard</h1><p>Earn points through approved voice tasks. Figures are based on genuine contributions.</p></div><div className="chips">{[['week','This week'],['month','This month'],['year','This year']].map(([v,l])=><button className={'chip '+(period===v?'selected':'')} onClick={()=>setPeriod(v)} key={v}>{l}</button>)}</div></div><div className="panel"><h2><Trophy size={20}/> Community rankings</h2>{isLoading?<p>Loading results…</p>:data.length?<div className="leaderboardList">{data.map((r:{user_id:string;display_name:string;approved_tasks:number;approved_seconds:number;points:number},i:number)=><div className="listLine" key={r.user_id}><span className="position">{i+1}</span><div><strong>{r.display_name}</strong><small>{r.approved_tasks} approved tasks · {duration(r.approved_seconds*1000)}</small></div><strong>{r.points} pts</strong></div>)}</div>:<div className="emptyState">No approved task activity for this period yet.</div>}</div><div className="panel"><h2>Account levels</h2><div className="levelsList">{levels.map((l,i)=><div key={l.label}><span>{i+1}. {l.label}</span><strong>{l.hours}h total</strong></div>)}</div></div></>}
