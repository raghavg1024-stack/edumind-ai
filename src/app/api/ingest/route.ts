import { uploadMaxBytes, uploadMaxMb } from '@/lib/upload-limits';
import { NextResponse } from 'next/server';
import { extract } from '@/lib/extract';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size > uploadMaxBytes) return NextResponse.json({error:`Choose a file smaller than ${uploadMaxMb} MB.`},{status:400});
    return NextResponse.json({ segments: await extract(file.name,new Uint8Array(await file.arrayBuffer())) });
  } catch(e) { return NextResponse.json({error:e instanceof Error ? e.message : 'Extraction failed.'},{status:400}); }
}
