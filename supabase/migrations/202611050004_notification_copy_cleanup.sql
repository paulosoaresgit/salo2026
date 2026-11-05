-- Keep notification copy concise. The audit record continues to say that
-- no audio content/pronunciation verification was performed.
do $fix$
declare definition text;
declare old_body text:='Your submitted task was automatically accepted after five minutes. The reward is now in your wallet; speech quality was not evaluated.';
declare new_body text:='Your submitted task was automatically accepted after five minutes. Your reward is now available in your wallet.';
begin
 select pg_get_functiondef('public.auto_accept_due_submissions(integer)'::regprocedure) into definition;
 if strpos(definition,old_body)>0 then
   execute replace(definition,old_body,new_body);
 elsif strpos(definition,new_body)=0 then
   raise exception 'Timed task notification copy changed unexpectedly; review required';
 end if;
end $fix$;
update public.notifications
 set body=replace(body,
 'Your submitted task was automatically accepted after five minutes. The reward is now in your wallet; speech quality was not evaluated.',
 'Your submitted task was automatically accepted after five minutes. Your reward is now available in your wallet.')
 where body like '%speech quality was not evaluated%';
