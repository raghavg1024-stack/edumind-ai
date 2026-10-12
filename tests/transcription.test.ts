import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deepgramSegments} from '../src/lib/transcribe';
import {extractAudio} from '../src/lib/media-worker';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
test('speech adapter uses returned utterance times and rejects invalid provider output',()=>{const s=deepgramSegments({results:{utterances:[{start:2.25,end:5.7,transcript:'Chlorophyll absorbs light.'}]}},20);assert.equal(s[0].start_seconds,2.25);assert.equal(s[0].end_seconds,5.7);assert.throws(()=>deepgramSegments({results:{utterances:[]}},20));assert.throws(()=>deepgramSegments({results:{utterances:[{start:5,end:2,transcript:'bad'}]}},20));});
test('FFmpeg extracts real audio from the known-spoken sample MP4',async()=>{const temp=await mkdtemp(join(tmpdir(),'edumind-media-test-'));try{const audio=join(temp,'audio.wav');const duration=await extractAudio(resolve('public/samples/photosynthesis.mp4'),audio);assert.ok(duration>15&&duration<30);const bytes=await readFile(audio);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.ok(bytes.length>100000,'actual PCM audio exists');assert.ok(bytes.subarray(44).some(b=>b>10),'audio is not an empty file');}finally{if(!resolve(temp).startsWith(resolve(tmpdir())+sep+'edumind-media-test-'))throw new Error('Invalid test cleanup path');await rm(temp,{recursive:true,force:true});}});
