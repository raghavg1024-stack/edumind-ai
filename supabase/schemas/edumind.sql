create extension if not exists vector with schema extensions;
create table public.documents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, topic text not null, kind text not null, storage_path text not null,
 chunk_count integer not null check (chunk_count > 0), created_at timestamptz not null default now(), unique(id,user_id)
);
create index documents_user_idx on public.documents(user_id);
create table public.chunks (
 id uuid primary key default gen_random_uuid(), document_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 content text not null, locator text not null, topic text not null, embedding extensions.vector(768) not null,
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade
);
create index chunks_document_idx on public.chunks(document_id,user_id);
create index chunks_user_topic_idx on public.chunks(user_id,topic);
-- Exact vector scan is deliberate for the small MVP corpus.
create table public.quizzes (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 topic text not null, difficulty text not null, generation_mode text not null default 'ai' check(generation_mode in ('ai','source-check')), questions jsonb not null check (jsonb_array_length(questions) between 1 and 5),
 created_at timestamptz not null default now(), unique(id,user_id)
);
create index quizzes_user_idx on public.quizzes(user_id);
create table public.attempts (
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null unique, user_id uuid not null references auth.users(id) on delete cascade,
 result jsonb not null, created_at timestamptz not null default now(),
 foreign key(quiz_id,user_id) references public.quizzes(id,user_id) on delete cascade
);
create index attempts_user_idx on public.attempts(user_id);
create index attempts_quiz_owner_idx on public.attempts(quiz_id,user_id);
create table public.mastery (
 user_id uuid not null references auth.users(id) on delete cascade, topic text not null,
 correct integer not null default 0, total integer not null default 0, updated_at timestamptz not null default now(),
 primary key(user_id,topic), check(correct >= 0 and total >= correct)
);
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.quizzes enable row level security;
alter table public.attempts enable row level security;
alter table public.mastery enable row level security;
create policy documents_owned on public.documents for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy chunks_owned on public.chunks for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy quizzes_read on public.quizzes for select to authenticated using ((select auth.uid())=user_id);
create policy quizzes_insert on public.quizzes for insert to authenticated with check ((select auth.uid())=user_id);
create policy attempts_owned on public.attempts for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy mastery_owned on public.mastery for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,delete on public.documents,public.chunks to authenticated;
grant select,insert on public.quizzes,public.attempts to authenticated;
grant select,insert,update on public.mastery to authenticated;
create function public.match_chunks(query_embedding extensions.vector(768), match_count integer default 5, min_similarity float default .35)
returns table(id uuid, document_id uuid, content text, locator text, topic text, title text, similarity float)
language sql stable security invoker set search_path = '' as $$
 select c.id,c.document_id,c.content,c.locator,c.topic,d.title,1-(c.embedding OPERATOR(extensions.<=>) query_embedding) as similarity
 from public.chunks c join public.documents d on d.id=c.document_id
 where c.user_id=(select auth.uid()) and 1-(c.embedding OPERATOR(extensions.<=>) query_embedding)>=min_similarity
 order by c.embedding OPERATOR(extensions.<=>) query_embedding limit least(greatest(match_count,1),10);
$$;
revoke execute on function public.match_chunks from public,anon;
grant execute on function public.match_chunks to authenticated;
create function public.grade_quiz(quiz_id uuid, selected integer[]) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare q public.quizzes; existing jsonb; result jsonb; points integer:=0; item jsonb; feedback jsonb:='[]'; i integer:=0; n integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(quiz_id::text,0));
 select * into q from public.quizzes where id=quiz_id and user_id=(select auth.uid());
 if q.id is null then raise exception 'Quiz not found'; end if;
 select a.result into existing from public.attempts a where a.quiz_id=q.id;
 if existing is not null then return existing; end if;
 n:=jsonb_array_length(q.questions);
 if array_length(selected,1) is distinct from n then raise exception 'Answer all questions'; end if;
 for item in select * from jsonb_array_elements(q.questions) loop
  i:=i+1;
  if selected[i] is null or selected[i] not between 0 and 3 then raise exception 'Invalid answer'; end if;
  if selected[i]=(item->>'answer')::integer then points:=points+1; end if;
  feedback:=feedback||jsonb_build_array(jsonb_build_object('correct',selected[i]=(item->>'answer')::integer,'answer',(item->>'answer')::integer,'explanation',item->>'explanation','chunk_id',item->>'chunk_id'));
 end loop;
 result:=jsonb_build_object('correct',points,'total',n,'feedback',feedback);
 insert into public.attempts(quiz_id,user_id,result) values(q.id,auth.uid(),result);
 insert into public.mastery(user_id,topic,correct,total) values(auth.uid(),q.topic,points,n)
 on conflict(user_id,topic) do update set correct=public.mastery.correct+excluded.correct,total=public.mastery.total+excluded.total,updated_at=now();
 return result;
end;
$$;
revoke execute on function public.grade_quiz from public,anon;
grant execute on function public.grade_quiz to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('sources','sources',false,8000000) on conflict(id) do nothing;
create policy sources_owned on storage.objects for all to authenticated
using(bucket_id='sources' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='sources' and (storage.foldername(name))[1]=(select auth.uid())::text);
