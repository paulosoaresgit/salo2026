import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
test('@live member: real Supabase login, allocation, audio upload, submission and blocked payout',async({page})=>{
 test.skip(!process.env.E2E_TEST_EMAIL||!process.env.VITE_SUPABASE_URL,'Requires disposable Supabase E2E fixture');
 await page.goto('/login');
 await page.getByLabel('Email address').fill(process.env.E2E_TEST_EMAIL!);
 await page.getByLabel('8-digit access code or password').fill(process.env.E2E_TEST_PIN!);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/\/app$/,{timeout:20000});
 await expect(page.getByRole('heading',{name:/Good (morning|afternoon|evening), VoiceTask/i})).toBeVisible();
 await page.goto('/app/tasks');
 await expect(page.getByRole('heading',{name:'Available tasks'})).toBeVisible();
 await expect(page.getByText('Browser audio upload exercise')).toBeVisible({timeout:15000});
 await page.locator('.taskRow').filter({hasText:'Browser audio upload exercise'}).getByRole('link',{name:/Start task/i}).click();
 await expect(page.getByText('I am so happy to record this sentence today.')).toBeVisible();
 await page.getByRole('button',{name:'Record',exact:true}).click();
 await expect(page.getByText('Recording in progress')).toBeVisible();
 await page.waitForTimeout(1400);
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save & continue'})).toBeVisible({timeout:8000});
 await page.getByRole('button',{name:'Save & continue'}).click();
 await expect(page.getByText('1 saved')).toBeVisible({timeout:20000});
 await page.getByRole('button',{name:/Submit all recordings/i}).click();
 await expect(page.getByRole('heading',{name:'Submission received'})).toBeVisible({timeout:20000});
 const service=createClient(process.env.VITE_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const {data:fixture}=await service.auth.admin.listUsers({page:1,perPage:100});
 const user=fixture.users.find(u=>u.email===process.env.E2E_TEST_EMAIL);
 expect(user).toBeTruthy();
 const {data:submissions,error}=await service.from('task_submissions').select('id,status').eq('user_id',user!.id);
 expect(error).toBeNull();
 expect(submissions?.some(s=>s.status==='submitted')).toBe(true);
 const {data:recordings}=await service.from('recording_files').select('id,path').eq('submission_id',submissions![0].id);
 expect(recordings).toHaveLength(1);
 expect(recordings?.[0]?.path).toContain(user!.id);
 await page.goto('/app/wallet');
 await expect(page.getByText('£0.00').first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Request withdrawal'})).toBeDisabled();
 // Real local Member Club journey: published course, module, YouTube lesson,
 // protected progress row; a draft course must not leak into the member view.
 const {data:course,error:courseError}=await service.from('club_courses').insert({
   title:'Browser learning course',slug:'browser-learning-course',description:'A real-browser learning fixture',
   cover_url:'https://example.com/cover.webp',published:true,featured:true,sort_order:1
 }).select('id').single();
 expect(courseError).toBeNull();
 const {error:draftError}=await service.from('club_courses').insert({
   title:'Staff draft course',slug:'staff-draft-course',description:'Members should not see this',
   cover_url:'https://example.com/draft.webp',published:false,sort_order:2
 });
 expect(draftError).toBeNull();
 const {data:module,error:moduleError}=await service.from('club_modules').insert({
   course_id:course!.id,title:'Welcome module',position:1,published:true
 }).select('id').single();
 expect(moduleError).toBeNull();
 const {data:lesson,error:lessonError}=await service.from('club_lessons').insert({
   module_id:module!.id,title:'Welcome lesson',position:1,published:true,
   youtube_url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
   description:'This is a disposable browser fixture.'
 }).select('id').single();
 expect(lessonError).toBeNull();
 await page.goto('/app/member-club');
 await expect(page.getByRole('heading',{name:'Browser learning course'})).toBeVisible({timeout:15000});
 await expect(page.getByText('Staff draft course')).toHaveCount(0);
 await page.getByRole('link',{name:/Browser learning course/}).click();
 await expect(page.getByRole('heading',{name:'Welcome lesson'})).toBeVisible({timeout:15000});
 await expect(page.locator('iframe[title="Welcome lesson"]')).toBeVisible();
 await page.getByRole('button',{name:'Mark as completed'}).click();
 await expect(page.getByRole('button',{name:'Lesson completed'})).toBeDisabled({timeout:15000});
 const {data:progress,error:progressError}=await service.from('club_lesson_progress')
   .select('lesson_id').eq('user_id',user!.id).eq('lesson_id',lesson!.id);
 expect(progressError).toBeNull();
 expect(progress).toHaveLength(1);

});
