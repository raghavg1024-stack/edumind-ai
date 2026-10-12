export type TranscriptSegment = { start_seconds: number; end_seconds: number; content: string };
export type Lecture = { id: string; document_id: string; course_id: string; course_title?: string; title: string; topic: string; kind: 'mp4'|'youtube'; youtube_id: string|null; storage_path: string|null; duration_seconds: number|null; status: 'uploading'|'awaiting_transcript'|'queued'|'processing'|'failed'|'ready'; error_message: string|null; indexed: boolean; created_at: string };
export type Bookmark = {id:string;lecture_id:string;at_seconds:number;note:string};
export function timestamp(seconds:number) {
 const n=Math.max(0,Math.floor(seconds));const h=Math.floor(n/3600);return `${h?`${h}:`:''}${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
export function youtubeId(input:string) {
 let url:URL;try{url=new URL(input);}catch{throw new Error('Enter a valid YouTube URL.');}
 const host=url.hostname.toLowerCase();if(url.protocol!=='https:' || !['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host))throw new Error('Use an HTTPS YouTube or youtu.be link.');
 const id=host==='youtu.be'?url.pathname.slice(1).split('/')[0]:url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
 if(!id||!/^[\w-]{11}$/.test(id))throw new Error('YouTube video ID is invalid.');return id;
}
export function validateSegments(segments:TranscriptSegment[], duration?:number|null) {
 if(!segments.length||segments.length>10000)throw new Error('Provide 1–10,000 timestamped transcript segments.');
 let previous=-1;let chars=0;
 for(const s of segments){if(!Number.isFinite(s.start_seconds)||!Number.isFinite(s.end_seconds)||s.start_seconds<0||s.end_seconds<=s.start_seconds||s.start_seconds<previous||s.end_seconds>14400)throw new Error('Transcript timestamps must be ordered, positive intervals within four hours.');if(duration&&s.end_seconds>duration+1)throw new Error('Transcript exceeds the video duration.');if(typeof s.content!=='string'||!s.content.trim()||s.content.length>12000)throw new Error('Transcript segment text is missing or too long.');previous=s.start_seconds;chars+=s.content.length;}
 if(chars>500000)throw new Error('Transcript exceeds 500,000 characters.');return segments.map(s=>({...s,content:s.content.trim()}));
}
function seconds(input:string){const parts=input.replace(',','.').split(':').map(Number);if(parts.some(p=>!Number.isFinite(p))||parts.length<2||parts.length>3||parts.slice(1).some(p=>p<0||p>=60))throw new Error('Invalid transcript timestamp.');return parts.reduce((n,p)=>n*60+p,0);}
export function parseTranscript(name:string,text:string,duration?:number|null) {
 if(text.length>1_000_000)throw new Error('Transcript file must be smaller than 1 MB.');
 if(name.toLowerCase().endsWith('.json')){const parsed=JSON.parse(text);if(!Array.isArray(parsed))throw new Error('JSON must be an array of start_seconds, end_seconds, content.');return validateSegments(parsed,duration);}
 if(!/\.(srt|vtt)$/i.test(name))throw new Error('Upload timestamped VTT, SRT, or segment JSON. Plain text has no reliable timestamps.');
 const segments:TranscriptSegment[]=[];for(const block of text.replace(/\r/g,'').split(/\n\s*\n/)){const lines=block.split('\n');const i=lines.findIndex(l=>l.includes('-->'));if(i<0)continue;const m=lines[i].match(/^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/);if(!m)throw new Error('Invalid caption cue.');segments.push({start_seconds:seconds(m[1]),end_seconds:seconds(m[2]),content:lines.slice(i+1).join(' ').replace(/<[^>]*>/g,'').trim()});}return validateSegments(segments,duration);
}
export function transcriptChunks(segments:TranscriptSegment[],maxChars=1100,maxSeconds=6) {
 validateSegments(segments);const result:TranscriptSegment[]=[];
 for(const segment of segments){const previous=result[result.length-1];if(previous&&previous.content.length+segment.content.length+1<=maxChars&&segment.end_seconds-previous.start_seconds<=maxSeconds&&segment.start_seconds-previous.end_seconds<=8){previous.content+=' '+segment.content;previous.end_seconds=Math.max(previous.end_seconds,segment.end_seconds);}else result.push({...segment});}return result;
}
export function captionsVtt(segments:TranscriptSegment[]) {
 const stamp=(n:number)=>{const ms=Math.round(n*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
 return 'WEBVTT\n\n'+segments.map((s,i)=>`${i+1}\n${stamp(s.start_seconds)} --> ${stamp(s.end_seconds)}\n${s.content.replace(/-->/g,'→').replace(/[<>]/g,'')}\n`).join('\n');
}
