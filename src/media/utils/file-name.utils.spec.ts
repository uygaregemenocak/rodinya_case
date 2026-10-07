import { describe, expect, it } from 'vitest';
import {
  getContentDisposition,
  sanitizeFileName,
  toAsciiFileName,
} from './file-name.utils.js';

describe('toAsciiFileName', () => {
  it.each([
    ['tatil fotoğrafı.jpg', 'tatil fotografi.jpg'],
    ['İŞÇİ ÖĞÜ.jpg', 'ISCI OGU.jpg'],
    ['plain.jpg', 'plain.jpg'],
    ['emoji 📷.jpg', 'emoji __.jpg'],
    ['quote".jpg', 'quote_.jpg'],
  ])('%s -> %s', (input, expected) => {
    expect(toAsciiFileName(input)).toBe(expected);
  });
});

describe('getContentDisposition', () => {
  it('has both the utf-8 name and an ascii fallback', () => {
    expect(getContentDisposition('fotoğraf.jpg', 'attachment')).toBe(
      "attachment; filename=fotograf.jpg; filename*=UTF-8''foto%C4%9Fraf.jpg",
    );
  });
});

describe('sanitizeFileName', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\pic.jpg', 'pic.jpg'],
    ['bad\u0000\u001fname.jpg', 'badname.jpg'],
    ['   ', 'image.jpg'],
    [undefined, 'image.jpg'],
  ])('%s -> %s', (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it('cuts long names to 255 characters', () => {
    expect(sanitizeFileName('a'.repeat(1000))).toHaveLength(255);
  });
});
