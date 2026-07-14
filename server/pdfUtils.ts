import { createRequire } from 'module';
const require = createRequire(import.meta.url || process.argv[1]);

export interface PdfPage {
  /** 1-indexed page number. */
  pageNumber: number;
  text: string;
}

export interface PdfExtractionResult {
  pages: PdfPage[];
  fullText: string;
  numPages: number;
}

/**
 * Extracts text from a PDF buffer while tracking which page each piece of
 * text came from. This powers page-level citations: every chunk built from
 * `pages` can be tagged with the page number it originated from.
 *
 * Uses pdf-parse's page-aware `PDFParse` class (built on pdfjs-dist). If that
 * API is unavailable for any reason, falls back to the legacy whole-document
 * extraction so paper ingestion never hard-fails because of this feature —
 * it just loses per-page granularity for that document (page defaults to 1).
 */
export async function extractPdfPages(buffer: Buffer): Promise<PdfExtractionResult> {
  try {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const rawPages = result?.pages;

      if (Array.isArray(rawPages) && rawPages.length > 0) {
        const pages: PdfPage[] = rawPages.map((p: any, idx: number) => ({
          pageNumber: typeof p.num === 'number' ? p.num : idx + 1,
          text: (p.text || '').trim(),
        }));

        const fullText = result.text || pages.map(p => p.text).join('\n\n');

        return {
          pages,
          fullText,
          numPages: pages.length,
        };
      }

      // No page breakdown returned - fall through to legacy mode below.
      throw new Error('No per-page text returned by PDFParse.getText()');
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy();
      }
    }
  } catch (err: any) {
    console.warn(
      'Page-level PDF extraction unavailable, falling back to whole-document extraction:',
      err?.message || err
    );
    const pdfCompat = require('pdf-parse');
    const parsed = await pdfCompat(buffer);
    const text = parsed?.text || '';
    const trimmed = text.trim();

    return {
      pages: trimmed ? [{ pageNumber: 1, text: trimmed }] : [],
      fullText: text,
      numPages: parsed?.numpages || (trimmed ? 1 : 0),
    };
  }
}
