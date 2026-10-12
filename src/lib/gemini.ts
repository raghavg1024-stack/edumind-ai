import { GoogleGenAI,ThinkingLevel } from '@google/genai';
import { z } from 'zod';
const ai = () => {
  if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API key is missing. Configure GEMINI_API_KEY on the server.');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY,httpOptions:{timeout:30000,retryOptions:{attempts:1}} });
};
export async function retryTransient<T>(operation:()=>Promise<T>){
 for(let attempt=0;;attempt++){try{return await operation();}catch(e){const status=(e as {status?:number}).status;if(attempt>=2||![429,502,503,504].includes(status||0))throw e;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}}
}
export async function embed(text: string, query = false) {
  const result = await retryTransient(()=>ai().models.embedContent({ model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001', contents: text, config: { outputDimensionality: 768, taskType: query ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' } }));
  const vector = result.embeddings?.[0]?.values;
  if (!vector || vector.length !== 768 || vector.some(v => !Number.isFinite(v))) throw new Error('Embedding response is invalid.');
  const norm = Math.sqrt(vector.reduce((s,v) => s + v*v, 0));
  if (!norm) throw new Error('Embedding is empty.');
  return vector.map(v => v/norm);
}
export async function generate<T>(prompt: string, schema: z.ZodType<T>, jsonSchema: Record<string, unknown>) {
  const model=process.env.GEMINI_MODEL||'gemini-3.8-flash';
  const result = await retryTransient(()=>ai().models.generateContent({ model, contents: prompt, config: { responseMimeType: 'application/json', responseJsonSchema: jsonSchema, temperature: .2,maxOutputTokens:4096,...(model.startsWith('gemini-3')?{thinkingConfig:{thinkingLevel:ThinkingLevel.LOW}}:{}) } }));
  return schema.parse(JSON.parse(result.text || '{}'));
}
