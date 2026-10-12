import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function extractAudio(input:string,output:string){
 const probe=await exec(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',input],{timeout:60000,maxBuffer:100000});
 const info=JSON.parse(probe.stdout);const duration=Number(info.format?.duration);
 if(!Number.isFinite(duration)||duration<=0||duration>3600)throw new Error('Automatic transcription supports videos up to one hour. Upload a transcript for longer lectures.');
 if(!info.streams?.some((s:{codec_type:string})=>s.codec_type==='audio'))throw new Error('This video has no audio track.');
 if(!info.streams?.some((s:{codec_type:string})=>s.codec_type==='video'))throw new Error('This file has no video track.');
 await exec(process.env.FFMPEG_PATH||'ffmpeg',['-nostdin','-y','-v','error','-protocol_whitelist','file,pipe','-i',input,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-threads','1',output],{timeout:600000,maxBuffer:100000});return duration;
}
