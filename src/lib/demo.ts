import { chunkText, retrieve } from './learning';
import type { Chunk, Quiz, Snapshot } from './types';
export const sampleText = `Photosynthesis converts light energy into chemical energy stored in glucose. Plants use carbon dioxide and water to produce glucose and oxygen. Chlorophyll absorbs light in the chloroplasts.\n\nThe light-dependent reactions occur in the thylakoid membranes. They split water, release oxygen, and produce ATP and NADPH.\n\nThe Calvin cycle occurs in the stroma. It uses ATP and NADPH to fix carbon dioxide into sugars. The Calvin cycle does not directly require light, but relies on the products of the light-dependent reactions.\n\nLimiting factors include light intensity, carbon dioxide concentration, and temperature. Increasing one factor only increases the rate until another factor becomes limiting.`;
export const demoSource = { id: 'sample', title: 'Biology · Photosynthesis notes', topic: 'Photosynthesis', kind: 'text', created_at: '2026-01-01', chunk_count: 1 };
export const demoChunks: Chunk[] = chunkText(sampleText).map((content,i) => ({ id: `sample-${i}`, document_id: 'sample', content, locator: `Section ${i+1}`, topic: 'Photosynthesis', title: demoSource.title }));
export function demoTutor(question: string, chunks: Chunk[]) {
  const citations = retrieve(question, chunks);
  return { answer: citations.length ? `Here are the relevant passages from your materials. In local demo mode, EduMind retrieves source text without generating an AI explanation.\n\n${citations.map((c,i) => `${c.content} [${i+1}]`).join('\n\n')}` : 'I could not find supporting material for that question. Upload a relevant source or try using a term from your notes.', citations };
}
export function demoQuiz(topic: string, chunks: Chunk[], level: string): Quiz {
  const matching = chunks.filter(c => c.topic === topic).sort((a,b)=>Number(Boolean(b.lecture_id))-Number(Boolean(a.lecture_id)));
  return { id: crypto.randomUUID(), topic, difficulty: level, questions: matching.slice(0,3).map(c => {
    const statement = c.content.split(/(?<=[.!?])\s/)[0];
    const options = ['The source provides no information about this.', statement, 'This claim cannot be checked against the source.', 'All of these statements contradict the source.'];
    const answer = Math.floor(Math.random()*4);
    [options[1], options[answer]] = [options[answer], options[1]];
    return { prompt: `Which statement is supported by ${c.title ?? 'your source'} (${c.locator})?`, options, answer, explanation: statement, chunk_id: c.id };
  }) };
}
export const initialDemo: Snapshot & { chunks: Chunk[] } = { sources: [demoSource], mastery: [], chunks: demoChunks };
