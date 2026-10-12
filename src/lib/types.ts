export type Chunk = { id: string; document_id: string; content: string; locator: string; topic: string; title?: string; similarity?: number; lecture_id?: string | null; start_seconds?: number | null; end_seconds?: number | null };
export type Source = { id: string; title: string; topic: string; kind: string; created_at: string; chunk_count: number; storage_path?: string };
export type Question = { prompt: string; options: string[]; answer: number; explanation: string; chunk_id: string; citation?: Chunk };
export type Quiz = { id: string; topic: string; difficulty: string; questions: Question[]; generation_mode?: 'ai'|'source-check' };
export type Mastery = { topic: string; correct: number; total: number };
export type Snapshot = { sources: Source[]; mastery: Mastery[] };
export type TutorReply = { answer: string; citations: Chunk[] };
