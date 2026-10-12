-- Apply AFTER edumind.sql. Declarative extension of the existing chunks knowledge base.
create table public.courses (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 title text not null,created_at timestamptz not null default now(),unique(user_id,title),unique(id,user_id)
);
create table public.lectures (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 document_id uuid not null unique,course_id uuid not null,title text not null,topic text not null,
 kind text not null check(kind in ('mp4','youtube')),storage_path text,youtube_id text,duration_seconds float check(duration_seconds>0 and duration_seconds<=14400),
 status text not null default 'uploading' check(status in ('uploading','awaiting_transcript','queued','processing','ready','failed')),
 indexed boolean not null default false,error_message text,created_at timestamptz not null default now(),unique(id,user_id),
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade,
 foreign key(course_id,user_id) references public.courses(id,user_id) on delete cascade,
 check((kind='mp4' and storage_path is not null and youtube_id is null) or (kind='youtube' and youtube_id ~ '^[A-Za-z0-9_-]{11}$' and storage_path is null))
);
create index lectures_user_idx on public.lectures(user_id,created_at);
create index lectures_course_idx on public.lectures(course_id,user_id);
create index lectures_document_owner_idx on public.lectures(document_id,user_id);
create table public.lecture_transcripts (
 id uuid primary key default gen_random_uuid(),lecture_id uuid not null unique,user_id uuid not null references auth.users(id) on delete cascade,
 transcript_text text not null,provider text not null,created_at timestamptz not null default now(),
 foreign key(lecture_id,user_id) references public.lectures(id,user_id) on delete cascade
);
create index lecture_transcripts_user_idx on public.lecture_transcripts(user_id);
create index lecture_transcripts_lecture_owner_idx on public.lecture_transcripts(lecture_id,user_id);
create table public.lecture_segments (
 id uuid primary key default gen_random_uuid(),lecture_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
 start_seconds float not null check(start_seconds>=0),end_seconds float not null check(end_seconds>start_seconds and end_seconds<=14400),content text not null check(length(content)>0),
 foreign key(lecture_id,user_id) references public.lectures(id,user_id) on delete cascade
);
create index lecture_segments_lecture_idx on public.lecture_segments(lecture_id,user_id,start_seconds);
create index lecture_segments_user_idx on public.lecture_segments(user_id);
create table public.lecture_bookmarks (
 id uuid primary key default gen_random_uuid(),lecture_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
 at_seconds float not null check(at_seconds>=0 and at_seconds<=14400),note text not null check(length(note) between 1 and 3000),created_at timestamptz not null default now(),
 foreign key(lecture_id,user_id) references public.lectures(id,user_id) on delete cascade
);
create index lecture_bookmarks_lecture_idx on public.lecture_bookmarks(lecture_id,user_id,at_seconds);
create index lecture_bookmarks_user_idx on public.lecture_bookmarks(user_id);
create table public.video_progress (
 lecture_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
 at_seconds float not null check(at_seconds>=0 and at_seconds<=14400),updated_at timestamptz not null default now(),primary key(lecture_id,user_id),
 foreign key(lecture_id,user_id) references public.lectures(id,user_id) on delete cascade
);
create index video_progress_user_idx on public.video_progress(user_id);
alter table public.chunks alter column embedding drop not null;
alter table public.chunks add column lecture_id uuid;
alter table public.chunks add column start_seconds float;
alter table public.chunks add column end_seconds float;
alter table public.chunks add foreign key(lecture_id,user_id) references public.lectures(id,user_id) on delete cascade;
alter table public.chunks add check((lecture_id is null and start_seconds is null and end_seconds is null) or (lecture_id is not null and start_seconds>=0 and end_seconds>start_seconds));
create index chunks_lecture_idx on public.chunks(lecture_id,user_id);
-- Compatibility name requested by the challenge; no duplicate vector store.
create view public.resource_chunks with(security_invoker=true) as select * from public.chunks;
grant select on public.resource_chunks to authenticated;
alter table public.courses enable row level security;
alter table public.lectures enable row level security;
alter table public.lecture_transcripts enable row level security;
alter table public.lecture_segments enable row level security;
alter table public.lecture_bookmarks enable row level security;
alter table public.video_progress enable row level security;
create policy courses_owned on public.courses for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy lectures_owned on public.lectures for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy transcripts_owned on public.lecture_transcripts for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy segments_owned on public.lecture_segments for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy bookmarks_owned on public.lecture_bookmarks for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy progress_owned on public.video_progress for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.courses,public.lectures,public.lecture_transcripts,public.lecture_segments,public.lecture_bookmarks,public.video_progress to authenticated;
grant update on public.documents,public.chunks to authenticated;
create function public.save_lecture_transcript(target_lecture uuid,segments jsonb,provider text) returns void
language plpgsql security invoker set search_path='' as $$
declare l public.lectures;s jsonb;previous float:=-1;start_time float;end_time float;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_lecture::text,1));
 select * into l from public.lectures where id=target_lecture and user_id=(select auth.uid());
 if l.id is null then raise exception 'Lecture not found';end if;
 if l.status in ('uploading','processing','queued') then raise exception 'Wait until upload or processing finishes';end if;
 if jsonb_array_length(segments) not between 1 and 10000 then raise exception 'Invalid transcript size';end if;
 delete from public.lecture_segments where lecture_id=l.id;
 delete from public.chunks where lecture_id=l.id;
 for s in select * from jsonb_array_elements(segments) loop
  start_time:=(s->>'start_seconds')::float;end_time:=(s->>'end_seconds')::float;
  if start_time is null or end_time is null or start_time<0 or start_time<previous or end_time<=start_time or end_time>14400 or (l.duration_seconds is not null and end_time>l.duration_seconds+1) or length(s->>'content') not between 1 and 12000 then raise exception 'Invalid transcript segment';end if;
  previous:=start_time;
  insert into public.lecture_segments(lecture_id,user_id,start_seconds,end_seconds,content) values(l.id,l.user_id,start_time,end_time,s->>'content');
  insert into public.chunks(document_id,user_id,topic,content,locator,lecture_id,start_seconds,end_seconds) values(l.document_id,l.user_id,l.topic,s->>'content','Time '||start_time::text,l.id,start_time,end_time);
 end loop;
 insert into public.lecture_transcripts(lecture_id,user_id,transcript_text,provider) values(l.id,l.user_id,(select string_agg(value->>'content',' ') from jsonb_array_elements(segments)),provider)
 on conflict(lecture_id) do update set transcript_text=excluded.transcript_text,provider=excluded.provider,created_at=now();
 update public.documents set chunk_count=jsonb_array_length(segments) where id=l.document_id;
 update public.lectures set status='ready',indexed=false,error_message=null where id=l.id;
end;$$;
revoke execute on function public.save_lecture_transcript from public,anon;
grant execute on function public.save_lecture_transcript to authenticated;
drop function public.match_chunks(extensions.vector,integer,float);
create function public.match_chunks(query_embedding extensions.vector(768),match_count integer default 5,min_similarity float default .35)
returns table(id uuid,document_id uuid,content text,locator text,topic text,title text,similarity float,lecture_id uuid,start_seconds float,end_seconds float)
language sql stable security invoker set search_path='' as $$
 select c.id,c.document_id,c.content,c.locator,c.topic,d.title,1-(c.embedding OPERATOR(extensions.<=>) query_embedding),c.lecture_id,c.start_seconds,c.end_seconds
 from public.chunks c join public.documents d on d.id=c.document_id
 where c.user_id=(select auth.uid()) and c.embedding is not null and 1-(c.embedding OPERATOR(extensions.<=>) query_embedding)>=min_similarity
 order by c.embedding OPERATOR(extensions.<=>) query_embedding limit least(greatest(match_count,1),10);
$$;
revoke execute on function public.match_chunks from public,anon;
grant execute on function public.match_chunks to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('lecture-videos','lecture-videos',false,50000000,array['video/mp4']) on conflict(id) do nothing;
create policy lecture_video_read on storage.objects for select to authenticated using(bucket_id='lecture-videos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy lecture_video_insert on storage.objects for insert to authenticated with check(bucket_id='lecture-videos' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.lectures l where l.storage_path=name and l.user_id=(select auth.uid()) and l.status='uploading'));
