-- Time-based, non-ASR acceptance. No claim of voice quality or pronunciation verification.
-- Only existing, saved files for every required phrase are checked for presence.
-- This is a reward-eligibility policy, not a speech quality certification.
create extension if not exists pg_cron;

create or replace function public.auto_accept_due_submissions(p_limit integer default 50)
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_row record;
  v_expected integer;
  v_valid_files integer;
  v_count integer:=0;
  v_reason text:='Automatically accepted after the five-minute waiting period. Audio content, pronunciation and emotion were not verified.';
begin
  if p_limit<1 or p_limit>200 then raise exception 'Invalid batch size';end if;
  for v_row in
    select s.id,s.assignment_id,s.user_id,s.submitted_at,s.review_due_at,
           a.task_id,a.reward_pence_snapshot
    from public.task_submissions s
    join public.user_task_assignments a on a.id=s.assignment_id and a.user_id=s.user_id
    join public.profiles p on p.id=s.user_id and p.status='active'
    where s.status in ('submitted','quality_review','manual_review')
      and s.review_due_at<=now()
      and a.status in ('submitted','quality_review')
    order by s.review_due_at,s.id
    limit p_limit
    for update of s skip locked
  loop
    select count(*) into v_expected from public.task_phrases where task_id=v_row.task_id;
    select count(distinct f.phrase_id) into v_valid_files
    from public.recording_files f
    join public.task_phrases phrase on phrase.id=f.phrase_id and phrase.task_id=v_row.task_id
    join storage.objects o on o.bucket_id='voice-recordings' and o.name=f.path
    where f.submission_id=v_row.id and f.byte_size>0
      and o.metadata->>'size' is not null
      and (o.metadata->>'size')::bigint=f.byte_size;
    -- No recording content check, transcription or duration estimate is performed.
    -- Missing uploaded files must never yield a wallet credit.
    if v_expected<1 or v_expected>70 or v_valid_files<>v_expected then
      continue;
    end if;
    insert into public.wallet_ledger_entries
      (user_id,amount_pence,entry_type,source_type,source_id,effect_type,idempotency_key,reason)
    values(v_row.user_id,v_row.reward_pence_snapshot,'task_reward',
           'task_submission',v_row.id,'credit','task-credit-'||v_row.id::text,v_reason);
    update public.wallet_accounts
       set available_pence=available_pence+v_row.reward_pence_snapshot,
           liability_ledger_version=liability_ledger_version+1
     where user_id=v_row.user_id;
    if not found then raise exception 'Wallet account unavailable';end if;
    update public.task_submissions
       set status='approved',approved_at=now(),approved_duration_ms=0,
           review_reason=v_reason,validator_version='time-acceptance-v1'
     where id=v_row.id;
    update public.user_task_assignments set status='approved' where id=v_row.assignment_id;
    insert into public.notifications(user_id,title,body,type,deep_link)
      values(v_row.user_id,'Task accepted',
             'Your submitted task was automatically accepted after five minutes. Your reward is now available in your wallet.',
             'success','/app/wallet');
    insert into public.audit_logs(action,entity_type,entity_id,after_filtered)
      values('task.auto_accepted','task_submissions',v_row.id,
             jsonb_build_object('policy','time-acceptance-v1','quality_checked',false,
                                'reward_pence',v_row.reward_pence_snapshot,'duration_measured',false));
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.auto_accept_due_submissions(integer) from public,anon,authenticated;
grant execute on function public.auto_accept_due_submissions(integer) to service_role;

-- Job runs server-side without a client browser or third-party API tokens.
select cron.schedule('voicetask-auto-accept-due','* * * * *',
  'select public.auto_accept_due_submissions(50)');
