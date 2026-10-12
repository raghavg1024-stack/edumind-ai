import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {z} from 'zod';
import {extractAudio} from '../src/lib/media-worker';
import {transcribeAudio} from '../src/lib/transcribe';
import {embed,generate} from '../src/lib/gemini';
import {parseTranscript} from '../src/lib/video';
import {readFile} from 'node:fs/promises';
async function main(){
const results:Record<string,unknown>={};
const temp=await mkdtemp(join(tmpdir(),'edumind-live-test-'));
try{
 const duration=await extractAudio(resolve('public/samples/photosynthesis.mp4'),join(temp,'speech.wav'));results.audio_extraction={status:'passed',duration};
 if(process.env.DEEPGRAM_API_KEY||(process.env.STT_PROVIDER==='http'&&process.env.STT_API_URL)){
  try{const transcript=await transcribeAudio(join(temp,'speech.wav'),duration);const text=transcript.segments.map(s=>s.content).join(' ').toLowerCase();const matches=['photosynthesis','chlorophyll','calvin','carbon dioxide'].filter(c=>text.includes(c));results.actual_speech_transcription={status:matches.length>=3?'passed':'failed',concept_matches:matches,segments:transcript.segments.length,provider:transcript.provider};}catch{results.actual_speech_transcription={status:'failed',reason:'Speech API or timestamp validation failed. Check provider configuration and quota.'};}
 }else results.actual_speech_transcription={status:'blocked',reason:'No prerecorded speech API configured. Web Speech is not a background timestamped audio service.'};
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(url&&key&&(key.startsWith('sb_publishable_')||key.startsWith('eyJ'))){try{const r=await fetch(url+'/auth/v1/settings',{headers:{apikey:key}});results.supabase_connection={status:r.ok?'passed':'failed',http:r.status};}catch{results.supabase_connection={status:'failed',reason:'Supabase is unreachable.'};}}
 else results.supabase_connection={status:'blocked',reason:'Missing or invalid publishable key.'};
 results.cloud_student_upload={status:'blocked',reason:'Requires applied classroom schema and an authenticated test student. Local storage-policy tests are separate.'};
 if(process.env.GEMINI_API_KEY){try{
  const cues=parseTranscript('sample.vtt',await readFile('public/samples/photosynthesis.vtt','utf8'),duration);const vectors:number[][]=[];for(const c of cues)vectors.push(await embed(c.content));
  const query=await embed('What does the Calvin cycle fix?',true);const ranked=cues.map((c,i)=>({cue:c,score:query.reduce((s,v,j)=>s+v*vectors[i][j],0)})).sort((a,b)=>b.score-a.score);const hit=ranked[0];
  results.semantic_video_retrieval={status:hit.cue.content.includes('Calvin')?'passed':'failed',start_seconds:hit.cue.start_seconds,end_seconds:hit.cue.end_seconds};
  const answer=await generate(`Answer only from this passage and include [1]: ${hit.cue.content} Question: What does the Calvin cycle fix? Return JSON with answer.`,z.object({answer:z.string()}),{type:'object',properties:{answer:{type:'string'}},required:['answer']});results.gemini_grounding={status:/carbon dioxide/i.test(answer.answer)&&answer.answer.includes('[1]')?'passed':'failed',embedding_dimensions:query.length};
  const schema=z.object({questions:z.array(z.object({prompt:z.string(),options:z.array(z.string()).length(4),answer:z.number().int().min(0).max(3),explanation:z.string(),segment:z.number().int().min(0).max(cues.length-1)})).min(1).max(3)});
  const quiz=await generate(`Generate two foundation quiz questions using only these actual lecture captions: ${JSON.stringify(cues.map((c,i)=>({...c,segment:i})))}. Four options each, answer index 0-3, explanation and segment index supporting the answer.`,schema,{type:'object',properties:{questions:{type:'array',items:{type:'object',properties:{prompt:{type:'string'},options:{type:'array',items:{type:'string'},minItems:4,maxItems:4},answer:{type:'integer'},explanation:{type:'string'},segment:{type:'integer'}},required:['prompt','options','answer','explanation','segment']}}},required:['questions']});
  results.lecture_quiz_generation={status:quiz.questions.every(q=>cues[q.segment]&&new Set(q.options).size===4)?'passed':'failed',questions:quiz.questions.length,revision_timestamps:quiz.questions.map(q=>cues[q.segment].start_seconds)};
 }catch(e){results.gemini_grounding={status:'failed',http_status:(e as {status?:number}).status||null,error_type:e instanceof Error?e.name:'Error',reason:'Gemini embedding or generation call failed. Check key, model availability, and quota.'};}}
 else results.gemini_grounding={status:'blocked',reason:'Gemini key missing.'};
 console.log(JSON.stringify(results,null,2));await writeFile('docs/live-verification.json',JSON.stringify(results,null,2));
 if(Object.values(results).some(r=>(r as {status:string}).status!=='passed'))process.exitCode=1;
}finally{if(!resolve(temp).startsWith(resolve(tmpdir())+sep+'edumind-live-test-'))throw new Error('Invalid cleanup path');await rm(temp,{recursive:true,force:true});}
}
void main().catch(()=>{console.error('Live verification failed before service checks.');process.exitCode=1;});
