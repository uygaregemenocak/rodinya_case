import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalObjectStorage } from './local-object-storage.js';
import {
  InvalidObjectKeyError,
  ObjectNotFoundError,
} from './object-storage.js';

describe('LocalObjectStorage', () => {
  let rootDir: string;
  let storage: LocalObjectStorage;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'storage-test-'));
    storage = new LocalObjectStorage(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('saves and reads back a file', async () => {
    const size = await storage.putObject(
      'media',
      'u1/a.jpg',
      Readable.from([Buffer.from('hello')]),
    );
    expect(size).toBe(5);

    const onDisk = await readFile(path.join(rootDir, 'media/u1/a.jpg'), 'utf8');
    expect(onDisk).toBe('hello');

    const info = await storage.headObject('media', 'u1/a.jpg');
    expect(info).toMatchObject({ size: 5, contentType: 'image/jpeg' });

    const object = await storage.getObject('media', 'u1/a.jpg');
    expect(await buffer(object.body)).toEqual(Buffer.from('hello'));
  });

  it('reads only the requested range', async () => {
    await storage.putObject(
      'media',
      'r.jpg',
      Readable.from([Buffer.from('0123456789')]),
    );

    const object = await storage.getObject('media', 'r.jpg', {
      start: 2,
      end: 4,
    });
    expect(await buffer(object.body)).toEqual(Buffer.from('234'));
  });

  it('removes the temp file if the upload fails halfway', async () => {
    const brokenStream = new Readable({
      read() {
        this.push(Buffer.from('partial'));
        this.destroy(new Error('client aborted'));
      },
    });

    await expect(
      storage.putObject('media', 'u1/b.jpg', brokenStream),
    ).rejects.toThrow('client aborted');
    expect(await readdir(path.join(rootDir, 'media/u1'))).toEqual([]);
  });

  it('handles missing files', async () => {
    expect(await storage.headObject('media', 'nope.jpg')).toBeNull();
    await expect(storage.getObject('media', 'nope.jpg')).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
    // deleting a missing file is fine
    await storage.deleteObject('media', 'nope.jpg');
  });

  it.each([
    '../escape.jpg',
    'a/../../escape.jpg',
    '/etc/passwd',
    'a//b.jpg',
    'a\\b.jpg',
    '',
  ])('does not allow the key "%s"', async (key) => {
    await expect(storage.headObject('media', key)).rejects.toBeInstanceOf(
      InvalidObjectKeyError,
    );
  });

  it('does not allow a bad bucket name', async () => {
    await expect(storage.headObject('..', 'a.jpg')).rejects.toBeInstanceOf(
      InvalidObjectKeyError,
    );
  });
});
