import {createClient} from '@supabase/supabase-js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {embed} from '../src/lib/gemini';
import {extractAudio} from '../src/lib/media-worker';
import {transcribeAudio} from '../src/lib/transcribe';
import {transcriptChunks,validateSegments,timestamp,type TranscriptSegment} from '../src/lib/video';
const key=process.env.VIDEO_WORKER_SUPABASE_KEY;
if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!key)throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and a dedicated server-only VIDEO_WORKER_SUPABASE_KEY.');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
const check=(e:{message:string}|null)=>{if(e)throw new Error(e.message);};
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
async function tick(){
 const claimed=await db.rpc('claim_video_job');check(claimed.error);const job=claimed.data?.[0];if(!job)return false;
 const temp=await mkdtemp(join(tmpdir(),'edumind-video-'));let lostLease=false;
 const heartbeat=setInterval(()=>{void db.from('video_jobs').update({lease_until:new Date(Date.now()+900000).toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id).eq('lease_token',job.lease_token).eq('status','processing').select('id').then(r=>{if(r.error||!r.data?.length)lostLease=true;});},30000);
 try{
  const lecture=await db.from('lectures').select('*').eq('id',job.lecture_id).eq('user_id',job.user_id).single();check(lecture.error);const l=lecture.data!;
  let segments:TranscriptSegment[];let provider='uploaded';let duration=l.duration_seconds;
  if(job.kind==='transcribe'){
   if(l.kind!=='mp4'||!l.storage_path?.startsWith(`${job.user_id}/${l.id}/`))throw new Error('Invalid video resource.');
   const video=await db.storage.from('lecture-videos').download(l.storage_path);check(video.error);if(!video.data||video.data.size>50_000_000)throw new Error('Video missing or oversized.');
   const input=join(temp,'lecture.mp4'),audio=join(temp,'audio.wav');await writeFile(input,new Uint8Array(await video.data.arrayBuffer()));duration=await extractAudio(input,audio);const transcribed=await transcribeAudio(audio,duration);segments=transcribed.segments;provider=transcribed.provider;
  }else{const rows=await db.from('lecture_segments').select('start_seconds,end_seconds,content').eq('lecture_id',l.id).eq('user_id',job.user_id).order('start_seconds');check(rows.error);segments=validateSegments(rows.data||[],duration);const t=await db.from('lecture_transcripts').select('provider').eq('lecture_id',l.id).maybeSingle();check(t.error);provider=t.data?.provider||'uploaded';}
  const chunks=[];for(const c of transcriptChunks(segments)){if(lostLease)throw new Error('Processing lease lost.');chunks.push({...c,locator:`${timestamp(c.start_seconds)}–${timestamp(c.end_seconds)}`,embedding:await embed(c.content)});}
  if(lostLease)throw new Error('Processing lease lost.');
  const saved=await db.rpc('finish_video_job',{job_id:job.id,token:job.lease_token,segments,embedded_chunks:chunks,transcription_provider:provider,video_duration:duration});check(saved.error);if(!saved.data)throw new Error('Processing lease expired before publication.');
  console.log(`Lecture job ${job.id}: ready (${segments.length} segments, ${chunks.length} chunks).`);
 }catch(e){
  const raw=e instanceof Error?e.message:'Processing failed.';const message=raw.replace(/(?:sb_secret_|AIza|Token |Bearer )[^\s]+/g,'[redacted]').slice(0,300);
  const failed=await db.from('video_jobs').update({status:'failed',error_message:message,lease_until:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('lease_token',job.lease_token).eq('status','processing').select('id');
  if(failed.data?.length)await db.from('lectures').update({status:'failed',error_message:message}).eq('id',job.lecture_id).eq('user_id',job.user_id);
  console.error(`Lecture job ${job.id}: failed (${message}).`);
 }finally{clearInterval(heartbeat);if(!resolve(temp).startsWith(resolve(tmpdir())+sep+'edumind-video-'))throw new Error('Temporary cleanup path is invalid.');await rm(temp,{recursive:true,force:true});}return true;
}
async function main(){console.log('EduMind video worker started.');do{try{const ran=await tick();if(process.argv.includes('--once'))break;if(!ran)await new Promise(resolve=>setTimeout(resolve,4000));}catch(e){console.error('Worker queue unavailable:',e instanceof Error?e.name:'Error');if(process.argv.includes('--once')){process.exitCode=1;break;}await new Promise(resolve=>setTimeout(resolve,10000));}}while(!stopping);}
void main();
