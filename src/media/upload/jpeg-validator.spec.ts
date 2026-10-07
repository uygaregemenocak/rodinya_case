import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { describe, expect, it } from 'vitest';
import { JpegValidator } from './jpeg-validator.js';

const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0xff, 0xd9,
]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// runs the chunks through the validator and returns what comes out
async function validate(chunks: Buffer[], maxSize = 1024): Promise<Buffer> {
  const output: Buffer[] = [];
  await pipeline(
    Readable.from(chunks),
    new JpegValidator(maxSize),
    async (stream) => {
      for await (const chunk of stream) {
        output.push(chunk);
      }
    },
  );
  return Buffer.concat(output);
}

describe('JpegValidator', () => {
  it('lets a jpeg through unchanged', async () => {
    expect(await validate([JPEG])).toEqual(JPEG);
  });

  it('works when the first bytes come in separate chunks', async () => {
    const chunks = [JPEG.subarray(0, 1), JPEG.subarray(1, 2), JPEG.subarray(2)];
    expect(await validate(chunks)).toEqual(JPEG);
  });

  it('rejects a png', async () => {
    await expect(validate([PNG])).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects empty or too short files', async () => {
    await expect(validate([])).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
    await expect(validate([JPEG.subarray(0, 2)])).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects files over the limit', async () => {
    await expect(validate([JPEG], JPEG.length - 1)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
  });

  it('allows a file exactly at the limit', async () => {
    expect(await validate([JPEG], JPEG.length)).toHaveLength(JPEG.length);
  });
});
