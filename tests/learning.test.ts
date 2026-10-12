import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { chunkText, retrieve, difficulty, studyPlan } from '../src/lib/learning';
import { extract } from '../src/lib/extract';
import { demoChunks, demoTutor, demoQuiz } from '../src/lib/demo';
test('chunk boundaries retain overlap without empty trailing chunks',()=>{
 const text='abcdefghij'.repeat(250);const chunks=chunkText(text);assert.equal(chunks[0].slice(-180),chunks[1].slice(0,180));assert.ok(chunks.every(c=>c.length<=1100));assert.deepEqual(chunkText('  '),[]);
});
test('retrieval refuses unsupported questions and returns real source ids',()=>{
 assert.deepEqual(retrieve('quantum teleportation',demoChunks),[]);assert.equal(demoTutor('quantum teleportation',demoChunks).citations.length,0);assert.ok(demoTutor('chlorophyll',demoChunks).citations.every(c=>demoChunks.some(d=>d.id===c.id)));
});
test('difficulty uses evidence count and accuracy; plans prioritize weak topics',()=>{
 assert.equal(difficulty({topic:'A',correct:2,total:2}),'foundation');assert.equal(difficulty({topic:'A',correct:4,total:5}),'challenge');assert.equal(difficulty({topic:'A',correct:3,total:5}),'practice');assert.equal(difficulty({topic:'A',correct:1,total:5}),'foundation');const p=studyPlan(['A','B','A'],[{topic:'A',correct:4,total:5}]);assert.equal(p.length,2);assert.equal(p[0].topic,'B');assert.equal(p[0].assessed,false);
});
test('demo quiz is supported and has one answer at a valid index',()=>{
 const quiz=demoQuiz('Photosynthesis',demoChunks,'foundation');assert.ok(quiz.questions.length);for(const q of quiz.questions){assert.equal(q.options.length,4);assert.ok(q.answer>=0&&q.answer<4);assert.equal(q.options[q.answer],q.explanation);}
});
test('text and transcripts retain section and timestamp locators',async()=>{
 const enc=new TextEncoder();const txt=await extract('notes.txt',enc.encode('First paragraph.\n\nSecond paragraph.'));assert.deepEqual(txt.map(x=>x.locator),['Section 1','Section 2']);const vtt=await extract('lecture.vtt',enc.encode('WEBVTT\n\n00:00:04.000 --> 00:00:06.000\nChlorophyll absorbs light.'));assert.equal(vtt[0].locator,'Time 00:00:04.000');const srt=await extract('lecture.srt',enc.encode('1\n00:00:01,000 --> 00:00:03,000\nPlants produce oxygen.'));assert.equal(srt[0].content,'Plants produce oxygen.');
});
test('PPTX slides are numerically ordered and XML entities decoded',async()=>{
 const zip=new JSZip();for(const n of [10,2,1])zip.file(`ppt/slides/slide${n}.xml`,`<p:sld><a:p><a:r><a:t>Slide ${n} light &amp; water</a:t></a:r></a:p></p:sld>`);const result=await extract('slides.pptx',await zip.generateAsync({type:'uint8array'}));assert.deepEqual(result.map(x=>x.locator),['Slide 1','Slide 2','Slide 10']);assert.equal(result[0].content,'Slide 1 light & water');
});
test('empty, malformed and unsupported sources fail clearly',async()=>{
 await assert.rejects(()=>extract('empty.txt',new Uint8Array()),/No readable text/);await assert.rejects(()=>extract('old.ppt',new Uint8Array()),/Convert legacy/);await assert.rejects(()=>extract('bad.pdf',new TextEncoder().encode('not a pdf')),/Invalid PDF/);
});
