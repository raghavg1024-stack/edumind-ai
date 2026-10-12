import { readFile } from 'node:fs/promises';
import {z} from 'zod';
import {validateSegments,type TranscriptSegment} from './video';
const utterance=z.object({start:z.number(),end:z.number(),transcript:z.string()});
export function deepgramSegments(response:unknown,duration:number){const result=z.object({results:z.object({utterances:z.array(utterance)})}).parse(response);return validateSegments(result.results.utterances.map(s=>({start_seconds:s.start,end_seconds:s.end,content:s.transcript})),duration);}
export async function transcribeAudio(path:string,duration:number):Promise<{segments:TranscriptSegment[];provider:string}>{
 const bytes=await readFile(path);if(bytes.length>125_000_000)throw new Error('Audio exceeds the automatic transcription limit.');
 if(process.env.STT_PROVIDER==='http'){
  if(!process.env.STT_API_URL)throw new Error('STT_API_URL is not configured.');const endpoint=new URL(process.env.STT_API_URL);if(endpoint.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(endpoint.hostname))throw new Error('Speech API must use HTTPS, or localhost for a local service.');
  const form=new FormData();form.set('file',new Blob([bytes],{type:'audio/wav'}),'lecture.wav');form.set('response_format','verbose_json');if(process.env.STT_MODEL)form.set('model',process.env.STT_MODEL);
  const response=await fetch(endpoint,{method:'POST',headers:process.env.STT_API_KEY?{Authorization:`Bearer ${process.env.STT_API_KEY}`}:{},body:form,signal:AbortSignal.timeout(480000)});
  if(!response.ok)throw new Error(`Speech API returned HTTP ${response.status}.`);
  const result=z.object({segments:z.array(z.object({start:z.number(),end:z.number(),text:z.string()}))}).parse(await response.json());
  return {segments:validateSegments(result.segments.map(s=>({start_seconds:s.start,end_seconds:s.end,content:s.text})),duration),provider:'configured-http'};
 }
 if(!process.env.DEEPGRAM_API_KEY)throw new Error('Configure DEEPGRAM_API_KEY or a timestamped HTTP speech provider. Web Speech cannot run in this background worker.');
 const response=await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&utterances=true',{method:'POST',headers:{Authorization:`Token ${process.env.DEEPGRAM_API_KEY}`,'Content-Type':'audio/wav'},body:bytes,signal:AbortSignal.timeout(480000)});
 if(!response.ok)throw new Error(`Speech API returned HTTP ${response.status}.`);
 return {segments:deepgramSegments(await response.json(),duration),provider:'deepgram-nova-3'};
}
