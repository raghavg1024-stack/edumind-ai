import type { Chunk, Mastery } from './types';
export function chunkText(text: string, size = 1100, overlap = 180) {
  const clean = text.replace(/\r/g, '').trim();
  const chunks: string[] = [];
  for (let start = 0; start < clean.length; start += size - overlap) {
    const part = clean.slice(start, start + size).trim();
    if (part) chunks.push(part);
    if (start + size >= clean.length) break;
  }
  return chunks;
}
export function retrieve(query: string, chunks: Chunk[], limit = 5) {
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter(w => !['the','what','how','does','are','and','explain','about','can','you'].includes(w));
  return chunks.map(c => ({ ...c, similarity: words.reduce((s,w) => s + ((c.content + ' ' + c.topic).toLowerCase().includes(w) ? 1 : 0), 0) / Math.max(words.length, 1) })).filter(c => c.similarity > 0).sort((a,b) => b.similarity - a.similarity).slice(0,limit);
}
export function difficulty(m?: Mastery) {
  if (!m || m.total < 3) return 'foundation';
  const score = m.correct / m.total;
  return score >= .8 ? 'challenge' : score >= .5 ? 'practice' : 'foundation';
}
export function studyPlan(topics: string[], mastery: Mastery[]) {
  return [...new Set(topics)].map(topic => {
    const m = mastery.find(x => x.topic === topic);
    const score = m?.total ? Math.round(100 * m.correct / m.total) : 0;
    return { topic, score, assessed: Boolean(m?.total), minutes: score < 50 ? 25 : 15, action: !m?.total ? 'Take a diagnostic quiz, then ask the tutor about unfamiliar ideas.' : score < 50 ? 'Review cited examples with the tutor. Retry a foundation quiz.' : score < 80 ? 'Explain the topic in your own words, then take a practice quiz.' : 'Use a challenge quiz to apply the idea. Revisit in three days.' };
  }).sort((a,b) => a.score - b.score);
}
