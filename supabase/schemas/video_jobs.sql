-- Durable jobs for a separate FFmpeg-capable worker. Web handlers only enqueue.
create table public.video_jobs (
 id uuid primary key default gen_random_uuid(),lecture_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('transcribe','index')),status text not null default 'queued' check(status in ('queued','processing','ready','failed')),
 attempts integer not null default 0 check(attempts between 0 and 3),lease_token uuid,lease_until timestamptz,error_message text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(lecture_id,user_id) references public.lectures(id,user_id) on delete cascade
);
create unique index video_jobs_active_idx on public.video_jobs(lecture_id) where status in ('queued','processing');
create index video_jobs_queue_idx on public.video_jobs(status,created_at);
create index video_jobs_user_idx on public.video_jobs(user_id);
create index video_jobs_lecture_owner_idx on public.video_jobs(lecture_id,user_id);
alter table public.video_jobs enable row level security;
create policy video_jobs_read on public.video_jobs for select to authenticated using((select auth.uid())=user_id);
create policy video_jobs_insert on public.video_jobs for insert to authenticated with check((select auth.uid())=user_id and status='queued' and attempts=0 and exists(select 1 from public.lectures l where l.id=lecture_id and l.user_id=user_id and l.status in ('awaiting_transcript','ready','failed','queued')));
grant select,insert on public.video_jobs to authenticated;
grant all on public.video_jobs,public.lectures,public.lecture_transcripts,public.lecture_segments,public.documents,public.chunks to service_role;
create function public.enqueue_video_job(target_lecture uuid,job_kind text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare l public.lectures;job_id uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_lecture::text,1));
 select * into l from public.lectures where id=target_lecture and user_id=(select auth.uid());
 if l.id is null then raise exception 'Lecture not found';end if;
 if job_kind not in ('index','transcribe') then raise exception 'Invalid processing action';end if;
 if l.status in ('uploading','processing','queued') then raise exception 'Lecture upload or processing is already active';end if;
 if job_kind='transcribe' and l.kind<>'mp4' then raise exception 'YouTube requires a permitted transcript upload';end if;
 if job_kind='index' and not exists(select 1 from public.lecture_segments where lecture_id=l.id) then raise exception 'Upload a transcript first';end if;
 insert into public.video_jobs(lecture_id,user_id,kind) values(l.id,l.user_id,job_kind) returning id into job_id;
 update public.lectures set status='queued',error_message=null where id=l.id;
 return job_id;
end;$$;
revoke execute on function public.enqueue_video_job from public,anon;
grant execute on function public.enqueue_video_job to authenticated;
create function public.claim_video_job() returns setof public.video_jobs
language plpgsql security invoker set search_path='' as $$
declare j public.video_jobs;
begin
 update public.video_jobs set status='failed',error_message='Worker retries exhausted. Try processing again.',updated_at=now() where status='processing' and lease_until<now() and attempts>=3;
 update public.lectures l set status='failed',error_message=failed_job.error_message from public.video_jobs failed_job where failed_job.lecture_id=l.id and failed_job.status='failed' and l.status='processing' and not exists(select 1 from public.video_jobs active where active.lecture_id=l.id and active.status in ('queued','processing'));
 select * into j from public.video_jobs where status='queued' or (status='processing' and lease_until<now() and attempts<3) order by created_at for update skip locked limit 1;
 if j.id is null then return;end if;
 update public.video_jobs set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes',updated_at=now() where id=j.id returning * into j;
 update public.lectures set status='processing',error_message=null where id=j.lecture_id;
 return next j;
end;$$;
revoke execute on function public.claim_video_job from public,anon,authenticated;
grant execute on function public.claim_video_job to service_role;
create function public.finish_video_job(job_id uuid,token uuid,segments jsonb,embedded_chunks jsonb,transcription_provider text,video_duration float default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j public.video_jobs;l public.lectures;s jsonb;c jsonb;start_time float;end_time float;previous float:=-1;duration float;
begin
 select * into j from public.video_jobs where id=job_id and status='processing' and lease_token=token and lease_until>now() for update;
 if j.id is null then return false;end if;
 select * into l from public.lectures where id=j.lecture_id and user_id=j.user_id;
 if l.id is null then raise exception 'Lecture missing';end if;
 duration:=coalesce(video_duration,l.duration_seconds,14400);
 if duration<=0 or duration>14400 then raise exception 'Invalid video duration';end if;
 if jsonb_array_length(segments) not between 1 and 10000 or jsonb_array_length(embedded_chunks) not between 1 and 2000 then raise exception 'Invalid worker output';end if;
 delete from public.lecture_segments where lecture_id=l.id;
 delete from public.chunks where lecture_id=l.id;
 for s in select * from jsonb_array_elements(segments) loop
  start_time:=(s->>'start_seconds')::float;end_time:=(s->>'end_seconds')::float;
  if start_time is null or end_time is null or start_time<0 or start_time<previous or end_time<=start_time or end_time>duration+1 or length(s->>'content') not between 1 and 12000 then raise exception 'Invalid timed worker segment';end if;
  previous:=start_time;
  insert into public.lecture_segments(lecture_id,user_id,start_seconds,end_seconds,content) values(l.id,l.user_id,start_time,end_time,s->>'content');
 end loop;
 for c in select * from jsonb_array_elements(embedded_chunks) loop
  if jsonb_array_length(c->'embedding')<>768 or (c->>'start_seconds')::float<0 or (c->>'end_seconds')::float<=(c->>'start_seconds')::float or (c->>'end_seconds')::float>duration+1 or length(c->>'content')<1 then raise exception 'Invalid timed embedding';end if;
  insert into public.chunks(document_id,user_id,topic,content,locator,embedding,lecture_id,start_seconds,end_seconds) values(l.document_id,l.user_id,l.topic,c->>'content',c->>'locator',(c->'embedding')::text::extensions.vector,l.id,(c->>'start_seconds')::float,(c->>'end_seconds')::float);
 end loop;
 insert into public.lecture_transcripts(lecture_id,user_id,transcript_text,provider) values(l.id,l.user_id,(select string_agg(value->>'content',' ') from jsonb_array_elements(segments)),transcription_provider)
 on conflict(lecture_id) do update set transcript_text=excluded.transcript_text,provider=excluded.provider,created_at=now();
 update public.documents set chunk_count=jsonb_array_length(embedded_chunks) where id=l.document_id;
 update public.lectures set status='ready',indexed=true,error_message=null,duration_seconds=duration where id=l.id;
 update public.video_jobs set status='ready',lease_until=null,error_message=null,updated_at=now() where id=j.id;
 return true;
end;$$;
revoke execute on function public.finish_video_job from public,anon,authenticated;
grant execute on function public.finish_video_job to service_role;
