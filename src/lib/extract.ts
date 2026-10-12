import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { chunkText } from './learning';
export type Segment = { content: string; locator: string };
export async function extract(name: string, bytes: Uint8Array): Promise<Segment[]> {
  const ext = name.toLowerCase().split('.').pop();
  const segments: Segment[] = [];
  if (ext === 'pdf') {
    if (Buffer.from(bytes.slice(0,5)).toString() !== '%PDF-') throw new Error('Invalid PDF.');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
    const pdf = await task.promise;
    try {
      if (pdf.numPages > 100) throw new Error('Maximum 100 pages per PDF.');
      for (let n=1;n<=pdf.numPages;n++) {
        const page = await pdf.getPage(n);
        const text = await page.getTextContent();
        segments.push({ content: text.items.map(x => 'str' in x ? x.str : '').join(' '), locator: `Page ${n}` });
      }
    } finally { await task.destroy(); }
  } else if (ext === 'pptx') {
    const zip = await JSZip.loadAsync(bytes);
    const files = Object.keys(zip.files).filter(x => /^ppt\/slides\/slide\d+\.xml$/.test(x)).sort((a,b) => Number(a.match(/(\d+)\.xml/)![1])-Number(b.match(/(\d+)\.xml/)![1]));
    if (files.length > 100) throw new Error('Maximum 100 slides.');
    const parser = new XMLParser({ ignoreAttributes: true, processEntities: true });
    const texts = (node: unknown): string[] => {
      if (!node || typeof node !== 'object') return [];
      return Object.entries(node).flatMap(([key,val]) => key === 'a:t' ? [String(val)] : Array.isArray(val) ? val.flatMap(texts) : texts(val));
    };
    let expanded = 0;
    for (const file of files) {
      const xml = await zip.file(file)!.async('string');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Slide XML contains unsupported entity declarations.');
      expanded += xml.length;
      if (expanded > 10_000_000) throw new Error('Expanded slide data is too large.');
      segments.push({ content: texts(parser.parse(xml)).join(' '), locator: `Slide ${file.match(/(\d+)\.xml/)![1]}` });
    }
  } else if (['txt','md','vtt','srt'].includes(ext || '')) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (ext === 'vtt' || ext === 'srt') {
      for (const block of text.split(/\r?\n\s*\r?\n/)) {
        const lines = block.split(/\r?\n/);
        const i = lines.findIndex(x => x.includes('-->'));
        if (i >= 0) segments.push({ content: lines.slice(i+1).join(' ').replace(/<[^>]*>/g,''), locator: `Time ${lines[i].split('-->')[0].trim()}` });
      }
    } else text.split(/\n\s*\n/).forEach((content,i) => segments.push({ content, locator: `Section ${i+1}` }));
  } else throw new Error('Use PDF, PPTX, TXT, MD, VTT or SRT. Convert legacy .ppt to .pptx first.');
  const chunks = segments.flatMap(s => chunkText(s.content).map(content => ({content, locator:s.locator})));
  if (!chunks.length) throw new Error('No readable text found. Scanned documents need OCR before upload.');
  if (chunks.length > 180 || chunks.reduce((s,c) => s+c.content.length,0) > 180_000) throw new Error('Source is too large for the MVP. Split it into smaller files.');
  return chunks;
}
