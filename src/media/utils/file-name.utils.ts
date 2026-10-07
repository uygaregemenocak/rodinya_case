import { create as createContentDisposition } from 'content-disposition';

const DEFAULT_FILE_NAME = 'image.jpg';

// We only keep the original name to show it back to the user, so strip any
// folder part and control characters and cap the length.
export function sanitizeFileName(fileName: string | undefined): string {
  const baseName = (fileName ?? '').split(/[\\/]/).pop() ?? '';

  let cleaned = '';
  for (const char of baseName) {
    const code = char.codePointAt(0)!;
    if (code > 31 && code !== 127) {
      cleaned += char;
    }
  }

  cleaned = cleaned.trim().slice(0, 255);
  return cleaned || DEFAULT_FILE_NAME;
}

// Turkish characters to plain ASCII, e.g. "fotoğrafı.jpg" -> "fotografi.jpg".
// Some clients (curl -OJ for example) only read the ASCII filename.
export function toAsciiFileName(fileName: string): string {
  return fileName
    .replace(/ı/g, 'i') // dotless i doesn't get removed by normalize()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
}

export function getContentDisposition(
  fileName: string,
  type: 'inline' | 'attachment',
): string {
  return createContentDisposition(fileName, {
    type,
    fallback: toAsciiFileName(fileName),
  });
}
