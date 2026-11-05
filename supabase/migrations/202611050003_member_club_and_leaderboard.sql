-- Member Club and manual leaderboard. Idempotent on an already configured staging database.
create table if not exists public.club_settings(
 id smallint primary key default 1 check(id=1),
 hero_title text not null default 'Your learning starts here',
 hero_description text not null default 'Explore training, courses and member resources.',
 hero_eyebrow text not null default 'VOICE TASK • MEMBER CLUB',
 hero_video_url text,
 layout_config jsonb not null default '{"layout":"carousel","courses_per_row":6}'::jsonb,
 updated_at timestamptz not null default now()
);
insert into public.club_settings(id) values(1) on conflict do nothing;
create table if not exists public.club_courses(
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 2 and 160),
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 description text not null default '',
 cover_url text not null check(cover_url ~ '^https://'),
 sort_order integer not null default 100 check(sort_order between 0 and 100000),
 featured boolean not null default false,published boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists club_courses_published_order_idx on public.club_courses(published,sort_order,id);
create table if not exists public.club_modules(
 id uuid primary key default gen_random_uuid(),
 course_id uuid not null references public.club_courses(id) on delete cascade,
 title text not null check(length(trim(title)) between 2 and 160),
 position smallint not null check(position between 1 and 30),
 description text not null default '',
 published boolean not null default true,
 created_at timestamptz not null default now(),unique(course_id,position)
);
create index if not exists club_modules_course_position_idx on public.club_modules(course_id,position);
create table if not exists public.club_lessons(
 id uuid primary key default gen_random_uuid(),
 module_id uuid not null references public.club_modules(id) on delete cascade,
 title text not null check(length(trim(title)) between 2 and 160),
 position smallint not null check(position between 1 and 10),
 description text not null default '',
 youtube_url text not null check(youtube_url ~* '^https://(www[.])?(youtube[.]com|youtu[.]be|youtube-nocookie[.]com)/'),
 duration_seconds integer check(duration_seconds between 0 and 86400),
 pdf_url text,
 resource_url text check(resource_url is null or resource_url ~ '^https://'),
 published boolean not null default true,
 created_at timestamptz not null default now(),unique(module_id,position)
);
alter table public.club_lessons drop constraint if exists club_lessons_pdf_url_check;
alter table public.club_lessons add constraint club_lessons_pdf_url_check
 check(pdf_url is null or pdf_url ~ '^https://' or pdf_url ~ '^club-materials/[a-f0-9-]+[.]pdf$');
create index if not exists club_lessons_module_position_idx on public.club_lessons(module_id,position);
create table if not exists public.club_lesson_progress(
 user_id uuid not null references auth.users(id) on delete cascade,
 lesson_id uuid not null references public.club_lessons(id) on delete cascade,
 completed_at timestamptz not null default now(),primary key(user_id,lesson_id)
);
alter table public.club_settings enable row level security;
alter table public.club_courses enable row level security;
alter table public.club_modules enable row level security;
alter table public.club_lessons enable row level security;
alter table public.club_lesson_progress enable row level security;
revoke all on public.club_settings,public.club_courses,public.club_modules,public.club_lessons from anon,authenticated;
grant select on public.club_settings,public.club_courses,public.club_modules,public.club_lessons to authenticated;
grant select,insert,delete on public.club_lesson_progress to authenticated;
drop policy if exists club_settings_for_members on public.club_settings;
create policy club_settings_for_members on public.club_settings for select to authenticated using(true);
drop policy if exists club_published_courses on public.club_courses;
create policy club_published_courses on public.club_courses for select to authenticated using(published or (select public.is_admin()));
drop policy if exists club_published_modules on public.club_modules;
create policy club_published_modules on public.club_modules for select to authenticated
 using((published and exists(select 1 from public.club_courses c where c.id=course_id and c.published)) or (select public.is_admin()));
drop policy if exists club_published_lessons on public.club_lessons;
create policy club_published_lessons on public.club_lessons for select to authenticated
 using((published and exists(select 1 from public.club_modules m join public.club_courses c on c.id=m.course_id where m.id=module_id and m.published and c.published)) or (select public.is_admin()));
drop policy if exists club_progress_read_own on public.club_lesson_progress;
create policy club_progress_read_own on public.club_lesson_progress for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists club_progress_insert_own on public.club_lesson_progress;
create policy club_progress_insert_own on public.club_lesson_progress for insert to authenticated
 with check(user_id=(select auth.uid()) and exists(select 1 from public.club_lessons l join public.club_modules m on m.id=l.module_id join public.club_courses c on c.id=m.course_id where l.id=lesson_id and l.published and m.published and c.published));
drop policy if exists club_progress_delete_own on public.club_lesson_progress;
create policy club_progress_delete_own on public.club_lesson_progress for delete to authenticated using(user_id=(select auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('club-materials','club-materials',false,15728640,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=15728640,allowed_mime_types=array['application/pdf'];

-- Include members with manual score adjustments even without in-app approved tasks.
create or replace function public.community_leaderboard(p_period text default 'week')
returns table(user_id uuid,display_name text,approved_tasks bigint,approved_seconds bigint,points bigint)
language sql stable security definer set search_path='' as $func$
with bounds as (
 select case p_period when 'year' then date_trunc('year',now() at time zone 'UTC')
 when 'month' then date_trunc('month',now() at time zone 'UTC')
 else date_trunc('week',now() at time zone 'UTC') end as since),
approved as (
 select s.user_id,count(distinct s.assignment_id)::bigint as tasks,
 coalesce(sum(s.approved_duration_ms/1000),0)::bigint as seconds
 from public.task_submissions s cross join bounds b
 where s.status='approved' and s.approved_at>=b.since group by s.user_id),
adjusted as (
 select x.user_id,coalesce(sum(x.bonus_points),0)::bigint as bonus
 from public.leaderboard_adjustments x cross join bounds b
 where x.period_scope=p_period and x.created_at>=b.since group by x.user_id),
members as (select user_id from approved union select user_id from adjusted)
select m.user_id,coalesce(nullif(trim(p.public_display_name),''),nullif(trim(p.full_name),''),'VoiceTask member') as display_name,
 coalesce(a.tasks,0)::bigint as approved_tasks,coalesce(a.seconds,0)::bigint as approved_seconds,
 (coalesce(a.tasks,0)*100+coalesce(x.bonus,0))::bigint as points
from members m join public.profiles p on p.id=m.user_id and p.status='active'
left join approved a on a.user_id=m.user_id
left join adjusted x on x.user_id=m.user_id
order by points desc,approved_tasks desc,approved_seconds desc,m.user_id limit 100;
$func$;
revoke all on function public.community_leaderboard(text) from public,anon;
grant execute on function public.community_leaderboard(text) to authenticated;
create or replace function public.staff_set_leaderboard_points(
 p_user uuid,p_period text,p_points integer,p_actor uuid,p_reason text)
returns integer language plpgsql security definer set search_path='' as $func$
declare v_begin timestamptz;v_base bigint;v_bonus bigint;v_delta bigint;
begin
 if p_period not in('week','month','year') then raise exception 'Invalid leaderboard period';end if;
 if p_points<0 or p_points>10000000 then raise exception 'Points must be between 0 and 10,000,000';end if;
 if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Auditable explanation of 10+ characters required';end if;
 if not exists(select 1 from public.user_roles where user_id=p_actor and role='admin') then raise exception 'Administrator required';end if;
 if not exists(select 1 from public.profiles where id=p_user and status='active') then raise exception 'Active registered member required';end if;
 v_begin:=case p_period when 'year' then date_trunc('year',now() at time zone 'UTC') when 'month' then date_trunc('month',now() at time zone 'UTC') else date_trunc('week',now() at time zone 'UTC') end;
 perform pg_advisory_xact_lock(hashtextextended('leaderboard-'||p_user::text||p_period,0));
 select count(distinct s.assignment_id)*100 into v_base from public.task_submissions s where s.user_id=p_user and s.status='approved' and s.approved_at>=v_begin;
 select coalesce(sum(x.bonus_points),0) into v_bonus from public.leaderboard_adjustments x where x.user_id=p_user and x.period_scope=p_period and x.created_at>=v_begin;
 v_delta:=p_points-(v_base+v_bonus);
 if abs(v_delta)>10000000 then raise exception 'Adjustment outside permitted range';end if;
 if v_delta<>0 then
  insert into public.leaderboard_adjustments(user_id,period_scope,bonus_points,reason,created_by) values(p_user,p_period,v_delta::integer,p_reason,p_actor);
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_filtered)
   values(p_actor,'ranking.staff_points_set','leaderboard_adjustments',p_user,jsonb_build_object('period',p_period,'previous_points',v_base+v_bonus,'new_points',p_points,'delta',v_delta,'reason',p_reason));
 end if;
 return p_points;
end $func$;
revoke all on function public.staff_set_leaderboard_points(uuid,text,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.staff_set_leaderboard_points(uuid,text,integer,uuid,text) to service_role;
