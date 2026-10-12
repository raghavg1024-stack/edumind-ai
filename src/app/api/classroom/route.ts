import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatedDb,dbCheck,HttpError } from '@/lib/server-auth';
import { parseTranscript,youtubeId } from '@/lib/video';
export const runtime='nodejs';
const uuid=z.string().uuid();
export async function POST(request:Request){try{
 const {db,user}=await authenticatedDb(request);
 const b=z.object({action:z.enum(['list','create','complete','detail','transcript','bookmark','delete_bookmark','progress','process','resume']),job_kind:z.enum(['index','transcribe']).optional(),lecture_id:uuid.optional(),title:z.string().trim().min(1).max(200).optional(),topic:z.string().trim().min(1).max(80).optional(),course:z.string().trim().min(1).max(120).optional(),youtube_url:z.string().max(2000).optional(),filename:z.string().max(250).optional(),size:z.number().int().positive().max(50_000_000).optional(),duration:z.number().positive().max(14400).optional(),transcript_name:z.string().max(250).optional(),transcript_text:z.string().max(1_000_000).optional(),at_seconds:z.number().min(0).max(14400).optional(),note:z.string().trim().min(1).max(3000).optional(),bookmark_id:uuid.optional()}).parse(await request.json());
 if(b.action==='list'){const r=await db.from('lectures').select('*,courses(title)').order('created_at',{ascending:false});dbCheck(r.error);return NextResponse.json({lectures:(r.data||[]).map(l=>({...l,course_title:l.courses?.title})),capabilities:{worker:process.env.VIDEO_WORKER_ENABLED==='true',transcription:process.env.VIDEO_TRANSCRIPTION_ENABLED==='true'}});}
 if(b.action==='create'){
  if(!b.title||!b.topic||!b.course)throw new HttpError('Title, course and topic are required.');
  const youtube=b.youtube_url?youtubeId(b.youtube_url):null;
  if(!youtube&&(!b.filename?.toLowerCase().endsWith('.mp4')||!b.size||!b.duration))throw new HttpError('Choose an MP4 up to 50 MB and four hours, with readable duration.');
  const course=await db.from('courses').upsert({user_id:user.id,title:b.course},{onConflict:'user_id,title'}).select('id').single();dbCheck(course.error);
  const id=crypto.randomUUID(),resource=crypto.randomUUID();const path=youtube?null:`${user.id}/${id}/lecture.mp4`;
  const doc=await db.from('documents').insert({id:resource,user_id:user.id,title:b.title,topic:b.topic,kind:'video',storage_path:path||`youtube:${youtube}`,chunk_count:1});dbCheck(doc.error);
  const lecture=await db.from('lectures').insert({id,document_id:resource,course_id:course.data!.id,user_id:user.id,title:b.title,topic:b.topic,kind:youtube?'youtube':'mp4',youtube_id:youtube,storage_path:path,duration_seconds:b.duration||null,status:youtube?'awaiting_transcript':'uploading'}).select().single();
  if(lecture.error){await db.from('documents').delete().eq('id',resource);dbCheck(lecture.error);}
  if(youtube)return NextResponse.json({lecture:lecture.data});
  const signed=await db.storage.from('lecture-videos').createSignedUploadUrl(path!);dbCheck(signed.error);
  return NextResponse.json({lecture:lecture.data,upload:{path,token:signed.data!.token}});
 }
 if(!b.lecture_id)throw new HttpError('Lecture ID is required.');
 const row=await db.from('lectures').select('*').eq('id',b.lecture_id).single();dbCheck(row.error);const lecture=row.data;
 if(b.action==='process'){
  if(process.env.VIDEO_WORKER_ENABLED!=='true')throw new HttpError('The background worker is not configured. Upload a transcript for playback and citations.',503);
  if(!b.job_kind)throw new HttpError('Choose indexing or transcription.');
  if(b.job_kind==='transcribe'&&process.env.VIDEO_TRANSCRIPTION_ENABLED!=='true')throw new HttpError('A prerecorded-audio speech provider is not configured. Web Speech does not support this background job.',503);
  const job=await db.rpc('enqueue_video_job',{target_lecture:lecture.id,job_kind:b.job_kind});dbCheck(job.error);return NextResponse.json({job_id:job.data},{status:202});
 }
 if(b.action==='resume'){if(lecture.kind!=='mp4'||lecture.status!=='uploading')throw new HttpError('This lecture does not need an upload retry.');const signed=await db.storage.from('lecture-videos').createSignedUploadUrl(lecture.storage_path);dbCheck(signed.error);return NextResponse.json({path:lecture.storage_path,token:signed.data!.token});}
 if(b.action==='complete'){
  if(lecture.kind!=='mp4'||lecture.status!=='uploading')throw new HttpError('Lecture upload is not pending.');
  const folder=lecture.storage_path.slice(0,lecture.storage_path.lastIndexOf('/'));const objects=await db.storage.from('lecture-videos').list(folder,{search:'lecture.mp4'});dbCheck(objects.error);
  const video=objects.data?.find(f=>f.name==='lecture.mp4');if(!video||Number(video.metadata?.size)>50_000_000||video.metadata?.mimetype!=='video/mp4')throw new HttpError('Video upload is missing or invalid.');
  const signed=await db.storage.from('lecture-videos').createSignedUrl(lecture.storage_path,60);dbCheck(signed.error);
  const header=await fetch(signed.data!.signedUrl,{headers:{Range:'bytes=0-31'},signal:AbortSignal.timeout(15000)});if(!header.ok)throw new HttpError('Uploaded video could not be verified.');
  const reader=header.body?.getReader();const first=await reader?.read();await reader?.cancel();if(!first?.value||Buffer.from(first.value.subarray(4,8)).toString()!=='ftyp')throw new HttpError('Uploaded file is not a supported MP4.');
  const updated=await db.from('lectures').update({status:'awaiting_transcript',error_message:null}).eq('id',lecture.id);dbCheck(updated.error);return NextResponse.json({ok:true});
 }
 if(b.action==='detail'){
  const [segments,bookmarks,progress]=await Promise.all([db.from('lecture_segments').select('id,start_seconds,end_seconds,content').eq('lecture_id',lecture.id).order('start_seconds'),db.from('lecture_bookmarks').select('id,lecture_id,at_seconds,note').eq('lecture_id',lecture.id).order('at_seconds'),db.from('video_progress').select('at_seconds').eq('lecture_id',lecture.id).maybeSingle()]);dbCheck(segments.error);dbCheck(bookmarks.error);dbCheck(progress.error);
  let video_url:string|null=null;if(lecture.storage_path&&lecture.status!=='uploading'){const signed=await db.storage.from('lecture-videos').createSignedUrl(lecture.storage_path,14400);dbCheck(signed.error);video_url=signed.data!.signedUrl;}
  const references=await db.from('chunks').select('id,document_id,content,locator,topic,documents(title)').eq('topic',lecture.topic).is('lecture_id',null).limit(12);dbCheck(references.error);
  return NextResponse.json({lecture,segments:segments.data,bookmarks:bookmarks.data,progress:progress.data?.at_seconds||0,video_url,references:(references.data||[]).map(c=>({...c,title:(Array.isArray(c.documents)?c.documents[0]:c.documents)?.title}))});
 }
 if(b.action==='transcript'){
  if(!b.transcript_name||!b.transcript_text)throw new HttpError('A timestamped transcript file is required.');
  const segments=parseTranscript(b.transcript_name,b.transcript_text,lecture.duration_seconds);
  const result=await db.rpc('save_lecture_transcript',{target_lecture:lecture.id,segments,provider:'uploaded'});dbCheck(result.error);return NextResponse.json({ok:true,segments:segments.length});
 }
 if(b.action==='bookmark'){
  if(b.at_seconds===undefined||!b.note)throw new HttpError('Note and timestamp are required.');if(lecture.duration_seconds&&b.at_seconds>lecture.duration_seconds)throw new HttpError('Timestamp is outside this lecture.');
  const saved=await db.from('lecture_bookmarks').insert({lecture_id:lecture.id,user_id:user.id,at_seconds:b.at_seconds,note:b.note}).select().single();dbCheck(saved.error);return NextResponse.json(saved.data);
 }
 if(b.action==='delete_bookmark'){if(!b.bookmark_id)throw new HttpError('Bookmark ID is required.');const r=await db.from('lecture_bookmarks').delete().eq('id',b.bookmark_id).eq('lecture_id',lecture.id);dbCheck(r.error);return NextResponse.json({ok:true});}
 if(b.at_seconds===undefined)throw new HttpError('Playback timestamp is required.');
 const saved=await db.from('video_progress').upsert({lecture_id:lecture.id,user_id:user.id,at_seconds:Math.min(b.at_seconds,lecture.duration_seconds||14400),updated_at:new Date().toISOString()},{onConflict:'lecture_id,user_id'});dbCheck(saved.error);return NextResponse.json({ok:true});
}catch(e){return NextResponse.json({error:e instanceof z.ZodError?'Invalid classroom input.':e instanceof Error?e.message:'Classroom request failed.'},{status:e instanceof HttpError?e.status:400});}}
